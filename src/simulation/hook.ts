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
