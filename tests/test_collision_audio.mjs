import assert from "node:assert/strict";
import test from "node:test";

import {
  collision_intensity_pin_cap,
  create_collision_sound,
} from "../src/audio/collision_audio.ts";

test("physical impact cues are bounded before they reach the audio scheduler", () => {
  const sound = create_collision_sound({
    first_contact: true,
    ball_pin: { contact_count: 99.8, impulse: 2, pan: 3 },
    pin_pin: { contact_count: -3, impulse: Number.NaN, pan: -3 },
    deck: { contact_count: 4, impulse: -1, pan: Number.POSITIVE_INFINITY },
  });

  assert.ok(sound);
  assert.ok(
    sound.ball_pin.contact_count <= collision_intensity_pin_cap &&
      [sound.ball_pin.impulse, sound.pin_pin.impulse, sound.deck.impulse].every(
        (value) => value >= 0 && value <= 1,
      ) &&
      [sound.ball_pin.pan, sound.pin_pin.pan, sound.deck.pan].every(
        (value) => value >= -1 && value <= 1,
      ),
  );
});

test("empty physical impact windows remain silent", () => {
  assert.equal(
    create_collision_sound({
      first_contact: true,
      ball_pin: { contact_count: 0, impulse: 0, pan: 0 },
      pin_pin: { contact_count: 0, impulse: 0, pan: 0 },
      deck: { contact_count: 0, impulse: 0, pan: 0 },
    }),
    undefined,
  );
});
