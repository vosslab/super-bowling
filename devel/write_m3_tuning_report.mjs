import { readFile, mkdir, writeFile } from "node:fs/promises";

import { ball_radius, board_width, foul_to_head_pin, pin_radius } from "../src/config/lane.ts";
import { aim_control_steps } from "../src/game/aim.ts";
import { create_preview_path } from "../src/simulation/preview.ts";
import { pin_snapshot_stride } from "../src/simulation/protocol.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

const m1_990_median_ms = 390.22;
const visible_board_tolerance_boards = 1;

function interpolate_x_at_y(path, target_y) {
  for (let index = 2; index < path.length; index += 2) {
    const previous_x = path[index - 2];
    const previous_y = path[index - 1];
    const next_x = path[index];
    const next_y = path[index + 1];
    if (previous_y <= target_y && next_y >= target_y && next_y > previous_y) {
      const progress = (target_y - previous_y) / (next_y - previous_y);
      return previous_x + (next_x - previous_x) * progress;
    }
  }
  throw new Error(`Preview path did not reach the ${target_y}-foot head-pin plane.`);
}

async function entry_x(pin_count, launch) {
  const path = await create_preview_path(pin_count, launch);
  return interpolate_x_at_y(path, foul_to_head_pin);
}

async function live_entry_x_before_contact(pin_count, launch, target_y) {
  const world = await create_simulation_world(pin_count);
  world.launch(launch.power, launch.start_position, launch.angle, launch.spin);
  const ball_offset = pin_count * pin_snapshot_stride;
  let previous = world.create_snapshot().data;
  for (let step = 0; step < 1200; step += 1) {
    world.step_fixed();
    const next = world.create_snapshot().data;
    const previous_y = previous[ball_offset + 1];
    const next_y = next[ball_offset + 1];
    if (previous_y <= target_y && next_y >= target_y && next_y > previous_y) {
      const progress = (target_y - previous_y) / (next_y - previous_y);
      const x = previous[ball_offset] + (next[ball_offset] - previous[ball_offset]) * progress;
      world.dispose();
      return x;
    }
    previous = next;
  }
  world.dispose();
  throw new Error(`Live path did not reach the ${target_y}-foot approach plane.`);
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)];
}

function require_number(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is not a finite number.`);
  }
  return value;
}

function summarize_990_cost(benchmark) {
  const samples = benchmark.samples.filter((sample) => sample.pin_count === 990);
  const fixture_cpu_times_ms = samples.map((sample) =>
    require_number(sample.fixture_cpu_time_ms, `${sample.fixture_id} fixture CPU time`),
  );
  const median_ms = median(fixture_cpu_times_ms);
  return {
    samples: samples.length,
    fixture_cpu_times_ms: [...fixture_cpu_times_ms].sort((first, second) => first - second),
    median_ms,
    m1_baseline_median_ms: m1_990_median_ms,
    baseline_ratio: median_ms / m1_990_median_ms,
    evidence_guards: {
      median_ms_at_most: 750,
      baseline_ratio_at_most: 1.92,
    },
  };
}

async function control_measurement(pin_count) {
  const width = board_width(pin_count);
  const steps = aim_control_steps(pin_count);
  const baseline = { power: 18, start_position: 0, angle: 0, spin: 0 };
  const baseline_x = await entry_x(pin_count, baseline);
  const measurements = await Promise.all([
    entry_x(pin_count, { ...baseline, start_position: width }),
    entry_x(pin_count, { ...baseline, angle: (steps.angle_degrees * Math.PI) / 180 }),
    entry_x(pin_count, { ...baseline, spin: steps.spin }),
  ]);
  return {
    pin_count,
    board_width_feet: width,
    input_steps: steps,
    one_increment_entry_shift_boards: {
      start_position: (measurements[0] - baseline_x) / width,
      angle: (measurements[1] - baseline_x) / width,
      spin: (measurements[2] - baseline_x) / width,
    },
  };
}

async function main() {
  const benchmark = JSON.parse(
    await readFile("artifacts/benchmark/simulation_benchmark.json", "utf8"),
  );
  const frame_window = JSON.parse(
    await readFile("artifacts/milestone/frame_window_990.json", "utf8"),
  );
  const zero_spin_x = await entry_x(10, { power: 18, start_position: 0, angle: 0, spin: 0 });
  const full_spin_x = await entry_x(10, { power: 18, start_position: 0, angle: 0, spin: 1 });
  const calibration_launch = { power: 18, start_position: 0, angle: 0.035, spin: 0.7 };
  // This plane is one foot before the head-pin center and more than one ball-plus-pin radius
  // ahead of contact, so the live result still measures the shared free-roll trajectory.
  const calibration_y = foul_to_head_pin - 1;
  const preview_calibration_x = await entry_x(10, calibration_launch);
  const preview_approach_x = interpolate_x_at_y(
    await create_preview_path(10, calibration_launch),
    calibration_y,
  );
  const live_approach_x = await live_entry_x_before_contact(10, calibration_launch, calibration_y);
  const calibration_delta_feet = Math.abs(preview_approach_x - live_approach_x);
  const calibration_board_width_feet = board_width(10);
  const report = {
    purpose: "M3 temporary tuning evidence; values are observations, not permanent gates.",
    shot_harness: benchmark.shot_harness,
    benchmark_settlement: {
      samples: benchmark.samples.length,
      false_timeouts: benchmark.samples.filter((sample) => sample.timed_out).length,
    },
    hook_at_head_pin_plane: {
      zero_spin_x_feet: zero_spin_x,
      full_spin_x_feet: full_spin_x,
      full_spin_displacement_feet: full_spin_x - zero_spin_x,
    },
    preview_live_calibration: {
      launch: calibration_launch,
      measurement_plane: {
        y_feet: calibration_y,
        description:
          "One foot before the head-pin center, before ball-to-head-pin contact; collision outcomes are intentionally not used for this calibration.",
        minimum_clearance_before_contact_feet: 1 - (ball_radius + pin_radius),
      },
      preview_x_feet: preview_approach_x,
      live_x_feet: live_approach_x,
      delta_feet: calibration_delta_feet,
      delta_boards: calibration_delta_feet / calibration_board_width_feet,
      visible_tolerance_boards: visible_board_tolerance_boards,
      head_pin_plane_preview_x_feet: preview_calibration_x,
    },
    control_scale: await Promise.all([control_measurement(10), control_measurement(990)]),
    performance_evidence: {
      benchmark_990: summarize_990_cost(benchmark),
      frame_window_990: {
        viewport: frame_window.viewport,
        samples: frame_window.samples,
        median_ms: frame_window.median_ms,
        p95_ms: frame_window.p95_ms,
        evidence_guards: { median_ms_at_most: 50, p95_ms_at_most: 60 },
      },
    },
  };
  await mkdir("artifacts/m3", { recursive: true });
  await writeFile("artifacts/m3/tuning_report.json", `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
