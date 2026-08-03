import type { ModeRecord } from "../save/contracts";
import type { RackPinCount } from "../config/pin_counts";
import type { FrameScore } from "../game/contracts";
import { strike_run_term } from "../game/bowling_terms";
import { current_strike_streak } from "../game/match_stats";
import { score_card } from "../game/scoring";

/** The derived values before or after one scoring transition. */
export type EarnedMomentState = {
  last_finalized_score: number | undefined;
  current_strike_run: number;
};

export type EarnedMomentInput = {
  previous_record: ModeRecord | undefined;
  previous_state: EarnedMomentState;
  current_state: EarnedMomentState;
  high_game_already_fired: boolean;
};

export type EarnedMoment =
  { kind: "high_game"; score: number } | { kind: "strike_run"; term: string };

/** Derives the live values that earned-moment comparisons need from one score card. */
export function earned_moment_state(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame: number,
): EarnedMomentState {
  const scored_frames = score_card(frames, pin_count, bowls_per_frame);
  const finalized_scores = scored_frames.flatMap((frame) =>
    frame.score === undefined ? [] : [frame.score],
  );
  const last_finalized_score = finalized_scores[finalized_scores.length - 1];
  const current_strike_run = current_strike_streak(frames, pin_count, bowls_per_frame);

  return { last_finalized_score, current_strike_run };
}

function crossed_high_game(input: EarnedMomentInput): boolean {
  const previous_record = input.previous_record;
  const previous_score = input.previous_state.last_finalized_score;
  const current_score = input.current_state.last_finalized_score;

  return (
    previous_record !== undefined &&
    !input.high_game_already_fired &&
    current_score !== undefined &&
    current_score > previous_record.best_score &&
    (previous_score === undefined || previous_score <= previous_record.best_score)
  );
}

/**
 * Chooses the single in-play moment newly earned by this scoring transition.
 * The caller owns the once-per-match high-game flag and computes finalized scores.
 */
export function earned_moment(input: EarnedMomentInput): EarnedMoment | undefined {
  const previous_run = input.previous_state.current_strike_run;
  const current_run = input.current_state.current_strike_run;
  const term =
    current_run > previous_run && current_run >= 3 ? strike_run_term(current_run) : undefined;
  if (term !== undefined) return { kind: "strike_run", term };

  if (crossed_high_game(input)) {
    const score = input.current_state.last_finalized_score;
    if (score !== undefined) return { kind: "high_game", score };
  }

  return undefined;
}
