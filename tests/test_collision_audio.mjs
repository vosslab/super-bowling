import assert from "node:assert/strict";
import test from "node:test";

import { create_collision_sound } from "../src/audio/collision_audio.ts";

test("physical impact cues are bounded before they reach the audio scheduler", () => {
  assert.deepEqual(
    create_collision_sound({
      first_contact: true,
      ball_pin: { contact_count: 99.8, impulse: 2 },
      pin_pin: { contact_count: -3, impulse: Number.NaN },
      deck_impulse: -1,
      pan: 3,
    }),
    {
      first_contact: true,
      ball_pin: { contact_count: 12, impulse: 1 },
      pin_pin: { contact_count: 0, impulse: 0 },
      deck_impulse: 0,
      pan: 1,
    },
  );
});

test("empty physical impact windows remain silent", () => {
  assert.equal(
    create_collision_sound({
      first_contact: true,
      ball_pin: { contact_count: 0, impulse: 1 },
      pin_pin: { contact_count: 0, impulse: 1 },
      deck_impulse: 0,
    }),
    undefined,
  );
});
