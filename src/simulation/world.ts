import RAPIER from "@dimforge/rapier2d-compat";

import type { PinId } from "../brands";
import {
  ball_radius,
  deck_depth,
  foul_to_head_pin,
  fallen_pin_length,
  gutter_width,
  lane_width,
  pit_back_y,
  pin_radius,
} from "../config/lane";
import { get_mode_for_rack_pin_count, type RackPinCount } from "../config/pin_counts";
import { aim_limits, clamp } from "../game/aim";
import {
  get_ball_mass_lb,
  get_pin_contact_force_event_threshold,
  get_pin_velocity_change_from_contact_force,
  get_mode_tuning,
  get_settle_max_seconds,
  physics_config,
} from "../config/physics";
import { create_activation_index, find_nearby_pin_ids } from "./activation";
import { apply_ball_force, type BallForceState } from "./ball_force";
import { get_pin_state_flag, type PinState, update_pin_state } from "./pin_state";
import {
  ball_snapshot_stride,
  ball_snapshot_in_pit_flag_offset,
  pin_snapshot_stride,
  snapshot_state_flag_offset,
  snapshot_in_pit_flag_offset,
  snapshot_fallen_axis_angle_offset,
  snapshot_removed_flag_offset,
  snapshot_velocity_x_offset,
  snapshot_velocity_y_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "./protocol";
import { create_rack, type Rack } from "./rack";

type PinRecord = {
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

type PinContactRecord = {
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

function create_collision_path_diagnostics(): CollisionPathDiagnostics {
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
  is_pin_fallen(pin_id: PinId): boolean;
  get_pin_final_distance_from_rack_slot(pin_id: PinId): number | undefined;
  is_pin_active(pin_id: PinId): boolean;
  activate_pin(pin_id: PinId): boolean;
  activate_nearby(x: number, y: number): number;
  dispose(): void;
};

let rapier_ready: Promise<void> | undefined;

export async function initialize_rapier(): Promise<void> {
  rapier_ready ??= RAPIER.init();
  await rapier_ready;
}

function create_pin_body(world: RAPIER.World, x: number, y: number): RAPIER.RigidBody {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y)
    .setLinearDamping(physics_config.pin_linear_damping)
    .setCanSleep(true);
  const body = world.createRigidBody(body_description);
  body.sleep();
  return body;
}

function create_pin_collider(world: RAPIER.World, body: RAPIER.RigidBody): RAPIER.Collider {
  const collider_description = RAPIER.ColliderDesc.ball(physics_config.pin_radius)
    .setMass(physics_config.pin_mass_lb)
    .setFriction(physics_config.pin_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  return world.createCollider(collider_description, body);
}

function create_fallen_pin_collider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  direction: { x: number; y: number },
  mass: number,
): RAPIER.Collider {
  // Rapier capsules are measured along their local y axis. Its two rounded
  // ends are included in `fallen_pin_length`, so the straight middle excludes
  // one radius at each end.
  const half_height = fallen_pin_length / 2 - physics_config.pin_radius;
  const collider_description = RAPIER.ColliderDesc.capsule(half_height, physics_config.pin_radius)
    .setTranslation(direction.x * (fallen_pin_length / 2), direction.y * (fallen_pin_length / 2))
    .setRotation(Math.atan2(direction.y, direction.x) - Math.PI / 2)
    // Shape changes must not give a fallen pin extra inertia by silently adding
    // material. Rapier derives the new angular inertia from this same mass.
    .setMass(mass)
    .setFriction(physics_config.pin_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  return world.createCollider(collider_description, body);
}

type BallRecord = {
  body: RAPIER.RigidBody;
  collider_handle: number;
};

type BallSnapshot = {
  x: number;
  y: number;
  velocity_x: number;
  velocity_y: number;
  rotation: number;
};

function create_ball_body(world: RAPIER.World, pin_count: RackPinCount): BallRecord {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(0)
    .setCanSleep(true)
    .lockRotations();
  const body = world.createRigidBody(body_description);
  const collider_description = RAPIER.ColliderDesc.ball(physics_config.ball_radius)
    .setMass(get_ball_mass_lb(pin_count))
    .setFriction(physics_config.lane_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  const collider = world.createCollider(collider_description, body);
  body.sleep();
  return { body, collider_handle: collider.handle };
}

function create_static_cuboid(
  world: RAPIER.World,
  x: number,
  y: number,
  half_width: number,
  half_height: number,
  sensor = false,
): RAPIER.Collider {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
  let description = RAPIER.ColliderDesc.cuboid(half_width, half_height).setSensor(sensor);
  if (sensor) description = description.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  return world.createCollider(description, body);
}

function get_speed(body: RAPIER.RigidBody): number {
  const velocity = body.linvel();
  return Math.hypot(velocity.x, velocity.y);
}

export async function create_simulation_world(
  pin_count: RackPinCount,
  { deck_assist_enabled = true }: { deck_assist_enabled?: boolean } = {},
): Promise<SimulationWorld> {
  await initialize_rapier();
  const tuning = get_mode_tuning(get_mode_for_rack_pin_count(pin_count));
  const rack = create_rack(pin_count);
  const rapier_world = new RAPIER.World({ x: 0, y: 0 });
  rapier_world.timestep = physics_config.fixed_step_seconds;
  const event_queue = new RAPIER.EventQueue(true);
  const lane_half_width = lane_width(pin_count) / 2;
  const outer_gutter_edge = lane_half_width + gutter_width;
  const deck_back_y = foul_to_head_pin + deck_depth(pin_count);
  // Keep the sensor after the deck, with a visible physical gap before it.
  const pit_front_y = deck_back_y + ball_radius;
  const pit_back = pit_back_y(pin_count);
  const lane_run_half_height = pit_back / 2 + pin_radius;
  const deck_half_height = Math.max(pin_radius, (pit_back - foul_to_head_pin) / 2);
  // Outer rails confine the complete lane-plus-gutter envelope. The two sensor
  // strips model gutters; kickbacks begin at the pin deck and stop deck scatter.
  create_static_cuboid(
    rapier_world,
    -outer_gutter_edge - pin_radius,
    lane_run_half_height,
    pin_radius,
    lane_run_half_height,
  );
  create_static_cuboid(
    rapier_world,
    outer_gutter_edge + pin_radius,
    lane_run_half_height,
    pin_radius,
    lane_run_half_height,
  );
  const left_gutter_sensor = create_static_cuboid(
    rapier_world,
    -(lane_half_width + gutter_width / 2),
    (foul_to_head_pin + pit_back) / 2,
    gutter_width / 2,
    lane_run_half_height,
    true,
  );
  const right_gutter_sensor = create_static_cuboid(
    rapier_world,
    lane_half_width + gutter_width / 2,
    (foul_to_head_pin + pit_back) / 2,
    gutter_width / 2,
    lane_run_half_height,
    true,
  );
  const gutter_sensor_handles = new Set([left_gutter_sensor.handle, right_gutter_sensor.handle]);
  create_static_cuboid(
    rapier_world,
    -outer_gutter_edge - pin_radius,
    foul_to_head_pin + deck_half_height,
    pin_radius,
    deck_half_height,
  );
  create_static_cuboid(
    rapier_world,
    outer_gutter_edge + pin_radius,
    foul_to_head_pin + deck_half_height,
    pin_radius,
    deck_half_height,
  );
  const pit_sensor = create_static_cuboid(
    rapier_world,
    0,
    (pit_front_y + pit_back) / 2,
    outer_gutter_edge,
    (pit_back - pit_front_y) / 2,
    true,
  );
  create_static_cuboid(
    rapier_world,
    0,
    pit_back + pin_radius,
    outer_gutter_edge + pin_radius,
    pin_radius,
  );
  const activation_index = create_activation_index(rack.slots, tuning.activation_radius);
  const pins_by_id = new Map<PinId, PinRecord>();
  const pin_id_by_collider_handle = new Map<number, PinId>();
  const first_pin_contact_by_id = new Map<PinId, PinContactRecord>();
  const first_pin_impact_by_id = new Map<PinId, PinImpactDiagnostic>();
  const pin_contact_depth_by_id = new Map<PinId, number>();
  let pre_step_velocity_by_collider_handle = new Map<number, { x: number; y: number }>();
  let pre_step_pin_impact_by_id = new Map<PinId, PinImpactDiagnostic>();
  const collision_path_diagnostics: Record<CollisionPath, CollisionPathDiagnostics> = {
    ball_pin: create_collision_path_diagnostics(),
    pin_pin: create_collision_path_diagnostics(),
  };

  for (const slot of rack.slots) {
    const body = create_pin_body(rapier_world, slot.x, slot.y);
    const collider = create_pin_collider(rapier_world, body);
    body.sleep();
    const record: PinRecord = {
      pin_id: slot.pin_id,
      initial_x: slot.x,
      initial_y: slot.y,
      body,
      collider_handle: collider.handle,
      state: "standing",
      active: false,
      removed: false,
      in_pit: false,
      fallen_collider: false,
      last_physical_position: undefined,
      nearby_activation_requested: false,
    };
    pins_by_id.set(slot.pin_id, record);
    pin_id_by_collider_handle.set(collider.handle, slot.pin_id);
  }

  let ball: BallRecord | undefined = create_ball_body(rapier_world, pin_count);
  let retained_ball_snapshot: BallSnapshot = {
    x: 0,
    y: 0,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
  };
  let ball_force_state: BallForceState = {
    spin: 0,
    in_gutter: false,
    in_pit: false,
    has_hit_pin: false,
    deck_assist_acceleration: 0,
    deck_assist_force_lbf: 0,
    deck_assist_force_world: 0,
    deck_assist_geometry_scale: 0,
    deck_assist_geometry_factor: 0,
    deck_assist_force: 0,
    deck_assist_fade: 0,
    deck_assist_active: false,
    forward_progress_speed: 0,
    last_y: 0,
    launch_direction: { x: 0, y: 1 },
  };
  let launched = false;
  let roll_elapsed_seconds = 0;
  let quiet_time = 0;
  let accumulator = 0;
  let roll_step = 0;
  let last_ball_activation_cell: string | undefined;
  let disposed = false;

  function require_pin(pin_id: PinId): PinRecord {
    const record = pins_by_id.get(pin_id);
    if (record === undefined) throw new Error(`Unknown pin id: ${pin_id}`);
    return record;
  }

  function get_collision_path(
    first_handle: number,
    second_handle: number,
  ): CollisionPath | undefined {
    const first_pin = pin_id_by_collider_handle.get(first_handle);
    const second_pin = pin_id_by_collider_handle.get(second_handle);
    if (first_pin !== undefined && second_pin !== undefined) return "pin_pin";
    if (
      (first_pin !== undefined && second_handle === ball?.collider_handle) ||
      (second_pin !== undefined && first_handle === ball?.collider_handle)
    ) {
      return "ball_pin";
    }
    return undefined;
  }

  function get_pre_step_impact(record: PinRecord): PinImpactDiagnostic {
    return (
      pre_step_pin_impact_by_id.get(record.pin_id) ?? {
        step: roll_step,
        active: record.active,
        sleeping: record.body.isSleeping(),
        collider_shape: record.fallen_collider ? "fallen_capsule" : "standing_circle",
      }
    );
  }

  function record_pin_impact(record: PinRecord): void {
    if (!first_pin_impact_by_id.has(record.pin_id)) {
      first_pin_impact_by_id.set(record.pin_id, get_pre_step_impact(record));
    }
  }

  function record_collision_occurrence(
    path: CollisionPath,
    first_handle: number,
    second_handle: number,
    first_pin_id: PinId | undefined,
    second_pin_id: PinId | undefined,
  ): void {
    const diagnostics = collision_path_diagnostics[path];
    diagnostics.contact_occurrences += 1;
    const first_collider = rapier_world.getCollider(first_handle);
    const second_collider = rapier_world.getCollider(second_handle);
    if (first_collider !== null && second_collider !== null) {
      let impulse = 0;
      rapier_world.contactPair(first_collider, second_collider, (manifold) => {
        for (let index = 0; index < manifold.numContacts(); index += 1) {
          impulse += Math.hypot(
            manifold.contactImpulse(index),
            manifold.contactTangentImpulse(index),
          );
        }
      });
      diagnostics.total_impulse += impulse;
      diagnostics.maximum_impulse = Math.max(diagnostics.maximum_impulse, impulse);
    }
    const velocity_change = [first_handle, second_handle].reduce((total, handle) => {
      const previous = pre_step_velocity_by_collider_handle.get(handle);
      if (previous === undefined) return total;
      const pin_id = pin_id_by_collider_handle.get(handle);
      const body =
        pin_id === undefined
          ? handle === ball?.collider_handle
            ? ball.body
            : undefined
          : require_pin(pin_id).body;
      if (body === undefined) return total;
      const current = body.linvel();
      return total + Math.hypot(current.x - previous.x, current.y - previous.y);
    }, 0);
    diagnostics.total_endpoint_velocity_change += velocity_change;
    diagnostics.maximum_endpoint_velocity_change = Math.max(
      diagnostics.maximum_endpoint_velocity_change,
      velocity_change,
    );
    const pin_ids = [first_pin_id, second_pin_id].filter(
      (pin_id): pin_id is PinId => pin_id !== undefined,
    );
    const records = pin_ids.map(require_pin);
    if (records.some((record) => record.fallen_collider)) {
      diagnostics.contacts_after_fallen_collider_replacement += 1;
    }
    for (const record of records) record_pin_impact(record);
  }

  function update_propagation_depth(
    direct_ball_contacts: Set<PinId>,
    pin_pin_edges: Array<[PinId, PinId]>,
  ): void {
    const depths = new Map(pin_contact_depth_by_id);
    for (const pin_id of direct_ball_contacts) depths.set(pin_id, 0);
    const edges = [...pin_pin_edges].sort(
      ([first_a, second_a], [first_b, second_b]) =>
        Number(first_a) - Number(first_b) || Number(second_a) - Number(second_b),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const [first_pin, second_pin] of edges) {
        const first_depth = depths.get(first_pin);
        const second_depth = depths.get(second_pin);
        if (first_depth !== undefined && first_depth + 1 < (second_depth ?? Infinity)) {
          depths.set(second_pin, first_depth + 1);
          changed = true;
        }
        if (second_depth !== undefined && second_depth + 1 < (first_depth ?? Infinity)) {
          depths.set(first_pin, second_depth + 1);
          changed = true;
        }
      }
    }
    pin_contact_depth_by_id.clear();
    for (const [pin_id, depth] of depths) pin_contact_depth_by_id.set(pin_id, depth);
    const diagnostics = collision_path_diagnostics.pin_pin;
    for (const [pin_id, depth] of depths) {
      if (depth === 0) continue;
      diagnostics.deepest_propagation_depth = Math.max(
        diagnostics.deepest_propagation_depth,
        depth,
      );
      const slot = rack.slots.find((candidate) => candidate.pin_id === pin_id);
      if (slot !== undefined) {
        diagnostics.deepest_contact_row = Math.max(
          diagnostics.deepest_contact_row ?? 0,
          slot.row_index,
        );
      }
    }
  }

  function record_contact_force(path: CollisionPath): void {
    const diagnostics = collision_path_diagnostics[path];
    diagnostics.contact_force_events += 1;
  }

  function capture_pre_step_collision_state(): void {
    pre_step_velocity_by_collider_handle = new Map();
    pre_step_pin_impact_by_id = new Map();
    if (ball !== undefined) {
      const velocity = ball.body.linvel();
      pre_step_velocity_by_collider_handle.set(ball.collider_handle, {
        x: velocity.x,
        y: velocity.y,
      });
    }
    for (const record of pins_by_id.values()) {
      if (record.removed) continue;
      const velocity = record.body.linvel();
      pre_step_velocity_by_collider_handle.set(record.collider_handle, {
        x: velocity.x,
        y: velocity.y,
      });
      pre_step_pin_impact_by_id.set(record.pin_id, {
        step: roll_step + 1,
        active: record.active,
        sleeping: record.body.isSleeping(),
        collider_shape: record.fallen_collider ? "fallen_capsule" : "standing_circle",
      });
    }
  }

  function reset_collision_diagnostics(): void {
    first_pin_impact_by_id.clear();
    pin_contact_depth_by_id.clear();
    pre_step_velocity_by_collider_handle = new Map();
    pre_step_pin_impact_by_id = new Map();
    for (const path of ["ball_pin", "pin_pin"] as const) {
      Object.assign(collision_path_diagnostics[path], create_collision_path_diagnostics());
    }
  }

  function activate_pin(pin_id: PinId): boolean {
    const record = require_pin(pin_id);
    if (record.active || record.removed) return false;
    record.body.wakeUp();
    record.active = true;
    return true;
  }

  function activate_nearby(x: number, y: number): number {
    const nearby_pin_ids = find_nearby_pin_ids(activation_index, x, y, tuning.activation_radius);
    let activated_count = 0;
    for (const pin_id of nearby_pin_ids) {
      if (activate_pin(pin_id)) activated_count += 1;
    }
    return activated_count;
  }

  /**
   * Expanding a moving pin's original-rack neighborhood is a transition, not
   * a per-frame force. Contacts still wake bodies natively through Rapier; the
   * one-shot lookup only makes plausible nearby partners available for that
   * contact. Repeating the same spatial-hash query for every fallen capsule
   * dominated 990-pin fixed-step time without creating additional contacts.
   */
  function request_nearby_activation(record: PinRecord): void {
    if (record.nearby_activation_requested || record.removed) return;
    record.nearby_activation_requested = true;
    const translation = record.body.translation();
    activate_nearby(translation.x, translation.y);
  }

  function request_ball_nearby_activation(x: number, y: number): void {
    // The activation index is built with this same cell size. One radius query
    // for each cell crossed covers its neighboring cells, while avoiding 120
    // identical spatial scans per simulated second as the ball travels.
    const cell = `${Math.floor(x / tuning.activation_radius)}:${Math.floor(y / tuning.activation_radius)}`;
    if (cell === last_ball_activation_cell) return;
    last_ball_activation_cell = cell;
    activate_nearby(x, y);
  }

  function get_fall_direction(record: PinRecord): { x: number; y: number } {
    const velocity = record.body.linvel();
    const displacement = record.body.translation();
    const candidates = [
      { x: velocity.x, y: velocity.y },
      { x: displacement.x - record.initial_x, y: displacement.y - record.initial_y },
    ];
    for (const candidate of candidates) {
      const length = Math.hypot(candidate.x, candidate.y);
      if (length > 1e-6) return { x: candidate.x / length, y: candidate.y / length };
    }
    // A contact-force fall can occur before the first observable displacement.
    // Forward is the deterministic no-information fallback in lane coordinates.
    return { x: 0, y: 1 };
  }

  function replace_with_fallen_collider(record: PinRecord): void {
    if (record.fallen_collider || record.removed) return;
    const standing_collider = rapier_world.getCollider(record.collider_handle);
    if (standing_collider === null) {
      throw new Error(`Pin ${record.pin_id} is missing its standing collider.`);
    }
    const mass = standing_collider.mass();
    const direction = get_fall_direction(record);
    pin_id_by_collider_handle.delete(record.collider_handle);
    rapier_world.removeCollider(standing_collider, false);
    const fallen_collider = create_fallen_pin_collider(rapier_world, record.body, direction, mass);
    record.collider_handle = fallen_collider.handle;
    record.fallen_collider = true;
    pin_id_by_collider_handle.set(fallen_collider.handle, record.pin_id);
    // This applies only after the physical shape has changed into its fallen
    // capsule. It preserves every standing-pin collision response and lets
    // native Rapier contacts control the fall rather than capping rotation.
    record.body.setAngularDamping(physics_config.fallen_pin_angular_damping);
    record.body.wakeUp();
  }

  function mark_pin_fallen(record: PinRecord, fall_events: PinId[]): void {
    if (record.state !== "standing") return;
    record.state = "fallen";
    replace_with_fallen_collider(record);
    request_nearby_activation(record);
    fall_events.push(record.pin_id);
  }

  function record_pin_contact(pin_id: PinId, contact: PinFirstContact): void {
    const existing = first_pin_contact_by_id.get(pin_id);
    if (existing === undefined || (existing.step === roll_step && contact === "ball_pin")) {
      // A ball and pin contact reported in the same simulation step is direct
      // for this diagnostic, regardless of event-queue order.
      first_pin_contact_by_id.set(pin_id, { contact, step: roll_step });
    }
  }

  function process_collision_events(): void {
    const pin_ids_to_capture = new Set<PinId>();
    const direct_ball_contacts = new Set<PinId>();
    const pin_pin_edges: Array<[PinId, PinId]> = [];
    let ball_entered_pit = false;
    event_queue.drainCollisionEvents((first_handle, second_handle, started) => {
      if (!started) return;
      const is_pit_intersection =
        first_handle === pit_sensor.handle || second_handle === pit_sensor.handle;
      if (is_pit_intersection) {
        const other_handle = first_handle === pit_sensor.handle ? second_handle : first_handle;
        if (other_handle === ball?.collider_handle) ball_entered_pit = true;
        const pit_pin_id = pin_id_by_collider_handle.get(other_handle);
        if (pit_pin_id !== undefined) pin_ids_to_capture.add(pit_pin_id);
        return;
      }
      if (gutter_sensor_handles.has(first_handle) || gutter_sensor_handles.has(second_handle)) {
        return;
      }
      const first_pin = pin_id_by_collider_handle.get(first_handle);
      const second_pin = pin_id_by_collider_handle.get(second_handle);
      if (first_pin !== undefined && second_pin !== undefined) {
        record_collision_occurrence("pin_pin", first_handle, second_handle, first_pin, second_pin);
        pin_pin_edges.push(
          Number(first_pin) < Number(second_pin)
            ? [first_pin, second_pin]
            : [second_pin, first_pin],
        );
        record_pin_contact(first_pin, "pin_pin");
        record_pin_contact(second_pin, "pin_pin");
      } else if (first_pin !== undefined && second_handle === ball?.collider_handle) {
        record_collision_occurrence("ball_pin", first_handle, second_handle, first_pin, undefined);
        direct_ball_contacts.add(first_pin);
        ball_force_state = { ...ball_force_state, has_hit_pin: true };
        record_pin_contact(first_pin, "ball_pin");
      } else if (second_pin !== undefined && first_handle === ball?.collider_handle) {
        record_collision_occurrence("ball_pin", first_handle, second_handle, second_pin, undefined);
        direct_ball_contacts.add(second_pin);
        ball_force_state = { ...ball_force_state, has_hit_pin: true };
        record_pin_contact(second_pin, "ball_pin");
      }
      if (first_pin !== undefined) activate_pin(first_pin);
      if (second_pin !== undefined) activate_pin(second_pin);
    });
    update_propagation_depth(direct_ball_contacts, pin_pin_edges);
    if (ball_entered_pit) capture_ball_in_pit();
    for (const pin_id of pin_ids_to_capture) capture_pin_in_pit(require_pin(pin_id));
  }

  function process_contact_force_events(fall_events: PinId[]): void {
    event_queue.drainContactForceEvents((event) => {
      const contact_force = event.totalForceMagnitude();
      const path = get_collision_path(event.collider1(), event.collider2());
      if (path !== undefined) {
        record_contact_force(path);
      }
      for (const handle of [event.collider1(), event.collider2()]) {
        const pin_id = pin_id_by_collider_handle.get(handle);
        if (pin_id === undefined) continue;
        const record = require_pin(pin_id);
        const collider = rapier_world.getCollider(handle);
        if (collider === null) continue;
        const velocity_change = get_pin_velocity_change_from_contact_force(
          contact_force,
          collider.mass(),
        );
        const next_state = update_pin_state(record.state, 0, velocity_change);
        if (next_state === "fallen") mark_pin_fallen(record, fall_events);
      }
    });
  }

  function update_active_pins(fall_events: PinId[]): void {
    for (const record of pins_by_id.values()) {
      if (!record.active || record.removed) continue;
      // Fallen pins have already exchanged their standing circle for a capsule
      // and requested their local activation once. Rapier continues to solve
      // their contacts directly; there is no remaining state transition for
      // this bookkeeping pass to discover. Sleeping standing pins likewise
      // wake through native collision events before another transition is due.
      if (record.state === "fallen" || record.body.isSleeping()) continue;
      const translation = record.body.translation();
      const displacement = Math.hypot(
        translation.x - record.initial_x,
        translation.y - record.initial_y,
      );
      const next_state = update_pin_state(record.state, displacement, 0);
      if (next_state === "fallen") mark_pin_fallen(record, fall_events);
      if (get_speed(record.body) >= physics_config.propagation_speed) {
        request_nearby_activation(record);
      }
    }
  }

  function get_counts(): { standing_pin_count: number; fallen_pin_count: number } {
    let fallen_pin_count = 0;
    for (const record of pins_by_id.values()) if (record.state === "fallen") fallen_pin_count += 1;
    const standing_pin_count = pin_count - fallen_pin_count;
    return { standing_pin_count, fallen_pin_count };
  }

  function is_quiet(): boolean {
    if (launched && !ball_force_state.in_pit) return false;
    for (const record of pins_by_id.values()) {
      if (record.active && get_speed(record.body) > physics_config.settle_speed) return false;
    }
    return true;
  }

  function capture_ball_in_pit(): void {
    if (ball === undefined) return;
    const position = ball.body.translation();
    const velocity = ball.body.linvel();
    retained_ball_snapshot = {
      x: position.x,
      y: position.y,
      velocity_x: velocity.x,
      velocity_y: velocity.y,
      rotation: ball.body.rotation(),
    };
    rapier_world.removeRigidBody(ball.body);
    ball = undefined;
    ball_force_state = { ...ball_force_state, in_pit: true };
  }

  function capture_pin_in_pit(record: PinRecord): void {
    if (record.removed) return;
    const position = record.body.translation();
    record.last_physical_position = { x: position.x, y: position.y };
    pin_id_by_collider_handle.delete(record.collider_handle);
    rapier_world.removeRigidBody(record.body);
    record.removed = true;
    record.in_pit = true;
    record.active = false;
    record.state = "fallen";
  }

  function step_fixed(): StepResult {
    if (disposed) throw new Error("Simulation world has been disposed.");
    const fall_events: PinId[] = [];
    if (!launched) return { settled: true, timed_out: false, fall_events };
    if (ball !== undefined) {
      let force_requested_capture = false;
      ball_force_state = apply_ball_force(ball.body, ball_force_state, {
        pin_count,
        timestep_seconds: physics_config.fixed_step_seconds,
        damping: physics_config.ball_linear_damping,
        spin_decay: physics_config.ball_spin_decay,
        deck_assist_enabled,
        capture_ball(): void {
          force_requested_capture = true;
        },
      });
      if (force_requested_capture) {
        capture_ball_in_pit();
      } else if (!ball_force_state.in_gutter) {
        const ball_position = ball.body.translation();
        request_ball_nearby_activation(ball_position.x, ball_position.y);
      }
    }
    capture_pre_step_collision_state();
    rapier_world.step(event_queue);
    roll_step += 1;
    roll_elapsed_seconds += physics_config.fixed_step_seconds;
    process_collision_events();
    process_contact_force_events(fall_events);
    update_active_pins(fall_events);
    quiet_time = is_quiet() ? quiet_time + physics_config.fixed_step_seconds : 0;
    const settled = quiet_time >= physics_config.settle_quiet_seconds;
    const reached_settlement_limit = roll_elapsed_seconds >= get_settle_max_seconds(pin_count);
    if (reached_settlement_limit && !settled && !ball_force_state.in_pit) {
      throw new Error("Ball did not reach the pit before the settlement timeout.");
    }
    const timed_out = reached_settlement_limit && !settled;
    return { settled, timed_out, fall_events };
  }

  function create_snapshot(): SimulationSnapshot {
    const counts = get_counts();
    const data = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
    for (const record of pins_by_id.values()) {
      const offset = Number(record.pin_id) * pin_snapshot_stride;
      if (!record.removed) {
        const collider = rapier_world.getCollider(record.collider_handle);
        if (collider === null) {
          throw new Error(`Pin ${record.pin_id} is missing its collider for its snapshot.`);
        }
        // Fallen artwork is centered on the capsule's world-space center,
        // rather than the retained upright body origin. The latter sits at the
        // capsule's tail by construction and would visibly desynchronize it.
        const position = record.fallen_collider
          ? collider.translation()
          : record.body.translation();
        const velocity = record.body.linvel();
        data[offset + snapshot_x_offset] = position.x;
        data[offset + snapshot_y_offset] = position.y;
        data[offset + snapshot_velocity_x_offset] = velocity.x;
        data[offset + snapshot_velocity_y_offset] = velocity.y;
        if (record.fallen_collider) {
          // Rapier capsules use local y as their long axis; Canvas sprites use
          // their local x axis, so the published drawing axis is +90 degrees.
          data[offset + snapshot_fallen_axis_angle_offset] = collider.rotation() + Math.PI / 2;
        }
      }
      data[offset + snapshot_state_flag_offset] = get_pin_state_flag(record.state);
      data[offset + snapshot_removed_flag_offset] = Number(record.removed);
      data[offset + snapshot_in_pit_flag_offset] = Number(record.in_pit);
    }
    const ball_offset = pin_count * pin_snapshot_stride;
    const ball_snapshot =
      ball === undefined
        ? retained_ball_snapshot
        : {
            x: ball.body.translation().x,
            y: ball.body.translation().y,
            velocity_x: ball.body.linvel().x,
            velocity_y: ball.body.linvel().y,
            rotation: ball.body.rotation(),
          };
    data[ball_offset] = ball_snapshot.x;
    data[ball_offset + 1] = ball_snapshot.y;
    data[ball_offset + 2] = ball_snapshot.velocity_x;
    data[ball_offset + 3] = ball_snapshot.velocity_y;
    data[ball_offset + 4] = ball_snapshot.rotation;
    data[ball_offset + ball_snapshot_in_pit_flag_offset] = Number(ball_force_state.in_pit);
    return {
      pin_count,
      standing_pin_count: counts.standing_pin_count,
      fallen_pin_count: counts.fallen_pin_count,
      data,
    };
  }

  function launch(power: number, start_position: number, angle: number, spin: number): void {
    const limits = aim_limits(pin_count);
    // The worker receives a position/angle that has already been normalized by
    // the game state. Keep direct simulation fixtures free to model gutters
    // and deliberate misses, while making the player-facing power and spin
    // envelope authoritative here as well.
    const normalized_aim = {
      power: Math.max(0.1, Math.min(power, limits.maximum_power)),
      start_position,
      angle,
      spin: clamp(spin, limits.minimum_spin, limits.maximum_spin),
    };
    ball ??= create_ball_body(rapier_world, pin_count);
    ball.body.setTranslation({ x: normalized_aim.start_position, y: 0 }, true);
    ball.body.setLinvel(
      {
        x: Math.sin(normalized_aim.angle) * normalized_aim.power,
        y: Math.cos(normalized_aim.angle) * normalized_aim.power,
      },
      true,
    );
    ball.body.wakeUp();
    launched = true;
    first_pin_contact_by_id.clear();
    reset_collision_diagnostics();
    roll_step = 0;
    last_ball_activation_cell = undefined;
    roll_elapsed_seconds = 0;
    quiet_time = 0;
    accumulator = 0;
    ball_force_state = {
      spin: normalized_aim.spin,
      in_gutter: false,
      in_pit: false,
      has_hit_pin: false,
      deck_assist_acceleration: 0,
      deck_assist_force_lbf: 0,
      deck_assist_force_world: 0,
      deck_assist_geometry_scale: 0,
      deck_assist_geometry_factor: 0,
      deck_assist_force: 0,
      deck_assist_fade: 0,
      deck_assist_active: false,
      forward_progress_speed: 0,
      last_y: 0,
      launch_direction: {
        x: Math.sin(normalized_aim.angle),
        y: Math.cos(normalized_aim.angle),
      },
    };
  }

  function sweep_deadwood(): void {
    for (const record of pins_by_id.values()) {
      if (record.state !== "fallen" || record.removed) continue;
      const position = record.body.translation();
      record.last_physical_position = { x: position.x, y: position.y };
      pin_id_by_collider_handle.delete(record.collider_handle);
      rapier_world.removeRigidBody(record.body);
      record.removed = true;
      record.active = false;
    }
  }

  function prepare_next_roll(): void {
    sweep_deadwood();
    ball ??= create_ball_body(rapier_world, pin_count);
    ball.body.setTranslation({ x: 0, y: 0 }, true);
    ball.body.setLinvel({ x: 0, y: 0 }, true);
    ball.body.setAngvel(0, true);
    ball.body.sleep();
    retained_ball_snapshot = { x: 0, y: 0, velocity_x: 0, velocity_y: 0, rotation: 0 };
    ball_force_state = {
      spin: 0,
      in_gutter: false,
      in_pit: false,
      has_hit_pin: false,
      deck_assist_acceleration: 0,
      deck_assist_force_lbf: 0,
      deck_assist_force_world: 0,
      deck_assist_geometry_scale: 0,
      deck_assist_geometry_factor: 0,
      deck_assist_force: 0,
      deck_assist_fade: 0,
      deck_assist_active: false,
      forward_progress_speed: 0,
      last_y: 0,
      launch_direction: { x: 0, y: 1 },
    };
    launched = false;
    first_pin_contact_by_id.clear();
    reset_collision_diagnostics();
    roll_step = 0;
    last_ball_activation_cell = undefined;
    roll_elapsed_seconds = 0;
    quiet_time = 0;
    accumulator = 0;
  }

  function tick(elapsed_seconds: number): StepResult {
    accumulator += Math.min(
      elapsed_seconds,
      physics_config.fixed_step_seconds * physics_config.max_steps_per_tick,
    );
    let result: StepResult = { settled: false, timed_out: false, fall_events: [] };
    while (
      accumulator >= physics_config.fixed_step_seconds &&
      !result.settled &&
      !result.timed_out
    ) {
      result = step_fixed();
      accumulator -= physics_config.fixed_step_seconds;
    }
    return result;
  }

  function get_dynamic_body_count(): number {
    let dynamic_pin_count = 0;
    for (const record of pins_by_id.values()) {
      if (record.active && !record.removed) dynamic_pin_count += 1;
    }
    return dynamic_pin_count + Number(ball !== undefined && launched);
  }

  function get_awake_body_count(): number {
    let awake_body_count = ball === undefined || ball.body.isSleeping() ? 0 : 1;
    for (const record of pins_by_id.values()) {
      if (!record.removed && !record.body.isSleeping()) awake_body_count += 1;
    }
    return awake_body_count;
  }

  function get_total_body_count(): number {
    const active_pin_count = [...pins_by_id.values()].filter((record) => !record.removed).length;
    return active_pin_count + Number(ball !== undefined);
  }

  function get_pin_velocity(pin_id: PinId): { x: number; y: number } {
    const record = require_pin(pin_id);
    if (record.removed) return { x: 0, y: 0 };
    const velocity = record.body.linvel();
    return { x: velocity.x, y: velocity.y };
  }

  function get_pin_position(pin_id: PinId): { x: number; y: number; rotation: number } {
    const record = require_pin(pin_id);
    if (record.removed) return { x: record.initial_x, y: record.initial_y, rotation: 0 };
    const position = record.body.translation();
    return { x: position.x, y: position.y, rotation: record.body.rotation() };
  }

  function get_pin_final_position(pin_id: PinId): { x: number; y: number } {
    const record = require_pin(pin_id);
    if (record.removed)
      return record.last_physical_position ?? { x: record.initial_x, y: record.initial_y };
    const position = record.body.translation();
    return { x: position.x, y: position.y };
  }

  /**
   * Narrow test diagnostic for the world-space long axis used by a fallen
   * capsule. It stays out of snapshots and the production worker protocol.
   */
  function get_pin_fallen_axis_angle(pin_id: PinId): number | undefined {
    const record = require_pin(pin_id);
    if (!record.fallen_collider || record.removed) return undefined;
    const collider = rapier_world.getCollider(record.collider_handle);
    if (collider === null) {
      throw new Error(`Pin ${pin_id} is missing its fallen collider.`);
    }
    return collider.rotation() + Math.PI / 2;
  }

  function get_pin_first_contact(pin_id: PinId): PinFirstContact | undefined {
    require_pin(pin_id);
    return first_pin_contact_by_id.get(pin_id)?.contact;
  }

  function get_pin_collision_profile(pin_id: PinId): PinCollisionProfile {
    const record = require_pin(pin_id);
    if (record.removed) {
      return {
        shape: record.fallen_collider ? "fallen_capsule" : "standing_circle",
        mass: 0,
        footprint_length: record.fallen_collider
          ? fallen_pin_length
          : physics_config.pin_radius * 2,
      };
    }
    const collider = rapier_world.getCollider(record.collider_handle);
    if (collider === null) throw new Error(`Pin ${pin_id} is missing its collider.`);
    return {
      shape: record.fallen_collider ? "fallen_capsule" : "standing_circle",
      mass: collider.mass(),
      footprint_length: record.fallen_collider ? fallen_pin_length : physics_config.pin_radius * 2,
    };
  }

  function get_ball_collision_profile(): BallCollisionProfile {
    if (ball === undefined) return { mass: 0 };
    const collider = rapier_world.getCollider(ball.collider_handle);
    if (collider === null) throw new Error("The ball is missing its collider.");
    return { mass: collider.mass() };
  }

  function get_ball_drive_diagnostics(): BallDriveDiagnostics {
    return {
      has_hit_pin: ball_force_state.has_hit_pin,
      deck_assist_acceleration: ball_force_state.deck_assist_acceleration,
      deck_assist_force_lbf: ball_force_state.deck_assist_force_lbf ?? 0,
      deck_assist_force_world: ball_force_state.deck_assist_force_world ?? 0,
      deck_assist_geometry_scale: ball_force_state.deck_assist_geometry_scale ?? 0,
      deck_assist_geometry_factor: ball_force_state.deck_assist_geometry_factor ?? 0,
      deck_assist_force: ball_force_state.deck_assist_force,
      deck_assist_fade: ball_force_state.deck_assist_fade,
      deck_assist_active: ball_force_state.deck_assist_active,
      forward_progress_speed: ball_force_state.forward_progress_speed,
    };
  }

  function get_pin_impact_diagnostic(pin_id: PinId): PinImpactDiagnostic | undefined {
    require_pin(pin_id);
    const diagnostic = first_pin_impact_by_id.get(pin_id);
    return diagnostic === undefined ? undefined : { ...diagnostic };
  }

  function get_collision_path_diagnostics(): Record<CollisionPath, CollisionPathDiagnostics> {
    return {
      ball_pin: { ...collision_path_diagnostics.ball_pin },
      pin_pin: { ...collision_path_diagnostics.pin_pin },
    };
  }

  function is_pin_fallen(pin_id: PinId): boolean {
    return require_pin(pin_id).state === "fallen";
  }

  function get_pin_final_distance_from_rack_slot(pin_id: PinId): number | undefined {
    const record = require_pin(pin_id);
    if (record.state !== "fallen") return undefined;
    const position = record.removed ? record.last_physical_position : record.body.translation();
    if (position === undefined) return undefined;
    return Math.hypot(position.x - record.initial_x, position.y - record.initial_y);
  }

  function is_pin_active(pin_id: PinId): boolean {
    return require_pin(pin_id).active;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    event_queue.free();
    rapier_world.free();
  }

  return {
    pin_count,
    rack,
    launch,
    sweep_deadwood,
    prepare_next_roll,
    step_fixed,
    tick,
    create_snapshot,
    get_counts,
    get_dynamic_body_count,
    get_awake_body_count,
    get_total_body_count,
    get_pin_velocity,
    get_pin_position,
    get_pin_final_position,
    get_pin_fallen_axis_angle,
    get_pin_first_contact,
    get_pin_collision_profile,
    get_ball_collision_profile,
    get_ball_drive_diagnostics,
    get_pin_impact_diagnostic,
    get_collision_path_diagnostics,
    is_pin_fallen,
    get_pin_final_distance_from_rack_slot,
    is_pin_active,
    activate_pin,
    activate_nearby,
    dispose,
  };
}
