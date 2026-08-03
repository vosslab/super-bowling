import type { ModeRecord } from "../save/contracts";
import type { RackPinCount } from "../config/pin_counts";
import type { FrameScore } from "../game/contracts";
import { strike_run_term } from "../game/bowling_terms";
import { current_strike_streak, finalized_frame_score_progress } from "../game/match_stats";

/** The derived values before or after one scoring transition. */
export type EarnedMomentState = {
  last_finalized_score: number | undefined;
  best_frame_score: number | undefined;
  current_strike_run: number;
};

export type EarnedMomentInput = {
  previous_record: ModeRecord | undefined;
  previous_state: EarnedMomentState;
  current_state: EarnedMomentState;
  high_game_already_fired: boolean;
  best_frame_already_fired: boolean;
};

export type EarnedMoment =
  | { kind: "high_game"; score: number }
  | { kind: "best_frame"; score: number }
  | { kind: "strike_run"; term: string };

/** Derives the live values that earned-moment comparisons need from one score card. */
export function earned_moment_state(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame: number,
): EarnedMomentState {
  const { last_finalized_score, best_frame_score } = finalized_frame_score_progress(
    frames,
    pin_count,
    bowls_per_frame,
  );
  const current_strike_run = current_strike_streak(frames, pin_count, bowls_per_frame);

  return { last_finalized_score, best_frame_score, current_strike_run };
}

function earned_high_game(input: EarnedMomentInput): boolean {
  const previous_record = input.previous_record;
  const current_score = input.current_state.last_finalized_score;

  return (
    previous_record !== undefined &&
    !input.high_game_already_fired &&
    current_score !== undefined &&
    current_score > previous_record.best_score
  );
}

function earned_best_frame(input: EarnedMomentInput): boolean {
  const record_score = input.previous_record?.best_frame_score ?? 0;
  const previous_score = input.previous_state.best_frame_score ?? 0;
  const current_score = input.current_state.best_frame_score;
  return (
    !input.best_frame_already_fired &&
    current_score !== undefined &&
    current_score > previous_score &&
    current_score > record_score
  );
}

/**
 * Chooses the single in-play moment newly earned by this scoring transition.
 * The caller owns the once-per-match and once-per-player flags.
 */
export function earned_moment(input: EarnedMomentInput): EarnedMoment | undefined {
  if (earned_high_game(input)) {
    const score = input.current_state.last_finalized_score;
    if (score !== undefined) return { kind: "high_game", score };
  }

  if (earned_best_frame(input)) {
    const score = input.current_state.best_frame_score;
    if (score !== undefined) return { kind: "best_frame", score };
  }

  const previous_run = input.previous_state.current_strike_run;
  const current_run = input.current_state.current_strike_run;
  const term =
    current_run > previous_run && current_run >= 3 ? strike_run_term(current_run) : undefined;
  if (term !== undefined) return { kind: "strike_run", term };

  return undefined;
}
