import assert from "node:assert/strict";
import test from "node:test";

import {
  classify_sample,
  default_probe_settings,
  parse_probe_options,
  run_cli,
} from "../devel/probe_strike_matrix.mjs";

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
  assert.match(stdout.text(), /^Usage:/);
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
