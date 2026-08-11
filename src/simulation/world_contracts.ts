import type RAPIER from "@dimforge/rapier2d-compat";

import type { PinId } from "../brands";
import type { RackPinCount } from "../config/pin_counts";
import type { FallTransitionSummary, ImpactPathSummary } from "./protocol";
import type { PinState } from "./pin_state";
import type { Rack } from "./rack";

export type PinRecord = {
  pin_id: PinId;
  initial_x: number;
  initial_y: number;
  body: RAPIER.RigidBody;
  collider_handle: number;
  state: PinState;
  active: boolean;
  removed: boolean;
  in_pit: boolean;
  fallen_collider: boolean;
  last_physical_position: { x: number; y: number } | undefined;
  nearby_activation_requested: boolean;
};

export type BallRecord = {
  body: RAPIER.RigidBody;
  collider_handle: number;
};

export type BallSnapshot = {
  x: number;
  y: number;
  velocity_x: number;
  velocity_y: number;
  rotation: number;
};

export type SimulationSnapshot = {
  pin_count: RackPinCount;
  standing_pin_count: number;
  fallen_pin_count: number;
  data: Float32Array;
};

export type StepResult = {
  settled: boolean;
  timed_out: boolean;
  fall_events: PinId[];
};

/**
 * Diagnostic provenance for a pin's first dynamic collision in the current roll.
 * Static lane, pit, and gutter contacts are deliberately excluded.
 */
export type PinFirstContact = "ball_pin" | "pin_pin";

export type PinContactRecord = {
  contact: PinFirstContact;
  step: number;
};

export type PinCollisionProfile = {
  shape: "standing_circle" | "fallen_capsule";
  mass: number;
  footprint_length: number;
};

export type BallCollisionProfile = {
  mass: number;
};

export type BallDriveDiagnostics = {
  has_hit_pin: boolean;
  deck_assist_acceleration: number;
  deck_assist_force_lbf: number;
  deck_assist_force_world: number;
  deck_assist_geometry_scale: number;
  deck_assist_geometry_factor: number;
  deck_assist_force: number;
  deck_assist_fade: number;
  deck_assist_active: boolean;
  forward_progress_speed: number;
};

export type CollisionPath = "ball_pin" | "pin_pin";

export type ImpactWindow = {
  ball_pin: ImpactPathSummary | undefined;
  pin_pin: ImpactPathSummary | undefined;
  fallen: FallTransitionSummary | undefined;
};

export type CollisionPathDiagnostics = {
  contact_occurrences: number;
  contact_force_events: number;
  // Rapier reports this manifold impulse for a newly-started collider pair.
  total_impulse: number;
  maximum_impulse: number;
  // This is the pair endpoints' net pre/post-step delta, so simultaneous
  // contacts in that fixed step can contribute to it as well.
  total_endpoint_velocity_change: number;
  maximum_endpoint_velocity_change: number;
  contacts_after_fallen_collider_replacement: number;
  deepest_propagation_depth: number;
  deepest_contact_row: number | undefined;
};

export type PinImpactDiagnostic = {
  step: number;
  active: boolean;
  sleeping: boolean;
  collider_shape: "standing_circle" | "fallen_capsule";
};

export type SimulationWorld = {
  readonly pin_count: RackPinCount;
  readonly rack: Rack;
  launch(power: number, start_position: number, angle: number, spin: number): void;
  sweep_deadwood(): void;
  prepare_next_roll(): void;
  step_fixed(): StepResult;
  tick(elapsed_seconds: number): StepResult;
  create_snapshot(): SimulationSnapshot;
  get_counts(): { standing_pin_count: number; fallen_pin_count: number };
  get_dynamic_body_count(): number;
  get_awake_body_count(): number;
  get_total_body_count(): number;
  get_pin_velocity(pin_id: PinId): { x: number; y: number };
  get_pin_position(pin_id: PinId): { x: number; y: number; rotation: number };
  get_pin_final_position(pin_id: PinId): { x: number; y: number };
  get_pin_fallen_axis_angle(pin_id: PinId): number | undefined;
  get_pin_first_contact(pin_id: PinId): PinFirstContact | undefined;
  get_pin_collision_profile(pin_id: PinId): PinCollisionProfile;
  get_ball_collision_profile(): BallCollisionProfile;
  get_ball_drive_diagnostics(): BallDriveDiagnostics;
  get_pin_impact_diagnostic(pin_id: PinId): PinImpactDiagnostic | undefined;
  get_collision_path_diagnostics(): Record<CollisionPath, CollisionPathDiagnostics>;
  drain_impact_window(): ImpactWindow;
  is_pin_fallen(pin_id: PinId): boolean;
  get_pin_final_distance_from_rack_slot(pin_id: PinId): number | undefined;
  is_pin_active(pin_id: PinId): boolean;
  activate_pin(pin_id: PinId): boolean;
  activate_nearby(x: number, y: number): number;
  dispose(): void;
};

export function create_collision_path_diagnostics(): CollisionPathDiagnostics {
  return {
    contact_occurrences: 0,
    contact_force_events: 0,
    total_impulse: 0,
    maximum_impulse: 0,
    total_endpoint_velocity_change: 0,
    maximum_endpoint_velocity_change: 0,
    contacts_after_fallen_collider_replacement: 0,
    deepest_propagation_depth: 0,
    deepest_contact_row: undefined,
  };
}
