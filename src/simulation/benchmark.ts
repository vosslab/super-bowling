import { performance } from "node:perf_hooks";

import { benchmark_fixtures, type BenchmarkFixture } from "../config/benchmark_fixtures";
import {
  get_rack_pin_count,
  supported_pin_counts,
  type PinCount,
  type RackPinCount,
} from "../config/pin_counts";
import { get_mode_tuning, physics_config } from "../config/physics";
import { create_draw_commands } from "../render/benchmark_renderer";
import { create_simulation_world } from "./world";

export type { BenchmarkFixture } from "../config/benchmark_fixtures";
export { benchmark_fixtures } from "../config/benchmark_fixtures";

export type CpuTimeSummary = {
  mean: number;
  p95: number;
};

export type BenchmarkSample = {
  mode: PinCount;
  pin_count: RackPinCount;
  fixture_id: BenchmarkFixture["fixture_id"];
  settled: boolean;
  timed_out: boolean;
  fixture_cpu_time_ms: number;
  fixed_step_cpu_time_ms: CpuTimeSummary;
  emitted_frame_cpu_time_ms: CpuTimeSummary;
  settlement_time_ms: number;
  total_body_count: number;
  max_awake_body_count: number;
  final_awake_body_count: number;
  standing_pin_count: number;
  fallen_pin_count: number;
};

export type BenchmarkReport = {
  generated_at: string;
  samples: BenchmarkSample[];
};

function summarize_cpu_times(samples: number[]): CpuTimeSummary {
  const sorted = [...samples].sort((first, second) => first - second);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p95_index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return { mean: total / sorted.length, p95: sorted[p95_index]! };
}

export async function run_benchmark(
  mode: PinCount,
  fixture: BenchmarkFixture,
): Promise<BenchmarkSample> {
  const pin_count = get_rack_pin_count(mode);
  const world = await create_simulation_world(pin_count);
  const tuning = get_mode_tuning(mode);
  const snapshot_step_interval = Math.max(
    1,
    Math.round(1 / (physics_config.fixed_step_seconds * tuning.snapshot_hz)),
  );
  const fixed_step_times: number[] = [];
  const emitted_frame_times: number[] = [];
  let emitted_frame_fixed_step_cpu_time_ms = 0;
  let previous_snapshot = world.create_snapshot().data;
  let max_awake_body_count = world.get_awake_body_count();
  let settled = false;
  let timed_out = false;
  let step_count = 0;
  const fixture_start = performance.now();
  world.launch(fixture.power, fixture.lateral_offset);
  const max_steps = Math.ceil(
    physics_config.settle_max_seconds / physics_config.fixed_step_seconds,
  );
  while (step_count < max_steps && !settled && !timed_out) {
    const steering_active =
      step_count >= fixture.steer_start_step && step_count <= fixture.steer_end_step;
    world.set_steer(steering_active ? fixture.steer_direction : 0);
    const fixed_step_start = performance.now();
    const result = world.step_fixed();
    const fixed_step_cpu_time_ms = performance.now() - fixed_step_start;
    fixed_step_times.push(fixed_step_cpu_time_ms);
    emitted_frame_fixed_step_cpu_time_ms += fixed_step_cpu_time_ms;
    max_awake_body_count = Math.max(max_awake_body_count, world.get_awake_body_count());
    settled = result.settled;
    timed_out = result.timed_out;
    step_count += 1;
    if (step_count % snapshot_step_interval === 0 || settled || timed_out) {
      const emitted_frame_start = performance.now();
      const current_snapshot = world.create_snapshot().data;
      create_draw_commands(previous_snapshot, current_snapshot, pin_count, 1, 1600, 1000);
      previous_snapshot = current_snapshot;
      emitted_frame_times.push(
        emitted_frame_fixed_step_cpu_time_ms + (performance.now() - emitted_frame_start),
      );
      emitted_frame_fixed_step_cpu_time_ms = 0;
    }
  }
  const counts = world.get_counts();
  const sample: BenchmarkSample = {
    mode,
    pin_count,
    fixture_id: fixture.fixture_id,
    settled,
    timed_out,
    fixture_cpu_time_ms: performance.now() - fixture_start,
    fixed_step_cpu_time_ms: summarize_cpu_times(fixed_step_times),
    emitted_frame_cpu_time_ms: summarize_cpu_times(emitted_frame_times),
    settlement_time_ms: step_count * physics_config.fixed_step_seconds * 1000,
    total_body_count: world.get_total_body_count(),
    max_awake_body_count,
    final_awake_body_count: world.get_awake_body_count(),
    standing_pin_count: counts.standing_pin_count,
    fallen_pin_count: counts.fallen_pin_count,
  };
  world.dispose();
  return sample;
}

export async function run_benchmark_report(): Promise<{
  generated_at: string;
  samples: BenchmarkSample[];
}> {
  const samples: BenchmarkSample[] = [];
  for (const pin_count of supported_pin_counts) {
    for (const fixture of benchmark_fixtures) {
      samples.push(await run_benchmark(pin_count, fixture));
    }
  }
  return { generated_at: new Date().toISOString(), samples };
}

function has_finite_measurements(sample: BenchmarkSample): boolean {
  const measurements = [
    sample.fixture_cpu_time_ms,
    sample.fixed_step_cpu_time_ms.mean,
    sample.fixed_step_cpu_time_ms.p95,
    sample.emitted_frame_cpu_time_ms.mean,
    sample.emitted_frame_cpu_time_ms.p95,
    sample.settlement_time_ms,
  ];
  return measurements.every((value) => Number.isFinite(value) && value >= 0);
}

/**
 * Returns every release-gate failure while preserving the complete JSON report
 * for diagnosis. A benchmark sample proves a completed, conserved simulation
 * only when it settled before its limit and all recorded timings are usable.
 */
export function get_benchmark_validation_failures(report: BenchmarkReport): string[] {
  const failures: string[] = [];
  const expected_sample_count = supported_pin_counts.length * benchmark_fixtures.length;
  if (report.samples.length !== expected_sample_count) {
    failures.push(`expected ${expected_sample_count} samples, received ${report.samples.length}`);
  }
  for (const sample of report.samples) {
    const label = `${sample.mode}/${sample.fixture_id}`;
    if (!sample.settled) failures.push(`${label} did not settle`);
    if (sample.timed_out) failures.push(`${label} reached its settlement timeout`);
    if (sample.standing_pin_count + sample.fallen_pin_count !== sample.pin_count) {
      failures.push(`${label} violated pin conservation`);
    }
    if (!has_finite_measurements(sample)) failures.push(`${label} has non-finite measurements`);
  }
  return failures;
}
