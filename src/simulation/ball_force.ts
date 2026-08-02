import type RAPIER from "@dimforge/rapier2d-compat";

import {
  ball_radius,
  deck_depth,
  foul_to_head_pin,
  lane_width,
  pin_radius,
  pit_back_y,
} from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { hook_lateral_acceleration, hook_tuning_for_rack } from "./hook";

export type BallForceState = {
  spin: number;
  in_gutter: boolean;
  in_pit: boolean;
  has_hit_pin: boolean;
  deck_assist_acceleration: number;
  // Rapier's force input is in the lane's world units.  Keep the derived lbf
  // value alongside it so diagnostics can show the physical conversion.
  deck_assist_force_lbf?: number;
  deck_assist_force_world?: number;
  deck_assist_geometry_scale?: number;
  deck_assist_geometry_factor?: number;
  deck_assist_force: number;
  deck_assist_fade: number;
  deck_assist_active: boolean;
  forward_progress_speed: number;
  last_y: number;
  launch_direction: { x: number; y: number };
};

export type BallForceOptions = {
  pin_count: RackPinCount;
  timestep_seconds: number;
  damping: number;
  spin_decay: number;
  deck_assist_enabled?: boolean;
  capture_ball?(body: RAPIER.RigidBody): void;
};

export type DeckAssistTuning = {
  minimum_progress_speed: number;
  response_seconds: number;
  maximum_acceleration: number;
};

// The lane coordinates are expressed in feet.  Derive (rather than assume)
// that scale from the authoritative 60 ft foul-line-to-head-pin mapping so a
// future world-coordinate rescale remains visible in the force diagnostics.
const regulation_foul_to_head_pin_feet = 60;
const regulation_ten_pin_lane_width_feet = 41.5 / 12;
const gravitational_acceleration_ft_per_second_squared = 32.174;

export type DeckAssistForceUnits = {
  world_units_per_foot: number;
  geometry_factor: number;
};

export function get_deck_assist_force_units(pin_count: RackPinCount): DeckAssistForceUnits {
  return {
    world_units_per_foot: foul_to_head_pin / regulation_foul_to_head_pin_feet,
    geometry_factor: lane_width(pin_count) / regulation_ten_pin_lane_width_feet,
  };
}

/**
 * The 990 drive preserves the existing F_world = m * a response. It reports a
 * derived lbf value using F_world = F_lbf * 32.174 * S * geometry_factor * fade,
 * where S is the authoritative feet-to-world scale. While the ball is in the pin field,
 * its target forward speed is 24 + 0.30 * deck_depth ft/s and its maximum
 * acceleration is 24 + deck_depth ft/s^2. The last quarter-deck linearly fades
 * that acceleration to zero at the backstop, so the drive cannot push into pit.
 */
export const superhuman_990_deck_assist: DeckAssistTuning = {
  minimum_progress_speed: 24,
  response_seconds: 0.16,
  maximum_acceleration: 24,
};

// Measured recovery guard for regulation-scale racks. It uses the same real
// contact and pin-field bounds as the 990 drive but only restores walking pace.
export const standard_deck_stall_guard: DeckAssistTuning = {
  minimum_progress_speed: 1,
  response_seconds: 0.12,
  maximum_acceleration: 20,
};

export function deck_assist_tuning_for_rack(pin_count: RackPinCount): DeckAssistTuning | undefined {
  return pin_count === 990 ? superhuman_990_deck_assist : standard_deck_stall_guard;
}

export function get_deck_assist_geometry(pin_count: RackPinCount): {
  pin_field_start_y: number;
  pin_field_backstop_y: number;
  fade_start_y: number;
  target_progress_speed: number;
  maximum_acceleration: number;
} {
  const depth = deck_depth(pin_count);
  const pin_field_start_y = foul_to_head_pin - (ball_radius + pin_radius);
  const pin_field_backstop_y = foul_to_head_pin + depth;
  const fade_start_y = pin_field_backstop_y - depth / 4;
  return {
    pin_field_start_y,
    pin_field_backstop_y,
    fade_start_y,
    target_progress_speed:
      pin_count === 990
        ? superhuman_990_deck_assist.minimum_progress_speed + depth * 0.3
        : standard_deck_stall_guard.minimum_progress_speed,
    maximum_acceleration:
      pin_count === 990
        ? superhuman_990_deck_assist.maximum_acceleration + depth
        : standard_deck_stall_guard.maximum_acceleration,
  };
}

export function apply_ball_force(
  body: RAPIER.RigidBody,
  state: BallForceState,
  options: BallForceOptions,
): BallForceState {
  if (state.in_pit) return state;
  const position = body.translation();
  // A contact solver may retain a large nominal velocity while a heavy ball is
  // visibly wedged against the rack. Drive uses actual fixed-step progress.
  const forward_progress_speed = Math.max(
    0,
    (position.y - state.last_y) / options.timestep_seconds,
  );
  const entered_gutter =
    state.in_gutter || Math.abs(position.x) > lane_width(options.pin_count) / 2;
  const velocity = body.linvel();
  const speed = Math.hypot(velocity.x, velocity.y);
  const hook = entered_gutter
    ? 0
    : hook_lateral_acceleration(state.spin, speed, hook_tuning_for_rack(options.pin_count));
  const damping_factor = Math.max(0, 1 - options.damping * options.timestep_seconds);
  body.setLinvel(
    {
      x: (velocity.x + hook * options.timestep_seconds) * damping_factor,
      y: velocity.y * damping_factor,
    },
    true,
  );
  // This drive never acts before a real ball-pin contact, outside the physical
  // pin field, in a gutter/pit, or in a pins-free preview. Its force follows
  // the launch vector so it cannot turn a forward roll or add sideways-only
  // correction; only the 990 profile has superhuman geometry scaling.
  const deck_assist_tuning = deck_assist_tuning_for_rack(options.pin_count);
  const geometry = get_deck_assist_geometry(options.pin_count);
  const in_pin_field =
    position.y >= geometry.pin_field_start_y && position.y < geometry.pin_field_backstop_y;
  const deck_assist_fade = in_pin_field
    ? Math.min(
        1,
        Math.max(
          0,
          (geometry.pin_field_backstop_y - position.y) /
            (geometry.pin_field_backstop_y - geometry.fade_start_y),
        ),
      )
    : 0;
  const selected_acceleration =
    options.deck_assist_enabled !== false &&
    deck_assist_tuning !== undefined &&
    state.has_hit_pin &&
    !entered_gutter &&
    in_pin_field
      ? Math.min(
          geometry.maximum_acceleration,
          Math.max(
            0,
            (geometry.target_progress_speed - forward_progress_speed) /
              deck_assist_tuning.response_seconds,
          ),
        )
      : 0;
  // Fade is applied exactly once in the reconstructed world force.  The lbf
  // diagnostic is intentionally derived from the pre-fade response, allowing
  // the conversion to reproduce the long-standing mass * acceleration * fade
  // physics without changing kinematics.
  const deck_assist_acceleration = selected_acceleration * deck_assist_fade;
  const force_units = get_deck_assist_force_units(options.pin_count);
  const deck_assist_force_lbf =
    selected_acceleration > 0
      ? (body.mass() * selected_acceleration) /
        (gravitational_acceleration_ft_per_second_squared *
          force_units.world_units_per_foot *
          force_units.geometry_factor)
      : 0;
  const deck_assist_force_world =
    deck_assist_force_lbf *
    gravitational_acceleration_ft_per_second_squared *
    force_units.world_units_per_foot *
    force_units.geometry_factor *
    deck_assist_fade;
  const deck_assist_force = deck_assist_force_world;
  if (deck_assist_acceleration > 0) {
    body.addForce(
      {
        x: state.launch_direction.x * deck_assist_force,
        y: state.launch_direction.y * deck_assist_force,
      },
      true,
    );
  }
  const next_spin = state.spin * Math.max(0, 1 - options.spin_decay * options.timestep_seconds);
  const reached_pit = position.y >= pit_back_y(options.pin_count) - ball_radius;
  if (reached_pit) {
    options.capture_ball?.(body);
    return {
      ...state,
      spin: next_spin,
      in_gutter: entered_gutter,
      in_pit: true,
      deck_assist_acceleration: 0,
      deck_assist_force_lbf: 0,
      deck_assist_force_world: 0,
      deck_assist_geometry_scale: force_units.world_units_per_foot,
      deck_assist_geometry_factor: force_units.geometry_factor,
      deck_assist_force: 0,
      deck_assist_fade: 0,
      deck_assist_active: false,
      forward_progress_speed,
      last_y: position.y,
    };
  }
  return {
    ...state,
    spin: next_spin,
    in_gutter: entered_gutter,
    in_pit: false,
    deck_assist_acceleration,
    deck_assist_force_lbf,
    deck_assist_force_world,
    deck_assist_geometry_scale: force_units.world_units_per_foot,
    deck_assist_geometry_factor: force_units.geometry_factor,
    deck_assist_force,
    deck_assist_fade,
    deck_assist_active: deck_assist_acceleration > 0,
    forward_progress_speed,
    last_y: position.y,
  };
}
