import assert from "node:assert/strict";
import test from "node:test";

import {
  create_camera_driver,
  advance_camera_driver,
  begin_camera_shot,
  confirm_camera_impact,
  reset_camera_driver,
} from "../src/app/camera_driver.ts";
import { create_camera_state, show_camera_result } from "../src/render/camera.ts";
import { get_camera_zoom } from "../src/render/camera.ts";

function committed_path(camera, offset = 0) {
  return new Float32Array([
    offset,
    0,
    offset,
    camera.rack_bounds.front / 2,
    offset,
    camera.rack_bounds.front,
    offset,
    camera.rack_bounds.back,
  ]);
}

test("camera driver resets a prior shot before retaining the committed public preview", () => {
  const driver = create_camera_driver();
  const initial = create_camera_state(496);
  const path = committed_path(initial);
  const rolling = begin_camera_shot(driver, initial, path);
  const refined = advance_camera_driver(driver, rolling, {
    x: 0,
    y: rolling.rack_bounds.front / 2,
  });

  assert.equal(driver.committed_path, path, "launch retains the accepted worker path by identity");
  assert.ok(refined.collision_zone, "a live authoritative ball sample creates a local zone");

  const reset = reset_camera_driver(driver, refined);
  assert.equal(driver.committed_path, undefined, "next aim has no stale shot path");
  assert.equal(reset.collision_zone, undefined, "next aim has no stale collision subject");
  assert.equal(reset.collision_zone_held, false, "next aim releases the prior collision hold");
});

test("camera driver refines the predicted zone from live samples for dense racks", () => {
  for (const pin_count of [496, 990]) {
    const driver = create_camera_driver();
    const initial = create_camera_state(pin_count);
    const rolling = begin_camera_shot(driver, initial, committed_path(initial, -1));
    const early = advance_camera_driver(driver, rolling, { x: -1, y: 0 });
    const near_deck = advance_camera_driver(driver, early, {
      x: -1,
      y: initial.rack_bounds.front,
    });

    assert.ok(early.collision_zone && near_deck.collision_zone, `${pin_count}-pin shot has a zone`);
    assert.notDeepEqual(
      near_deck.collision_zone,
      early.collision_zone,
      `${pin_count}-pin live progress contracts the prediction before contact`,
    );
  }
});

test("the first dense-rack sample uses collision depth before ratcheting progress", () => {
  for (const pin_count of [496, 990]) {
    const driver = create_camera_driver();
    const initial = create_camera_state(pin_count);
    const rolling = begin_camera_shot(driver, initial, committed_path(initial));
    const at_rack_front = advance_camera_driver(driver, rolling, {
      x: 0,
      y: initial.rack_bounds.front,
    });

    assert.ok(at_rack_front.collision_zone, `${pin_count}-pin front sample has a collision zone`);
    assert.ok(
      at_rack_front.shot_progress < 1,
      `${pin_count}-pin front sample cannot saturate before its local collision neighborhood`,
    );
  }
});

test("ball-pin confirmation holds the local zone while camera travel continues into the cascade", () => {
  const driver = create_camera_driver();
  const initial = create_camera_state(990);
  const rolling = begin_camera_shot(driver, initial, committed_path(initial, 2));
  const approach = advance_camera_driver(driver, rolling, {
    x: 2,
    y: initial.rack_bounds.front,
  });
  const impact = confirm_camera_impact(driver, approach, {
    contact_count: 1,
    total_impulse: 1,
    maximum_impulse: 1,
    centroid_x: 2,
    centroid_y: initial.rack_bounds.front,
  });
  const cascade = advance_camera_driver(driver, impact, {
    x: 3,
    y: initial.rack_bounds.back,
  });

  assert.equal(impact.collision_zone_held, true, "first ball-pin impact holds the local subject");
  assert.deepEqual(cascade.collision_zone, impact.collision_zone, "pin cascade cannot retarget it");
  assert.ok(cascade.focus_y > impact.focus_y, "post-contact live travel still advances the camera");

  const result = show_camera_result(cascade);
  assert.equal(
    result.shot_phase,
    "result",
    "settled-result handoff remains a distinct later phase",
  );
  assert.deepEqual(
    result.collision_zone,
    cascade.collision_zone,
    "result begins from the held subject",
  );
});

test("dense authoritative contact replaces a discrepant preview zone exactly once", () => {
  for (const pin_count of [496, 990]) {
    const driver = create_camera_driver();
    const initial = create_camera_state(pin_count);
    const rolling = begin_camera_shot(driver, initial, committed_path(initial, -6));
    const approach = advance_camera_driver(driver, rolling, {
      x: -6,
      y: initial.rack_bounds.front,
    });
    assert.ok(approach.collision_zone, `${pin_count}-pin preview establishes an approach subject`);
    const centroid = {
      x: initial.rack_bounds.right - 1.25,
      y: initial.rack_bounds.front + (4 * Math.sqrt(3)) / 2,
    };
    const impact = confirm_camera_impact(driver, approach, {
      contact_count: 1,
      total_impulse: 1,
      maximum_impulse: 1,
      centroid_x: centroid.x,
      centroid_y: centroid.y,
    });

    assert.ok(impact.collision_zone, `${pin_count}-pin impact has a held local subject`);
    assert.notDeepEqual(
      impact.collision_zone,
      approach.collision_zone,
      `${pin_count}-pin actual contact replaces the discrepant preview subject`,
    );
    assert.ok(
      centroid.x >= impact.collision_zone.left &&
        centroid.x <= impact.collision_zone.right &&
        centroid.y >= impact.collision_zone.front &&
        centroid.y <= impact.collision_zone.back,
      `${pin_count}-pin held subject contains the worker contact centroid`,
    );
    assert.ok(
      get_camera_zoom(impact) >= get_camera_zoom(approach),
      `${pin_count}-pin authoritative zone confirmation cannot release rolling zoom`,
    );

    const later_ball = advance_camera_driver(driver, impact, {
      x: initial.rack_bounds.left + 0.5,
      y: initial.rack_bounds.back,
    });
    const later_summary = confirm_camera_impact(driver, later_ball, {
      contact_count: 4,
      total_impulse: 99,
      maximum_impulse: 99,
      centroid_x: initial.rack_bounds.left + 0.5,
      centroid_y: initial.rack_bounds.back,
    });
    assert.deepEqual(
      later_ball.collision_zone,
      impact.collision_zone,
      "later ball samples cannot retarget",
    );
    assert.deepEqual(
      later_summary.collision_zone,
      impact.collision_zone,
      "later summaries cannot retarget",
    );
  }
});

test("pin-pin-only impact summaries do not invent a collision zone", () => {
  const driver = create_camera_driver();
  const initial = create_camera_state(496);
  const rolling = begin_camera_shot(driver, initial, committed_path(initial));
  const untouched = confirm_camera_impact(driver, rolling, undefined);

  assert.equal(untouched.collision_zone, undefined);
  assert.equal(untouched.collision_zone_held, false);
});

test("retained worker paths produce cadence-independent monotonic envelope zoom", () => {
  for (const pin_count of [105, 496, 990]) {
    const initial = create_camera_state(pin_count);
    const path = new Float32Array([
      -4,
      0,
      -3,
      initial.rack_bounds.front * 0.4,
      -1,
      initial.rack_bounds.front,
      1,
      initial.rack_bounds.back,
    ]);
    const samples = [
      { x: -4, y: 0 },
      { x: -3, y: initial.rack_bounds.front * 0.4 },
      { x: -1, y: initial.rack_bounds.front },
    ];
    const sparse_driver = create_camera_driver();
    const dense_driver = create_camera_driver();
    const sparse = samples.reduce(
      (camera, ball) => advance_camera_driver(sparse_driver, camera, ball),
      begin_camera_shot(sparse_driver, initial, path),
    );
    let dense = begin_camera_shot(dense_driver, initial, path);
    for (const ball of samples) {
      dense = advance_camera_driver(dense_driver, dense, { x: ball.x + 0.2, y: ball.y * 0.5 });
      dense = advance_camera_driver(dense_driver, dense, ball);
    }
    assert.equal(
      get_camera_zoom(dense),
      get_camera_zoom(sparse),
      `${pin_count}-pin common worker samples retain the same zoom at either draw cadence`,
    );
    assert.ok(
      get_camera_zoom(sparse) > 1,
      `${pin_count}-pin local envelope allows the rolling camera to advance`,
    );
  }
});
