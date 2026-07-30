import type { RackPinCount } from "../config/pin_counts";

export const pin_snapshot_stride = 5;
export const snapshot_x_offset = 0;
export const snapshot_y_offset = 1;
export const snapshot_velocity_x_offset = 2;
export const snapshot_velocity_y_offset = 3;
export const snapshot_state_flag_offset = 4;
export const ball_snapshot_stride = 5;

export type InitializeRequest = { type: "initialize"; pin_count: RackPinCount };
export type ResetRackRequest = { type: "reset_rack"; pin_count: RackPinCount };
export type LaunchRequest = { type: "launch"; power: number; lateral_offset: number };
export type SteerRequest = { type: "steer"; direction: -1 | 0 | 1 };
export type SetPausedRequest = { type: "set_paused"; paused: boolean };
export type DisposeRequest = { type: "dispose" };

export type SimulationRequest =
  | InitializeRequest
  | ResetRackRequest
  | LaunchRequest
  | SteerRequest
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
export type FatalEvent = { type: "fatal"; message: string };
export type SimulationEvent = ReadyEvent | SnapshotEvent | SettledEvent | FatalEvent;
