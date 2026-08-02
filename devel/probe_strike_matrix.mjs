import { fileURLToPath } from "node:url";

import {
  aim_limits,
  board_position_limits,
  default_aim,
  start_position_from_boards,
} from "../src/game/aim.ts";
import { foul_to_head_pin } from "../src/config/lane.ts";
import {
  get_mode_label,
  get_rack_pin_count,
  supported_pin_counts,
} from "../src/config/pin_counts.ts";
import { get_settle_max_seconds, physics_config } from "../src/config/physics.ts";
import { pin_snapshot_stride, read_snapshot_ball } from "../src/simulation/protocol.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

const option_names = new Set(["power", "start-position", "angle", "spin"]);
const ten_pin_mode = 10;
const sweep_power_step_count = 5;
const sweep_angle_step_count = 5;
const sweep_spin_step_count = 5;
const sweep_board_interval = 1;
const pocket_crossing_minimum = 0.15;
const pocket_crossing_maximum = 0.4;
const centered_crossing_maximum = 0.05;

export const default_probe_settings = Object.freeze(default_aim(get_rack_pin_count(10)));
export const sweep_crossing_definition = Object.freeze({
  head_pin_plane: foul_to_head_pin,
  pocket_minimum: pocket_crossing_minimum,
  pocket_maximum: pocket_crossing_maximum,
  centered_maximum: centered_crossing_maximum,
});

function equally_spaced_values(minimum, maximum, count) {
  if (count < 2) return [minimum];
  return Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1),
  );
}

/** The permanent 10-pin search space, generated from player-facing aim limits. */
export function get_sweep_definition() {
  const pin_count = get_rack_pin_count(ten_pin_mode);
  const limits = aim_limits(pin_count);
  const board_limits = board_position_limits(pin_count);
  const board_count =
    Math.round((board_limits.maximum - board_limits.minimum) / sweep_board_interval) + 1;
  const power_steps = equally_spaced_values(
    limits.minimum_power,
    limits.maximum_power,
    sweep_power_step_count,
  );
  const angle_steps = equally_spaced_values(
    limits.minimum_angle,
    limits.maximum_angle,
    sweep_angle_step_count,
  );
  const spin_steps = equally_spaced_values(
    limits.minimum_spin,
    limits.maximum_spin,
    sweep_spin_step_count,
  );
  return {
    pin_count,
    power_steps,
    board_minimum: board_limits.minimum,
    board_maximum: board_limits.maximum,
    board_interval: sweep_board_interval,
    board_count,
    angle_steps,
    spin_steps,
    total_sample_count: power_steps.length * board_count * angle_steps.length * spin_steps.length,
  };
}

export function get_sweep_settings() {
  const definition = get_sweep_definition();
  const settings = [];
  for (const power of definition.power_steps) {
    for (let board_index = 0; board_index < definition.board_count; board_index += 1) {
      const boards = definition.board_minimum + board_index * definition.board_interval;
      for (const angle of definition.angle_steps) {
        for (const spin of definition.spin_steps) {
          settings.push({
            power,
            start_position: start_position_from_boards(definition.pin_count, boards),
            angle,
            spin,
          });
        }
      }
    }
  }
  return settings;
}

export function usage() {
  return (
    `Usage: npm run strike-matrix -- [options]\n\n` +
    `Run one fixed four-parameter launch against every supported rack. The probe uses\n` +
    `the simulation's fixed timestep and has no stochastic or seeded variability.\n\n` +
    `Options:\n` +
    `  --power <number>           Launch power (default: ${default_probe_settings.power})\n` +
    `  --start-position <number>  Lateral position in feet (default: ${default_probe_settings.start_position})\n` +
    `  --angle <number>           Launch angle in radians (default: ${default_probe_settings.angle})\n` +
    `  --spin <number>            Hook spin (default: ${default_probe_settings.spin})\n` +
    `  --require-all-strikes      Exit nonzero unless every rack is a settled strike\n` +
    `  --sweep                    Run the permanent 10-pin, 4,000-shot limit-derived sweep\n` +
    `                             (no individual launch options); classify the measured 60-ft\n` +
    `                             crossing as pocket at 0.15..0.40 ft or centered within 0.05 ft\n` +
    `  --help                     Show this help\n`
  );
}

function parse_number(option, value) {
  if (value === undefined) throw new Error(`--${option} requires a number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${option} must be a finite number.`);
  return parsed;
}

export function parse_probe_options(arguments_list) {
  const settings = { ...default_probe_settings };
  let require_all_strikes = false;
  let help = false;
  let sweep = false;
  let has_launch_option = false;
  for (let index = 0; index < arguments_list.length; index += 1) {
    const argument = arguments_list[index];
    if (argument === "--help") {
      help = true;
      continue;
    }
    if (argument === "--require-all-strikes") {
      require_all_strikes = true;
      continue;
    }
    if (argument === "--sweep") {
      sweep = true;
      continue;
    }
    if (!argument?.startsWith("--")) throw new Error(`Unknown argument: ${argument}`);
    const option = argument.slice(2);
    if (!option_names.has(option)) throw new Error(`Unknown argument: ${argument}`);
    const value = parse_number(option, arguments_list[index + 1]);
    index += 1;
    has_launch_option = true;
    if (option === "start-position") settings.start_position = value;
    else if (option === "power") settings.power = value;
    else if (option === "angle") settings.angle = value;
    else settings.spin = value;
  }
  if (sweep && has_launch_option) {
    throw new Error(
      "--sweep uses its recorded search space and accepts no individual launch options.",
    );
  }
  return { help, require_all_strikes, settings, sweep };
}

export function assert_settings_are_legal(settings) {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    const limits = aim_limits(pin_count);
    const entries = [
      ["power", settings.power, limits.minimum_power, limits.maximum_power],
      [
        "start-position",
        settings.start_position,
        limits.minimum_start_position,
        limits.maximum_start_position,
      ],
      ["angle", settings.angle, limits.minimum_angle, limits.maximum_angle],
      ["spin", settings.spin, limits.minimum_spin, limits.maximum_spin],
    ];
    for (const [name, value, minimum, maximum] of entries) {
      if (value < minimum || value > maximum) {
        throw new Error(
          `--${name}=${value} is outside the ${mode}-mode UI range ${minimum}..${maximum}.`,
        );
      }
    }
  }
}

export function classify_sample(sample) {
  const conservation = sample.standing_pin_count + sample.fallen_pin_count === sample.pin_count;
  const execution_valid = sample.settled && !sample.timed_out && conservation;
  const strike =
    execution_valid &&
    sample.standing_pin_count === 0 &&
    sample.fallen_pin_count === sample.pin_count;
  return { conservation, strike, execution_valid };
}

export function summarize_matrix_samples(samples) {
  return {
    execution_valid: samples.every((sample) => sample.execution_valid),
    all_strikes: samples.every((sample) => sample.strike),
  };
}

export function get_probe_exit_code(report, require_all_strikes) {
  if (!report.execution_valid) return 1;
  return require_all_strikes && !report.all_strikes ? 1 : 0;
}

function summarize_fallen_set(world) {
  const rows = new Map();
  const fallen_pins = [];
  for (const slot of world.rack.slots) {
    if (!world.is_pin_fallen(slot.pin_id)) continue;
    const position = world.get_pin_final_position(slot.pin_id);
    const profile = world.get_pin_collision_profile(slot.pin_id);
    const impact = world.get_pin_impact_diagnostic(slot.pin_id);
    const pin = {
      pin_id: Number(slot.pin_id),
      row_index: slot.row_index,
      first_contact: world.get_pin_first_contact(slot.pin_id) ?? null,
      final_distance_from_rack_slot: world.get_pin_final_distance_from_rack_slot(slot.pin_id) ?? 0,
      impact: impact ?? null,
      final_collider_shape: profile.shape,
    };
    fallen_pins.push(pin);
    const row = rows.get(slot.row_index) ?? { row_index: slot.row_index, fallen_count: 0, xs: [] };
    row.fallen_count += 1;
    row.xs.push(position.x);
    rows.set(slot.row_index, row);
  }
  const fallen_set_shape = [...rows.values()].map((row) => ({
    row_index: row.row_index,
    fallen_count: row.fallen_count,
    minimum_x: Math.min(...row.xs),
    maximum_x: Math.max(...row.xs),
    lateral_spread: Math.max(...row.xs) - Math.min(...row.xs),
  }));
  return { fallen_pins, fallen_set_shape };
}

function get_ball_position(world) {
  const snapshot = world.create_snapshot();
  return read_snapshot_ball(snapshot.data, snapshot.pin_count * pin_snapshot_stride);
}

export function classify_head_pin_crossing(crossing_x) {
  if (crossing_x === undefined) {
    return { reached_head_pin_plane: false, classification: "did_not_reach" };
  }
  const distance_from_center = Math.abs(crossing_x);
  return {
    reached_head_pin_plane: true,
    crossing_x,
    distance_from_center,
    classification:
      distance_from_center >= sweep_crossing_definition.pocket_minimum &&
      distance_from_center <= sweep_crossing_definition.pocket_maximum
        ? "pocket"
        : distance_from_center <= sweep_crossing_definition.centered_maximum
          ? "centered"
          : "other",
  };
}

async function run_one_rack(mode, settings, { measure_head_pin_crossing = false } = {}) {
  const pin_count = get_rack_pin_count(mode);
  const world = await create_simulation_world(pin_count);
  try {
    const runtime_collider_mass = {
      ball: world.get_ball_collision_profile().mass,
      standing_pin: world.get_pin_collision_profile(world.rack.slots[0].pin_id).mass,
    };
    world.launch(settings.power, settings.start_position, settings.angle, settings.spin);
    let previous_ball_position = measure_head_pin_crossing ? get_ball_position(world) : undefined;
    let head_pin_crossing_x;
    const maximum_steps = Math.ceil(
      get_settle_max_seconds(pin_count) / physics_config.fixed_step_seconds,
    );
    let settled = false;
    let timed_out = false;
    let step_count = 0;
    while (step_count < maximum_steps && !settled && !timed_out) {
      const result = world.step_fixed();
      settled = result.settled;
      timed_out = result.timed_out;
      step_count += 1;
      if (previous_ball_position !== undefined && head_pin_crossing_x === undefined) {
        const current_ball_position = get_ball_position(world);
        if (
          previous_ball_position.y < foul_to_head_pin &&
          current_ball_position.y >= foul_to_head_pin
        ) {
          const fraction =
            (foul_to_head_pin - previous_ball_position.y) /
            (current_ball_position.y - previous_ball_position.y);
          head_pin_crossing_x =
            previous_ball_position.x +
            (current_ball_position.x - previous_ball_position.x) * fraction;
        }
        previous_ball_position = current_ball_position;
      }
    }
    const counts = world.get_counts();
    const classification = classify_sample({ pin_count, ...counts, settled, timed_out });
    const { fallen_pins, fallen_set_shape } = summarize_fallen_set(world);
    return {
      mode,
      label: get_mode_label(mode),
      pin_count,
      ...counts,
      ...classification,
      settled,
      timed_out,
      steps: step_count,
      simulation_seconds: step_count * physics_config.fixed_step_seconds,
      ...(measure_head_pin_crossing
        ? { head_pin_crossing: classify_head_pin_crossing(head_pin_crossing_x) }
        : {}),
      collision_diagnostics: {
        runtime_collider_mass,
        endpoint_velocity_change_interpretation:
          "net pre/post-step endpoint change; simultaneous contacts may contribute",
        paths: world.get_collision_path_diagnostics(),
        fallen_pins,
        fallen_set_shape,
      },
    };
  } finally {
    world.dispose();
  }
}

export async function run_strike_matrix(settings) {
  assert_settings_are_legal(settings);
  const samples = [];
  for (const mode of supported_pin_counts) samples.push(await run_one_rack(mode, settings));
  const { execution_valid, all_strikes } = summarize_matrix_samples(samples);
  return {
    deterministic: {
      fixed_step_seconds: physics_config.fixed_step_seconds,
      stochastic_variability: false,
      stochastic_source: "none",
    },
    settings,
    samples,
    execution_valid,
    all_strikes,
  };
}

export async function run_strike_sweep() {
  const definition = get_sweep_definition();
  const samples = [];
  for (const settings of get_sweep_settings()) {
    const sample = await run_one_rack(ten_pin_mode, settings, {
      measure_head_pin_crossing: true,
    });
    samples.push({ ...sample, settings });
  }
  const { execution_valid, all_strikes } = summarize_matrix_samples(samples);
  return {
    deterministic: {
      fixed_step_seconds: physics_config.fixed_step_seconds,
      stochastic_variability: false,
      stochastic_source: "none",
    },
    definition,
    samples,
    execution_valid,
    all_strikes,
  };
}

export function format_sample(sample) {
  const outcome = sample.strike ? "STRIKE" : "not a strike";
  const settlement = sample.timed_out ? "timed out" : sample.settled ? "settled" : "unfinished";
  return (
    `${sample.label}: ${outcome}; ${sample.fallen_pin_count}/${sample.pin_count} fallen, ` +
    `${sample.standing_pin_count} standing; ${settlement}; ${sample.steps} steps ` +
    `(${sample.simulation_seconds.toFixed(2)} s); conservation=${sample.conservation}; ` +
    `mass ball=${sample.collision_diagnostics.runtime_collider_mass.ball.toFixed(4)}, ` +
    `pin=${sample.collision_diagnostics.runtime_collider_mass.standing_pin.toFixed(4)}; ` +
    `contacts ball-pin=${sample.collision_diagnostics.paths.ball_pin.contact_occurrences}, ` +
    `pin-pin=${sample.collision_diagnostics.paths.pin_pin.contact_occurrences}, ` +
    `depth=${sample.collision_diagnostics.paths.pin_pin.deepest_propagation_depth}`
  );
}

function write_cli_error(error, stderr) {
  stderr.write(`Error: ${error.message}\n\n${usage()}`);
}

function write_report(report, stdout) {
  stdout.write(
    `Deterministic fixed-step probe: stochastic variability is off; stochastic source: none.\n` +
      `Launch: power=${report.settings.power}, start-position=${report.settings.start_position}, ` +
      `angle=${report.settings.angle}, spin=${report.settings.spin}\n`,
  );
  for (const sample of report.samples) {
    stdout.write(`${format_sample(sample)}\n`);
    stdout.write(`Collision diagnostics: ${JSON.stringify(sample.collision_diagnostics)}\n`);
  }
  stdout.write(
    `Matrix: execution valid=${report.execution_valid}; all racks strike=${report.all_strikes}.\n`,
  );
}

function write_sweep_report(report, stdout) {
  stdout.write(
    `Deterministic 10-pin sweep: ${report.definition.total_sample_count} samples; ` +
      `fixed timestep; stochastic variability is off; stochastic source: none.\n`,
  );
  for (const sample of report.samples) {
    const crossing = sample.head_pin_crossing;
    const crossing_text = crossing.reached_head_pin_plane
      ? `x=${crossing.crossing_x.toFixed(4)} ft, offset=${crossing.distance_from_center.toFixed(4)} ft, ${crossing.classification}`
      : crossing.classification;
    stdout.write(`${format_sample(sample)}; head-pin crossing ${crossing_text}\n`);
    stdout.write(
      `Sweep diagnostics: ${JSON.stringify({
        settings: sample.settings,
        head_pin_crossing: sample.head_pin_crossing,
        collision_diagnostics: sample.collision_diagnostics,
      })}\n`,
    );
  }
  stdout.write(
    `Sweep: execution valid=${report.execution_valid}; all samples strike=${report.all_strikes}.\n`,
  );
}

export async function run_cli(
  arguments_list,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    run_matrix = run_strike_matrix,
    run_sweep = run_strike_sweep,
  } = {},
) {
  let options;
  try {
    options = parse_probe_options(arguments_list);
    assert_settings_are_legal(options.settings);
  } catch (error) {
    write_cli_error(error, stderr);
    return 1;
  }
  if (options.help) {
    stdout.write(usage());
    return 0;
  }
  const report = options.sweep ? await run_sweep() : await run_matrix(options.settings);
  if (options.sweep) write_sweep_report(report, stdout);
  else write_report(report, stdout);
  if (!report.execution_valid) {
    stderr.write("Probe failed: at least one rack did not settle cleanly with conserved pins.\n");
  } else if (options.require_all_strikes && !report.all_strikes) {
    stderr.write("Probe failed: --require-all-strikes found a non-strike rack.\n");
  }
  return get_probe_exit_code(report, options.require_all_strikes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await run_cli(process.argv.slice(2));
}
