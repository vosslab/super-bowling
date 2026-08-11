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
   * A roll pushes the shared projection toward the deck. The complete 990-pin
   * field retains a deliberate minimum push: reducing the move in direct
   * proportion to rack count made its camera motion effectively invisible.
   */
  ten_pin_shot_zoom: 1.36,
  large_rack_minimum_shot_zoom: 1.2,
  shot_zoom_start_progress: 0.14,
  shot_zoom_full_progress: 0.84,
  shot_zoom_focus_y_fraction: 0.12,
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
