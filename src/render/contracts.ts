import type { BallDesign } from "../designer/ball_design";
import type { RackPinCount } from "../config/pin_counts";

export type LaneCamera = {
  center_x: number;
  center_y: number;
  zoom: number;
};

export type BallRenderState = {
  design: BallDesign;
  x: number;
  y: number;
  roll_angle: number;
};

export type RackBounds = {
  left: number;
  right: number;
  front: number;
  back: number;
  pin_count: RackPinCount;
};

export type CameraState = {
  rack_bounds: RackBounds;
  /** 0 at the foul line, 1 at the head pin; never decreases during a roll. */
  shot_progress: number;
  /** Mild centered faux-3D zoom derived from shot_progress. */
  zoom: number;
  reduced_motion: boolean;
};

export type RenderSnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};
