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
  /** Monotonic physical travel that drives the deck-focused shot projection. */
  shot_progress: number;
  /** The result composition begins only after the authoritative settled event. */
  shot_phase: "rolling" | "result";
  /** Presentation-only progress from the held impact composition to the result view. */
  result_transition_progress: number;
};

export type RenderSnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};
