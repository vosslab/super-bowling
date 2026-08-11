import assert from "node:assert/strict";
import test from "node:test";

import {
  collision_intensity_pin_cap,
  create_collision_sound,
} from "../src/audio/collision_audio.ts";

test("physical impact cues are bounded before they reach the audio scheduler", () => {
  const sound = create_collision_sound({
    first_contact: true,
    ball_pin: { contact_count: 99.8, impulse: 2 },
    pin_pin: { contact_count: -3, impulse: Number.NaN },
    deck_impulse: -1,
    pan: 3,
  });

  assert.ok(sound);
  assert.ok(
    sound.ball_pin.contact_count <= collision_intensity_pin_cap &&
      [sound.ball_pin.impulse, sound.pin_pin.impulse, sound.deck_impulse].every(
        (value) => value >= 0 && value <= 1,
      ) &&
      sound.pan >= -1 &&
      sound.pan <= 1,
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
