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
import { get_mode_tuning, get_settle_max_seconds, physics_config } from "../config/physics";
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
  get_pin_fallen_axis_angle(pin_id: PinId): number | undefined;
  get_pin_first_contact(pin_id: PinId): PinFirstContact | undefined;
  get_pin_collision_profile(pin_id: PinId): PinCollisionProfile;
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
    .setDensity(physics_config.pin_mass)
    .setFriction(physics_config.pin_friction)
    .setRestitution(physics_config.restitution)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    // Rapier's threshold is force; the game fall rule is an impulse per fixed step.
    .setContactForceEventThreshold(physics_config.fall_impulse / physics_config.fixed_step_seconds);
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
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(physics_config.fall_impulse / physics_config.fixed_step_seconds);
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

function create_ball_body(world: RAPIER.World): BallRecord {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(0)
    .setCanSleep(true)
    .lockRotations();
  const body = world.createRigidBody(body_description);
  const collider_description = RAPIER.ColliderDesc.ball(physics_config.ball_radius)
    .setDensity(physics_config.ball_mass)
    .setFriction(physics_config.lane_friction)
    .setRestitution(physics_config.restitution)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    // Rapier's threshold is force; the game fall rule is an impulse per fixed step.
    .setContactForceEventThreshold(physics_config.fall_impulse / physics_config.fixed_step_seconds);
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

export async function create_simulation_world(pin_count: RackPinCount): Promise<SimulationWorld> {
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
      nearby_activation_requested: false,
    };
    pins_by_id.set(slot.pin_id, record);
    pin_id_by_collider_handle.set(collider.handle, slot.pin_id);
  }

  let ball: BallRecord | undefined = create_ball_body(rapier_world);
  let retained_ball_snapshot: BallSnapshot = {
    x: 0,
    y: 0,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
  };
  let ball_force_state: BallForceState = { spin: 0, in_gutter: false, in_pit: false };
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
        record_pin_contact(first_pin, "pin_pin");
        record_pin_contact(second_pin, "pin_pin");
      } else if (first_pin !== undefined && second_handle === ball?.collider_handle) {
        record_pin_contact(first_pin, "ball_pin");
      } else if (second_pin !== undefined && first_handle === ball?.collider_handle) {
        record_pin_contact(second_pin, "ball_pin");
      }
      if (first_pin !== undefined) activate_pin(first_pin);
      if (second_pin !== undefined) activate_pin(second_pin);
    });
    if (ball_entered_pit) capture_ball_in_pit();
    for (const pin_id of pin_ids_to_capture) capture_pin_in_pit(require_pin(pin_id));
  }

  function process_contact_force_events(fall_events: PinId[]): void {
    event_queue.drainContactForceEvents((event) => {
      // Convert the per-step contact force back into the centralized impulse threshold unit.
      const impulse = event.totalForceMagnitude() * physics_config.fixed_step_seconds;
      for (const handle of [event.collider1(), event.collider2()]) {
        const pin_id = pin_id_by_collider_handle.get(handle);
        if (pin_id === undefined) continue;
        const record = require_pin(pin_id);
        const next_state = update_pin_state(record.state, 0, impulse);
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
    const bounded_power = Math.max(0.1, Math.min(power, 24));
    ball ??= create_ball_body(rapier_world);
    ball.body.setTranslation({ x: start_position, y: 0 }, true);
    ball.body.setLinvel(
      { x: Math.sin(angle) * bounded_power, y: Math.cos(angle) * bounded_power },
      true,
    );
    ball.body.wakeUp();
    launched = true;
    first_pin_contact_by_id.clear();
    roll_step = 0;
    last_ball_activation_cell = undefined;
    roll_elapsed_seconds = 0;
    quiet_time = 0;
    accumulator = 0;
    ball_force_state = { spin, in_gutter: false, in_pit: false };
  }

  function sweep_deadwood(): void {
    for (const record of pins_by_id.values()) {
      if (record.state !== "fallen" || record.removed) continue;
      pin_id_by_collider_handle.delete(record.collider_handle);
      rapier_world.removeRigidBody(record.body);
      record.removed = true;
      record.active = false;
    }
  }

  function prepare_next_roll(): void {
    sweep_deadwood();
    ball ??= create_ball_body(rapier_world);
    ball.body.setTranslation({ x: 0, y: 0 }, true);
    ball.body.setLinvel({ x: 0, y: 0 }, true);
    ball.body.setAngvel(0, true);
    ball.body.sleep();
    retained_ball_snapshot = { x: 0, y: 0, velocity_x: 0, velocity_y: 0, rotation: 0 };
    ball_force_state = { spin: 0, in_gutter: false, in_pit: false };
    launched = false;
    first_pin_contact_by_id.clear();
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
    get_pin_fallen_axis_angle,
    get_pin_first_contact,
    get_pin_collision_profile,
    is_pin_active,
    activate_pin,
    activate_nearby,
    dispose,
  };
}
