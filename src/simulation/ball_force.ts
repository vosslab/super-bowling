import type RAPIER from "@dimforge/rapier2d-compat";

import { ball_radius, lane_width, pit_back_y } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { default_hook_tuning, hook_lateral_acceleration } from "./hook";

export type BallForceState = { spin: number; in_gutter: boolean; in_pit: boolean };

export type BallForceOptions = {
  pin_count: RackPinCount;
  timestep_seconds: number;
  damping: number;
  spin_decay: number;
  capture_ball?(body: RAPIER.RigidBody): void;
};

export function apply_ball_force(
  body: RAPIER.RigidBody,
  state: BallForceState,
  options: BallForceOptions,
): BallForceState {
  if (state.in_pit) return state;
  const position = body.translation();
  const entered_gutter =
    state.in_gutter || Math.abs(position.x) > lane_width(options.pin_count) / 2;
  const velocity = body.linvel();
  const speed = Math.hypot(velocity.x, velocity.y);
  const hook = entered_gutter
    ? 0
    : hook_lateral_acceleration(state.spin, speed, default_hook_tuning);
  const damping_factor = Math.max(0, 1 - options.damping * options.timestep_seconds);
  body.setLinvel(
    {
      x: (velocity.x + hook * options.timestep_seconds) * damping_factor,
      y: velocity.y * damping_factor,
    },
    true,
  );
  const next_spin = state.spin * Math.max(0, 1 - options.spin_decay * options.timestep_seconds);
  const reached_pit = position.y >= pit_back_y(options.pin_count) - ball_radius;
  if (reached_pit) {
    options.capture_ball?.(body);
    return { spin: next_spin, in_gutter: entered_gutter, in_pit: true };
  }
  return { spin: next_spin, in_gutter: entered_gutter, in_pit: false };
}
