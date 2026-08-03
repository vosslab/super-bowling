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

/** Places roll marks into the fixed boxes shown by a bowling score card. */
export function format_frame_roll_slots(
  frame_index: number,
  frame: FrameScore | undefined,
  pin_count: RackPinCount,
  bowls_per_frame = 2,
): Array<string | undefined> {
  const slot_count = frame_index === 9 ? bowls_per_frame + 1 : bowls_per_frame;
  const marks =
    frame === undefined ? [] : format_frame_roll_marks(frame, pin_count, bowls_per_frame);
  const classic_strike = bowls_per_frame === 2 && frame_index < 9 && marks[0] === "X";
  const leading_empty_slots = classic_strike ? slot_count - marks.length : 0;

  return Array.from({ length: slot_count }, (_, slot_index) => {
    return marks[slot_index - leading_empty_slots];
  });
}
