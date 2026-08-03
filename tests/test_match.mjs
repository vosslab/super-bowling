import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { create_player_id } from "../src/brands.ts";
import { get_rack_pin_count } from "../src/config/pin_counts.ts";
import { create_match_state, reduce_match } from "../src/game/match.ts";

const ball_design = normalize_ball_design({});

function ready_match() {
  const initial = create_match_state({
    pin_count: 10,
    players: [{ player_id: create_player_id(0), name: "Ari", ball_design }],
  });
  return reduce_match(reduce_match(initial, { type: "start" }).state, { type: "rack_ready" }).state;
}

function ready_super_match(bowls_per_frame = 3, player_count = 1) {
  const players = Array.from({ length: player_count }, (_, index) => ({
    player_id: create_player_id(index),
    name: `Player ${index + 1}`,
    ball_design,
  }));
  const initial = create_match_state({ pin_count: 10, bowls_per_frame, players });
  return reduce_match(reduce_match(initial, { type: "start" }).state, { type: "rack_ready" }).state;
}

function ready_tenth_frame_match() {
  let state = ready_match();
  for (let frame_index = 0; frame_index < 9; frame_index += 1) {
    state = advance_result(settle_roll(state, 10).state).state;
    state = advance_result(settle_roll(complete_sweep(state), 10).state).state;
    state = reduce_match(state, { type: "rack_ready" }).state;
  }
  return state;
}

function settle_roll(state, standing_pin_count) {
  const launched_state = reduce_match(state, { type: "launch" }).state;
  const fallen_pin_count = 10 - standing_pin_count;
  const transition = reduce_match(launched_state, {
    type: "settled",
    settled_roll: { pin_count: 10, standing_pin_count, fallen_pin_count, timed_out: false },
  });
  return transition;
}

function advance_result(state) {
  return reduce_match(state, { type: "advance_after_result" });
}

function complete_sweep(state) {
  return reduce_match(state, { type: "sweep_complete" }).state;
}

test("starts a one-player match with a fresh rack effect", () => {
  const initial = create_match_state({
    pin_count: 10,
    players: [{ player_id: create_player_id(0), name: "Ari", ball_design }],
  });
  const transition = reduce_match(initial, { type: "start" });
  assert.equal(transition.state.phase, "rack_resetting");
  assert.deepEqual(transition.effects, [{ type: "reset_rack", pin_count: 10 }]);
});

test("keeps a non-strike result visible before the second roll", () => {
  let state = ready_match();
  state = reduce_match(state, { type: "launch" }).state;
  const transition = reduce_match(state, {
    type: "settled",
    settled_roll: { pin_count: 10, standing_pin_count: 4, fallen_pin_count: 6, timed_out: false },
  });
  assert.equal(transition.state.phase, "result");
  assert.equal(transition.state.standing_pin_count, 4);
  assert.deepEqual(transition.effects, []);
  assert.equal(transition.state.result_message, "6 pins down");
  const advanced = advance_result(transition.state);
  assert.equal(advanced.state.phase, "sweeping");
  assert.deepEqual(advanced.effects, [{ type: "prepare_next_roll" }]);
  assert.equal(reduce_match(advanced.state, { type: "launch" }).state.phase, "sweeping");
  assert.equal(complete_sweep(advanced.state).phase, "aiming");
});

test("resets a fresh rack after a strike and accepts settlement once", () => {
  let state = ready_match();
  state = reduce_match(state, { type: "launch" }).state;
  const settled = {
    type: "settled",
    settled_roll: { pin_count: 10, standing_pin_count: 0, fallen_pin_count: 10, timed_out: false },
  };
  const first = reduce_match(state, settled);
  const duplicate = reduce_match(first.state, settled);
  assert.equal(first.state.phase, "result");
  assert.deepEqual(first.effects, []);
  assert.equal(duplicate.state, first.state);
  const advanced = advance_result(first.state);
  assert.equal(advanced.state.phase, "rack_resetting");
  assert.deepEqual(advanced.effects, [{ type: "reset_rack", pin_count: 10 }]);
});

test("raises a fatal state for a settlement that breaks pin conservation", () => {
  let state = ready_match();
  state = reduce_match(state, { type: "launch" }).state;
  const transition = reduce_match(state, {
    type: "settled",
    settled_roll: { pin_count: 10, standing_pin_count: 3, fallen_pin_count: 8, timed_out: false },
  });
  assert.equal(transition.state.phase, "fatal");
});

test("rotates completed players in frame order", () => {
  let state = create_match_state({
    pin_count: 10,
    players: [
      { player_id: create_player_id(0), name: "Ari", ball_design },
      { player_id: create_player_id(1), name: "Bea", ball_design },
    ],
  });
  state = reduce_match(reduce_match(state, { type: "start" }).state, { type: "rack_ready" }).state;
  state = reduce_match(state, { type: "launch" }).state;
  const transition = reduce_match(state, {
    type: "settled",
    settled_roll: { pin_count: 10, standing_pin_count: 0, fallen_pin_count: 10, timed_out: false },
  });
  const advanced = advance_result(transition.state);
  assert.equal(advanced.state.active_player_id, create_player_id(1));
  assert.equal(advanced.state.current_frame_index, 0);
});

test("uses a visible handoff and one fresh rack effect for every hot-seat turn", () => {
  const players = ["Ari", "Bea", "Chen", "Dia"].map((name, index) => ({
    player_id: create_player_id(index),
    name,
    ball_design,
  }));
  let state = create_match_state({ pin_count: 10, players });
  state = reduce_match(reduce_match(state, { type: "start" }).state, { type: "rack_ready" }).state;
  const expected = ["Bea", "Chen", "Dia", "Ari"];
  for (const next_name of expected) {
    state = advance_result(settle_roll(state, 10).state).state;
    const handoff = advance_result(settle_roll(complete_sweep(state), 10).state);
    assert.equal(handoff.state.phase, "handoff");
    assert.equal(handoff.effects.length, 0);
    assert.equal(
      handoff.state.players.find((player) => player.player_id === handoff.state.active_player_id)
        ?.name,
      next_name,
    );
    const continued = reduce_match(handoff.state, { type: "continue_turn" });
    assert.deepEqual(continued.effects, [{ type: "reset_rack", pin_count: 10 }]);
    state = reduce_match(continued.state, { type: "rack_ready" }).state;
  }
});

test("resets tenth-frame strike bonuses only when their next roll starts fresh", () => {
  const first_strike = advance_result(settle_roll(ready_tenth_frame_match(), 0).state);
  const first_bonus_strike = advance_result(
    settle_roll(reduce_match(first_strike.state, { type: "rack_ready" }).state, 0).state,
  );
  const final_bonus = advance_result(
    settle_roll(reduce_match(first_bonus_strike.state, { type: "rack_ready" }).state, 0).state,
  );

  assert.deepEqual(first_strike.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.deepEqual(first_bonus_strike.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.deepEqual(final_bonus.effects, [
    {
      type: "match_complete",
      summaries: [
        {
          player_id: create_player_id(0),
          total_score: 30,
          best_frame_score: 30,
          longest_strike_streak: 3,
        },
      ],
    },
  ]);
});

test("keeps a partial tenth-frame strike bonus on its existing rack", () => {
  const first_strike = advance_result(settle_roll(ready_tenth_frame_match(), 0).state);
  const partial_bonus = advance_result(
    settle_roll(reduce_match(first_strike.state, { type: "rack_ready" }).state, 3).state,
  );
  const final_bonus = advance_result(settle_roll(complete_sweep(partial_bonus.state), 0).state);

  assert.deepEqual(first_strike.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.deepEqual(partial_bonus.effects, [{ type: "prepare_next_roll" }]);
  assert.equal(partial_bonus.state.phase, "sweeping");
  assert.equal(partial_bonus.state.standing_pin_count, 3);
  assert.deepEqual(final_bonus.effects, [
    {
      type: "match_complete",
      summaries: [
        {
          player_id: create_player_id(0),
          total_score: 20,
          best_frame_score: 20,
          longest_strike_streak: 1,
        },
      ],
    },
  ]);
});

test("resets a tenth-frame spare before its single bonus", () => {
  const first_roll = advance_result(settle_roll(ready_tenth_frame_match(), 3).state);
  const spare = advance_result(settle_roll(complete_sweep(first_roll.state), 0).state);

  assert.deepEqual(first_roll.effects, [{ type: "prepare_next_roll" }]);
  assert.deepEqual(spare.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.equal(spare.state.phase, "rack_resetting");
});

test("sweeps a gutter-ball rack before the next roll and never after a completed frame", () => {
  const gutter = advance_result(settle_roll(ready_match(), 10).state);
  assert.equal(gutter.state.phase, "sweeping");
  assert.deepEqual(gutter.effects, [{ type: "prepare_next_roll" }]);

  const second_roll = advance_result(settle_roll(complete_sweep(gutter.state), 10).state);
  assert.equal(second_roll.state.phase, "rack_resetting");
  assert.deepEqual(second_roll.effects, [{ type: "reset_rack", pin_count: 10 }]);
});

test("keeps terminal tenth-frame and settle-timeout transitions free of rack effects", () => {
  const tenth_first_roll = advance_result(settle_roll(ready_tenth_frame_match(), 4).state);
  const tenth_open = advance_result(settle_roll(complete_sweep(tenth_first_roll.state), 1).state);
  const rolling = reduce_match(ready_match(), { type: "launch" }).state;
  const settle_timeout = reduce_match(rolling, {
    type: "fatal",
    message: "The lane did not settle in time.",
  });
  const terminal_rows = [
    { transition: tenth_open, expected_phase: "final" },
    { transition: settle_timeout, expected_phase: "fatal" },
  ];

  for (const { transition, expected_phase } of terminal_rows) {
    assert.equal(transition.state.phase, expected_phase);
    assert.equal(
      transition.effects.some(
        (effect) =>
          effect.type === "sweep_deadwood" ||
          effect.type === "prepare_next_roll" ||
          effect.type === "reset_rack",
      ),
      false,
    );
  }
});

test("clamps a four-value aim state and emits every launch value", () => {
  const state = ready_match();
  const updated = reduce_match(state, {
    type: "set_aim",
    aim: { power: 999, start_position: 999, angle: 999, spin: 999 },
  });
  const launched = reduce_match(updated.state, { type: "launch" });
  assert.equal(launched.effects.length, 1);
  assert.deepEqual(launched.effects[0], {
    type: "launch",
    power: updated.state.aim.power,
    start_position: updated.state.aim.start_position,
    angle: updated.state.aim.angle,
    spin: updated.state.aim.spin,
  });
  assert.ok(updated.state.aim.power < 999);
  assert.ok(updated.state.aim.start_position < 999);
  assert.ok(updated.state.aim.angle < 999);
  assert.ok(updated.state.aim.spin < 999);
});

test("carries every selected rack size through reset and settlement conservation", () => {
  for (const pin_count of [10, 20, 50, 100, 500, 1000]) {
    const rack_pin_count = get_rack_pin_count(pin_count);
    const initial = create_match_state({
      pin_count,
      players: [{ player_id: create_player_id(0), name: "Ari", ball_design }],
    });
    const started = reduce_match(initial, { type: "start" });
    assert.deepEqual(started.effects, [{ type: "reset_rack", pin_count: rack_pin_count }]);
    const aiming = reduce_match(started.state, { type: "rack_ready" }).state;
    const rolling = reduce_match(aiming, { type: "launch" }).state;
    const settled = reduce_match(rolling, {
      type: "settled",
      settled_roll: {
        pin_count: rack_pin_count,
        standing_pin_count: 0,
        fallen_pin_count: rack_pin_count,
        timed_out: false,
      },
    });
    assert.equal(settled.state.phase, "result");
    assert.deepEqual(advance_result(settled.state).effects, [
      { type: "reset_rack", pin_count: rack_pin_count },
    ]);
  }
});

test("keeps a super frame on its rack until its configured third bowl", () => {
  let state = ready_super_match();
  for (const standing_pin_count of [6, 3]) {
    const advanced = advance_result(settle_roll(state, standing_pin_count).state);
    assert.equal(advanced.state.phase, "sweeping");
    assert.deepEqual(advanced.effects, [{ type: "prepare_next_roll" }]);
    state = complete_sweep(advanced.state);
  }
  const completed = advance_result(settle_roll(state, 0).state);
  assert.equal(completed.state.phase, "rack_resetting");
  assert.deepEqual(completed.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.equal(completed.state.score_cards[create_player_id(0)]?.frames[0]?.score, 10);
});

test("ends a super frame immediately when it clears the rack", () => {
  const completed = advance_result(settle_roll(ready_super_match(), 0).state);
  assert.equal(completed.state.phase, "rack_resetting");
  assert.deepEqual(completed.effects, [{ type: "reset_rack", pin_count: 10 }]);
  assert.equal(completed.state.result_message, undefined);
});

test("uses a super-frame tenth fresh rack after clears and never grants a fifth bowl", () => {
  let state = ready_super_match();
  for (let frame_index = 0; frame_index < 9; frame_index += 1) {
    for (const standing_pin_count of [8, 5, 0]) {
      const advanced = advance_result(settle_roll(state, standing_pin_count).state);
      if (standing_pin_count === 0) {
        state = reduce_match(advanced.state, { type: "rack_ready" }).state;
      } else {
        state = complete_sweep(advanced.state);
      }
    }
  }
  for (let bowl_index = 0; bowl_index < 3; bowl_index += 1) {
    const advanced = advance_result(settle_roll(state, 0).state);
    assert.equal(advanced.state.phase, "rack_resetting");
    state = reduce_match(advanced.state, { type: "rack_ready" }).state;
  }
  const final = advance_result(settle_roll(state, 0).state);
  assert.equal(final.state.phase, "final");
  assert.deepEqual(final.effects, [
    {
      type: "match_complete",
      summaries: [
        {
          player_id: create_player_id(0),
          total_score: 130,
          best_frame_score: 40,
          longest_strike_streak: 4,
        },
      ],
    },
  ]);
});

test("keeps a super-frame tenth on its partial rack through its fourth bowl", () => {
  let state = ready_super_match();
  for (let frame_index = 0; frame_index < 9; frame_index += 1) {
    for (const standing_pin_count of [8, 5, 0]) {
      const advanced = advance_result(settle_roll(state, standing_pin_count).state);
      state =
        standing_pin_count === 0
          ? reduce_match(advanced.state, { type: "rack_ready" }).state
          : complete_sweep(advanced.state);
    }
  }
  for (const standing_pin_count of [8, 5]) {
    state = complete_sweep(advance_result(settle_roll(state, standing_pin_count).state).state);
  }
  const third = advance_result(settle_roll(state, 1).state);
  assert.equal(third.state.phase, "sweeping");
  assert.deepEqual(third.effects, [{ type: "prepare_next_roll" }]);
  const final = advance_result(settle_roll(complete_sweep(third.state), 1).state);
  assert.equal(final.state.phase, "final");
  assert.deepEqual(final.effects, [
    {
      type: "match_complete",
      summaries: [
        {
          player_id: create_player_id(0),
          total_score: 99,
          best_frame_score: 10,
          longest_strike_streak: 0,
        },
      ],
    },
  ]);
});

test("does not hand off a super frame before a clear or its final bowl", () => {
  let state = ready_super_match(3, 2);
  for (const standing_pin_count of [8, 5]) {
    state = complete_sweep(advance_result(settle_roll(state, standing_pin_count).state).state);
    assert.equal(state.active_player_id, create_player_id(0));
  }
  const handoff = advance_result(settle_roll(state, 0).state);
  assert.equal(handoff.state.phase, "handoff");
  assert.equal(handoff.state.active_player_id, create_player_id(1));
});

test("runs endpoint bowl rules through every opening frame and fixed tenth total", () => {
  for (const bowls_per_frame of [1, 5]) {
    let state = ready_super_match(bowls_per_frame);
    for (let frame_index = 0; frame_index < 9; frame_index += 1) {
      for (let bowl_index = 0; bowl_index < bowls_per_frame; bowl_index += 1) {
        const advanced = advance_result(settle_roll(state, 10).state);
        state =
          advanced.state.phase === "sweeping"
            ? complete_sweep(advanced.state)
            : reduce_match(advanced.state, { type: "rack_ready" }).state;
      }
      assert.equal(state.current_frame_index, frame_index + 1);
      assert.equal(state.phase, "aiming");
    }
    for (let bowl_index = 0; bowl_index < bowls_per_frame + 1; bowl_index += 1) {
      const advanced = advance_result(settle_roll(state, 10).state);
      if (bowl_index === bowls_per_frame) {
        assert.equal(advanced.state.phase, "final");
      } else {
        state = complete_sweep(advanced.state);
        assert.equal(state.phase, "aiming");
      }
    }
  }
});

test("rejects invalid bowls-per-frame setup values", () => {
  for (const bowls_per_frame of [0, 6, 1.5]) {
    assert.throws(() =>
      create_match_state({
        pin_count: 10,
        bowls_per_frame,
        players: [{ player_id: create_player_id(0), name: "Ari", ball_design }],
      }),
    );
  }
});
