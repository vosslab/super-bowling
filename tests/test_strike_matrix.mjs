import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classify_head_pin_crossing,
  classify_sample,
  default_probe_settings,
  get_sweep_definition,
  get_sweep_settings,
  parse_probe_options,
  run_cli,
  run_strike_matrix,
  summarize_matrix_samples,
  sweep_crossing_definition,
} from "../devel/probe_strike_matrix.mjs";
import { aim_limits, board_position_limits } from "../src/game/aim.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";

const cascade_baseline = readFileSync(
  new URL("../docs/active_plans/reports/cascade_baseline.md", import.meta.url),
  "utf8",
);

function output_buffer() {
  let text = "";
  return {
    stream: { write: (value) => void (text += value) },
    text: () => text,
  };
}

test("strike matrix defaults match the player aim defaults", () => {
  const options = parse_probe_options([]);
  assert.deepEqual(options.settings, default_probe_settings);
  assert.equal(options.require_all_strikes, false);
});

test("strike matrix parses a complete fixed launch and strict result option", () => {
  const options = parse_probe_options([
    "--power",
    "18",
    "--start-position",
    "-0.25",
    "--angle",
    "0.02",
    "--spin",
    "-0.5",
    "--require-all-strikes",
  ]);
  assert.deepEqual(options.settings, { power: 18, start_position: -0.25, angle: 0.02, spin: -0.5 });
  assert.equal(options.require_all_strikes, true);
});

test("strike matrix rejects incomplete and unknown options", () => {
  assert.throws(() => parse_probe_options(["--power"]), /requires a number/);
  assert.throws(() => parse_probe_options(["--wobble", "1"]), /Unknown argument/);
  assert.throws(() => parse_probe_options(["--power", "not-a-number"]), /must be a finite number/);
});

test("permanent sweep derives every endpoint and produces a unique frozen grid", () => {
  const definition = get_sweep_definition();
  const limits = aim_limits(definition.pin_count);
  const board_limits = board_position_limits(definition.pin_count);
  const settings = get_sweep_settings();

  assert.equal(definition.power_steps[0], limits.minimum_power);
  assert.equal(definition.power_steps.at(-1), limits.maximum_power);
  assert.equal(definition.board_minimum, board_limits.minimum);
  assert.equal(definition.board_maximum, board_limits.maximum);
  assert.equal(definition.angle_steps[0], limits.minimum_angle);
  assert.equal(definition.angle_steps.at(-1), limits.maximum_angle);
  assert.equal(definition.spin_steps[0], limits.minimum_spin);
  assert.equal(definition.spin_steps.at(-1), limits.maximum_spin);
  assert.equal(definition.board_count, 32);
  assert.equal(settings.length, definition.total_sample_count);
  assert.equal(settings.length, 4000);
  assert.equal(new Set(settings.map((setting) => JSON.stringify(setting))).size, settings.length);
});

test("head-pin crossing classifications preserve the recorded inclusive bands", () => {
  assert.equal(classify_head_pin_crossing(0.15).classification, "pocket");
  assert.equal(classify_head_pin_crossing(-0.4).classification, "pocket");
  assert.equal(classify_head_pin_crossing(0.05).classification, "centered");
  assert.equal(classify_head_pin_crossing(-0.05).classification, "centered");
  assert.equal(classify_head_pin_crossing(0.050001).classification, "other");
  assert.deepEqual(classify_head_pin_crossing(undefined), {
    reached_head_pin_plane: false,
    classification: "did_not_reach",
  });
});

test("sweep options preserve the frozen interface without starting its simulations for help", async () => {
  assert.equal(parse_probe_options(["--sweep"]).sweep, true);
  assert.throws(() => parse_probe_options(["--sweep", "--power", "16"]), /recorded search space/);

  const help_stdout = output_buffer();
  let sweep_runs = 0;
  assert.equal(
    await run_cli(["--sweep", "--help"], {
      stdout: help_stdout.stream,
      run_sweep: async () => {
        sweep_runs += 1;
        throw new Error("--sweep --help must not run simulations");
      },
    }),
    0,
  );
  assert.equal(sweep_runs, 0);
  assert.match(help_stdout.text(), /permanent 10-pin, 4,000-shot limit-derived sweep/);
});

test("sweep writes each WP-D1 diagnostic as deterministic JSON", async () => {
  const definition = get_sweep_definition();
  const diagnostics = {
    runtime_collider_mass: { ball: 1, standing_pin: 2 },
    endpoint_velocity_change_interpretation:
      "net pre/post-step endpoint change; simultaneous contacts may contribute",
    paths: {
      ball_pin: {
        contact_occurrences: 1,
        contact_force_events: 2,
        total_impulse: 3,
        maximum_impulse: 4,
        total_endpoint_velocity_change: 5,
        maximum_endpoint_velocity_change: 6,
        contacts_after_fallen_collider_replacement: 7,
        deepest_propagation_depth: 0,
        deepest_contact_row: 0,
      },
      pin_pin: {
        contact_occurrences: 8,
        contact_force_events: 9,
        total_impulse: 10,
        maximum_impulse: 11,
        total_endpoint_velocity_change: 12,
        maximum_endpoint_velocity_change: 13,
        contacts_after_fallen_collider_replacement: 14,
        deepest_propagation_depth: 15,
        deepest_contact_row: 3,
      },
    },
    fallen_pins: [
      {
        pin_id: 1,
        row_index: 2,
        first_contact: { source: "pin" },
        final_distance_from_rack_slot: 0.5,
        impact: { active: true, sleeping: false },
        final_collider_shape: "fallen_capsule",
      },
    ],
    fallen_set_shape: [
      { row_index: 2, fallen_count: 1, minimum_x: 0, maximum_x: 0, lateral_spread: 0 },
    ],
  };
  const sample = {
    settings: { power: 16, start_position: 0, angle: 0, spin: 0 },
    label: "10 pins",
    pin_count: 10,
    standing_pin_count: 9,
    fallen_pin_count: 1,
    conservation: true,
    strike: false,
    execution_valid: true,
    settled: true,
    timed_out: false,
    steps: 1,
    simulation_seconds: 1 / 60,
    head_pin_crossing: classify_head_pin_crossing(0.2),
    collision_diagnostics: diagnostics,
  };
  const stdout = output_buffer();
  assert.equal(
    await run_cli(["--sweep"], {
      stdout: stdout.stream,
      run_sweep: async () => ({
        deterministic: {
          fixed_step_seconds: 1 / 60,
          stochastic_variability: false,
          stochastic_source: "none",
        },
        definition,
        samples: [sample],
        execution_valid: true,
        all_strikes: false,
      }),
    }),
    0,
  );
  const diagnostics_line = stdout
    .text()
    .split("\n")
    .find((line) => line.startsWith("Sweep diagnostics: "));
  assert.ok(diagnostics_line);
  assert.deepEqual(JSON.parse(diagnostics_line.slice("Sweep diagnostics: ".length)), {
    settings: sample.settings,
    head_pin_crossing: sample.head_pin_crossing,
    collision_diagnostics: diagnostics,
  });
});

test("frozen baseline report agrees with the maintained sweep contract", () => {
  const definition = get_sweep_definition();
  const report_row = (name) => {
    const row = cascade_baseline.match(
      new RegExp(`^\\|\\s*${name}\\s*\\|\\s*(.*?)\\s*\\|\\s*(\\d+)\\s*\\|\\s*$`, "m"),
    );
    assert.ok(row, `baseline report has a ${name} row`);
    return { values: row[1], count: Number(row[2]) };
  };
  const code_numbers = (text) =>
    [...text.matchAll(/`([+-]?\d+(?:\.\d+)?)`/g)].map((match) => Number(match[1]));
  const power = report_row("Power");
  const boards = report_row("Start position");
  const angle = report_row("Angle");
  const spin = report_row("Spin");
  const board_values = code_numbers(boards.values);
  const angle_values = code_numbers(angle.values);
  const grid = cascade_baseline.match(/`(\d+) x (\d+) x (\d+) x (\d+) = ([\d,]+)`/);
  const plane = cascade_baseline.match(/`y = ([\d.]+) ft`/);
  const pocket = cascade_baseline.match(/pocket line crosses `([\d.]+)\.\.([\d.]+) ft`/);
  const centered = cascade_baseline.match(/centered line crosses within `([\d.]+) ft`/);

  assert.deepEqual(code_numbers(power.values), definition.power_steps);
  assert.equal(power.count, definition.power_steps.length);
  assert.deepEqual(board_values, [
    definition.board_minimum,
    definition.board_maximum,
    definition.board_interval,
  ]);
  assert.equal(boards.count, definition.board_count);
  assert.deepEqual(angle_values.slice(0, 2), [
    definition.angle_steps[0],
    definition.angle_steps.at(-1),
  ]);
  assert.equal(angle.count, definition.angle_steps.length);
  assert.deepEqual(code_numbers(spin.values), definition.spin_steps);
  assert.equal(spin.count, definition.spin_steps.length);
  assert.ok(grid, "baseline report records the grid product");
  assert.deepEqual(grid.slice(1, 5).map(Number), [
    definition.power_steps.length,
    definition.board_count,
    definition.angle_steps.length,
    definition.spin_steps.length,
  ]);
  assert.equal(Number(grid[5].replace(",", "")), definition.total_sample_count);
  assert.ok(plane, "baseline report records the head-pin plane");
  assert.equal(Number(plane[1]), sweep_crossing_definition.head_pin_plane);
  assert.ok(pocket, "baseline report records the pocket band");
  assert.deepEqual(pocket.slice(1).map(Number), [
    sweep_crossing_definition.pocket_minimum,
    sweep_crossing_definition.pocket_maximum,
  ]);
  assert.ok(centered, "baseline report records the centered band");
  assert.equal(Number(centered[1]), sweep_crossing_definition.centered_maximum);
  assert.match(cascade_baseline, /WP-D3 owns this section/);
});

test("strike classification requires clean settlement and exact pin accounting", () => {
  assert.deepEqual(
    classify_sample({
      pin_count: 10,
      standing_pin_count: 0,
      fallen_pin_count: 10,
      settled: true,
      timed_out: false,
    }),
    { conservation: true, strike: true, execution_valid: true },
  );
  assert.deepEqual(
    classify_sample({
      pin_count: 10,
      standing_pin_count: 0,
      fallen_pin_count: 10,
      settled: false,
      timed_out: true,
    }),
    { conservation: true, strike: false, execution_valid: false },
  );
  assert.deepEqual(
    classify_sample({
      pin_count: 10,
      standing_pin_count: 1,
      fallen_pin_count: 10,
      settled: true,
      timed_out: false,
    }),
    { conservation: false, strike: false, execution_valid: false },
  );
});

test("strike matrix runs every menu mode with its actual rack total", async () => {
  const report = await run_strike_matrix(default_probe_settings);
  assert.equal(report.deterministic.stochastic_variability, false);
  assert.equal(report.deterministic.stochastic_source, "none");
  assert.deepEqual(
    report.samples.map((sample) => sample.mode),
    [...supported_pin_counts],
  );
  assert.deepEqual(
    report.samples.map((sample) => sample.pin_count),
    supported_pin_counts.map(get_rack_pin_count),
  );
  assert.deepEqual(summarize_matrix_samples(report.samples), {
    execution_valid: report.execution_valid,
    all_strikes: report.all_strikes,
  });
  for (const sample of report.samples) {
    assert.equal(
      sample.conservation,
      sample.standing_pin_count + sample.fallen_pin_count === sample.pin_count,
    );
    assert.equal(
      sample.execution_valid,
      sample.settled && !sample.timed_out && sample.conservation,
    );
  }
});

test("strike matrix CLI keeps normal and strict result policies distinct", async () => {
  const stdout = output_buffer();
  const stderr = output_buffer();
  const non_strike_report = {
    settings: default_probe_settings,
    samples: [],
    execution_valid: true,
    all_strikes: false,
  };
  const run_matrix = async () => non_strike_report;

  assert.equal(await run_cli([], { stdout: stdout.stream, stderr: stderr.stream, run_matrix }), 0);
  assert.match(stdout.text(), /all racks strike=false/);
  assert.equal(stderr.text(), "");

  const strict_stdout = output_buffer();
  const strict_stderr = output_buffer();
  assert.equal(
    await run_cli(["--require-all-strikes"], {
      stdout: strict_stdout.stream,
      stderr: strict_stderr.stream,
      run_matrix,
    }),
    1,
  );
  assert.match(strict_stderr.text(), /--require-all-strikes found a non-strike rack/);
});

test("strike matrix CLI preserves help without starting the simulation", async () => {
  const stdout = output_buffer();
  const stderr = output_buffer();
  assert.equal(
    await run_cli(["--help"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      run_matrix: async () => {
        throw new Error("help must not start the simulation");
      },
    }),
    0,
  );
  assert.match(stdout.text(), /^Usage: npm run strike-matrix -- \[options\]/);
  assert.equal(stderr.text(), "");
});

test("strike matrix CLI reports argument and range errors without a stack trace", async () => {
  const stdout = output_buffer();
  const stderr = output_buffer();
  assert.equal(
    await run_cli(["--wobble", "1"], { stdout: stdout.stream, stderr: stderr.stream }),
    1,
  );
  assert.match(stderr.text(), /^Error: Unknown argument: --wobble\n\nUsage:/);
  assert.doesNotMatch(stderr.text(), /at .*probe_strike_matrix/);

  const range_stderr = output_buffer();
  assert.equal(await run_cli(["--power", "999"], { stderr: range_stderr.stream }), 1);
  assert.match(range_stderr.text(), /^Error: --power=999 is outside the 10-mode UI range/);
});
