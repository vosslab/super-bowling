import assert from "node:assert/strict";
import test from "node:test";

import { create_pin_id } from "../src/brands.ts";
import { benchmark_fixtures } from "../src/config/benchmark_fixtures.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import { get_mode_tuning } from "../src/config/physics.ts";
import { find_nearby_pin_ids, create_activation_index } from "../src/simulation/activation.ts";
import { get_benchmark_validation_failures } from "../src/simulation/benchmark.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_velocity_x_offset,
} from "../src/simulation/protocol.ts";
import { create_rack } from "../src/simulation/rack.ts";
import { create_simulation_world } from "../src/simulation/world.ts";
import { create_draw_commands } from "../src/render/benchmark_renderer.ts";

async function run_centered_roll(mode, power) {
  const world = await create_simulation_world(get_rack_pin_count(mode));
  const head_pin = world.rack.slots[0];
  assert.ok(head_pin);
  world.launch(power, 0);
  let head_contact_step;
  let terminal = false;
  let fallen_pin_count = 0;
  for (let step = 1; step <= 900 && !terminal; step += 1) {
    const result = world.step_fixed();
    const head_velocity = world.get_pin_velocity(head_pin.pin_id);
    if (head_contact_step === undefined && Math.hypot(head_velocity.x, head_velocity.y) > 0.01) {
      head_contact_step = step;
    }
    fallen_pin_count = world.get_counts().fallen_pin_count;
    terminal = result.settled || result.timed_out;
    if (head_contact_step !== undefined && fallen_pin_count >= 1) break;
  }
  world.dispose();
  return { terminal, head_contact_step, fallen_pin_count };
}

test("creates exact deterministic racks with unique ids and containing bounds", () => {
  for (const pin_count of supported_pin_counts) {
    const rack_pin_count = get_rack_pin_count(pin_count);
    const rack = create_rack(rack_pin_count);
    assert.equal(rack.slots.length, rack_pin_count);
    assert.equal(new Set(rack.slots.map((slot) => slot.pin_id)).size, rack_pin_count);
    assert.ok(
      rack.slots.every((slot) => slot.x >= rack.bounds.min_x && slot.x <= rack.bounds.max_x),
    );
  }
});

test("builds every supported rack from one centered head pin into centered triangular rows", () => {
  for (const pin_count of supported_pin_counts) {
    const rack_pin_count = get_rack_pin_count(pin_count);
    const rack = create_rack(rack_pin_count);
    const rows = new Map();
    for (const slot of rack.slots) {
      const row = rows.get(slot.row_index) ?? [];
      row.push(slot);
      rows.set(slot.row_index, row);
    }
    assert.equal(rack.slots.length, rack_pin_count);
    const head_row = rows.get(0);
    assert.ok(head_row);
    assert.equal(head_row.length, 1);
    assert.equal(head_row[0].x, 0);
    assert.equal(head_row[0].y, Math.min(...rack.slots.map((slot) => slot.y)));

    const ordered_rows = [...rows.entries()].sort(([first], [second]) => first - second);
    let total_capacity = 0;
    for (const [row_index, row] of ordered_rows) {
      const capacity = row_index + 1;
      total_capacity += row.length;
      assert.equal(row.length, capacity);
      assert.deepEqual(
        row.map((slot) => slot.column_index),
        Array.from({ length: row.length }, (_, column_index) => column_index),
      );
      for (let index = 0; index < row.length; index += 1) {
        const opposite = row[row.length - 1 - index];
        assert.ok(opposite);
        assert.equal(row[index].x + opposite.x, 0);
      }
    }
    assert.equal(total_capacity, rack_pin_count);
    for (const slot of rack.slots.slice(1)) {
      assert.ok(slot.y > head_row[0].y);
    }
  }
});

test("exposes only snapshot and activation tuning for every supported count", () => {
  for (const pin_count of supported_pin_counts) {
    const tuning = get_mode_tuning(pin_count);
    assert.equal(tuning.snapshot_hz, pin_count <= 100 ? 60 : 30);
    assert.equal(Number.isFinite(tuning.activation_radius), true);
  }
});

test("shares labeled steering fixtures between benchmark entry points", () => {
  const hook = benchmark_fixtures.find((fixture) => fixture.fixture_id === "late_left_hook");
  assert.deepEqual(hook, {
    fixture_id: "late_left_hook",
    label: "late left hook",
    lateral_offset: 0.25,
    power: 17,
    steer_start_step: 90,
    steer_end_step: 210,
    steer_direction: -1,
  });
});

test("includes only radius candidates across spatial-hash cell boundaries", () => {
  const slots = [
    { pin_id: create_pin_id(0), x: -1.01, y: 0, row_index: 0, column_index: 0 },
    { pin_id: create_pin_id(1), x: 0.99, y: 0, row_index: 0, column_index: 1 },
    { pin_id: create_pin_id(2), x: 1.01, y: 0, row_index: 0, column_index: 2 },
  ];
  const index = create_activation_index(slots, 1);
  assert.deepEqual(find_nearby_pin_ids(index, 0, 0, 1).map(Number).sort(), [1]);
});

test("direct contact wakes a sleeping dynamic pin and transfers velocity", async () => {
  const world = await create_simulation_world(10);
  const first_pin = world.rack.slots[0];
  assert.ok(first_pin);
  world.launch(24, first_pin.x);
  for (let step = 0; step < 300; step += 1) {
    world.step_fixed();
    const velocity = world.get_pin_velocity(first_pin.pin_id);
    if (Math.hypot(velocity.x, velocity.y) > 0) break;
  }
  const velocity = world.get_pin_velocity(first_pin.pin_id);
  assert.equal(world.is_pin_active(first_pin.pin_id), true);
  assert.ok(Math.hypot(velocity.x, velocity.y) > 0);
  world.dispose();
});

test("every centered selectable power reaches and knocks down the head pin", async () => {
  for (let power = 8; power <= 24; power += 1) {
    const roll = await run_centered_roll(10, power);
    assert.notEqual(roll.head_contact_step, undefined);
    assert.ok(roll.fallen_pin_count >= 1, `power ${power} should knock down a pin`);
  }
});

test("shared weak, default, and full powers contact every representative rack", async () => {
  for (const mode of [10, 100, 1000]) {
    for (const power of [8, 16, 24]) {
      const roll = await run_centered_roll(mode, power);
      assert.notEqual(roll.head_contact_step, undefined, `${mode}-pin power ${power}`);
      assert.ok(roll.fallen_pin_count >= 1, `${mode}-pin power ${power}`);
    }
  }
});

test("ten-pin power produces progressively faster head-pin impact", async () => {
  const weak = await run_centered_roll(10, 8);
  const default_roll = await run_centered_roll(10, 16);
  const full = await run_centered_roll(10, 24);
  assert.ok(weak.head_contact_step > default_roll.head_contact_step);
  assert.ok(default_roll.head_contact_step > full.head_contact_step);
});

test("a second roll retains its full settlement lifecycle on the same rack", async () => {
  const world = await create_simulation_world(10);
  const settle_roll = () => {
    let terminal = false;
    let step_count = 0;
    while (!terminal && step_count < 1600) {
      const result = world.step_fixed();
      terminal = result.settled || result.timed_out;
      step_count += 1;
    }
    return { terminal, step_count };
  };
  world.launch(18, 0);
  assert.equal(settle_roll().terminal, true);
  world.launch(18, 0);
  const second_roll = settle_roll();
  assert.equal(second_roll.terminal, true);
  assert.ok(second_roll.step_count > 1);
  world.dispose();
});

test("count conservation and exactly-once falls hold through a cascade", async () => {
  const world = await create_simulation_world(get_rack_pin_count(20));
  world.launch(20, 0);
  const fall_ids = new Set();
  for (let step = 0; step < 900; step += 1) {
    const result = world.step_fixed();
    for (const pin_id of result.fall_events) {
      assert.equal(fall_ids.has(pin_id), false);
      fall_ids.add(pin_id);
    }
    const counts = world.get_counts();
    assert.equal(counts.standing_pin_count + counts.fallen_pin_count, get_rack_pin_count(20));
    if (result.settled || result.timed_out) break;
  }
  world.dispose();
});

test("benchmark validation identifies incomplete, unconserved, and unusable samples", () => {
  const report = {
    generated_at: "2026-07-29T00:00:00.000Z",
    samples: [
      {
        mode: 10,
        pin_count: 10,
        fixture_id: "head_on",
        settled: false,
        timed_out: true,
        fixture_cpu_time_ms: Number.NaN,
        fixed_step_cpu_time_ms: { mean: 1, p95: 1 },
        emitted_frame_cpu_time_ms: { mean: 1, p95: 1 },
        settlement_time_ms: 1,
        total_body_count: 11,
        max_awake_body_count: 11,
        final_awake_body_count: 0,
        standing_pin_count: 9,
        fallen_pin_count: 2,
      },
    ],
  };
  const failures = get_benchmark_validation_failures(report);
  assert.ok(failures.some((failure) => failure.includes("did not settle")));
  assert.ok(failures.some((failure) => failure.includes("timeout")));
  assert.ok(failures.some((failure) => failure.includes("conservation")));
  assert.ok(failures.some((failure) => failure.includes("non-finite")));
});

test("renderer creates a finite command for every pin at each framing count", () => {
  for (const pin_count of [10, 105, 990]) {
    const data = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
    data[0] = -1;
    data[snapshot_velocity_x_offset] = 1;
    const commands = create_draw_commands(data, data, pin_count, 0.5, 1600, 1000);
    assert.equal(commands.length, pin_count + 2);
    assert.ok(
      commands.every((command) =>
        [command.x, command.y, command.width, command.height, command.angle].every(Number.isFinite),
      ),
    );
  }
});
