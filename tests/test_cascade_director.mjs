import assert from "node:assert/strict";
import test from "node:test";

import { create_cascade_director } from "../src/audio/cascade_director.ts";
import { cascade_trace_fixtures } from "../src/audio/cascade_traces.ts";

function direct_trace(trace) {
  const director = create_cascade_director();
  return trace.flatMap((cue) => director.direct(cue).voices);
}

test("director is deterministic and each audible voice retains finite physical provenance", () => {
  const first = direct_trace(cascade_trace_fixtures.large_990_opening);
  const second = direct_trace(cascade_trace_fixtures.large_990_opening);

  assert.deepEqual(first, second);
  assert.ok(first.some((voice) => voice.role === "hero"));
  assert.ok(
    first.every(
      (voice) =>
        Number.isFinite(voice.source_simulation_time_ms) &&
        Number.isFinite(voice.pan) &&
        voice.pan >= -1 &&
        voice.pan <= 1 &&
        voice.source_path !== undefined,
    ),
  );
});

test("same-sector density protects attacks while retaining a quieter sourced body", () => {
  const voices = direct_trace(cascade_trace_fixtures.dense_single_sector);
  const attacks = voices.filter((voice) => voice.role === "hero" || voice.role === "attack");
  const bodies = voices.filter((voice) => voice.role === "body");

  assert.equal(attacks.length, 1);
  assert.ok(bodies.length > 0);
  assert.ok(bodies.every((voice) => voice.delay_ms > 0 && voice.source_contribution_count > 0));
  assert.ok(bodies.some((voice) => voice.source_contribution_count > 1));
});

test("director aggregates source-time frames, decays retained energy, and never flushes silence", () => {
  const director = create_cascade_director();
  const first = cascade_trace_fixtures.dense_single_sector[0];
  const same_frame = {
    ...cascade_trace_fixtures.dense_single_sector[1],
    source_simulation_time_ms: 110,
  };
  const quiet_later = {
    ...same_frame,
    source_simulation_time_ms: 300,
    ball_pin: { contact_count: 0, impulse: 0, pan: 0 },
    pin_pin: { contact_count: 1, impulse: 0.01, pan: 0 },
    deck: { contact_count: 0, impulse: 0, pan: 0 },
  };
  const first_voices = director.direct(first).voices;
  const same_frame_voices = director.direct(same_frame).voices;
  const decayed_voices = director.direct(quiet_later).voices;
  assert.ok(first_voices.every((voice) => voice.source_frame_ms === 100));
  assert.ok(same_frame_voices.every((voice) => voice.source_frame_ms === 100));
  const body_energy = (voices) =>
    voices.filter((voice) => voice.role === "body").map((voice) => voice.gain);
  assert.ok(body_energy(same_frame_voices).some((gain) => gain > 0));
  assert.ok(body_energy(decayed_voices).every((gain) => gain < 0.2));
  assert.deepEqual(director.direct({ ...quiet_later, source_simulation_time_ms: 250 }).voices, []);
  assert.deepEqual(
    director.direct({
      ...quiet_later,
      source_simulation_time_ms: 500,
      ball_pin: { contact_count: 0, impulse: 0, pan: 0 },
      pin_pin: { contact_count: 0, impulse: 0, pan: 0 },
      deck: { contact_count: 0, impulse: 0, pan: 0 },
    }).voices,
    [],
  );
});

test("large trace covers opening, propagation, and tail without fabricating malformed time", () => {
  const large = [
    ...cascade_trace_fixtures.large_990_opening,
    ...cascade_trace_fixtures.large_990_propagation,
    ...cascade_trace_fixtures.large_990_tail,
  ];
  const large_voices = direct_trace(large);
  const ten_voices = direct_trace(cascade_trace_fixtures.ten_pin_strike);
  const malformed = direct_trace(cascade_trace_fixtures.malformed_input);

  assert.ok(large_voices.length > ten_voices.length);
  assert.ok(large_voices.some((voice) => voice.source_simulation_time_ms >= 4_500));
  assert.equal(malformed.length, 0);
});
