import { get_rack_pin_count, type RackPinCount } from "../config/pin_counts";
import type {
  MatchSetup,
  MatchState,
  MatchTransition,
  PlayerMatchSummary,
  PlayerScoreCard,
  SettledRoll,
} from "./contracts";
import {
  append_roll,
  create_empty_score_card,
  is_frame_complete,
  is_spare,
  score_card,
} from "./scoring";
import { default_bowls_per_frame, is_valid_bowls_per_frame } from "./bowls_per_frame";
import { default_aim, normalize_aim, type AimValues } from "./aim";
import { match_statistics } from "./match_stats";

export type MatchAction =
  | { type: "start" }
  | { type: "rack_ready" }
  | { type: "continue_turn" }
  | { type: "set_aim"; aim: AimValues }
  | { type: "launch" }
  | { type: "settled"; settled_roll: SettledRoll }
  | { type: "advance_after_result" }
  | { type: "sweep_complete" }
  | { type: "fatal"; message: string };

function initial_score_cards(
  players: MatchSetup["players"],
): Readonly<Record<number, PlayerScoreCard>> {
  const score_cards: Record<number, PlayerScoreCard> = {};
  for (const player of players) {
    score_cards[player.player_id] = {
      player_id: player.player_id,
      frames: create_empty_score_card(),
    };
  }
  return score_cards;
}

function player_score_card(state: MatchState): PlayerScoreCard {
  const score_card = state.score_cards[state.active_player_id];
  if (score_card === undefined) throw new Error("The active player must have a score card.");
  return score_card;
}

function current_frame(state: MatchState): PlayerScoreCard["frames"][number] | undefined {
  return player_score_card(state).frames[state.current_frame_index];
}

function effects_for_new_rack(state: MatchState): MatchTransition {
  return {
    state: {
      ...state,
      phase: "rack_resetting",
      standing_pin_count: state.pin_count,
      handoff: undefined,
    },
    effects: [{ type: "reset_rack", pin_count: state.pin_count }],
  };
}

function current_player_index(state: MatchState): number {
  const index = state.players.findIndex((player) => player.player_id === state.active_player_id);
  if (index === -1) throw new Error("The active player must be part of the match.");
  return index;
}

function complete_match(state: MatchState): MatchTransition {
  const summaries: PlayerMatchSummary[] = [];
  for (const player of state.players) {
    const score_card = state.score_cards[player.player_id];
    if (score_card === undefined) {
      throw new Error("A completed match must include every player's score card.");
    }
    const statistics = match_statistics(score_card.frames, state.pin_count, state.bowls_per_frame);
    if (statistics.total_score === undefined || statistics.best_frame_score === undefined) {
      throw new Error("A completed match must have fully resolved player statistics.");
    }
    summaries.push({
      player_id: player.player_id,
      total_score: statistics.total_score,
      best_frame_score: statistics.best_frame_score,
      longest_strike_streak: statistics.longest_strike_streak,
    });
  }
  return {
    state: { ...state, phase: "final" },
    effects: [{ type: "match_complete", summaries }],
  };
}

function advance_after_frame(state: MatchState): MatchTransition {
  const next_player_index = current_player_index(state) + 1;
  const next_player = state.players[next_player_index];
  if (next_player !== undefined) {
    return {
      state: {
        ...state,
        phase: "handoff",
        handoff: {
          completed_player_id: state.active_player_id,
          next_player_id: next_player.player_id,
          frame_index: state.current_frame_index,
        },
        active_player_id: next_player.player_id,
        current_roll_index: 0,
      },
      effects: [],
    };
  }
  if (state.current_frame_index === 9) return complete_match(state);
  const first_player = state.players[0];
  if (first_player === undefined) throw new Error("A match needs its first player.");
  if (state.players.length === 1) {
    return effects_for_new_rack({
      ...state,
      active_player_id: first_player.player_id,
      current_frame_index: state.current_frame_index + 1,
      current_roll_index: 0,
    });
  }
  return {
    state: {
      ...state,
      phase: "handoff",
      handoff: {
        completed_player_id: state.active_player_id,
        next_player_id: first_player.player_id,
        frame_index: state.current_frame_index + 1,
      },
      active_player_id: first_player.player_id,
      current_frame_index: state.current_frame_index + 1,
      current_roll_index: 0,
    },
    effects: [],
  };
}

function update_active_score_card(state: MatchState, rolls: PlayerScoreCard["frames"]): MatchState {
  const active_score_card: PlayerScoreCard = {
    player_id: state.active_player_id,
    frames: score_card(rolls, state.pin_count, state.bowls_per_frame),
  };
  return {
    ...state,
    score_cards: { ...state.score_cards, [state.active_player_id]: active_score_card },
  };
}

function tenth_roll_requires_fresh_rack(
  frame: PlayerScoreCard["frames"][number],
  pin_count: RackPinCount,
): boolean {
  const first = frame.rolls[0];
  const second = frame.rolls[1];
  if (first === pin_count) {
    return frame.rolls.length === 1 || (frame.rolls.length === 2 && second === pin_count);
  }
  return (
    first !== undefined &&
    second !== undefined &&
    frame.rolls.length === 2 &&
    first + second === pin_count
  );
}

function super_tenth_roll_clears_rack(
  frame: PlayerScoreCard["frames"][number],
  pin_count: RackPinCount,
): boolean {
  let rack_total = 0;
  for (const [roll_index, roll] of frame.rolls.entries()) {
    rack_total += roll;
    if (rack_total === pin_count) {
      if (roll_index === frame.rolls.length - 1) return true;
      rack_total = 0;
    }
  }
  return false;
}

function transition_after_roll(state: MatchState): MatchTransition {
  const frame = current_frame(state);
  if (frame === undefined) throw new Error("A settled roll creates a current frame.");
  if (is_frame_complete(frame, state.pin_count, state.bowls_per_frame)) {
    return advance_after_frame(state);
  }
  const super_tenth_fresh_rack =
    state.bowls_per_frame !== default_bowls_per_frame &&
    state.current_frame_index === 9 &&
    super_tenth_roll_clears_rack(frame, state.pin_count);
  if (super_tenth_fresh_rack) {
    return effects_for_new_rack({
      ...state,
      current_roll_index: state.current_roll_index + 1,
      standing_pin_count: state.pin_count,
    });
  }
  if (state.bowls_per_frame !== default_bowls_per_frame) {
    return {
      state: { ...state, phase: "sweeping", current_roll_index: state.current_roll_index + 1 },
      effects: [],
    };
  }
  const tenth_frame = state.current_frame_index === 9;
  if (tenth_frame && tenth_roll_requires_fresh_rack(frame, state.pin_count)) {
    return effects_for_new_rack({
      ...state,
      current_roll_index: state.current_roll_index + 1,
      standing_pin_count: state.pin_count,
    });
  }
  const transition: MatchTransition = {
    state: { ...state, phase: "sweeping", current_roll_index: state.current_roll_index + 1 },
    effects: [],
  };
  return transition;
}

function result_message(
  knocked_pin_count: number,
  pin_count: RackPinCount,
  bowls_per_frame: number,
  frames: PlayerScoreCard["frames"],
): string {
  if (knocked_pin_count === pin_count && bowls_per_frame === default_bowls_per_frame)
    return "Strike!";
  const current_frame = frames[frames.length - 1];
  if (current_frame !== undefined && is_spare(current_frame, pin_count, bowls_per_frame)) {
    return "Spare!";
  }
  return `${knocked_pin_count} pin${knocked_pin_count === 1 ? "" : "s"} down`;
}

export function create_match_state(setup: MatchSetup): MatchState {
  if (setup.players.length < 1 || setup.players.length > 4) {
    throw new Error("A match supports one through four players.");
  }
  const unique_ids = new Set(setup.players.map((player) => player.player_id));
  if (unique_ids.size !== setup.players.length)
    throw new Error("Every player uses a unique PlayerId.");
  const first_player = setup.players[0];
  if (first_player === undefined) throw new Error("A match needs its first player.");
  const bowls_per_frame = setup.bowls_per_frame ?? default_bowls_per_frame;
  if (!is_valid_bowls_per_frame(bowls_per_frame)) {
    throw new Error("Bowls per frame must be an integer from one through five.");
  }
  return {
    active_player_id: first_player.player_id,
    aim: default_aim(get_rack_pin_count(setup.pin_count)),
    bowls_per_frame,
    current_frame_index: 0,
    current_roll_index: 0,
    phase: "setup",
    pin_count: get_rack_pin_count(setup.pin_count),
    players: [...setup.players],
    score_cards: initial_score_cards(setup.players),
    standing_pin_count: get_rack_pin_count(setup.pin_count),
  };
}

export function reduce_match(state: MatchState, action: MatchAction): MatchTransition {
  switch (action.type) {
    case "start":
      return state.phase === "setup" ? effects_for_new_rack(state) : { state, effects: [] };
    case "rack_ready":
      return state.phase === "rack_resetting"
        ? { state: { ...state, phase: "aiming" }, effects: [] }
        : { state, effects: [] };
    case "continue_turn":
      return state.phase === "handoff" ? effects_for_new_rack(state) : { state, effects: [] };
    case "set_aim":
      return state.phase === "aiming"
        ? {
            state: {
              ...state,
              aim: normalize_aim(state.pin_count, action.aim),
            },
            effects: [],
          }
        : { state, effects: [] };
    case "launch":
      return state.phase === "aiming"
        ? {
            state: {
              ...state,
              phase: "rolling",
              standing_pin_count_at_launch: state.standing_pin_count,
            },
            effects: [
              {
                type: "launch",
                power: state.aim.power,
                start_position: state.aim.start_position,
                angle: state.aim.angle,
                spin: state.aim.spin,
              },
            ],
          }
        : { state, effects: [] };
    case "settled": {
      if (state.phase !== "rolling") return { state, effects: [] };
      const at_launch = state.standing_pin_count_at_launch;
      const settled = action.settled_roll;
      const counts_match =
        settled.standing_pin_count + settled.fallen_pin_count === state.pin_count;
      const within_rack =
        settled.standing_pin_count >= 0 && settled.standing_pin_count <= (at_launch ?? -1);
      if (
        settled.pin_count !== state.pin_count ||
        !counts_match ||
        !within_rack ||
        at_launch === undefined
      ) {
        return {
          state: {
            ...state,
            phase: "fatal",
            fatal_message: "Worker settlement violated rack conservation.",
          },
          effects: [],
        };
      }
      const knocked_pin_count = at_launch - settled.standing_pin_count;
      let next_rolls: PlayerScoreCard["frames"];
      try {
        next_rolls = append_roll(
          player_score_card(state).frames,
          state.pin_count,
          knocked_pin_count,
          state.bowls_per_frame,
        );
      } catch (error) {
        return {
          state: {
            ...state,
            phase: "fatal",
            fatal_message: error instanceof Error ? error.message : "The roll was invalid.",
          },
          effects: [],
        };
      }
      const scored_state = update_active_score_card(
        {
          ...state,
          phase: "result",
          result_message: result_message(
            knocked_pin_count,
            state.pin_count,
            state.bowls_per_frame,
            next_rolls,
          ),
          standing_pin_count: settled.standing_pin_count,
          standing_pin_count_at_launch: undefined,
        },
        next_rolls,
      );
      return { state: scored_state, effects: [] };
    }
    case "advance_after_result": {
      if (state.phase !== "result") return { state, effects: [] };
      const transition = transition_after_roll({ ...state, result_message: undefined });
      const continues_on_same_rack =
        transition.state.phase === "sweeping" &&
        !transition.effects.some((effect) => effect.type === "reset_rack");
      return continues_on_same_rack
        ? { ...transition, effects: [{ type: "prepare_next_roll" }] }
        : transition;
    }
    case "sweep_complete":
      return state.phase === "sweeping"
        ? { state: { ...state, phase: "aiming" }, effects: [] }
        : { state, effects: [] };
    case "fatal":
      return { state: { ...state, phase: "fatal", fatal_message: action.message }, effects: [] };
  }
}
