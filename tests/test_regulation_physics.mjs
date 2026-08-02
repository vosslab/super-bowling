import assert from "node:assert/strict";
import test from "node:test";

import {
  ball_radius,
  deck_depth,
  foul_to_head_pin,
  gutter_width,
  lane_width,
  pin_radius,
  pit_back_y,
} from "../src/config/lane.ts";
import { supported_pin_counts, get_rack_pin_count } from "../src/config/pin_counts.ts";
import {
  sweep_angle_tolerance_radians,
  sweep_position_tolerance,
} from "../src/simulation/pin_state.ts";
import {
  ball_snapshot_in_pit_flag_offset,
  pin_snapshot_stride,
  read_snapshot_ball,
  snapshot_in_pit_flag_offset,
  snapshot_removed_flag_offset,
  snapshot_state_flag_offset,
} from "../src/simulation/protocol.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

function ball_is_in_pit(world) {
  const snapshot = world.create_snapshot();
  return (
    snapshot.data[snapshot.pin_count * pin_snapshot_stride + ball_snapshot_in_pit_flag_offset] === 1
  );
}

function run_until_ball_reaches_pit(world, maximum_steps = 3_600) {
  for (let step = 0; step < maximum_steps; step += 1) {
    world.step_fixed();
    if (ball_is_in_pit(world)) return true;
  }
  return false;
}

function run_until_settled(world, maximum_steps = 4_800) {
  for (let step = 0; step < maximum_steps; step += 1) {
    const result = world.step_fixed();
    if (result.settled) return true;
  }
  return false;
}

test("minimum-power center and gutter paths reach the pit for every rack and spin direction", async () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    const gutter_start = lane_width(pin_count) / 2 + ball_radius + pin_radius;
    for (const start_position of [-gutter_start, 0, gutter_start]) {
      for (const spin of [-1, 0, 1]) {
        const world = await create_simulation_world(pin_count);
        world.launch(8, start_position, 0, spin);
        assert.equal(
          run_until_ball_reaches_pit(world),
          true,
          `${mode}-pin start ${start_position} spin ${spin}`,
        );
        world.dispose();
      }
    }
  }
});

test("left and right gutter launches reach the pit without knocking pins", async () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    for (const side of [-1, 1]) {
      const world = await create_simulation_world(pin_count);
      const gutter_start = side * (lane_width(pin_count) / 2 + ball_radius + pin_radius);
      world.launch(8, gutter_start, 0, 0);
      assert.equal(run_until_ball_reaches_pit(world), true, `${mode}-pin ${side} gutter path`);
      assert.equal(world.get_counts().fallen_pin_count, 0, `${mode}-pin ${side} gutter pinfall`);
      world.dispose();
    }
  }
});

test("a settled-roll sweep removes deadwood without moving standing pins", async () => {
  const world = await create_simulation_world(10);
  world.launch(18, 0, 0, 0);
  assert.equal(run_until_settled(world), true, "roll settles before the between-roll sweep");
  const before_sweep = world.create_snapshot();
  assert.ok(
    before_sweep.fallen_pin_count > 0,
    "settled roll leaves deadwood for the next-roll sweep",
  );
  const bodies_before = world.get_total_body_count();
  const standing_before = [];
  let deadwood_count = 0;
  for (let index = 0; index < before_sweep.pin_count; index += 1) {
    const offset = index * pin_snapshot_stride;
    if (before_sweep.data[offset + snapshot_state_flag_offset] === 0) {
      standing_before.push(world.get_pin_position(index));
    } else if (before_sweep.data[offset + snapshot_removed_flag_offset] === 0) {
      deadwood_count += 1;
    }
  }
  assert.ok(deadwood_count > 0, "settled roll leaves fallen bodies for the between-roll sweep");
  const standing_count = before_sweep.standing_pin_count;
  world.sweep_deadwood();
  const after_sweep = world.create_snapshot();
  assert.equal(after_sweep.standing_pin_count, standing_count);
  assert.ok(world.get_total_body_count() < bodies_before, "sweep removes fallen rigid bodies");
  for (let index = 0; index < after_sweep.pin_count; index += 1) {
    const offset = index * pin_snapshot_stride;
    if (after_sweep.data[offset + snapshot_state_flag_offset] !== 0) {
      assert.equal(after_sweep.data[offset + snapshot_removed_flag_offset], 1);
    }
  }
  let standing_index = 0;
  for (let index = 0; index < after_sweep.pin_count; index += 1) {
    const offset = index * pin_snapshot_stride;
    if (after_sweep.data[offset + snapshot_state_flag_offset] !== 0) continue;
    const before = standing_before[standing_index++];
    const after = world.get_pin_position(index);
    assert.ok(before);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) <= sweep_position_tolerance);
    assert.ok(Math.abs(after.rotation - before.rotation) <= sweep_angle_tolerance_radians);
  }
  const bodies_after_first_sweep = world.get_total_body_count();
  world.sweep_deadwood();
  assert.equal(world.get_total_body_count(), bodies_after_first_sweep, "repeated sweep is a no-op");
  world.dispose();
});

test("a high-energy deck exit can carry a fallen pin into the pit", async () => {
  const world = await create_simulation_world(10);
  world.launch(24, 0, 0, 0);
  assert.equal(run_until_settled(world), true, "high-energy roll settles");
  const snapshot = world.create_snapshot();
  const captured_pin_count = Array.from({ length: snapshot.pin_count }, (_, index) => {
    const offset = index * pin_snapshot_stride;
    return (
      snapshot.data[offset + snapshot_removed_flag_offset] === 1 &&
      snapshot.data[offset + snapshot_in_pit_flag_offset] === 1
    );
  }).filter(Boolean).length;
  assert.ok(captured_pin_count > 0, "at least one pin reaches the physical pit sensor");
  world.dispose();
});

test("pit capture removes the ball body and a later launch respawns it", async () => {
  const world = await create_simulation_world(10);
  const initial_bodies = world.get_total_body_count();
  world.launch(8, lane_width(10) / 2 + ball_radius + pin_radius, 0, 0);
  assert.equal(run_until_ball_reaches_pit(world), true, "first roll reaches the pit");
  assert.equal(world.get_total_body_count(), initial_bodies - 1, "captured ball leaves Rapier");
  const snapshot = world.create_snapshot();
  const captured_ball = read_snapshot_ball(snapshot.data, snapshot.pin_count * pin_snapshot_stride);
  const deck_back_y = foul_to_head_pin + deck_depth(10);
  assert.ok(captured_ball.y > deck_back_y, "captured ball crosses the physical pit sensor front");
  assert.ok(
    captured_ball.y < pit_back_y(10) - ball_radius,
    "physical pit capture precedes the shared-force pit-back fallback",
  );
  world.launch(8, lane_width(10) / 2 + ball_radius + pin_radius, 0, 0);
  assert.equal(
    world.get_total_body_count(),
    initial_bodies,
    "new launch creates one fresh ball body",
  );
  world.dispose();
});

test("next-roll preparation clears deadwood and restores a sleeping foul-line ball", async () => {
  const world = await create_simulation_world(10);
  world.launch(18, 0, 0, 0);
  assert.equal(run_until_settled(world), true, "first roll settles");
  const before = world.create_snapshot();
  const standing_before = [];
  for (let index = 0; index < before.pin_count; index += 1) {
    const offset = index * pin_snapshot_stride;
    if (before.data[offset + snapshot_state_flag_offset] === 0) {
      standing_before.push({ index, position: world.get_pin_position(index) });
    }
  }
  assert.ok(before.fallen_pin_count > 0, "fixture leaves deadwood to clear");
  world.prepare_next_roll();
  const after = world.create_snapshot();
  const ball = read_snapshot_ball(after.data, after.pin_count * pin_snapshot_stride);
  assert.equal(ball.in_pit, false);
  assert.equal(ball.x, 0);
  assert.equal(ball.y, 0);
  assert.equal(ball.velocity_x, 0);
  assert.equal(ball.velocity_y, 0);
  assert.equal(after.standing_pin_count, before.standing_pin_count);
  assert.equal(after.fallen_pin_count, before.fallen_pin_count);
  for (const { index, position } of standing_before) {
    const current = world.get_pin_position(index);
    assert.ok(
      Math.hypot(current.x - position.x, current.y - position.y) <= sweep_position_tolerance,
    );
    assert.ok(Math.abs(current.rotation - position.rotation) <= sweep_angle_tolerance_radians);
  }
  world.dispose();
});

test("lane-plus-gutter rails retain every non-removed pin", async () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    const world = await create_simulation_world(pin_count);
    world.launch(24, 0, 0, 0);
    for (let step = 0; step < 2_000; step += 1) world.step_fixed();
    const envelope = lane_width(pin_count) / 2 + gutter_width;
    const snapshot = world.create_snapshot();
    for (let index = 0; index < pin_count; index += 1) {
      const offset = index * pin_snapshot_stride;
      if (snapshot.data[offset + snapshot_removed_flag_offset] === 0) {
        assert.ok(Math.abs(snapshot.data[offset]) <= envelope + 0.001, `${mode}-pin ${index}`);
      }
    }
    world.dispose();
  }
});

test("a roll that cannot reach the pit fails loudly instead of settling", async () => {
  const world = await create_simulation_world(10);
  world.launch(0.1, 0, Math.PI / 2, 0);
  assert.throws(() => {
    for (let step = 0; step < 2_000; step += 1) world.step_fixed();
  }, /did not reach the pit/);
  world.dispose();
});
