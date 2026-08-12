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

/** A clipped world-space deck neighborhood used by the live shot camera. */
export type CollisionZone = {
  left: number;
  right: number;
  front: number;
  back: number;
  /**
   * World-space trailing edge of the accepted local collision neighborhood.
   * Contacting shots retain travel through this edge so the camera cannot finish
   * its push at the rack front before the measured first-contact region.
   * Edge/no-contact paths use their clipped local deck context, not a made-up
   * ball-pin collision.
   */
  journey_depth: number;
};

/**
 * The committed forward subject that must remain visible while rolling zoom
 * advances.  It combines the still-relevant public-worker path with the
 * accepted local collision zone; it is presentation geometry, never physics.
 */
export type ShotZoomEnvelope = {
  points: ReadonlyArray<{ x: number; y: number }>;
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
  /**
   * The current local deck subject selected from the committed worker path and
   * authoritative live ball samples. Later camera composition owns how it is
   * framed; this state only owns its lifecycle.
   */
  collision_zone: CollisionZone | undefined;
  /** A first authoritative ball-pin impact freezes the zone through the cascade. */
  collision_zone_held: boolean;
  /** Remaining committed path and local collision shell used to cap live zoom. */
  shot_zoom_envelope: ShotZoomEnvelope | undefined;
  /** Monotonic physical travel that drives the deck-focused shot projection. */
  shot_progress: number;
  /** Monotonic rolling scale, retained independently of later corridor samples. */
  rolling_zoom: number;
  /** Stable world-space corridor that the close deck composition centers. */
  focus_x: number;
  /** Furthest live ball depth used for monotonic forward camera motion. */
  focus_y: number;
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
