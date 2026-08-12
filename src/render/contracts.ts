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

export type CameraResultFrame = {
  /** World-space lateral focus that centers the settled fallen-pin footprint. */
  focus_x: number;
  /** Screen-space zoom anchor through the center of the fallen-pin footprint. */
  focus_y_fraction: number;
  /** Preferred or fitted result scale that keeps every visible fallen pin on screen. */
  zoom: number;
};

export type CameraState = {
  rack_bounds: RackBounds;
  /** Monotonic physical travel that drives the deck-focused shot projection. */
  shot_progress: number;
  /** Monotonic rolling scale, retained independently of later corridor samples. */
  rolling_zoom: number;
  /** Stable world-space corridor that the close deck composition centers. */
  focus_x: number;
  /** Actual ball or first-contact lateral coordinate used to bound close-shot scale. */
  focus_subject_x: number;
  /** Furthest live ball depth used for monotonic forward camera motion. */
  focus_y: number;
  /** Actual ball or first-contact depth used to bound the close-shot scale. */
  focus_subject_y: number;
  /** The first physical rack contact freezes the approach corridor through the cascade. */
  focus_latched: boolean;
  /** The result composition begins only after the authoritative settled event. */
  shot_phase: "rolling" | "result";
  /** Presentation-only progress from the held impact composition to the result view. */
  result_transition_progress: number;
  /** Snapshot-derived result target; undefined retains the mode's default result frame. */
  result_frame: CameraResultFrame | undefined;
};

export type RenderSnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};
