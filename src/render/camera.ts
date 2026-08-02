import { camera_config } from "../config/camera";
import type { RackPinCount } from "../config/pin_counts";
import { create_rack } from "../simulation/rack";
import type { CameraState, RackBounds } from "./contracts";

function create_bounds_from_rack(pin_count: RackPinCount): RackBounds {
  const rack = create_rack(pin_count);
  return {
    left: rack.bounds.min_x,
    right: rack.bounds.max_x,
    front: rack.bounds.min_y,
    back: rack.bounds.max_y,
    pin_count,
  };
}

/**
 * Creates the immutable framing input at rack creation time. The result stays
 * attached to a match while snapshots move individual pins through a cascade.
 */
export function create_rack_bounds(pin_count: RackPinCount): RackBounds {
  return create_bounds_from_rack(pin_count);
}

export function create_camera_state(pin_count: RackPinCount, reduced_motion: boolean): CameraState {
  const rack_bounds = create_rack_bounds(pin_count);
  return { rack_bounds, shot_progress: 0, zoom: 0, reduced_motion };
}

/**
 * Advances the one centered shot framing from physical ball travel. The max
 * makes the zoom monotonic even if pin impact briefly sends the ball back.
 */
export function advance_camera_for_ball(
  camera: CameraState,
  ball_y: number,
  reduced_motion: boolean,
): CameraState {
  if (reduced_motion) {
    return { rack_bounds: camera.rack_bounds, shot_progress: 0, zoom: 0, reduced_motion: true };
  }
  const head_pin_y = Math.max(camera.rack_bounds.front, 0.001);
  const sampled_progress = Math.min(1, Math.max(0, ball_y / head_pin_y));
  const shot_progress = Math.max(camera.shot_progress, sampled_progress);
  return {
    rack_bounds: camera.rack_bounds,
    shot_progress,
    zoom: shot_progress * camera_config.maximum_shot_zoom,
    reduced_motion: false,
  };
}

/** Restores the identical full-lane aiming composition for every fresh roll. */
export function reset_camera_for_roll(camera: CameraState): CameraState {
  return {
    rack_bounds: camera.rack_bounds,
    shot_progress: 0,
    zoom: 0,
    reduced_motion: camera.reduced_motion,
  };
}

/** Applies the accessibility setting without changing the centered composition. */
export function with_reduced_motion(camera: CameraState, reduced_motion: boolean): CameraState {
  if (reduced_motion) {
    return { rack_bounds: camera.rack_bounds, shot_progress: 0, zoom: 0, reduced_motion: true };
  }
  return {
    rack_bounds: camera.rack_bounds,
    shot_progress: camera.reduced_motion ? 0 : camera.shot_progress,
    zoom: camera.reduced_motion ? 0 : camera.zoom,
    reduced_motion: false,
  };
}
