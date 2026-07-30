import assert from "node:assert/strict";
import test from "node:test";

import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  append_roll,
  create_empty_score_card,
  score_card,
  total_score,
  validate_score_card,
} from "../src/game/scoring.ts";

function score_rolls(pin_count, rolls) {
  return rolls.reduce(
    (card, roll) => append_roll(card, pin_count, roll),
    create_empty_score_card(),
  );
}

test("scores the GAME_RULES 10-pin open, spare, and strike examples", () => {
  const open_card = score_rolls(10, [3, 4]);
  const spare_card = score_rolls(10, [6, 4, 5, 0]);
  const strike_card = score_rolls(10, [10, 3, 4]);
  assert.equal(score_card(open_card, 10)[0]?.score, 7);
  assert.equal(score_card(spare_card, 10)[0]?.score, 15);
  assert.equal(score_card(strike_card, 10)[0]?.score, 17);
});

test("scores worked 100-mode and 1000-mode strikes at their actual rack totals", () => {
  assert.equal(score_card(score_rolls(105, [105, 30, 20]), 105)[0]?.score, 155);
  assert.equal(score_card(score_rolls(990, [990, 400, 300]), 990)[0]?.score, 1690);
});

test("scores a perfect game as thirty times every supported rack count", () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    assert.equal(
      total_score(
        score_rolls(
          pin_count,
          Array.from({ length: 12 }, () => pin_count),
        ),
        pin_count,
      ),
      30 * pin_count,
    );
  }
});

test("scores strike, spare, and open frames for every advertised rack", () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    const open_card = score_rolls(pin_count, [1, 2]);
    const spare_card = score_rolls(pin_count, [pin_count - 1, 1, 3, 0]);
    const strike_card = score_rolls(pin_count, [pin_count, 2, 3]);
    assert.equal(score_card(open_card, pin_count)[0]?.score, 3);
    assert.equal(score_card(spare_card, pin_count)[0]?.score, pin_count + 3);
    assert.equal(score_card(strike_card, pin_count)[0]?.score, pin_count + 5);
  }
});

test("scores a legal tenth-frame strike sequence for every advertised rack", () => {
  for (const mode of supported_pin_counts) {
    const pin_count = get_rack_pin_count(mode);
    const opening_frames = Array.from({ length: 9 }, () => [0, 0]).flat();
    const card = score_rolls(pin_count, [...opening_frames, pin_count, pin_count - 1, 1]);
    assert.equal(total_score(card, pin_count), 2 * pin_count);
  }
});

test("keeps incomplete strike totals unknown until their bonus rolls arrive", () => {
  const card = score_rolls(10, [10]);
  assert.equal(score_card(card, 10)[0]?.score, undefined);
  assert.equal(total_score(card, 10), undefined);
});

test("scores valid tenth-frame spare and strike bonus sequences", () => {
  const spare_tenth = score_rolls(
    10,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 3, 8],
  );
  const strike_tenth = score_rolls(
    10,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10],
  );
  assert.equal(total_score(spare_tenth, 10), 18);
  assert.equal(total_score(strike_tenth, 10), 30);
});

test("validates tenth-frame strike bonus racks", () => {
  const preceding_opens = Array.from({ length: 9 }, () => [0, 0]).flat();
  const strike_then_partial = score_rolls(10, [...preceding_opens, 10, 7, 3]);
  const perfect_tenth = score_rolls(10, [...preceding_opens, 10, 10, 10]);
  const invalid_tenth = [{ frame_index: 9, rolls: [10, 7, 4] }];

  assert.equal(total_score(strike_then_partial, 10), 20);
  assert.equal(total_score(perfect_tenth, 10), 30);
  assert.equal(validate_score_card(invalid_tenth, 10).valid, false);
  assert.throws(() => append_roll(score_rolls(10, [...preceding_opens, 10, 7]), 10, 4));
});

test("rejects roll sequences that exceed a standing rack", () => {
  const invalid_card = [{ frame_index: 0, rolls: [7, 4] }];
  assert.equal(validate_score_card(invalid_card, 10).valid, false);
  assert.throws(() => append_roll(score_rolls(10, [7]), 10, 4));
});
