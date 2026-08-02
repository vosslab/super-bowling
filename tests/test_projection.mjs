import assert from "node:assert/strict";
import test from "node:test";

import { foul_to_head_pin } from "../src/config/lane.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import { create_camera_state } from "../src/render/camera.ts";
import {
  create_camera_projection,
  create_game_draw_commands,
  project_world_point,
} from "../src/render/game_renderer.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

// Frozen 1600 x 1000 desktop side-panel layout: the renderer receives this
// measured lane rectangle, not the viewport or the retired bottom-deck size.
const canvas = { width: 1248, height: 884 };
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

function draw(pin_count, ball_y = 0, aim_lateral_offset) {
  const snapshot = create_snapshot(pin_count);
  fill_rack(snapshot, pin_count);
  snapshot[pin_count * pin_snapshot_stride + snapshot_y_offset] = ball_y;
  return create_game_draw_commands(
    snapshot,
    snapshot,
    pin_count,
    1,
    canvas.width,
    canvas.height,
    undefined,
    create_camera_state(pin_count, false),
    undefined,
    aim_lateral_offset,
  );
}

function lane_command(commands) {
  const lane = commands.find((command) => command.kind === "lane");
  assert.ok(lane, "a complete lane command is always present");
  return lane;
}

function ball_command(commands) {
  const ball = commands.find((command) => command.kind === "ball");
  assert.ok(ball, "a visible ball has a render command");
  return ball;
}

function standing_pins(commands) {
  return commands.filter((command) => command.kind === "standing_pin");
}

function assert_finite_point(point, label) {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${label} is finite`);
}

test("shared rational projection returns finite points and rejects non-finite or hidden points", () => {
  const projection = create_camera_projection(
    create_camera_state(10, false),
    canvas.width,
    canvas.height,
  );
  const visible = project_world_point(projection, { x: 1, y: 0, z: 0 });
  assert.ok(visible);
  assert.ok(
    [visible.x, visible.y].every(Number.isFinite),
    "a valid point projects to finite coordinates",
  );
  const depth_boundary_y = projection.near_y - projection.camera.depth_distance;
  for (const point of [
    { x: Number.NaN, y: 0, z: 0 },
    { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
    { x: 0, y: depth_boundary_y, z: 0 },
    { x: 0, y: depth_boundary_y - 1, z: 0 },
  ]) {
    assert.equal(project_world_point(projection, point), undefined);
  }
});

test("camera projection rejects invalid canvas dimensions before drawing", () => {
  const camera = create_camera_state(10, false);
  for (const [width, height] of [
    [0, canvas.height],
    [-1, canvas.height],
    [Number.NaN, canvas.height],
    [canvas.width, 0],
    [canvas.width, -1],
    [canvas.width, Number.POSITIVE_INFINITY],
  ]) {
    assert.throws(
      () => create_camera_projection(camera, width, height),
      /finite positive canvas (width|height)/,
    );
  }
});

test("projects every supported aiming scene into finite 16:10 commands", () => {
  for (const pin_count of rack_pin_counts) {
    const commands = draw(pin_count, 0, 0);
    const lane = lane_command(commands);
    const ball = ball_command(commands);
    const pins = standing_pins(commands);
    assert.equal(pins.length, pin_count, `${pin_count}-pin initial rack is complete`);
    for (const point of [
      ...lane.geometry.lane_near,
      ...lane.geometry.lane_far,
      ...lane.geometry.rail_near,
      ...lane.geometry.rail_far,
      ...lane.geometry.foul_line,
      ...lane.geometry.deck_boundary,
      ...lane.geometry.guide_dots,
    ]) {
      assert_finite_point(point, `${pin_count}-pin lane point`);
      assert.ok(point.x >= 0 && point.x <= canvas.width);
      assert.ok(point.y >= 0 && point.y <= canvas.height);
    }
    for (const body of [...pins, ball]) {
      assert.ok(
        [body.x, body.y, body.width, body.height, body.base_depth].every(Number.isFinite),
        `${pin_count}-pin body projection is finite`,
      );
      assert.ok(body.x >= 0 && body.x <= canvas.width);
      assert.ok(body.y >= 0 && body.y <= canvas.height);
    }
  }
});

test("uses one coherent rational depth path for lane, ball, and standing pins", () => {
  for (const pin_count of rack_pin_counts) {
    const launch = ball_command(draw(pin_count, -9));
    const foul = ball_command(draw(pin_count, 0));
    const deck = ball_command(draw(pin_count, foul_to_head_pin));
    assert.ok(launch.y > foul.y && foul.y > deck.y, `${pin_count}-pin ball recedes up-lane`);
    assert.ok(
      launch.width > foul.width && foul.width > deck.width,
      `${pin_count}-pin ball shrinks continuously with depth`,
    );

    const pins = standing_pins(draw(pin_count));
    const nearest = pins.reduce((closest, pin) =>
      pin.base_depth < closest.base_depth ? pin : closest,
    );
    const farthest = pins.reduce((furthest, pin) =>
      pin.base_depth > furthest.base_depth ? pin : furthest,
    );
    assert.ok(nearest.width >= farthest.width, `${pin_count}-pin farther pin is never larger`);
    assert.ok(nearest.height >= farthest.height, `${pin_count}-pin farther pin is never taller`);
    assert.ok(nearest.base_depth < farthest.base_depth, `${pin_count}-pin pin depth is ordered`);
  }
});

test("keeps physical body proportions coherent through the projection", () => {
  const commands = draw(105, 0, 0);
  const ball = ball_command(commands);
  const pins = standing_pins(commands);
  assert.equal(ball.width, ball.height, "the physical ball remains circular on screen");
  for (const pin of pins) {
    assert.ok(pin.height > pin.width, "an upright pin remains taller than it is wide");
    assert.ok(pin.width > 0 && pin.height > 0, "pin dimensions stay positive");
  }
  const first_ratio = pins[0].height / pins[0].width;
  for (const pin of pins.slice(1)) {
    assert.ok(
      Math.abs(pin.height / pin.width - first_ratio) < Number.EPSILON * 32,
      "depth changes the physical pin uniformly rather than distorting its aspect",
    );
  }
});

test("lane edges truly converge toward one centered forward direction", () => {
  for (const pin_count of rack_pin_counts) {
    const lane = lane_command(draw(pin_count)).geometry;
    const near_width = lane.rail_near[1].x - lane.rail_near[0].x;
    const far_width = lane.rail_far[1].x - lane.rail_far[0].x;
    const near_center = (lane.rail_near[0].x + lane.rail_near[1].x) / 2;
    const far_center = (lane.rail_far[0].x + lane.rail_far[1].x) / 2;
    assert.ok(far_width > 0 && far_width < near_width, `${pin_count}-pin rails converge`);
    assert.equal(near_center, lane.horizon.x, `${pin_count}-pin near rails share center`);
    assert.equal(far_center, lane.horizon.x, `${pin_count}-pin far rails share center`);
  }
});

test("omits a ball behind the drawable near range instead of producing invalid geometry", () => {
  for (const pin_count of rack_pin_counts) {
    const commands = draw(pin_count, -10_000);
    assert.equal(
      commands.find((command) => command.kind === "ball"),
      undefined,
      `${pin_count}-pin behind-range ball is clipped`,
    );
    lane_command(commands);
  }
});
