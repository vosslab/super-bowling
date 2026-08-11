import assert from "node:assert/strict";
import test from "node:test";

import { create_player_id } from "../src/brands.ts";
import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { create_match_state, reduce_match } from "../src/game/match.ts";
import { roll_celebration } from "../src/app/roll_celebration.ts";

const ball_design = normalize_ball_design({});

function ready_match() {
  const initial = create_match_state({
    pin_count: 10,
    players: [{ player_id: create_player_id(0), name: "Ari", ball_design }],
  });
  return reduce_match(reduce_match(initial, { type: "start" }).state, { type: "rack_ready" }).state;
}

function settle_roll(state, standing_pin_count) {
  const rolling = reduce_match(state, { type: "launch" }).state;
  return reduce_match(rolling, {
    type: "settled",
    settled_roll: {
      pin_count: 10,
      standing_pin_count,
      fallen_pin_count: 10 - standing_pin_count,
      timed_out: false,
    },
  }).state;
}

test("derives strike and spare bursts only from reducer-produced result states", () => {
  const strike = settle_roll(ready_match(), 0);
  assert.deepEqual(roll_celebration(strike), {
    kind: "strike",
    label: "STRIKE",
    support_text: "All pins cleared",
  });

  const first_roll = settle_roll(ready_match(), 4);
  const sweeping = reduce_match(first_roll, { type: "advance_after_result" }).state;
  const second_roll = reduce_match(sweeping, { type: "sweep_complete" }).state;
  const spare = settle_roll(second_roll, 0);
  assert.deepEqual(roll_celebration(spare), {
    kind: "spare",
    label: "SPARE",
    support_text: "Clean pickup",
  });

  assert.equal(roll_celebration(first_roll), undefined);
  assert.equal(roll_celebration(ready_match()), undefined);
});
