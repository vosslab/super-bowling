import type { BallDesign } from "../designer/ball_design";
import type { RackPinCount } from "../config/pin_counts";

export type LaneCamera = { center_x: number; center_y: number; zoom: number };

export type BallRenderState = { design: BallDesign; x: number; y: number; roll_angle: number };

export type RackBounds = {
  left: number;
  right: number;
  front: number;
  back: number;
  /** Extreme physical rack slots retained as edge-composition context. */
  left_entry: { x: number; y: number };
  right_entry: { x: number; y: number };
  pin_count: RackPinCount;
};

export type CameraState = {
  rack_bounds: RackBounds;
  /** Monotonic physical travel that drives the deck-focused shot projection. */
  shot_progress: number;
  /** Stable world-space corridor that the close deck composition centers. */
  focus_x: number;
  /** Actual ball or first-contact lateral coordinate used to bound close-shot scale. */
  focus_subject_x: number;
  /** Live ball or first-contact depth used to keep the close shot vertically composed. */
  focus_y: number;
  /** The first physical rack contact freezes the approach corridor through the cascade. */
  focus_latched: boolean;
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
