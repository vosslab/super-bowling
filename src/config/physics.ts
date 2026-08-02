import { deck_depth, pin_radius } from "./lane";
import type { PinCount, RackPinCount } from "./pin_counts";

export const physics_config = {
  fixed_step_seconds: 1 / 120,
  max_steps_per_tick: 8,
  ball_radius: 0.3542,
  // USBC permits balls through 16 lb; this simulation uses pounds as its mass unit.
  ball_mass_lb: 16,
  // The minimum launch crosses the fixed 60-ft lane in the simulated world.
  // This remains a tuning value; the reach tests assert the resulting behavior.
  ball_linear_damping: 0.02,
  ball_spin_decay: 0.15,
  pin_radius,
  // USBC's target pin mass is 3 lb 8 oz, in the same pound unit as the ball.
  pin_mass_lb: 3.5,
  // Fallen capsules carry their regulation-length contact footprint. This keeps
  // a low-power legal roll from keeping the whole deck awake until timeout.
  pin_linear_damping: 2.2,
  // Upright pins retain their free response. Once a pin becomes a horizontal
  // capsule, this damping dissipates implausible repeated end-over-end spin.
  fallen_pin_angular_damping: 3,
  pin_friction: 0.56,
  lane_friction: 0.16,
  // Every dynamic collider uses Rapier's Max combine rule. Because both sides
  // carry this value, ball/pin, pin/pin, and pin/capsule contacts all resolve
  // to this exact coefficient (max(0.08, 0.08) = 0.08).
  restitution: 0.08,
  fall_distance: 0.46,
  // A pin falls when a contact changes that pin's velocity by this amount.
  // Unlike a raw impulse, this has the same meaning after a collider mass change.
  fall_velocity_change_ft_per_second: 6.4,
  propagation_speed: 0.34,
  settle_speed: 0.035,
  settle_quiet_seconds: 0.75,
  settle_max_seconds: 12,
} as const;

/**
 * Convert the pin-response rule into Rapier's per-pair force-event filter.
 * Dynamic colliders all use this pin-derived value so an event is never
 * filtered according to the rack-aware ball mass.
 */
export function get_pin_contact_force_event_threshold(
  pin_mass_lb = physics_config.pin_mass_lb,
): number {
  return (
    (physics_config.fall_velocity_change_ft_per_second * pin_mass_lb) /
    physics_config.fixed_step_seconds
  );
}

/** Convert Rapier's summed contact force for one fixed step into a pin delta-v. */
export function get_pin_velocity_change_from_contact_force(
  contact_force: number,
  pin_mass_lb: number,
): number {
  return (contact_force * physics_config.fixed_step_seconds) / pin_mass_lb;
}

/** Super Bowling's fantasy racks need mass scaling while 10- and 21-pin stay regulation. */
export const rack_ball_mass_lb: Readonly<Record<RackPinCount, number>> = {
  10: 16,
  21: 16,
  45: 40,
  105: 80,
  496: 320,
  // This is intentionally non-regulation equipment for the 1,000-mode
  // fantasy rack, but it is a real collider mass rather than a density label.
  // 40 lb is heavy enough to read as superhuman while remaining measurable.
  990: 40,
};

export function get_ball_mass_lb(pin_count: RackPinCount): number {
  return rack_ball_mass_lb[pin_count];
}

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
