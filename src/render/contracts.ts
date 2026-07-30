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

export type CameraMode = "lane" | "deck";

export type CameraState = {
  mode: CameraMode;
  rack_bounds: RackBounds;
};

export type RenderSnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};
