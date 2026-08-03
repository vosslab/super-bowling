import assert from "node:assert/strict";
import test from "node:test";

import { earned_moment } from "../src/app/earned_moments.ts";

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
    previous_state: { last_finalized_score: 90, current_strike_run: 0 },
    current_state: { last_finalized_score: 90, current_strike_run: 0 },
    high_game_already_fired: false,
    ...overrides,
  };
}

test("does not announce an absent, below-record, or unresolved score", () => {
  assert.equal(earned_moment(input({ previous_record: undefined })), undefined);
  assert.equal(earned_moment(input()), undefined);
  assert.equal(
    earned_moment(
      input({ current_state: { last_finalized_score: undefined, current_strike_run: 0 } }),
    ),
    undefined,
  );
});

test("announces the finalized roll that crosses a high game once", () => {
  const crossing = input({ current_state: { last_finalized_score: 101, current_strike_run: 0 } });

  assert.deepEqual(earned_moment(crossing), { kind: "high_game", score: 101 });
  assert.equal(earned_moment({ ...crossing, high_game_already_fired: true }), undefined);
});

test("announces a turkey and each newly gained named run rung", () => {
  assert.equal(
    earned_moment(input({ current_state: { last_finalized_score: 90, current_strike_run: 2 } })),
    undefined,
  );
  assert.deepEqual(
    earned_moment(
      input({
        previous_state: { last_finalized_score: 90, current_strike_run: 2 },
        current_state: { last_finalized_score: 90, current_strike_run: 3 },
      }),
    ),
    { kind: "strike_run", term: "Turkey" },
  );
  assert.equal(
    earned_moment(
      input({
        previous_state: { last_finalized_score: 90, current_strike_run: 3 },
        current_state: { last_finalized_score: 90, current_strike_run: 3 },
      }),
    ),
    undefined,
  );
  assert.deepEqual(
    earned_moment(
      input({
        previous_state: { last_finalized_score: 90, current_strike_run: 3 },
        current_state: { last_finalized_score: 90, current_strike_run: 4 },
      }),
    ),
    { kind: "strike_run", term: "Four-bagger" },
  );
});

test("prefers a newly earned strike run over a simultaneous high game", () => {
  assert.deepEqual(
    earned_moment(
      input({
        previous_state: { last_finalized_score: 100, current_strike_run: 2 },
        current_state: { last_finalized_score: 101, current_strike_run: 3 },
      }),
    ),
    { kind: "strike_run", term: "Turkey" },
  );
});
