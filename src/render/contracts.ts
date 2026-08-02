import type { CameraCandidate } from "../config/camera";
import type { BallDesign } from "../designer/ball_design";
import type { RackPinCount } from "../config/pin_counts";

export type LaneCamera = { center_x: number; center_y: number; zoom: number };

export type BallRenderState = { design: BallDesign; x: number; y: number; roll_angle: number };

export type RackBounds = {
  left: number;
  right: number;
  front: number;
  back: number;
  pin_count: RackPinCount;
};

export type CameraState = {
  rack_bounds: RackBounds;
  /** Monotonic travel metadata; it never changes the fixed composition. */
  shot_progress: number;
  reduced_motion: boolean;
  /** Capture-safe bounded bakeoff profile, defaulting to the dense middle sample. */
  candidate: CameraCandidate;
};

export type RenderSnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};
