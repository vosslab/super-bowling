import RAPIER from "@dimforge/rapier2d-compat";

import type { PinId } from "../brands";
import { get_mode_for_rack_pin_count, type RackPinCount } from "../config/pin_counts";
import { get_mode_tuning, physics_config } from "../config/physics";
import { create_activation_index, find_nearby_pin_ids } from "./activation";
import { get_pin_state_flag, type PinState, update_pin_state } from "./pin_state";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_state_flag_offset,
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

export type SimulationWorld = {
  readonly pin_count: RackPinCount;
  readonly rack: Rack;
  launch(power: number, lateral_offset: number): void;
  set_steer(direction: -1 | 0 | 1): void;
  step_fixed(): StepResult;
  tick(elapsed_seconds: number): StepResult;
  create_snapshot(): SimulationSnapshot;
  get_counts(): { standing_pin_count: number; fallen_pin_count: number };
  get_dynamic_body_count(): number;
  get_awake_body_count(): number;
  get_total_body_count(): number;
  get_pin_velocity(pin_id: PinId): { x: number; y: number };
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

function create_ball_body(world: RAPIER.World): RAPIER.RigidBody {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, -9)
    .setLinearDamping(physics_config.ball_linear_damping)
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
  world.createCollider(collider_description, body);
  body.sleep();
  return body;
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
  const activation_index = create_activation_index(rack.slots, tuning.activation_radius);
  const pins_by_id = new Map<PinId, PinRecord>();
  const pin_id_by_collider_handle = new Map<number, PinId>();

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
    };
    pins_by_id.set(slot.pin_id, record);
    pin_id_by_collider_handle.set(collider.handle, slot.pin_id);
  }

  const ball = create_ball_body(rapier_world);
  let steer_direction: -1 | 0 | 1 = 0;
  let launched = false;
  let roll_elapsed_seconds = 0;
  let quiet_time = 0;
  let accumulator = 0;
  let disposed = false;

  function require_pin(pin_id: PinId): PinRecord {
    const record = pins_by_id.get(pin_id);
    if (record === undefined) throw new Error(`Unknown pin id: ${pin_id}`);
    return record;
  }

  function activate_pin(pin_id: PinId): boolean {
    const record = require_pin(pin_id);
    if (record.active) return false;
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

  function apply_steering(): void {
    if (!launched || steer_direction === 0) return;
    const velocity = ball.linvel();
    const next_velocity_x =
      velocity.x +
      steer_direction * physics_config.steering_acceleration * physics_config.fixed_step_seconds;
    ball.setLinvel({ x: next_velocity_x, y: velocity.y }, true);
  }

  function process_collision_events(): void {
    event_queue.drainCollisionEvents((first_handle, second_handle, started) => {
      if (!started) return;
      const first_pin = pin_id_by_collider_handle.get(first_handle);
      const second_pin = pin_id_by_collider_handle.get(second_handle);
      if (first_pin !== undefined) activate_pin(first_pin);
      if (second_pin !== undefined) activate_pin(second_pin);
    });
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
        if (record.state === "standing" && next_state === "fallen") fall_events.push(pin_id);
        record.state = next_state;
      }
    });
  }

  function update_active_pins(fall_events: PinId[]): void {
    for (const record of pins_by_id.values()) {
      if (!record.active) continue;
      const translation = record.body.translation();
      const displacement = Math.hypot(
        translation.x - record.initial_x,
        translation.y - record.initial_y,
      );
      const next_state = update_pin_state(record.state, displacement, 0);
      if (record.state === "standing" && next_state === "fallen") fall_events.push(record.pin_id);
      record.state = next_state;
      if (record.state === "fallen" || get_speed(record.body) >= physics_config.propagation_speed) {
        activate_nearby(translation.x, translation.y);
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
    if (launched && get_speed(ball) > physics_config.settle_speed) return false;
    for (const record of pins_by_id.values()) {
      if (record.active && get_speed(record.body) > physics_config.settle_speed) return false;
    }
    return true;
  }

  function step_fixed(): StepResult {
    if (disposed) throw new Error("Simulation world has been disposed.");
    const fall_events: PinId[] = [];
    if (!launched) return { settled: true, timed_out: false, fall_events };
    apply_steering();
    const ball_position = ball.translation();
    activate_nearby(ball_position.x, ball_position.y);
    rapier_world.step(event_queue);
    roll_elapsed_seconds += physics_config.fixed_step_seconds;
    process_collision_events();
    process_contact_force_events(fall_events);
    update_active_pins(fall_events);
    if (ball.translation().y > rack.bounds.max_y + 3) {
      ball.setLinvel({ x: 0, y: 0 }, true);
      ball.sleep();
    }
    quiet_time = is_quiet() ? quiet_time + physics_config.fixed_step_seconds : 0;
    const settled = quiet_time >= physics_config.settle_quiet_seconds;
    const timed_out = roll_elapsed_seconds >= physics_config.settle_max_seconds && !settled;
    return { settled, timed_out, fall_events };
  }

  function create_snapshot(): SimulationSnapshot {
    const counts = get_counts();
    const data = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
    for (const record of pins_by_id.values()) {
      const offset = Number(record.pin_id) * pin_snapshot_stride;
      const position = record.body.translation();
      const velocity = record.body.linvel();
      data[offset + snapshot_x_offset] = position.x;
      data[offset + snapshot_y_offset] = position.y;
      data[offset + snapshot_velocity_x_offset] = velocity.x;
      data[offset + snapshot_velocity_y_offset] = velocity.y;
      data[offset + snapshot_state_flag_offset] = get_pin_state_flag(record.state);
    }
    const ball_offset = pin_count * pin_snapshot_stride;
    const ball_position = ball.translation();
    const ball_velocity = ball.linvel();
    data[ball_offset] = ball_position.x;
    data[ball_offset + 1] = ball_position.y;
    data[ball_offset + 2] = ball_velocity.x;
    data[ball_offset + 3] = ball_velocity.y;
    data[ball_offset + 4] = ball.rotation();
    return {
      pin_count,
      standing_pin_count: counts.standing_pin_count,
      fallen_pin_count: counts.fallen_pin_count,
      data,
    };
  }

  function launch(power: number, lateral_offset: number): void {
    const bounded_power = Math.max(0.1, Math.min(power, 24));
    ball.setTranslation({ x: lateral_offset, y: -9 }, true);
    ball.setLinvel({ x: 0, y: bounded_power }, true);
    ball.wakeUp();
    launched = true;
    roll_elapsed_seconds = 0;
    quiet_time = 0;
    accumulator = 0;
  }

  function set_steer(direction: -1 | 0 | 1): void {
    steer_direction = direction;
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
    for (const record of pins_by_id.values()) if (record.active) dynamic_pin_count += 1;
    return dynamic_pin_count + (launched ? 1 : 0);
  }

  function get_awake_body_count(): number {
    let awake_body_count = ball.isSleeping() ? 0 : 1;
    for (const record of pins_by_id.values()) {
      if (!record.body.isSleeping()) awake_body_count += 1;
    }
    return awake_body_count;
  }

  function get_total_body_count(): number {
    return pin_count + 1;
  }

  function get_pin_velocity(pin_id: PinId): { x: number; y: number } {
    const velocity = require_pin(pin_id).body.linvel();
    return { x: velocity.x, y: velocity.y };
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
    set_steer,
    step_fixed,
    tick,
    create_snapshot,
    get_counts,
    get_dynamic_body_count,
    get_awake_body_count,
    get_total_body_count,
    get_pin_velocity,
    is_pin_active,
    activate_pin,
    activate_nearby,
    dispose,
  };
}
