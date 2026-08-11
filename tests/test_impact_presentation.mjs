import assert from "node:assert/strict";
import test from "node:test";

import {
  legal_roll_speed_reference,
  map_impact_presentation,
  normalize_ball_roll_speed,
  normalize_impact_impulse,
} from "../src/app/impact_presentation.ts";

function impact_event(overrides = {}) {
  return {
    type: "impact",
    simulation_time_ms: 100,
    pin_count: 990,
    first_ball_pin_impact: false,
    ball_pin: undefined,
    pin_pin: undefined,
    fallen: undefined,
    ...overrides,
  };
}

test("impact mapper preserves physical ordering and exact contact counts", () => {
  const weak = normalize_impact_impulse(58);
  const strong = normalize_impact_impulse(800);
  assert.ok(weak > 0 && weak < strong && strong < 1);
  const cues = map_impact_presentation(
    impact_event({
      pin_pin: {
        contact_count: 37,
        total_impulse: 800,
        maximum_impulse: 120,
        centroid_x: 4,
        centroid_y: 8,
      },
    }),
  );
  assert.equal(cues.audio?.pin_pin.contact_count, 37);
  assert.equal(cues.audio?.pin_pin.impulse, strong);
  assert.deepEqual(cues.visual, { x: 4, y: 8, strength: strong, first_contact: false });
});

test("impact mapper bounds malformed transport values without creating a cue", () => {
  assert.equal(normalize_impact_impulse(Number.NaN), 0);
  assert.equal(normalize_impact_impulse(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalize_impact_impulse(-3), 0);
  assert.equal(normalize_impact_impulse(999999), 1);
  assert.deepEqual(
    map_impact_presentation(
      impact_event({
        ball_pin: {
          contact_count: Number.NaN,
          total_impulse: Number.POSITIVE_INFINITY,
          maximum_impulse: -1,
          centroid_x: Number.NaN,
          centroid_y: Number.NEGATIVE_INFINITY,
        },
      }),
    ),
    { audio: undefined, visual: undefined },
  );
});

test("first ball-pin impact supplies the visual location before a stronger later cascade", () => {
  const cues = map_impact_presentation(
    impact_event({
      first_ball_pin_impact: true,
      ball_pin: {
        contact_count: 1,
        total_impulse: 58,
        maximum_impulse: 58,
        centroid_x: -2,
        centroid_y: 3,
      },
      pin_pin: {
        contact_count: 16,
        total_impulse: 1350,
        maximum_impulse: 500,
        centroid_x: 9,
        centroid_y: 12,
      },
    }),
  );
  assert.deepEqual(cues.visual, {
    x: -2,
    y: 3,
    strength: normalize_impact_impulse(58),
    first_contact: true,
  });
  assert.equal(cues.audio?.first_contact, true);
});

test("deck impulse is sourced from actual fall-transition speed, not pin-pin impulse", () => {
  const cues = map_impact_presentation(
    impact_event({
      pin_pin: {
        contact_count: 6,
        total_impulse: 1350,
        maximum_impulse: 800,
        centroid_x: 2,
        centroid_y: 4,
      },
      fallen: {
        transition_count: 2,
        total_speed: 36,
        maximum_speed: 18,
        centroid_x: -1,
        centroid_y: 7,
      },
    }),
  );
  assert.equal(cues.audio?.deck_impulse, normalize_ball_roll_speed(18));
  assert.notEqual(cues.audio?.deck_impulse, cues.audio?.pin_pin.impulse);
});

test("snapshot speed normalization uses the 60-unit legal superhuman ceiling", () => {
  assert.equal(normalize_ball_roll_speed(-1), 0);
  assert.equal(normalize_ball_roll_speed(Number.NaN), 0);
  assert.equal(normalize_ball_roll_speed(legal_roll_speed_reference / 2), 0.5);
  assert.equal(normalize_ball_roll_speed(legal_roll_speed_reference), 1);
  assert.equal(normalize_ball_roll_speed(120), 1);
});
