import type { RackPinCount } from "../config/pin_counts";
import type { MatchRecordValues } from "../save/contracts";
import { default_bowls_per_frame } from "./bowls_per_frame";
import type { FrameScore, PlayerMatchSummary } from "./contracts";
import { score_card, total_score } from "./scoring";

export type { MatchRecordValues } from "../save/contracts";

/** Statistics derived from one player's score card, with no match-state dependency. */
export type MatchStatistics = {
  total_score: number | undefined;
  best_frame_score: number | undefined;
  longest_strike_streak: number;
};

type StrikeStreaks = {
  current: number;
  longest: number;
};

/**
 * Score-card progress that is safe to compare while a game is still in play.
 * Only finalized frame scores contribute: unresolved strike/spare frames do not
 * supply either a cumulative total or a single-frame contribution.
 */
export type FinalizedFrameScoreProgress = {
  last_finalized_score: number | undefined;
  best_frame_score: number | undefined;
};

function strike_streaks(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  _bowls_per_frame: number,
): StrikeStreaks {
  let current = 0;
  let longest = 0;

  for (const frame of frames) {
    let pins_on_current_rack = 0;
    for (const roll of frame.rolls) {
      const starts_with_full_rack = pins_on_current_rack === 0;
      const is_strike_bowl = starts_with_full_rack && roll === pin_count;
      current = is_strike_bowl ? current + 1 : 0;
      longest = Math.max(longest, current);

      pins_on_current_rack += roll;
      if (pins_on_current_rack === pin_count) pins_on_current_rack = 0;
    }
  }

  return { current, longest };
}

/** Derives the latest finalized total and best finalized frame from one score card. */
export function finalized_frame_score_progress(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame: number,
): FinalizedFrameScoreProgress {
  const scored_frames = score_card(frames, pin_count, bowls_per_frame);
  let previous_cumulative_score = 0;
  let best_score: number | undefined;
  let last_finalized_score: number | undefined;

  for (const frame of scored_frames) {
    if (frame.score === undefined) continue;
    const contribution = frame.score - previous_cumulative_score;
    previous_cumulative_score = frame.score;
    last_finalized_score = frame.score;
    best_score = best_score === undefined ? contribution : Math.max(best_score, contribution);
  }

  return { last_finalized_score, best_frame_score: best_score };
}

export function current_strike_streak(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): number {
  return strike_streaks(frames, pin_count, bowls_per_frame).current;
}

export function match_statistics(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): MatchStatistics {
  const finalized_progress = finalized_frame_score_progress(frames, pin_count, bowls_per_frame);
  return {
    total_score: total_score(frames, pin_count, bowls_per_frame),
    best_frame_score: finalized_progress.best_frame_score,
    longest_strike_streak: strike_streaks(frames, pin_count, bowls_per_frame).longest,
  };
}

/** Folds each completed player's best values into the device-wide match record. */
export function fold_match_summaries(summaries: readonly PlayerMatchSummary[]): MatchRecordValues {
  const first_summary = summaries[0];
  if (first_summary === undefined) {
    throw new Error("A completed match must include at least one player summary.");
  }

  let top_score = first_summary.total_score;
  let best_frame_score = first_summary.best_frame_score;
  let longest_strike_streak = first_summary.longest_strike_streak;
  for (const summary of summaries.slice(1)) {
    top_score = Math.max(top_score, summary.total_score);
    best_frame_score = Math.max(best_frame_score, summary.best_frame_score);
    longest_strike_streak = Math.max(longest_strike_streak, summary.longest_strike_streak);
  }

  return { top_score, best_frame_score, longest_strike_streak };
}
