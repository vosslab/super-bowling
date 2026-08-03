import type { RackPinCount } from "../config/pin_counts";
import type { FrameScore } from "./contracts";
import { total_score } from "./scoring";

// USBC documents doubles, turkeys, and a 300 as 12 successive strikes:
// https://images.bowl.com/bowl/media/legacy/internap/bowl/highschool/pdfs/HighSchool_GuideFORWEB.pdf
// Its competition reports also use four-, five-, and six-bagger terminology:
// https://bowl.com/news/u18-u15-and-u12-champs-crowned-at-2023-junior-gold-championships

/** The score-strip vocabulary shared by every practice-record surface. */
export const scoreboard_labels = {
  high_game: "HIGH GAME",
  last_5_games: "LAST 5 GAMES",
  best_frame: "BEST FRAME",
  best_run: "BEST RUN",
  games_bowled: "GAMES BOWLED",
} as const;

/** Names a consecutive-strike run without inferring a game format. */
export function strike_run_term(consecutive_strikes: number): string | undefined {
  if (
    !Number.isInteger(consecutive_strikes) ||
    consecutive_strikes < 2 ||
    consecutive_strikes > 12
  ) {
    return undefined;
  }

  switch (consecutive_strikes) {
    case 2:
      return "Double";
    case 3:
      return "Turkey";
    case 4:
      return "Four-bagger";
    case 5:
      return "Five-bagger";
    case 6:
      return "Six-pack";
    default:
      return `${consecutive_strikes}-bagger`;
  }
}

/** Identifies only the standard ten-pin classic game's 12-strike, 300 achievement. */
export function is_perfect_game(
  frames: readonly FrameScore[],
  pin_count: RackPinCount,
  bowls_per_frame: number,
): boolean {
  if (pin_count !== 10 || bowls_per_frame !== 2 || frames.length !== 10) return false;

  const has_nine_strike_frames = frames.slice(0, 9).every((frame, frame_index) => {
    return (
      frame.frame_index === frame_index && frame.rolls.length === 1 && frame.rolls[0] === pin_count
    );
  });
  const tenth_frame = frames[9];
  const has_three_tenth_frame_strikes =
    tenth_frame !== undefined &&
    tenth_frame.frame_index === 9 &&
    tenth_frame.rolls.length === 3 &&
    tenth_frame.rolls.every((roll) => roll === pin_count);
  if (!has_nine_strike_frames || !has_three_tenth_frame_strikes) return false;

  return total_score(frames, pin_count, bowls_per_frame) === 300;
}
