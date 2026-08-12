import assert from "node:assert/strict";
import test from "node:test";

import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  advance_camera_for_ball,
  create_camera_state,
  set_camera_collision_zone,
} from "../src/render/camera.ts";
import { create_camera_projection } from "../src/render/camera_projection.ts";
import { project_world_point } from "../src/render/projection.ts";
import {
  create_shot_zoom_envelope,
  get_collision_zone_screen_diagnostic,
  get_shot_zoom_envelope_ceiling,
} from "../src/render/shot_framing.ts";
import { create_collision_zone } from "../src/render/collision_zone.ts";

const canvas = { width: 1600, height: 1000 };
const pin_counts = supported_pin_counts.map(get_rack_pin_count);

function distance_to_canvas_center(point) {
  return Math.hypot(point.x - canvas.width / 2, point.y - canvas.height / 2);
}

function create_synthetic_zone(bounds, lateral_center) {
  const front = bounds.front;
  const back = Math.min(bounds.back, front + (bounds.back - front) / 3);
  const half_width = Math.min((bounds.right - bounds.left) / 6, 3);
  return {
    left: Math.max(bounds.left, lateral_center - half_width),
    right: Math.min(bounds.right, lateral_center + half_width),
    front,
    back,
    journey_depth: back,
  };
}

test("collision zones, rather than rack centers, own live-shot composition", () => {
  for (const pin_count of pin_counts) {
    const initial = create_camera_state(pin_count);
    const bounds = initial.rack_bounds;
    const lateral_centers = [bounds.left / 2, 0, bounds.right / 2];
    for (const lateral_center of lateral_centers) {
      const zone = create_synthetic_zone(bounds, lateral_center);
      const camera = advance_camera_for_ball(
        set_camera_collision_zone(initial, zone),
        zone.journey_depth,
        lateral_center,
      );
      const projection = create_camera_projection(camera, canvas.width, canvas.height);
      const zone_center = project_world_point(projection, {
        x: (zone.left + zone.right) / 2,
        y: (zone.front + zone.back) / 2,
        z: 0,
      });
      const rack_center = project_world_point(projection, {
        x: 0,
        y: (bounds.front + bounds.back) / 2,
        z: 0,
      });
      assert.ok(zone_center && rack_center, `${pin_count}-pin zone and rack centers project`);
      assert.ok(
        distance_to_canvas_center(zone_center) <= distance_to_canvas_center(rack_center),
        `${pin_count}-pin local collision neighborhood outranks the complete-rack center`,
      );
      if (lateral_center !== 0) {
        assert.equal(
          Math.sign(camera.focus_x),
          Math.sign(lateral_center),
          `${pin_count}-pin ${lateral_center < 0 ? "left" : "right"} zone keeps its sidedness`,
        );
      }
    }
  }
});

test("zone framing remains monotonic and independent of intermediate draw samples", () => {
  const initial = create_camera_state(990);
  const bounds = initial.rack_bounds;
  const zone = create_synthetic_zone(bounds, bounds.left / 2);
  const committed = set_camera_collision_zone(initial, zone);
  const target_y = zone.journey_depth * 0.82;
  const sparse = advance_camera_for_ball(committed, target_y, zone.left / 2);
  const intermediate = advance_camera_for_ball(committed, target_y * 0.6, zone.left / 2);
  const dense = advance_camera_for_ball(intermediate, target_y, zone.left / 2);

  assert.equal(
    dense.focus_x,
    sparse.focus_x,
    "a shared zone and physical sample retain the same lateral composition at every cadence",
  );
  assert.equal(
    dense.shot_progress,
    sparse.shot_progress,
    "intermediate draws cannot move the monotonic journey beyond its physical sample",
  );
});

test("active collision-zone diagnostics use the same live projection as the camera", () => {
  for (const pin_count of [105, 496, 990]) {
    const initial = create_camera_state(pin_count);
    const zone = create_synthetic_zone(initial.rack_bounds, initial.rack_bounds.left / 2);
    const camera = advance_camera_for_ball(
      set_camera_collision_zone(initial, zone),
      zone.journey_depth,
      zone.left,
    );
    const diagnostic = get_collision_zone_screen_diagnostic(
      zone,
      create_camera_projection(camera, canvas.width, canvas.height),
      canvas.width,
      canvas.height,
    );
    assert.ok(diagnostic, `${pin_count}-pin active zone supplies a projected diagnostic`);
    assert.equal(
      diagnostic.polygon.length,
      4,
      `${pin_count}-pin diagnostic retains four zone corners`,
    );
    assert.ok(
      diagnostic.coverage_fraction > 0,
      `${pin_count}-pin local zone occupies nonzero projected canvas area`,
    );
    assert.ok(
      Number.isFinite(diagnostic.center_x_fraction) &&
        Number.isFinite(diagnostic.center_y_fraction),
      `${pin_count}-pin zone center remains a finite renderer-derived projection`,
    );
  }
});

test("forward path envelopes narrow without forcing dense-rack zoom to retreat", () => {
  for (const pin_count of [105, 496, 990]) {
    const initial = create_camera_state(pin_count);
    const { front, back } = initial.rack_bounds;
    const path = new Float32Array([-4, 0, -3, front * 0.4, -1, front, 1, front + 3, 2, back]);
    const samples = [
      { x: -4, y: 0 },
      { x: -3, y: front * 0.4 },
      { x: -1, y: front },
    ];
    const ceilings = samples.map((ball) => {
      const zone = create_collision_zone({
        rack_bounds: initial.rack_bounds,
        committed_path: path,
        ball,
      });
      const envelope = create_shot_zoom_envelope(path, ball, zone);
      return get_shot_zoom_envelope_ceiling(envelope, zone, initial.rack_bounds);
    });
    assert.ok(
      ceilings.every((ceiling, index) => index === 0 || ceiling >= ceilings[index - 1]),
      `${pin_count}-pin shrinking forward envelope never requires a later zoom retreat`,
    );
    assert.ok(
      ceilings[0] > 1,
      `${pin_count}-pin committed local corridor permits a meaningful close view`,
    );
  }
});

test("center, hook, and edge envelopes retain every future path point plus the local collision shell", () => {
  for (const pin_count of [105, 496, 990]) {
    const initial = create_camera_state(pin_count);
    const { front, back, left, right } = initial.rack_bounds;
    for (const [label, path] of [
      ["center", new Float32Array([0, 0, 0, front, 0, back])],
      ["hook", new Float32Array([-4, 0, -3, front * 0.45, -1, front, 1, back])],
      ["edge", new Float32Array([right, 0, right, front, right, back])],
    ]) {
      const ball = { x: path[0], y: path[1] };
      const zone = create_collision_zone({
        rack_bounds: initial.rack_bounds,
        committed_path: path,
        ball,
      });
      const envelope = create_shot_zoom_envelope(path, ball, zone);
      const expected = [
        ball,
        { x: zone.left, y: zone.front },
        { x: zone.left, y: zone.back },
        { x: zone.right, y: zone.front },
        { x: zone.right, y: zone.back },
      ];
      assert.ok(
        expected.every((point) =>
          envelope.points.some((candidate) => candidate.x === point.x && candidate.y === point.y),
        ),
        `${pin_count}-pin ${label} envelope contains its live ball and physical collision shell`,
      );
      assert.ok(
        envelope.points.every((point) => point.y <= zone.back),
        `${pin_count}-pin ${label} envelope stops at the held local collision neighborhood`,
      );
      assert.ok(left < right, "authoritative rack bounds remain ordered");
    }
  }
});
