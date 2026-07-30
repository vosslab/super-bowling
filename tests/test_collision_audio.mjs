import assert from "node:assert/strict";
import test from "node:test";

import {
  collision_bucket_ms,
  create_collision_aggregator,
  maximum_collision_voices_per_roll,
} from "../src/audio/collision_audio.ts";

test("collision aggregator combines positive deltas into one 90ms bucket", () => {
  const aggregator = create_collision_aggregator();
  aggregator.begin_roll();
  assert.equal(aggregator.record(2, 100), undefined);
  assert.equal(aggregator.record(4, 150), undefined);
  const sound = aggregator.record(1, 100 + collision_bucket_ms);
  assert.deepEqual(sound, { intensity: 0.5 });
  assert.deepEqual(aggregator.flush(210), { intensity: 1 / 12 });
});

test("collision aggregator caps intensity and bounds every roll to eight voices", () => {
  const aggregator = create_collision_aggregator();
  aggregator.begin_roll();
  const sounds = [];
  for (let index = 0; index < maximum_collision_voices_per_roll + 3; index += 1) {
    aggregator.record(99, index * collision_bucket_ms);
    const sound = aggregator.record(1, index * collision_bucket_ms + collision_bucket_ms);
    if (sound !== undefined) sounds.push(sound);
  }
  const final_sound = aggregator.flush(1000);
  if (final_sound !== undefined) sounds.push(final_sound);
  assert.equal(sounds.length, maximum_collision_voices_per_roll);
  assert.deepEqual(sounds.at(0), { intensity: 1 });
});

test("collision aggregator flushes one pending bucket and clears it at roll end", () => {
  const aggregator = create_collision_aggregator();
  aggregator.begin_roll();
  aggregator.record(3, 0);
  assert.deepEqual(aggregator.flush(40), { intensity: 0.25 });
  assert.equal(aggregator.flush(50), undefined);
  aggregator.end_roll();
  assert.equal(aggregator.record(6, 100), undefined);
});
