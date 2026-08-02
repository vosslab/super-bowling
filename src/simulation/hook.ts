import type { RackPinCount } from "../config/pin_counts";

export type HookTuning = {
  skid_speed: number;
  hook_speed: number;
  roll_speed: number;
  gain: number;
};

export const default_hook_tuning: HookTuning = {
  // Launches span 8 to 24 ft/s and cross the deck before the former 12 ft/s
  // skid threshold. Keep the skid-to-hook transition inside that real range.
  skid_speed: 26,
  hook_speed: 17,
  roll_speed: 2,
  gain: 0.7,
};

/**
 * The 1,000-mode ball can launch at 60 ft/s. Scale the speed phases with that
 * envelope so it starts to bend while it still has useful lane left. The 1x
 * gain candidate did not exceed the old full-spin head-plane displacement;
 * this smallest succeeding 2x candidate does, while zero spin stays exact.
 */
export const superhuman_990_hook_tuning: HookTuning = {
  skid_speed: 65,
  hook_speed: 42,
  roll_speed: 2,
  gain: default_hook_tuning.gain * 2,
};

export function hook_tuning_for_rack(pin_count: RackPinCount): HookTuning {
  return pin_count === 990 ? superhuman_990_hook_tuning : default_hook_tuning;
}

export function hook_lateral_acceleration(
  spin: number,
  speed: number,
  tuning: HookTuning = default_hook_tuning,
): number {
  if (spin === 0 || speed >= tuning.skid_speed || speed <= 0) return 0;
  const hook_span = tuning.skid_speed - tuning.hook_speed;
  const roll_span = tuning.hook_speed - tuning.roll_speed;
  let phase = 0;
  if (speed >= tuning.hook_speed) {
    phase = (tuning.skid_speed - speed) / hook_span;
  } else if (speed > tuning.roll_speed) {
    phase = (speed - tuning.roll_speed) / roll_span;
  }
  const acceleration = spin * tuning.gain * Math.max(0, phase);
  return acceleration;
}
