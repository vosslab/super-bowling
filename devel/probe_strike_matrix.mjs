import { fileURLToPath } from "node:url";

import { default_aim, aim_limits } from "../src/game/aim.ts";
import {
  get_mode_label,
  get_rack_pin_count,
  supported_pin_counts,
} from "../src/config/pin_counts.ts";
import { get_settle_max_seconds, physics_config } from "../src/config/physics.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

const option_names = new Set(["power", "start-position", "angle", "spin"]);

export const default_probe_settings = Object.freeze(default_aim(get_rack_pin_count(10)));

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
    if (!argument?.startsWith("--")) throw new Error(`Unknown argument: ${argument}`);
    const option = argument.slice(2);
    if (!option_names.has(option)) throw new Error(`Unknown argument: ${argument}`);
    const value = parse_number(option, arguments_list[index + 1]);
    index += 1;
    if (option === "start-position") settings.start_position = value;
    else if (option === "power") settings.power = value;
    else if (option === "angle") settings.angle = value;
    else settings.spin = value;
  }
  return { help, require_all_strikes, settings };
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

async function run_one_rack(mode, settings) {
  const pin_count = get_rack_pin_count(mode);
  const world = await create_simulation_world(pin_count);
  try {
    world.launch(settings.power, settings.start_position, settings.angle, settings.spin);
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
    }
    const counts = world.get_counts();
    const classification = classify_sample({ pin_count, ...counts, settled, timed_out });
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

export function format_sample(sample) {
  const outcome = sample.strike ? "STRIKE" : "not a strike";
  const settlement = sample.timed_out ? "timed out" : sample.settled ? "settled" : "unfinished";
  return (
    `${sample.label}: ${outcome}; ${sample.fallen_pin_count}/${sample.pin_count} fallen, ` +
    `${sample.standing_pin_count} standing; ${settlement}; ${sample.steps} steps ` +
    `(${sample.simulation_seconds.toFixed(2)} s); conservation=${sample.conservation}`
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
  for (const sample of report.samples) stdout.write(`${format_sample(sample)}\n`);
  stdout.write(
    `Matrix: execution valid=${report.execution_valid}; all racks strike=${report.all_strikes}.\n`,
  );
}

export async function run_cli(
  arguments_list,
  { stdout = process.stdout, stderr = process.stderr, run_matrix = run_strike_matrix } = {},
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
  const report = await run_matrix(options.settings);
  write_report(report, stdout);
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
