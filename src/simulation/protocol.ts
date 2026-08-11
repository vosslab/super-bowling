import type { RackPinCount } from "../config/pin_counts";

export const pin_snapshot_stride = 8;
export const snapshot_x_offset = 0;
export const snapshot_y_offset = 1;
export const snapshot_velocity_x_offset = 2;
export const snapshot_velocity_y_offset = 3;
export const snapshot_state_flag_offset = 4;
export const snapshot_removed_flag_offset = 5;
export const snapshot_in_pit_flag_offset = 6;
/**
 * World-space direction of a fallen capsule's long axis, in radians. Upright
 * pins publish zero because their artwork has no horizontal axis to align.
 */
export const snapshot_fallen_axis_angle_offset = 7;
export const ball_snapshot_stride = 6;
export const ball_snapshot_in_pit_flag_offset = 5;

export type InitializeRequest = { type: "initialize"; pin_count: RackPinCount };
export type ResetRackRequest = { type: "reset_rack"; pin_count: RackPinCount };
export type LaunchRequest = {
  type: "launch";
  power: number;
  start_position: number;
  angle: number;
  spin: number;
};
export type SweepDeadwoodRequest = { type: "sweep_deadwood" };
/** Clears fallen pins and restores a sleeping ball at the foul line for the next aim. */
export type PrepareNextRollRequest = { type: "prepare_next_roll" };
export type PreviewPathRequest = {
  type: "preview_path";
  /** Identifies the exact aim state that requested this asynchronous preview. */
  request_id: number;
  pin_count: RackPinCount;
  power: number;
  start_position: number;
  angle: number;
  spin: number;
};
export type SetPausedRequest = { type: "set_paused"; paused: boolean };
export type DisposeRequest = { type: "dispose" };

export type SimulationRequest =
  | InitializeRequest
  | ResetRackRequest
  | LaunchRequest
  | SweepDeadwoodRequest
  | PrepareNextRollRequest
  | PreviewPathRequest
  | SetPausedRequest
  | DisposeRequest;

// A ready event means the selected rack has been initialized and can receive its first launch.
export type ReadyEvent = { type: "ready"; pin_count: RackPinCount };
export type SnapshotEvent = {
  type: "snapshot";
  simulation_time_ms: number;
  pin_count: RackPinCount;
  standing_pin_count: number;
  fallen_pin_count: number;
  snapshot_data: Float32Array;
};
export type SettledEvent = {
  type: "settled";
  pin_count: RackPinCount;
  standing_pin_count: number;
  fallen_pin_count: number;
  timed_out: boolean;
};
/**
 * A compact summary of collision starts collected during one worker tick.
 * Coordinates are in rack-local world space, with positive y toward the pit.
 */
export type ImpactPathSummary = {
  contact_count: number;
  total_impulse: number;
  maximum_impulse: number;
  centroid_x: number;
  centroid_y: number;
};

/**
 * Standing-to-fallen transitions collected during one worker tick. Speeds are
 * the pin bodies' linear speeds at their real state transition; this is a
 * presentation cue for pin-body/deck weight, not a claimed floor collision.
 */
export type FallTransitionSummary = {
  transition_count: number;
  total_speed: number;
  maximum_speed: number;
  centroid_x: number;
  centroid_y: number;
};

/**
 * One physics-derived presentation window. The worker publishes at most one
 * of these per tick, so consumers never need to react to individual Rapier
 * pairs or state transitions.
 */
export type ImpactEvent = {
  type: "impact";
  simulation_time_ms: number;
  pin_count: RackPinCount;
  first_ball_pin_impact: boolean;
  ball_pin: ImpactPathSummary | undefined;
  pin_pin: ImpactPathSummary | undefined;
  fallen: FallTransitionSummary | undefined;
};
/** Confirms that a same-rack sweep restored the ball and removed deadwood. */
export type SweepCompleteEvent = { type: "sweep_complete"; pin_count: RackPinCount };
export type FatalEvent = { type: "fatal"; message: string };
export type PreviewPathEvent = {
  type: "preview_path";
  /** Echoes PreviewPathRequest.request_id so callers can reject stale paths. */
  request_id: number;
  pin_count: RackPinCount;
  points: Float32Array;
};
export type SimulationEvent =
  | ReadyEvent
  | SnapshotEvent
  | ImpactEvent
  | SettledEvent
  | SweepCompleteEvent
  | PreviewPathEvent
  | FatalEvent;

export type SnapshotPin = {
  x: number;
  y: number;
  velocity_x: number;
  velocity_y: number;
  state_flag: number;
  removed: boolean;
  in_pit: boolean;
  fallen_axis_angle: number;
};

export type SnapshotBall = {
  x: number;
  y: number;
  velocity_x: number;
  velocity_y: number;
  rotation: number;
  in_pit: boolean;
};

export function write_snapshot_pin(data: Float32Array, offset: number, pin: SnapshotPin): void {
  data[offset + snapshot_x_offset] = pin.x;
  data[offset + snapshot_y_offset] = pin.y;
  data[offset + snapshot_velocity_x_offset] = pin.velocity_x;
  data[offset + snapshot_velocity_y_offset] = pin.velocity_y;
  data[offset + snapshot_state_flag_offset] = pin.state_flag;
  data[offset + snapshot_removed_flag_offset] = Number(pin.removed);
  data[offset + snapshot_in_pit_flag_offset] = Number(pin.in_pit);
  data[offset + snapshot_fallen_axis_angle_offset] = pin.fallen_axis_angle;
}

export function read_snapshot_pin(data: Float32Array, offset: number): SnapshotPin {
  if (offset < 0 || offset + pin_snapshot_stride > data.length) {
    throw new Error("Snapshot pin offset is outside the declared stride.");
  }
  const x = data[offset + snapshot_x_offset];
  const y = data[offset + snapshot_y_offset];
  const velocity_x = data[offset + snapshot_velocity_x_offset];
  const velocity_y = data[offset + snapshot_velocity_y_offset];
  const state_flag = data[offset + snapshot_state_flag_offset];
  const removed_flag = data[offset + snapshot_removed_flag_offset];
  const in_pit_flag = data[offset + snapshot_in_pit_flag_offset];
  const fallen_axis_angle = data[offset + snapshot_fallen_axis_angle_offset];
  if (
    x === undefined ||
    y === undefined ||
    velocity_x === undefined ||
    velocity_y === undefined ||
    state_flag === undefined ||
    removed_flag === undefined ||
    in_pit_flag === undefined ||
    fallen_axis_angle === undefined
  ) {
    throw new Error("Snapshot pin is incomplete.");
  }
  const pin = {
    x,
    y,
    velocity_x,
    velocity_y,
    state_flag,
    removed: removed_flag !== 0,
    in_pit: in_pit_flag !== 0,
    fallen_axis_angle,
  };
  return pin;
}

export function write_snapshot_ball(data: Float32Array, offset: number, ball: SnapshotBall): void {
  data[offset + snapshot_x_offset] = ball.x;
  data[offset + snapshot_y_offset] = ball.y;
  data[offset + snapshot_velocity_x_offset] = ball.velocity_x;
  data[offset + snapshot_velocity_y_offset] = ball.velocity_y;
  data[offset + snapshot_state_flag_offset] = ball.rotation;
  data[offset + ball_snapshot_in_pit_flag_offset] = Number(ball.in_pit);
}

export function read_snapshot_ball(data: Float32Array, offset: number): SnapshotBall {
  if (offset < 0 || offset + ball_snapshot_stride > data.length) {
    throw new Error("Snapshot ball offset is outside the declared stride.");
  }
  const x = data[offset + snapshot_x_offset];
  const y = data[offset + snapshot_y_offset];
  const velocity_x = data[offset + snapshot_velocity_x_offset];
  const velocity_y = data[offset + snapshot_velocity_y_offset];
  const rotation = data[offset + snapshot_state_flag_offset];
  const in_pit_flag = data[offset + ball_snapshot_in_pit_flag_offset];
  if (
    x === undefined ||
    y === undefined ||
    velocity_x === undefined ||
    velocity_y === undefined ||
    rotation === undefined ||
    in_pit_flag === undefined
  ) {
    throw new Error("Snapshot ball is incomplete.");
  }
  return { x, y, velocity_x, velocity_y, rotation, in_pit: in_pit_flag !== 0 };
}
