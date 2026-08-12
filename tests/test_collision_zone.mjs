import assert from "node:assert/strict";
import test from "node:test";

import { ball_radius, lane_width, pin_radius, row_spacing } from "../src/config/lane.ts";
import { create_rack_bounds } from "../src/render/camera.ts";
import {
  create_collision_zone,
  create_confirmed_collision_zone,
} from "../src/render/collision_zone.ts";

function path_at_entry(x) {
  return new Float32Array([x, 0, x * 0.7, 30, x, 60, x, 100]);
}

function zone(pin_count, path, ball) {
  return create_collision_zone({
    rack_bounds: create_rack_bounds(pin_count),
    committed_path: path,
    ball,
  });
}

function width(rectangle) {
  return rectangle.right - rectangle.left;
}

function depth(rectangle) {
  return rectangle.back - rectangle.front;
}

test("collision-zone journey depth names the trailing measured collision neighborhood", () => {
  const predicted = zone(990, path_at_entry(0), { x: 0, y: 30 });
  assert.equal(
    predicted.journey_depth,
    predicted.back,
    "the camera endpoint is the accepted zone boundary, not a rack-relative guess",
  );
  assert.ok(
    predicted.journey_depth > create_rack_bounds(990).front,
    "the local collision neighborhood continues beyond the old rack-front endpoint",
  );
});

test("collision zones retain the committed path's left and right entry sidedness", () => {
  const left = zone(990, path_at_entry(-8), { x: -3, y: 30 });
  const right = zone(990, path_at_entry(8), { x: 3, y: 30 });
  assert.ok((left.left + left.right) / 2 < 0, "left path creates a left deck zone");
  assert.ok((right.left + right.right) / 2 > 0, "right path creates a right deck zone");
});

test("collision zones follow the first physically reachable pin instead of freezing at the rack front", () => {
  const bounds = create_rack_bounds(990);
  const rear_right = new Float32Array([
    0,
    0,
    8,
    40,
    16,
    70,
    20.8,
    bounds.back - 0.1,
    20.8,
    bounds.back + 4,
  ]);
  const predicted = zone(990, rear_right, { x: 0, y: 0 });
  assert.ok(predicted.front > bounds.front + 20, "the zone reaches the rear collision corridor");
  assert.ok(predicted.right > 0, "the rear collision remains on its committed side");
});

test("collision zones choose the first segment contact rather than its nearest row", () => {
  const bounds = create_rack_bounds(10);
  // At x=0.35 this segment passes closer to the second-row pin at x=0.5,
  // but it enters the head pin's contact circle first.  A closest-point
  // selection would incorrectly frame the second row.
  const crossing = new Float32Array([0.35, 59, 0.35, 62]);
  const predicted = zone(10, crossing, { x: 0.35, y: 59 });

  assert.equal(
    predicted.front,
    bounds.front - ball_radius,
    "the earliest head-pin contact anchors the local collision neighborhood",
  );
});

test("collision zone uncertainty narrows as the authoritative ball approaches the deck", () => {
  const path = path_at_entry(0);
  const early = zone(990, path, { x: 0, y: 0 });
  const late = zone(990, path, { x: 0, y: 59 });
  assert.ok(width(early) > width(late), "late zone has less lateral uncertainty");
  assert.ok(depth(early) > depth(late), "late zone has less deck-depth uncertainty");
});

test("a gutter path clips its collision neighborhood to the relevant rack edge", () => {
  const bounds = create_rack_bounds(990);
  const gutter_x = lane_width(990) / 2 + 0.5;
  const gutter = zone(990, path_at_entry(gutter_x), { x: gutter_x, y: 30 });
  assert.equal(gutter.right, bounds.right + ball_radius);
  assert.ok(gutter.left > 0, "the zone stays at the right rack edge");
});

test("ten pins include their physical ball-contact envelope", () => {
  const bounds = create_rack_bounds(10);
  const ten_pin_zone = zone(10, path_at_entry(0), { x: 0, y: 59 });
  assert.equal(ten_pin_zone.front, bounds.front - ball_radius);
  assert.ok(ten_pin_zone.left > bounds.left - ball_radius);
  assert.ok(ten_pin_zone.right < bounds.right + ball_radius);
  assert.ok(ten_pin_zone.back <= bounds.back + ball_radius);
});

test("a rear collision zone retains exactly the physically reachable contact shell", () => {
  const bounds = create_rack_bounds(990);
  const rear_pin_x = 0.5;
  const rear_contact_path = new Float32Array([
    rear_pin_x,
    bounds.back - 0.05,
    rear_pin_x,
    bounds.back + ball_radius,
  ]);
  const rear = zone(990, rear_contact_path, { x: rear_pin_x, y: bounds.back });
  const ball_pin_reach = ball_radius + pin_radius;
  const shell_beyond_pin_footprint = ball_pin_reach - pin_radius;

  assert.equal(rear.back, bounds.back + shell_beyond_pin_footprint);
  assert.ok(
    Math.abs(rear.back - bounds.back - ball_radius) < 1e-9,
    "the zone adds the ball's contact reach beyond the rack's existing pin-radius footprint",
  );
});

test("large racks retain one absolute local size when the neighborhood is unclipped", () => {
  const path = path_at_entry(0);
  const medium = zone(496, path, { x: 0, y: 59 });
  const dense = zone(990, path, { x: 0, y: 59 });
  const dense_bounds = create_rack_bounds(990);
  assert.ok(
    medium.left > create_rack_bounds(496).left && medium.right < create_rack_bounds(496).right,
  );
  assert.ok(dense.left > dense_bounds.left && dense.right < dense_bounds.right);
  assert.ok(width(dense) < dense_bounds.right - dense_bounds.left, "990 zone is a strict subset");
  assert.equal(width(medium), width(dense));
  assert.equal(depth(medium), depth(dense));
});

test("collision zone calculation is idempotent for identical authoritative inputs", () => {
  const input = {
    rack_bounds: create_rack_bounds(990),
    committed_path: path_at_entry(-5),
    ball: { x: -2, y: 30 },
  };
  assert.deepEqual(create_collision_zone(input), create_collision_zone(input));
});

test("confirmed collision zones anchor the actual contact centroid in the same local wave", () => {
  for (const pin_count of [496, 990]) {
    const bounds = create_rack_bounds(pin_count);
    const centroid = { x: bounds.right - 1.25, y: bounds.front + row_spacing * 5 };
    const confirmed = create_confirmed_collision_zone({ rack_bounds: bounds, centroid });

    assert.equal(
      confirmed.front,
      centroid.y - row_spacing,
      `${pin_count}-pin contact sits one physical row into the held subject`,
    );
    assert.ok(
      centroid.x >= confirmed.left &&
        centroid.x <= confirmed.right &&
        centroid.y >= confirmed.front &&
        centroid.y <= confirmed.back,
      `${pin_count}-pin actual contact remains in the held neighborhood`,
    );
  }
});
