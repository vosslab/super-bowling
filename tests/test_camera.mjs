import assert from "node:assert/strict";
import test from "node:test";

import { aim_limits } from "../src/game/aim.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  advance_camera_for_ball,
  create_camera_state,
  create_rack_bounds,
  get_camera_zoom,
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
  snapshot_removed_flag_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

const canvas = { width: 1600, height: 1000 };
const rack_pin_counts = supported_pin_counts.map(get_rack_pin_count);

function create_snapshot(pin_count) {
  return new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
}

function fill_rack(snapshot, pin_count) {
  for (const slot of create_rack(pin_count).slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
}

function draw(pin_count, camera = create_camera_state(pin_count), aim_lateral_offset = 0) {
  const snapshot = create_snapshot(pin_count);
  fill_rack(snapshot, pin_count);
  return create_game_draw_commands(
    snapshot,
    snapshot,
    pin_count,
    1,
    canvas.width,
    canvas.height,
    undefined,
    camera,
    undefined,
    aim_lateral_offset,
  );
}

function get_lane(commands) {
  const lane = commands.find((command) => command.kind === "lane");
  assert.ok(lane, "a lane is drawn for every camera state");
  return lane;
}

function get_pins(commands) {
  return commands.filter((command) => command.kind === "standing_pin");
}

function assert_inside_canvas(body, label) {
  assert.ok(
    body.x - body.width / 2 >= 0 && body.x + body.width / 2 <= canvas.width,
    `${label} stays horizontally inside the lane canvas`,
  );
  assert.ok(
    body.y - body.height / 2 >= 0 && body.y + body.height / 2 <= canvas.height,
    `${label} stays vertically inside the lane canvas`,
  );
}

function assert_complete_scene(pin_count, camera = create_camera_state(pin_count)) {
  const commands = draw(pin_count, camera);
  const lane = get_lane(commands);
  const ball = commands.find((command) => command.kind === "ball");
  const pins = get_pins(commands);
  assert.ok(ball, `${pin_count}-pin aiming ball draws`);
  assert.equal(pins.length, pin_count, `${pin_count}-pin complete rack draws`);
  for (const point of [
    ...lane.geometry.lane_near,
    ...lane.geometry.lane_far,
    ...lane.geometry.rail_near,
    ...lane.geometry.rail_far,
  ]) {
    assert.ok(
      Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= canvas.width &&
        point.y >= 0 &&
        point.y <= canvas.height,
      `${pin_count}-pin complete lane point stays inside`,
    );
  }
  assert_inside_canvas(ball, `${pin_count}-pin aiming ball`);
  for (const pin of pins) assert_inside_canvas(pin, `${pin_count}-pin rack pin`);
}

function row_diagnostic(pin_count) {
  const rack = create_rack(pin_count);
  const pins = get_pins(draw(pin_count));
  const rows = [];
  const last_row = Math.max(...rack.slots.map((slot) => slot.row_index));
  for (let row_index = 0; row_index <= last_row; row_index += 1) {
    const row_pins = rack.slots
      .filter((slot) => slot.row_index === row_index)
      .map((slot) => pins.find((pin) => pin.pin_index === Number(slot.pin_id)));
    assert.ok(row_pins.every(Boolean), `${pin_count}-pin row ${row_index} is fully drawable`);
    rows.push({
      center_y: row_pins.reduce((sum, pin) => sum + pin.y, 0) / row_pins.length,
      top: Math.min(...row_pins.map((pin) => pin.y - pin.height / 2)),
      bottom: Math.max(...row_pins.map((pin) => pin.y + pin.height / 2)),
    });
  }
  return rows;
}

test("derives immutable bounds from each authoritative complete rack", () => {
  for (const pin_count of rack_pin_counts) {
    const rack = create_rack(pin_count);
    const bounds = create_rack_bounds(pin_count);
    assert.deepEqual(
      [bounds.left, bounds.right, bounds.front, bounds.back],
      [rack.bounds.min_x, rack.bounds.max_x, rack.bounds.min_y, rack.bounds.max_y],
    );
  }
});

test("pushes the shared projection toward the deck from release through impact", () => {
  const camera_sequences = [];
  for (const pin_count of rack_pin_counts) {
    const aiming = create_camera_state(pin_count);
    const rolling = advance_camera_for_ball(aiming, aiming.rack_bounds.front / 2);
    const settled = advance_camera_for_ball(rolling, aiming.rack_bounds.back);
    const reduced = with_reduced_motion(settled, true);
    const reset = reset_camera_for_roll(settled);
    camera_sequences.push({ pin_count, aiming, rolling, settled, reduced, reset });
  }

  assert.ok(
    camera_sequences.every(({ aiming, rolling, settled }) => {
      const zooms = [aiming, rolling, settled].map(get_camera_zoom);
      return zooms[0] < zooms[1] && zooms[1] <= zooms[2];
    }),
    "every rack advances toward the deck without retreating",
  );
  assert.ok(
    camera_sequences.every(({ reduced, reset }) =>
      [reduced, reset].every((camera) => get_camera_zoom(camera) === 1),
    ),
    "reduced motion and the next decision return to the neutral view",
  );
});

test("keeps every legal aiming scene inside a representative play canvas", () => {
  for (const pin_count of rack_pin_counts) {
    const limits = aim_limits(pin_count);
    for (const lateral_offset of [limits.minimum_start_position, limits.maximum_start_position]) {
      const commands = draw(pin_count, create_camera_state(pin_count), lateral_offset);
      const ball = commands.find((command) => command.kind === "ball");
      assert.ok(ball, `${pin_count}-pin legal aiming ball draws`);
      assert_inside_canvas(ball, `${pin_count}-pin legal aiming ball`);
      for (const pin of get_pins(commands)) {
        assert_inside_canvas(pin, `${pin_count}-pin legal aiming pin`);
      }
    }
  }
});

test("keeps complete rack rows visible and depth ordered", () => {
  for (const pin_count of rack_pin_counts) {
    const rows = row_diagnostic(pin_count);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      assert.ok(previous.center_y > current.center_y, `${pin_count}-pin rows remain depth ordered`);
      assert.ok(previous.top <= current.bottom, `${pin_count}-pin adjacent rows remain visible`);
      assert.ok(
        [previous.center_y, previous.top, previous.bottom, current.center_y, current.bottom].every(
          Number.isFinite,
        ),
      );
    }
  }
});

test("ships finite, unclipped camera projections for every rack", () => {
  for (const pin_count of rack_pin_counts) {
    const camera = create_camera_state(pin_count);
    const projection = create_camera_projection(camera, canvas.width, canvas.height);
    assert.ok(
      [
        projection.camera.depth_exaggeration,
        projection.camera.horizon_fraction,
        projection.camera.occupied_vertical_span_fraction,
        ...projection.camera.row_reveal_fractions,
      ].every(Number.isFinite),
      `${pin_count}-pin projection diagnostics remain finite`,
    );
    assert.ok(
      projection.camera.row_reveal_fractions.every((fraction) => fraction > 0),
      `${pin_count}-pin projection leaves every adjacent rack row visible`,
    );
    assert_complete_scene(pin_count, camera);
  }
});

test("partial racks retain the complete-rack camera", () => {
  for (const pin_count of rack_pin_counts) {
    const camera = create_camera_state(pin_count);
    const baseline = create_camera_projection(camera, canvas.width, canvas.height);
    const partial = create_snapshot(pin_count);
    fill_rack(partial, pin_count);
    for (let pin_index = 0; pin_index < pin_count; pin_index += 2) {
      partial[pin_index * pin_snapshot_stride + snapshot_removed_flag_offset] = 1;
    }
    const commands = create_game_draw_commands(
      partial,
      partial,
      pin_count,
      1,
      canvas.width,
      canvas.height,
      undefined,
      camera,
    );
    assert.equal(get_pins(commands).length, Math.floor(pin_count / 2));
    assert.deepEqual(create_camera_projection(camera, canvas.width, canvas.height), baseline);
  }
});
