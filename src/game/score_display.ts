import type { RackPinCount } from "../config/pin_counts";
import { is_spare, is_strike } from "./scoring";
import type { FrameScore } from "./contracts";

/** Formats the classic score-strip marks while retaining the numeric game state. */
export function format_frame_roll_marks(
  frame: FrameScore,
  pin_count: RackPinCount,
  bowls_per_frame = 2,
): string[] {
  if (is_strike(frame, pin_count, bowls_per_frame)) return ["X"];
  return frame.rolls.map((roll, roll_index) => {
    if (roll === pin_count && bowls_per_frame === 2) return "X";
    const first_roll = frame.rolls[0];
    if (
      roll_index === 1 &&
      first_roll !== pin_count &&
      is_spare(frame, pin_count, bowls_per_frame)
    ) {
      return "/";
    }
    if (roll === 0) return "-";
    return String(roll);
  });
}
