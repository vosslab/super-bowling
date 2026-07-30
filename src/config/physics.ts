import type { PinCount } from "./pin_counts";

export const physics_config = {
  fixed_step_seconds: 1 / 120,
  max_steps_per_tick: 8,
  ball_radius: 0.52,
  ball_mass: 6.8,
  ball_linear_damping: 0.45,
  pin_radius: 0.31,
  pin_mass: 1,
  pin_linear_damping: 1.9,
  pin_friction: 0.56,
  lane_friction: 0.16,
  restitution: 0.08,
  fall_distance: 0.46,
  fall_impulse: 2.8,
  propagation_speed: 0.34,
  steering_acceleration: 5.2,
  settle_speed: 0.035,
  settle_quiet_seconds: 0.75,
  settle_max_seconds: 12,
} as const;

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
