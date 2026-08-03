import assert from "node:assert/strict";
import test from "node:test";

import { earned_moment, earned_moment_state } from "../src/app/earned_moments.ts";

const previous_record = {
  best_score: 100,
  recent_scores: [],
  best_frame_score: 30,
  best_strike_streak: 2,
  matches_played: 1,
};

function input(overrides = {}) {
  return {
    previous_record,
    previous_state: moment_state(),
    current_state: moment_state(),
    high_game_already_fired: false,
    best_frame_already_fired: false,
    ...overrides,
  };
}

function moment_state(overrides = {}) {
  return { last_finalized_score: 90, best_frame_score: 30, current_strike_run: 0, ...overrides };
}

test("does not announce a below-record or unresolved score", () => {
  assert.equal(earned_moment(input()), undefined);
  assert.equal(
    earned_moment(input({ current_state: moment_state({ last_finalized_score: undefined }) })),
    undefined,
  );
});

test("announces the finalized roll that crosses a high game once", () => {
  const crossing = input({ current_state: moment_state({ last_finalized_score: 101 }) });

  assert.deepEqual(earned_moment(crossing), { kind: "high_game", score: 101 });
  assert.equal(earned_moment({ ...crossing, high_game_already_fired: true }), undefined);
});

test("announces the first positive frame record in a new mode", () => {
  const moment = earned_moment(
    input({
      previous_record: undefined,
      previous_state: moment_state({
        last_finalized_score: undefined,
        best_frame_score: undefined,
      }),
      current_state: moment_state({ last_finalized_score: 8, best_frame_score: 8 }),
    }),
  );
  assert.deepEqual(moment, { kind: "best_frame", score: 8 });
});

test("derives a first completed classic frame as a best-frame moment", () => {
  const before = earned_moment_state([], 10, 2);
  const after = earned_moment_state([{ frame_index: 0, rolls: [5, 3] }], 10, 2);

  assert.deepEqual(after, {
    last_finalized_score: 8,
    best_frame_score: 8,
    current_strike_run: 0,
  });
  assert.deepEqual(
    earned_moment(
      input({
        previous_record: undefined,
        previous_state: before,
        current_state: after,
      }),
    ),
    { kind: "best_frame", score: 8 },
  );
});

test("announces an improved frame record once per player", () => {
  const crossing = input({ current_state: moment_state({ best_frame_score: 31 }) });
  assert.deepEqual(earned_moment(crossing), { kind: "best_frame", score: 31 });
  assert.equal(earned_moment({ ...crossing, best_frame_already_fired: true }), undefined);
});

test("announces a turkey and each newly gained named run rung", () => {
  assert.equal(
    earned_moment(input({ current_state: moment_state({ current_strike_run: 2 }) })),
    undefined,
  );
  assert.deepEqual(
    earned_moment(
      input({
        previous_state: moment_state({ current_strike_run: 2 }),
        current_state: moment_state({ current_strike_run: 3 }),
      }),
    ),
    { kind: "strike_run", term: "Turkey" },
  );
  assert.equal(
    earned_moment(
      input({
        previous_state: moment_state({ current_strike_run: 3 }),
        current_state: moment_state({ current_strike_run: 3 }),
      }),
    ),
    undefined,
  );
  assert.deepEqual(
    earned_moment(
      input({
        previous_state: moment_state({ current_strike_run: 3 }),
        current_state: moment_state({ current_strike_run: 4 }),
      }),
    ),
    { kind: "strike_run", term: "Four-bagger" },
  );
});

test("does not defer a lower-priority best frame after a high game", () => {
  const simultaneous = input({
    previous_state: moment_state({ last_finalized_score: 100, current_strike_run: 2 }),
    current_state: moment_state({
      last_finalized_score: 101,
      best_frame_score: 31,
      current_strike_run: 3,
    }),
  });
  assert.deepEqual(earned_moment(simultaneous), { kind: "high_game", score: 101 });
  assert.equal(
    earned_moment({
      ...simultaneous,
      previous_state: simultaneous.current_state,
      high_game_already_fired: true,
    }),
    undefined,
  );

  const later_frame_improvement = {
    ...simultaneous,
    previous_state: moment_state({ last_finalized_score: 101, best_frame_score: 31 }),
    current_state: moment_state({ last_finalized_score: 101, best_frame_score: 32 }),
    high_game_already_fired: true,
  };
  assert.deepEqual(earned_moment(later_frame_improvement), { kind: "best_frame", score: 32 });
});
