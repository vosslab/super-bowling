import assert from "node:assert/strict";
import test from "node:test";

import { foul_to_head_pin } from "../src/config/lane.ts";
import { supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  advance_camera_for_ball,
  create_camera_state,
  create_rack_bounds,
  reset_camera_for_roll,
  with_reduced_motion,
} from "../src/render/camera.ts";
import {
  create_camera_projection,
  create_game_draw_commands,
} from "../src/render/game_renderer.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

function create_snapshot(pin_count) {
  return new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
}

function fill_initial_rack(snapshot, pin_count) {
  for (const slot of create_rack(pin_count).slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
}

function snapshot_with_ball_y(pin_count, y) {
  const snapshot = create_snapshot(pin_count);
  snapshot[pin_count * pin_snapshot_stride + snapshot_y_offset] = y;
  return snapshot;
}

function ball_command(snapshot, pin_count, camera) {
  const commands = create_game_draw_commands(
    snapshot,
    snapshot,
    pin_count,
    1,
    1600,
    1000,
    undefined,
    camera,
  );
  const ball = commands.find((command) => command.kind === "ball");
  assert.ok(ball, "the physical rolling ball is drawable");
  return ball;
}

test("derives immutable bounds from the authoritative complete rack", () => {
  for (const pin_count of [10, 105, 990]) {
    const rack = create_rack(pin_count);
    const bounds = create_rack_bounds(pin_count);
    assert.deepEqual(
      [bounds.left, bounds.right, bounds.front, bounds.back],
      [rack.bounds.min_x, rack.bounds.max_x, rack.bounds.min_y, rack.bounds.max_y],
    );
  }
});

test("keeps one full-lane projection for aiming, rolling, and result", () => {
  for (const pin_count of supported_pin_counts) {
    const aiming = create_camera_state(pin_count, false);
    const result = advance_camera_for_ball(aiming, aiming.rack_bounds.back + 20, false);
    assert.deepEqual(create_camera_projection(result), create_camera_projection(aiming));
    assert.equal(result.rack_bounds, aiming.rack_bounds);
    assert.ok(result.zoom > 0);
  }
});

test("advances a centered shot zoom only from forward world travel and never rewinds", () => {
  const aiming = create_camera_state(10, false);
  const first = advance_camera_for_ball(aiming, 15, false);
  const later = advance_camera_for_ball(first, 40, false);
  const rebound = advance_camera_for_ball(later, 25, false);
  assert.equal(first.shot_progress, 15 / aiming.rack_bounds.front);
  assert.ok(later.zoom > first.zoom);
  assert.deepEqual(rebound, later);
  assert.equal(reset_camera_for_roll(later).zoom, 0);
});

test("reduced motion retains the fixed full-lane composition", () => {
  const active = advance_camera_for_ball(create_camera_state(10, false), 40, false);
  const reduced = with_reduced_motion(active, true);
  const sampled = advance_camera_for_ball(reduced, 60, true);
  assert.equal(sampled.zoom, 0);
  assert.equal(sampled.shot_progress, 0);
  assert.deepEqual(create_camera_projection(sampled), create_camera_projection(active));
});

test("ball travel is monotonic up-screen and spans at least thirty percent of the canvas", () => {
  for (const pin_count of [10, 105, 990]) {
    let camera = create_camera_state(pin_count, false);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
      const y = foul_to_head_pin * fraction;
      camera = advance_camera_for_ball(camera, y, false);
      return ball_command(snapshot_with_ball_y(pin_count, y), pin_count, camera).y;
    });
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(samples[index] < samples[index - 1], `${pin_count}-pin ball advances up-screen`);
    }
    assert.ok(samples[0] - samples.at(-1) >= 1000 * 0.3, `${pin_count}-pin travel is readable`);
  }
});

test("initial racks remain inside the production canvas in the centered composition", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_snapshot(pin_count);
    fill_initial_rack(snapshot, pin_count);
    const commands = create_game_draw_commands(
      snapshot,
      snapshot,
      pin_count,
      1,
      1600,
      1000,
      undefined,
      create_camera_state(pin_count, false),
    );
    const pins = commands.filter(
      (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
    );
    assert.equal(pins.length, pin_count);
    assert.ok(pins.every((pin) => pin.x >= 0 && pin.x <= 1600 && pin.y >= 0 && pin.y <= 1000));
  }
});

test("maximum centered-shot zoom keeps full rack sprites inside the canvas", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_snapshot(pin_count);
    fill_initial_rack(snapshot, pin_count);
    const aiming_camera = create_camera_state(pin_count, false);
    const camera = advance_camera_for_ball(aiming_camera, aiming_camera.rack_bounds.front, false);
    const pins = create_game_draw_commands(
      snapshot,
      snapshot,
      pin_count,
      1,
      1600,
      1000,
      undefined,
      camera,
    ).filter((command) => command.kind === "standing_pin" || command.kind === "fallen_pin");
    assert.equal(pins.length, pin_count);
    assert.ok(
      pins.every(
        (pin) =>
          pin.x - pin.width / 2 >= 0 &&
          pin.x + pin.width / 2 <= 1600 &&
          pin.y - pin.height / 2 >= 0 &&
          pin.y + pin.height / 2 <= 1000,
      ),
      `${pin_count}-pin rack remains fully visible at maximum shot zoom`,
    );
  }
});
