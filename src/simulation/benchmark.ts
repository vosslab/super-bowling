import { performance } from "node:perf_hooks";

import { benchmark_fixtures, type BenchmarkFixture } from "../config/benchmark_fixtures";
import {
  get_rack_pin_count,
  supported_pin_counts,
  type PinCount,
  type RackPinCount,
} from "../config/pin_counts";
import { get_mode_tuning, get_settle_max_seconds, physics_config } from "../config/physics";
import { ball_radius, lane_width, pin_radius } from "../config/lane";
import { create_draw_commands } from "../render/benchmark_renderer";
import { ball_snapshot_in_pit_flag_offset, pin_snapshot_stride } from "./protocol";
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

export type ShotHarnessSample = {
  shot_id: "A" | "B" | "C" | "D" | "E" | "F_left" | "F_right";
  label: string;
  fallen_pin_count: number;
  reached_pit: boolean;
  settled: boolean;
  timed_out: boolean;
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
  world.launch(fixture.power, fixture.start_position, fixture.angle, fixture.spin);
  const max_steps = Math.ceil(
    get_settle_max_seconds(pin_count) / physics_config.fixed_step_seconds,
  );
  while (step_count < max_steps && !settled && !timed_out) {
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

/**
 * Repeatable M3 tuning observations. Calibrated pinfall targets stay in the
 * report rather than becoming brittle release-gate assertions.
 */
export async function run_shot_harness_report(): Promise<ShotHarnessSample[]> {
  const pin_count = 10;
  const gutter_start = lane_width(pin_count) / 2 + ball_radius + pin_radius;
  const shots: Array<{
    shot_id: ShotHarnessSample["shot_id"];
    label: string;
    power: number;
    start_position: number;
    angle: number;
    spin: number;
  }> = [
    { shot_id: "A", label: "center full power", power: 24, start_position: 0, angle: 0, spin: 0 },
    { shot_id: "B", label: "center minimum power", power: 8, start_position: 0, angle: 0, spin: 0 },
    {
      shot_id: "C",
      label: "lane edge full power",
      power: 24,
      start_position: gutter_start,
      angle: 0,
      spin: 0,
    },
    {
      shot_id: "D",
      label: "gutter path",
      power: 8,
      start_position: gutter_start,
      angle: 0,
      spin: 0,
    },
    {
      shot_id: "E",
      label: "left pocket full spin",
      power: 24,
      start_position: -0.5,
      angle: 0,
      spin: 1,
    },
    {
      shot_id: "F_left",
      label: "mirrored left spin",
      power: 24,
      start_position: -0.5,
      angle: 0,
      spin: 1,
    },
    {
      shot_id: "F_right",
      label: "mirrored right spin",
      power: 24,
      start_position: 0.5,
      angle: 0,
      spin: -1,
    },
  ];
  const samples: ShotHarnessSample[] = [];
  for (const shot of shots) {
    const world = await create_simulation_world(pin_count);
    world.launch(shot.power, shot.start_position, shot.angle, shot.spin);
    let settled = false;
    let timed_out = false;
    const maximum_steps = Math.ceil(
      get_settle_max_seconds(pin_count) / physics_config.fixed_step_seconds,
    );
    for (let step = 0; step < maximum_steps && !settled && !timed_out; step += 1) {
      const result = world.step_fixed();
      settled = result.settled;
      timed_out = result.timed_out;
    }
    const snapshot = world.create_snapshot();
    const reached_pit =
      snapshot.data[pin_count * pin_snapshot_stride + ball_snapshot_in_pit_flag_offset] === 1;
    samples.push({
      shot_id: shot.shot_id,
      label: shot.label,
      fallen_pin_count: world.get_counts().fallen_pin_count,
      reached_pit,
      settled,
      timed_out,
    });
    world.dispose();
  }
  return samples;
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
