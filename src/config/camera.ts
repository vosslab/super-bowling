import { rack_row_count } from "./lane";
import type { RackPinCount } from "./pin_counts";

/**
 * Canvas-relative presentation controls for the fixed Super Bowling camera.
 * They change neither the lane nor the simulation; every drawn lane/body point
 * goes through the same rational depth scale in the renderer.
 */
export const camera_config = {
  /**
   * Presentation-only space behind the foul line. The simulation launches at
   * y=0; this compact apron gives the player room to stage the ball without
   * letting inactive foreground dominate the regulation lane.
   */
  launch_platform_depth: 3,
  /** Ball position from the foul line (0) toward the platform foot (1). */
  aiming_ball_platform_fraction: 0.55,
  /** Visual hierarchy budget verified across every supported rack. */
  maximum_launch_platform_screen_fraction: 0.12,
  lane_back_padding: 2,
  horizontal_padding: 0.35,
  horizon_fraction: 0.08,
  /**
   * The framing solver may put the one-point horizon above the canvas.  This
   * deliberately wide but finite interval accommodates the long 990-pin deck
   * while retaining a bounded, inspectable perspective transform.
   */
  bakeoff_horizon_fraction: { minimum: -2.5, maximum: 0.4 },
  /** Complete-rack crown composition target. */
  bakeoff_rack_top_fraction: 0.04,
  near_rail_half_width_fraction: 0.475,
  near_lane_y_fraction: 0.99,
  // Measured in lane-depth world units. A larger value makes the deck denser.
  depth_distance: 24,
} as const;

/** Ordered 105-pin bakeoff candidates, from densest to most open. */
export const camera_candidates = ["dense", "balanced", "open"] as const;

export type CameraCandidate = (typeof camera_candidates)[number];

/** Independently selected 10%-showing / 90%-overlap shipped composition. */
export const default_camera_candidate: CameraCandidate = "open";

export type CameraComposition = {
  candidate: CameraCandidate;
  /** One-point depth denominator, in world lane units. */
  depth_distance: number;
  /** Desired visible portion of a rear pin above the row in front. */
  target_reveal_fraction: number;
};

/**
 * Candidate intent is data, rather than a label or an unexplained multiplier.
 * The renderer measures these targets from actual projected 105-pin rows and
 * solves its bounded world-space deck exaggeration accordingly.
 */
export const camera_candidate_profiles: Readonly<
  Record<CameraCandidate, { target_reveal_fraction: number }>
> = {
  dense: { target_reveal_fraction: 0.03 },
  balanced: { target_reveal_fraction: 0.06 },
  open: { target_reveal_fraction: 0.1 },
};

/**
 * These are bounded bakeoff hypotheses, not rendering assertions. Visual
 * captures determined the observed pin reveal and selected the open candidate
 * as the shipped starting composition.
 */
export function get_camera_composition(
  pin_count: RackPinCount,
  candidate: CameraCandidate = default_camera_candidate,
): CameraComposition {
  // Wider physical lanes receive a longer denominator so their deep triangle
  // stays layered and legible rather than collapsing into a tiny distant grid.
  const mode_depth_distance = Math.max(
    36,
    rack_row_count(pin_count) * 4,
    camera_config.depth_distance,
  );
  return {
    candidate,
    // Candidate variation is solved exclusively from its measured row-reveal
    // target below. Keeping the camera denominator mode-derived avoids hidden
    // candidate-specific perspective changes.
    depth_distance: mode_depth_distance,
    target_reveal_fraction: camera_candidate_profiles[candidate].target_reveal_fraction,
  };
}
