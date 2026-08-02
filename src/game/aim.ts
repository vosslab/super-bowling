import { ball_radius, board_width, foul_to_head_pin, lane_width } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";

export type AimValues = {
  power: number;
  start_position: number;
  angle: number;
  spin: number;
};

export type AimLimits = {
  minimum_power: number;
  maximum_power: number;
  minimum_start_position: number;
  maximum_start_position: number;
  minimum_angle: number;
  maximum_angle: number;
  minimum_spin: number;
  maximum_spin: number;
};

export const minimum_power = 8;
export const maximum_power = 24;
export const minimum_spin = -1;
export const maximum_spin = 1;

/**
 * Regulation controls remain deliberately modest. The 1,000-mode rack is a
 * fantasy endurance challenge, so it exposes its own clearly bounded
 * superhuman envelope rather than silently changing ten-pin bowling.
 */
export const superhuman_990_maximum_power = 60;
export const superhuman_990_minimum_spin = -4;
export const superhuman_990_maximum_spin = 4;

export function aim_limits(pin_count: RackPinCount): AimLimits {
  const half_width = lane_width(pin_count) / 2;
  const maximum_angle = Math.atan((half_width * 0.35) / foul_to_head_pin);
  const is_superhuman_rack = pin_count === 990;
  return {
    minimum_power,
    maximum_power: is_superhuman_rack ? superhuman_990_maximum_power : maximum_power,
    minimum_start_position: -half_width + ball_radius,
    maximum_start_position: half_width - ball_radius,
    minimum_angle: -maximum_angle,
    maximum_angle,
    minimum_spin: is_superhuman_rack ? superhuman_990_minimum_spin : minimum_spin,
    maximum_spin: is_superhuman_rack ? superhuman_990_maximum_spin : maximum_spin,
  };
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalize_aim(pin_count: RackPinCount, aim: AimValues): AimValues {
  const limits = aim_limits(pin_count);
  return {
    power: clamp(aim.power, limits.minimum_power, limits.maximum_power),
    start_position: clamp(
      aim.start_position,
      limits.minimum_start_position,
      limits.maximum_start_position,
    ),
    angle: clamp(aim.angle, limits.minimum_angle, limits.maximum_angle),
    spin: clamp(aim.spin, limits.minimum_spin, limits.maximum_spin),
  };
}

export function start_position_in_boards(pin_count: RackPinCount, start_position: number): number {
  return start_position / board_width(pin_count);
}

export function start_position_from_boards(pin_count: RackPinCount, boards: number): number {
  return boards * board_width(pin_count);
}

export function board_position_limits(pin_count: RackPinCount): {
  minimum: number;
  maximum: number;
} {
  const limits = aim_limits(pin_count);
  return {
    minimum: Math.ceil((limits.minimum_start_position / board_width(pin_count)) * 10) / 10,
    maximum: Math.floor((limits.maximum_start_position / board_width(pin_count)) * 10) / 10,
  };
}

export function angle_in_degrees(angle: number): number {
  return (angle * 180) / Math.PI;
}

/**
 * Keep keyboard and pointer adjustments perceptible in board units at every
 * rack width. A board at the head-pin plane is the player-facing unit.
 */
export function aim_control_steps(pin_count: RackPinCount): {
  angle_degrees: number;
  spin: number;
} {
  const one_board_angle = Math.atan(board_width(pin_count) / foul_to_head_pin);
  return {
    angle_degrees: angle_in_degrees(one_board_angle),
    // The shared hook model moves about 3.2 ft at full spin; scale the
    // increment to one board and keep the smallest lanes usable by keyboard.
    spin: clamp(board_width(pin_count) / 3.2, 0.025, 0.35),
  };
}

export function default_aim(pin_count: RackPinCount): AimValues {
  return normalize_aim(pin_count, { power: 16, start_position: 0, angle: 0, spin: 0 });
}
