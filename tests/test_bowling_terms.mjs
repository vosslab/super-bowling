import assert from "node:assert/strict";
import test from "node:test";

import { is_perfect_game, strike_run_term } from "../src/game/bowling_terms.ts";

test("names every defined bagger rung and the numeric fallback", () => {
  assert.equal(strike_run_term(2), "Double");
  assert.equal(strike_run_term(3), "Turkey");
  assert.equal(strike_run_term(4), "Four-bagger");
  assert.equal(strike_run_term(5), "Five-bagger");
  assert.equal(strike_run_term(6), "Six-pack");
  assert.equal(strike_run_term(7), "7-bagger");
  assert.equal(strike_run_term(12), "12-bagger");
});

test("rejects strike-run counts outside the approved bagger domain", () => {
  assert.equal(strike_run_term(-1), undefined);
  assert.equal(strike_run_term(0), undefined);
  assert.equal(strike_run_term(1), undefined);
  assert.equal(strike_run_term(6.5), undefined);
  assert.equal(strike_run_term(Number.NaN), undefined);
  assert.equal(strike_run_term(Number.POSITIVE_INFINITY), undefined);
  assert.equal(strike_run_term(13), undefined);
});

test("recognizes only a standard ten-pin classic 300 as a perfect game", () => {
  const classic_300 = [
    { frame_index: 0, rolls: [10] },
    { frame_index: 1, rolls: [10] },
    { frame_index: 2, rolls: [10] },
    { frame_index: 3, rolls: [10] },
    { frame_index: 4, rolls: [10] },
    { frame_index: 5, rolls: [10] },
    { frame_index: 6, rolls: [10] },
    { frame_index: 7, rolls: [10] },
    { frame_index: 8, rolls: [10] },
    { frame_index: 9, rolls: [10, 10, 10] },
  ];
  const maximum_105 = [
    { frame_index: 0, rolls: [105] },
    { frame_index: 1, rolls: [105] },
    { frame_index: 2, rolls: [105] },
    { frame_index: 3, rolls: [105] },
    { frame_index: 4, rolls: [105] },
    { frame_index: 5, rolls: [105] },
    { frame_index: 6, rolls: [105] },
    { frame_index: 7, rolls: [105] },
    { frame_index: 8, rolls: [105] },
    { frame_index: 9, rolls: [105, 105, 105] },
  ];
  const maximum_ten_pin_super = [
    { frame_index: 0, rolls: [10] },
    { frame_index: 1, rolls: [10] },
    { frame_index: 2, rolls: [10] },
    { frame_index: 3, rolls: [10] },
    { frame_index: 4, rolls: [10] },
    { frame_index: 5, rolls: [10] },
    { frame_index: 6, rolls: [10] },
    { frame_index: 7, rolls: [10] },
    { frame_index: 8, rolls: [10] },
    { frame_index: 9, rolls: [10, 10, 10, 10] },
  ];

  assert.equal(is_perfect_game(classic_300, 10, 2), true);
  assert.equal(is_perfect_game(maximum_105, 105, 2), false);
  assert.equal(is_perfect_game(maximum_ten_pin_super, 10, 3), false);
});
