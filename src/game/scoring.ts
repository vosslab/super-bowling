import type { RackPinCount } from "../config/pin_counts";
import { default_bowls_per_frame, is_valid_bowls_per_frame } from "./bowls_per_frame";
import type { FrameScore } from "./contracts";

export type ScoreCard = readonly FrameScore[];

export type RollValidation = {
  valid: boolean;
  message?: string;
};

export { default_bowls_per_frame, is_valid_bowls_per_frame } from "./bowls_per_frame";

function uses_classic_scoring(bowls_per_frame: number): boolean {
  return bowls_per_frame === default_bowls_per_frame;
}

function validation_error(message: string): RollValidation {
  return { valid: false, message };
}

function is_non_negative_integer(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function frame_total(frame: FrameScore): number {
  return frame.rolls.reduce((total, roll) => total + roll, 0);
}

function validate_super_tenth_frame_rolls(
  rolls: readonly number[],
  pin_count: RackPinCount,
  bowls_per_frame: number,
): RollValidation {
  if (rolls.length > bowls_per_frame + 1 || rolls.some((roll) => roll > pin_count)) {
    return validation_error("The super-frame tenth has only its earned fresh-rack bowl.");
  }
  let rack_total = 0;
  for (const roll of rolls) {
    rack_total += roll;
    if (rack_total > pin_count)
      return validation_error("A super-frame rack cannot exceed its pins.");
    if (rack_total === pin_count) rack_total = 0;
  }
  return { valid: true };
}

function validate_tenth_frame_rolls(
  rolls: readonly number[],
  pin_count: RackPinCount,
): RollValidation {
  if (rolls.some((roll) => roll > pin_count)) {
    return validation_error("Tenth-frame rolls use the selected rack size.");
  }
  const first = rolls[0];
  if (first === undefined) return validation_error("The tenth frame needs its first roll.");
  const second = rolls[1];
  const third = rolls[2];

  if (first < pin_count) {
    if (second !== undefined && first + second > pin_count) {
      return validation_error("The tenth-frame opening rack cannot exceed its pin count.");
    }
    if (third !== undefined && first + (second ?? 0) !== pin_count) {
      return validation_error("A tenth-frame bonus follows a spare.");
    }
    return { valid: true };
  }

  if (third === undefined || second === undefined || second === pin_count) {
    return { valid: true };
  }
  if (third > pin_count - second) {
    return validation_error("The final strike bonus uses pins remaining on its rack.");
  }
  return { valid: true };
}

export function create_empty_score_card(): ScoreCard {
  return [];
}

export function is_strike(
  frame: FrameScore,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): boolean {
  return (
    uses_classic_scoring(bowls_per_frame) &&
    frame.rolls.length === 1 &&
    frame.rolls[0] === pin_count
  );
}

export function is_spare(
  frame: FrameScore,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): boolean {
  return (
    uses_classic_scoring(bowls_per_frame) &&
    frame.rolls.length === 2 &&
    frame_total(frame) === pin_count
  );
}

export function validate_score_card(
  score_card: ScoreCard,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): RollValidation {
  if (!is_valid_bowls_per_frame(bowls_per_frame)) {
    return validation_error("Bowls per frame must be an integer from one through five.");
  }
  if (score_card.length > 10) return validation_error("A score card has at most ten frames.");
  for (const [frame_index, frame] of score_card.entries()) {
    if (frame.frame_index !== frame_index) {
      return validation_error("Frame indexes must be contiguous.");
    }
    const maximum_rolls = uses_classic_scoring(bowls_per_frame)
      ? 3
      : frame_index === 9
        ? bowls_per_frame + 1
        : bowls_per_frame;
    if (frame.rolls.length === 0 || frame.rolls.length > maximum_rolls) {
      return validation_error("Every recorded frame has a legal number of rolls.");
    }
    if (!frame.rolls.every(is_non_negative_integer)) {
      return validation_error("Rolls are non-negative integers.");
    }
    if (
      frame_index < score_card.length - 1 &&
      !is_frame_complete(frame, pin_count, bowls_per_frame)
    ) {
      return validation_error("Only the current frame can be incomplete.");
    }
    if (!uses_classic_scoring(bowls_per_frame)) {
      if (frame_index === 9) {
        const tenth_validation = validate_super_tenth_frame_rolls(
          frame.rolls,
          pin_count,
          bowls_per_frame,
        );
        if (!tenth_validation.valid) return tenth_validation;
      } else if (frame.rolls.some((roll) => roll > pin_count) || frame_total(frame) > pin_count) {
        return validation_error("A super frame cannot exceed its rack.");
      }
      continue;
    }
    if (frame_index < 9) {
      if (frame.rolls.length > 2 || frame.rolls.some((roll) => roll > pin_count)) {
        return validation_error("Frames one through nine use legal rack-sized rolls.");
      }
      if (frame.rolls.length === 2 && frame_total(frame) > pin_count) {
        return validation_error("A two-roll frame cannot exceed its rack.");
      }
      if (frame.rolls.length === 2 && frame.rolls[0] === pin_count) {
        return validation_error("A strike ends a frame before a second roll.");
      }
      continue;
    }
    const tenth_validation = validate_tenth_frame_rolls(frame.rolls, pin_count);
    if (!tenth_validation.valid) return tenth_validation;
  }
  return { valid: true };
}

export function append_roll(
  score_card: ScoreCard,
  pin_count: RackPinCount,
  knocked_pin_count: number,
  bowls_per_frame = default_bowls_per_frame,
): ScoreCard {
  if (!is_non_negative_integer(knocked_pin_count) || knocked_pin_count > pin_count) {
    throw new Error("A roll must knock an integer number of pins within the selected rack.");
  }
  const validation = validate_score_card(score_card, pin_count, bowls_per_frame);
  if (!validation.valid) throw new Error(validation.message);
  const current_frame = score_card[score_card.length - 1];
  const current_frame_index = current_frame?.frame_index ?? 0;
  const current_rolls = current_frame?.rolls ?? [];
  const is_tenth_frame = current_frame_index === 9;
  const classic_scoring = uses_classic_scoring(bowls_per_frame);
  const starts_new_frame =
    current_frame === undefined ||
    (classic_scoring &&
      ((!is_tenth_frame &&
        (is_strike(current_frame, pin_count) || current_frame.rolls.length === 2)) ||
        (is_tenth_frame && is_frame_complete(current_frame, pin_count, bowls_per_frame)))) ||
    (!classic_scoring && is_frame_complete(current_frame, pin_count, bowls_per_frame));
  const next_frame_index = starts_new_frame ? score_card.length : current_frame_index;
  if (next_frame_index >= 10) throw new Error("The score card is complete.");
  const next_rolls = starts_new_frame ? [knocked_pin_count] : [...current_rolls, knocked_pin_count];
  const next_frame: FrameScore = { frame_index: next_frame_index, rolls: next_rolls };
  const candidate = starts_new_frame
    ? [...score_card, next_frame]
    : [...score_card.slice(0, -1), next_frame];
  const next_validation = validate_score_card(candidate, pin_count, bowls_per_frame);
  if (!next_validation.valid) throw new Error(next_validation.message);
  return candidate;
}

export function is_frame_complete(
  frame: FrameScore,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): boolean {
  if (!uses_classic_scoring(bowls_per_frame)) {
    if (frame.frame_index < 9) {
      return frame_total(frame) === pin_count || frame.rolls.length === bowls_per_frame;
    }
    return frame.rolls.length === bowls_per_frame + 1;
  }
  if (frame.frame_index < 9) return is_strike(frame, pin_count) || frame.rolls.length === 2;
  const first = frame.rolls[0];
  if (first === undefined) return false;
  if (first === pin_count) return frame.rolls.length === 3;
  const second = frame.rolls[1];
  if (second === undefined) return false;
  return first + second === pin_count ? frame.rolls.length === 3 : true;
}

function completed_rolls(score_card: ScoreCard, pin_count: RackPinCount): number[] {
  const rolls: number[] = [];
  for (const frame of score_card) {
    rolls.push(...frame.rolls);
    if (frame.frame_index === 9 && !is_frame_complete(frame, pin_count)) break;
  }
  return rolls;
}

function score_frame(
  score_card: ScoreCard,
  pin_count: RackPinCount,
  frame_index: number,
  bowls_per_frame: number,
): number | undefined {
  const frame = score_card[frame_index];
  if (frame === undefined || !is_frame_complete(frame, pin_count, bowls_per_frame))
    return undefined;
  if (!uses_classic_scoring(bowls_per_frame)) return frame_total(frame);
  if (frame_index === 9) return frame_total(frame);
  const rolls = completed_rolls(score_card, pin_count);
  const roll_offset = score_card
    .slice(0, frame_index)
    .reduce((total, item) => total + item.rolls.length, 0);
  if (is_strike(frame, pin_count)) {
    const first_bonus = rolls[roll_offset + 1];
    const second_bonus = rolls[roll_offset + 2];
    return first_bonus === undefined || second_bonus === undefined
      ? undefined
      : pin_count + first_bonus + second_bonus;
  }
  if (is_spare(frame, pin_count)) {
    const bonus = rolls[roll_offset + 2];
    return bonus === undefined ? undefined : pin_count + bonus;
  }
  return frame_total(frame);
}

export function score_card(
  score_card: ScoreCard,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): ScoreCard {
  const validation = validate_score_card(score_card, pin_count, bowls_per_frame);
  if (!validation.valid) throw new Error(validation.message);
  let cumulative_score = 0;
  return score_card.map((frame, frame_index) => {
    const frame_score = score_frame(score_card, pin_count, frame_index, bowls_per_frame);
    if (frame_score === undefined)
      return { frame_index: frame.frame_index, rolls: [...frame.rolls] };
    cumulative_score += frame_score;
    return { frame_index: frame.frame_index, rolls: [...frame.rolls], score: cumulative_score };
  });
}

export function total_score(
  card: ScoreCard,
  pin_count: RackPinCount,
  bowls_per_frame = default_bowls_per_frame,
): number | undefined {
  const scored_card = score_card(card, pin_count, bowls_per_frame);
  const tenth_frame = scored_card[9];
  if (
    scored_card.length !== 10 ||
    tenth_frame === undefined ||
    !is_frame_complete(tenth_frame, pin_count, bowls_per_frame)
  ) {
    return undefined;
  }
  return scored_card[9]?.score;
}
