import assert from "node:assert/strict";
import test from "node:test";

import {
  current_strike_streak,
  fold_match_summaries,
  match_statistics,
} from "../src/game/match_stats.ts";
import { is_strike } from "../src/game/scoring.ts";

const perfect_classic_game = Array.from({ length: 9 }, (_, frame_index) => ({
  frame_index,
  rolls: [10],
})).concat({ frame_index: 9, rolls: [10, 10, 10] });

test("derives classic totals and frame contributions from cumulative scores", () => {
  const frames = [
    { frame_index: 0, rolls: [10] },
    { frame_index: 1, rolls: [3, 4] },
    { frame_index: 2, rolls: [6, 4] },
    { frame_index: 3, rolls: [5, 0] },
    { frame_index: 4, rolls: [0, 0] },
    { frame_index: 5, rolls: [0, 0] },
    { frame_index: 6, rolls: [0, 0] },
    { frame_index: 7, rolls: [0, 0] },
    { frame_index: 8, rolls: [0, 0] },
    { frame_index: 9, rolls: [0, 0] },
  ];

  assert.deepEqual(match_statistics(frames, 10, 2), {
    total_score: 44,
    best_frame_score: 17,
    longest_strike_streak: 1,
  });
});

test("skips unresolved frame contributions while accepting an incomplete card", () => {
  const incomplete_frames = [{ frame_index: 0, rolls: [10] }];

  assert.doesNotThrow(() => match_statistics(incomplete_frames, 10, 2));
  assert.deepEqual(match_statistics(incomplete_frames, 10, 2), {
    total_score: undefined,
    best_frame_score: undefined,
    longest_strike_streak: 1,
  });
});

test("counts all twelve strike bowls in a perfect classic game", () => {
  assert.equal(match_statistics(perfect_classic_game, 10, 2).longest_strike_streak, 12);
  assert.equal(current_strike_streak(perfect_classic_game, 10, 2), 12);
});

test("breaks a strike run inside the tenth frame after a miss", () => {
  const frames = [
    { frame_index: 0, rolls: [10] },
    { frame_index: 1, rolls: [10] },
    { frame_index: 2, rolls: [10] },
    { frame_index: 3, rolls: [0, 0] },
    { frame_index: 4, rolls: [0, 0] },
    { frame_index: 5, rolls: [0, 0] },
    { frame_index: 6, rolls: [0, 0] },
    { frame_index: 7, rolls: [0, 0] },
    { frame_index: 8, rolls: [0, 0] },
    { frame_index: 9, rolls: [10, 3, 7] },
  ];

  assert.equal(match_statistics(frames, 10, 2).longest_strike_streak, 3);
  assert.equal(current_strike_streak(frames, 10, 2), 0);
});

test("uses fresh-rack strike bowls for super B=3 and B=5 tenth frames", () => {
  const three_bowl_frames = [
    { frame_index: 0, rolls: [0, 0, 0] },
    { frame_index: 1, rolls: [0, 0, 0] },
    { frame_index: 2, rolls: [0, 0, 0] },
    { frame_index: 3, rolls: [0, 0, 0] },
    { frame_index: 4, rolls: [0, 0, 0] },
    { frame_index: 5, rolls: [0, 0, 0] },
    { frame_index: 6, rolls: [0, 0, 0] },
    { frame_index: 7, rolls: [0, 0, 0] },
    { frame_index: 8, rolls: [0, 0, 0] },
    { frame_index: 9, rolls: [10, 3, 7, 10] },
  ];
  const five_bowl_frames = [
    { frame_index: 0, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 1, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 2, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 3, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 4, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 5, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 6, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 7, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 8, rolls: [0, 0, 0, 0, 0] },
    { frame_index: 9, rolls: [10, 3, 7, 10, 0, 0] },
  ];

  assert.equal(match_statistics(three_bowl_frames, 10, 3).best_frame_score, 30);
  assert.equal(match_statistics(three_bowl_frames, 10, 3).longest_strike_streak, 1);
  assert.equal(current_strike_streak(three_bowl_frames, 10, 3), 1);
  assert.equal(match_statistics(five_bowl_frames, 10, 5).best_frame_score, 30);
  assert.equal(match_statistics(five_bowl_frames, 10, 5).longest_strike_streak, 1);
  assert.equal(current_strike_streak(five_bowl_frames, 10, 5), 0);
});

test("matches classic strike detection for frames one through nine", () => {
  const frames = [
    { frame_index: 0, rolls: [10] },
    { frame_index: 1, rolls: [4, 6] },
    { frame_index: 2, rolls: [0, 0] },
    { frame_index: 3, rolls: [8, 1] },
  ];

  for (const frame of frames) {
    assert.equal(current_strike_streak([frame], 10, 2), Number(is_strike(frame, 10, 2)));
  }
});

test("folds each record value from the player who earned it", () => {
  const summaries = [
    { player_id: 0, total_score: 201, best_frame_score: 28, longest_strike_streak: 2 },
    { player_id: 1, total_score: 186, best_frame_score: 30, longest_strike_streak: 5 },
  ];

  assert.deepEqual(fold_match_summaries(summaries), {
    top_score: 201,
    best_frame_score: 30,
    longest_strike_streak: 5,
  });
});
