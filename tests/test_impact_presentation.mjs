import assert from "node:assert/strict";
import test from "node:test";

import { map_impact_presentation } from "../src/app/impact_presentation.ts";

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

test("first ball-pin contact remains the visual focus of a stronger cascade", () => {
  const cues = map_impact_presentation(
    impact_event({
      first_ball_pin_impact: true,
      ball_pin: {
        contact_count: 1,
        total_impulse: 20,
        maximum_impulse: 20,
        centroid_x: -2,
        centroid_y: 3,
      },
      pin_pin: {
        contact_count: 16,
        total_impulse: 400,
        maximum_impulse: 100,
        centroid_x: 9,
        centroid_y: 12,
      },
    }),
  );

  assert.deepEqual([cues.visual?.x, cues.visual?.y], [-2, 3]);
  assert.equal(cues.audio?.first_contact, true);
  assert.ok(cues.audio.ball_pin.pan < 0 && cues.audio.pin_pin.pan > 0);
});

test("deck intensity depends on fall speed rather than pin-pin impulse", () => {
  function mapped_deck_impulse(pin_pin_impulse) {
    return map_impact_presentation(
      impact_event({
        pin_pin: {
          contact_count: 3,
          total_impulse: pin_pin_impulse,
          maximum_impulse: pin_pin_impulse,
          centroid_x: 0,
          centroid_y: 4,
        },
        fallen: {
          transition_count: 2,
          total_speed: 24,
          maximum_speed: 16,
          centroid_x: 1,
          centroid_y: 6,
        },
      }),
    ).audio;
  }

  const quieter_contacts = mapped_deck_impulse(20);
  const louder_contacts = mapped_deck_impulse(400);
  assert.equal(quieter_contacts?.deck.impulse, louder_contacts?.deck.impulse);
  assert.equal(quieter_contacts?.deck.contact_count, 2);
  assert.notEqual(quieter_contacts?.pin_pin.impulse, louder_contacts?.pin_pin.impulse);
});

test("malformed transport values do not invent a presentation cue", () => {
  const cues = map_impact_presentation(
    impact_event({
      ball_pin: {
        contact_count: Number.NaN,
        total_impulse: Number.POSITIVE_INFINITY,
        maximum_impulse: -1,
        centroid_x: Number.NaN,
        centroid_y: Number.NEGATIVE_INFINITY,
      },
    }),
  );

  assert.deepEqual(cues, { audio: undefined, source_simulation_time_ms: 100, visual: undefined });
});
