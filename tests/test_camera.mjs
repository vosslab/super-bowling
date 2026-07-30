import assert from "node:assert/strict";
import test from "node:test";

import { camera_config } from "../src/config/camera.ts";
import { supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  create_camera_state,
  create_rack_bounds,
  reset_camera_for_roll,
  select_camera_mode,
  with_camera_mode,
} from "../src/render/camera.ts";
import {
  create_camera_projection,
  create_game_draw_commands,
} from "../src/render/game_renderer.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_state_flag_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

function create_snapshot(pin_count) {
  return new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
}

function fill_initial_rack(snapshot, pin_count) {
  const rack = create_rack(pin_count);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
}

function get_pin_commands(commands) {
  return commands.filter(
    (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
  );
}

test("selects the single centralized deck trigger and keeps reduced motion in lane view", () => {
  assert.equal(select_camera_mode(camera_config.deck_trigger_y - 0.01, false), "lane");
  assert.equal(select_camera_mode(camera_config.deck_trigger_y, false), "deck");
  assert.equal(select_camera_mode(camera_config.deck_trigger_y + 5, true), "lane");
});

test("uses distinct stable projections for lane and deck camera states", () => {
  const lane_camera = create_camera_state(105, camera_config.deck_trigger_y - 1, false);
  const deck_camera = with_camera_mode(lane_camera, camera_config.deck_trigger_y, false);
  assert.equal(lane_camera.mode, "lane");
  assert.equal(deck_camera.mode, "deck");
  assert.notDeepEqual(create_camera_projection(lane_camera), create_camera_projection(deck_camera));
  assert.equal(deck_camera.rack_bounds, lane_camera.rack_bounds);
});

test("latches deck view after the trigger until the next roll resets lane view", () => {
  const lane_camera = create_camera_state(10, camera_config.deck_trigger_y - 1, false);
  const deck_camera = with_camera_mode(lane_camera, camera_config.deck_trigger_y, false);
  const lower_ball_camera = with_camera_mode(deck_camera, camera_config.deck_trigger_y - 3, false);
  const next_roll_camera = reset_camera_for_roll(lower_ball_camera);
  assert.equal(deck_camera.mode, "deck");
  assert.equal(lower_ball_camera.mode, "deck");
  assert.equal(next_roll_camera.mode, "lane");
  assert.equal(next_roll_camera.rack_bounds, lane_camera.rack_bounds);
});

test("reduced motion locks lane view after a deck selection", () => {
  const lane_camera = create_camera_state(10, camera_config.deck_trigger_y - 1, false);
  const deck_camera = with_camera_mode(lane_camera, camera_config.deck_trigger_y, false);
  const reduced_motion_camera = with_camera_mode(
    deck_camera,
    camera_config.deck_trigger_y + 3,
    true,
  );
  assert.equal(reduced_motion_camera.mode, "lane");
  assert.equal(reduced_motion_camera.rack_bounds, deck_camera.rack_bounds);
});

test("derives immutable bounds from the authoritative complete rack", () => {
  for (const pin_count of [10, 105, 990]) {
    const rack = create_rack(pin_count);
    const bounds = create_rack_bounds(pin_count);
    assert.equal(bounds.pin_count, pin_count);
    assert.equal(bounds.left, rack.bounds.min_x);
    assert.equal(bounds.right, rack.bounds.max_x);
    assert.equal(bounds.front, rack.bounds.min_y);
    assert.equal(bounds.back, rack.bounds.max_y);
  }
});

test("expands super-lane framing with each triangular rack while containing every selected deck", () => {
  let previous_lane_width = 0;
  let previous_deck_width = 0;
  for (const pin_count of supported_pin_counts) {
    const lane_camera = create_camera_state(pin_count, camera_config.deck_trigger_y - 1, false);
    const deck_camera = create_camera_state(pin_count, camera_config.deck_trigger_y, false);
    const lane_projection = create_camera_projection(lane_camera);
    const deck_projection = create_camera_projection(deck_camera);
    const rack_width = lane_camera.rack_bounds.right - lane_camera.rack_bounds.left;
    assert.ok(lane_projection.x_extent * 2 >= rack_width);
    assert.ok(deck_projection.x_extent * 2 >= rack_width);
    assert.ok(lane_projection.x_extent >= previous_lane_width);
    assert.ok(deck_projection.x_extent >= previous_deck_width);
    previous_lane_width = lane_projection.x_extent;
    previous_deck_width = deck_projection.x_extent;
  }
  assert.ok(previous_lane_width > camera_config.lane_min_half_width);
  assert.ok(previous_deck_width > camera_config.deck_min_half_width);
});

test("both camera states contain every initial pin at the 16:10 production viewport", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_snapshot(pin_count);
    fill_initial_rack(snapshot, pin_count);
    for (const ball_y of [camera_config.deck_trigger_y - 1, camera_config.deck_trigger_y]) {
      const camera = create_camera_state(pin_count, ball_y, false);
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
      const pins = get_pin_commands(commands);
      assert.equal(pins.length, pin_count);
      assert.ok(
        pins.every(
          (pin) =>
            pin.x - pin.width / 2 >= 0 &&
            pin.x + pin.width / 2 <= 1600 &&
            pin.y - pin.height / 2 >= 0 &&
            pin.y + pin.height / 2 <= 1000,
        ),
      );
    }
  }
});

test("a cascade updates pin commands without changing a chosen camera projection", () => {
  const pin_count = 105;
  const initial = create_snapshot(pin_count);
  fill_initial_rack(initial, pin_count);
  const camera = create_camera_state(pin_count, camera_config.deck_trigger_y, false);
  const projection = create_camera_projection(camera);
  const cascade = new Float32Array(initial);
  cascade[snapshot_x_offset] = -100;
  cascade[snapshot_y_offset] = 100;
  cascade[snapshot_state_flag_offset] = 1;
  const commands = create_game_draw_commands(
    initial,
    cascade,
    pin_count,
    1,
    1600,
    1000,
    undefined,
    camera,
  );
  assert.equal(get_pin_commands(commands).length, pin_count);
  assert.deepEqual(create_camera_projection(camera), projection);
  const next_camera = with_camera_mode(camera, camera_config.deck_trigger_y + 2, false);
  assert.equal(next_camera.rack_bounds, camera.rack_bounds);
  assert.deepEqual(create_camera_projection(next_camera), projection);
});
