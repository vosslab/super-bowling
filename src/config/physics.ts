import { deck_depth, pin_radius } from "./lane";
import type { PinCount, RackPinCount } from "./pin_counts";

export const physics_config = {
  fixed_step_seconds: 1 / 120,
  max_steps_per_tick: 8,
  ball_radius: 0.3542,
  ball_mass: 35,
  // The minimum launch crosses the fixed 60-ft lane in the simulated world.
  // This remains a tuning value; the reach tests assert the resulting behavior.
  ball_linear_damping: 0.02,
  ball_spin_decay: 0.15,
  pin_radius,
  pin_mass: 1,
  // Fallen capsules carry their regulation-length contact footprint. This keeps
  // a low-power legal roll from keeping the whole deck awake until timeout.
  pin_linear_damping: 2.2,
  // Upright pins retain their free response. Once a pin becomes a horizontal
  // capsule, this damping dissipates implausible repeated end-over-end spin.
  fallen_pin_angular_damping: 3,
  pin_friction: 0.56,
  lane_friction: 0.16,
  restitution: 0.08,
  fall_distance: 0.46,
  fall_impulse: 2.8,
  propagation_speed: 0.34,
  settle_speed: 0.035,
  settle_quiet_seconds: 0.75,
  settle_max_seconds: 12,
} as const;

/**
 * A deep rack can legitimately take longer to finish its cascade. The constant
 * term keeps a ten-pin roll responsive while deck depth supplies the scale.
 */
export function get_settle_max_seconds(pin_count: RackPinCount): number {
  return physics_config.settle_max_seconds + deck_depth(pin_count) * 0.35;
}

const mode_tuning: Record<PinCount, { snapshot_hz: number; activation_radius: number }> = {
  10: { snapshot_hz: 60, activation_radius: 1.9 },
  20: { snapshot_hz: 60, activation_radius: 1.9 },
  50: { snapshot_hz: 60, activation_radius: 1.9 },
  100: { snapshot_hz: 60, activation_radius: 1.9 },
  500: { snapshot_hz: 30, activation_radius: 2.35 },
  1000: { snapshot_hz: 30, activation_radius: 2.55 },
};

export function get_mode_tuning(pin_count: PinCount): {
  snapshot_hz: number;
  activation_radius: number;
} {
  return mode_tuning[pin_count];
}
