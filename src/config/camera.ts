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
  horizon_fraction_bounds: { minimum: -2.5, maximum: 0.4 },
  /** Complete-rack crown composition target. */
  rack_top_fraction: 0.04,
  /** Desired visible portion of each pin row behind the row in front. */
  rack_row_reveal_fraction: 0.1,
  /**
   * A roll holds the complete rack in a calm establishing frame until the
   * ball is visibly committed to the deck, then makes the collision occupy
   * materially more screen space. The 990-pin field intentionally receives
   * the largest push: a count-proportional 1.2x adjustment was imperceptible
   * against that rack's already broad framing.
   */
  ten_pin_shot_zoom: 1.5,
  /**
   * The 990-pin collision is a deliberately cropped impact shot. The early
   * lane view establishes the complete field; this close ceiling then makes
   * the central collision corridor fill the frame before the ball reaches it.
   */
  large_rack_impact_zoom: 5,
  /** The ten-pin result stays close enough to support its lane celebration. */
  ten_pin_result_zoom: 1.36,
  /** The settled-result shot restores enough of the huge field to read it. */
  large_rack_result_zoom: 1.61,
  /** A short visual ease avoids a cut from impact hold into the result composition. */
  result_camera_transition_ms: 560,
  shot_zoom_start_progress: 0.44,
  /** Maximum impact scale arrives only once the ball and local entry field can share the frame. */
  shot_zoom_full_progress: 0.98,
  /** The close view starts panning only after the calm establishing approach. */
  shot_focus_start_progress: 0.5,
  /** The bounded camera catches up with the ball before it reaches the deck. */
  shot_focus_full_progress: 0.82,
  /** Extra rack extent used by the normalized focus-bound projection. */
  shot_focus_edge_context: 0.8,
  /** Keep an actual edge/gutter ball away from the canvas edge at close zoom. */
  shot_focus_subject_margin_fraction: 0.06,
  /** The close shot temporarily raises its projection anchor while the ball is still separated from the deck. */
  shot_vertical_focus_start_progress: 0.54,
  /** Peak vertical relief keeps the moving ball in a lower safe band before entry. */
  shot_vertical_focus_peak_progress: 0.76,
  /** The projection returns to the deck anchor before physical first contact. */
  shot_vertical_focus_release_progress: 0.98,
  /** Bounded extra screen anchor for the ball-plus-entry corridor composition. */
  shot_vertical_focus_relief_fraction: 0.13,
  /**
   * First contact returns to the stable deck anchor. A deeper real contact is
   * already drawn higher by perspective; moving the anchor downward would
   * compound that projection and push the ball below the frame.
   */
  shot_vertical_impact_focus_fraction: 0.04,
  shot_zoom_focus_y_fraction: 0.08,
  near_rail_half_width_fraction: 0.475,
  near_lane_y_fraction: 0.99,
  // Measured in lane-depth world units. A larger value makes the deck denser.
  depth_distance: 24,
} as const;

export type CameraComposition = {
  /** One-point depth denominator, in world lane units. */
  depth_distance: number;
  /** Desired visible portion of a rear pin above the row in front. */
  target_reveal_fraction: number;
};

/** Returns the single shipped composition for an authoritative complete rack. */
export function get_camera_composition(pin_count: RackPinCount): CameraComposition {
  // Wider physical lanes receive a longer denominator so their deep triangle
  // stays layered and legible rather than collapsing into a tiny distant grid.
  const mode_depth_distance = Math.max(
    36,
    rack_row_count(pin_count) * 4,
    camera_config.depth_distance,
  );
  return {
    depth_distance: mode_depth_distance,
    target_reveal_fraction: camera_config.rack_row_reveal_fraction,
  };
}
