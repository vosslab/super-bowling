import { camera_config, get_camera_composition } from "../config/camera";
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

/** Immutable rack framing; the camera never follows the ball. */
export function create_rack_bounds(pin_count: RackPinCount): RackBounds {
  return create_bounds_from_rack(pin_count);
}

/** Creates the normal-motion camera state. */
export function create_camera_state(pin_count: RackPinCount): CameraState {
  return {
    rack_bounds: create_rack_bounds(pin_count),
    shot_progress: 0,
    shot_phase: "rolling",
    result_transition_progress: 0,
  };
}

export function get_camera_depth_distance(camera: CameraState): number {
  return get_camera_composition(camera.rack_bounds.pin_count).depth_distance;
}

function smoothstep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function get_large_rack_weight(pin_count: RackPinCount): number {
  const rack_scale = Math.sqrt(10 / pin_count);
  return 1 - rack_scale;
}

function get_mode_impact_zoom_ceiling(pin_count: RackPinCount): number {
  const large_rack_weight = get_large_rack_weight(pin_count);
  return (
    camera_config.ten_pin_shot_zoom +
    (camera_config.large_rack_impact_zoom - camera_config.ten_pin_shot_zoom) * large_rack_weight
  );
}

function get_mode_result_zoom(pin_count: RackPinCount): number {
  const large_rack_weight = get_large_rack_weight(pin_count);
  return (
    camera_config.ten_pin_result_zoom +
    (camera_config.large_rack_result_zoom - camera_config.ten_pin_result_zoom) * large_rack_weight
  );
}

/** Returns the shared projection scale for the ball's physical lane progress. */
export function get_camera_zoom(camera: CameraState): number {
  const impact_zoom = get_rolling_camera_zoom(camera);
  if (camera.shot_phase === "result") {
    const result_zoom = get_mode_result_zoom(camera.rack_bounds.pin_count);
    const transition = smoothstep(camera.result_transition_progress);
    return impact_zoom + (result_zoom - impact_zoom) * transition;
  }
  return impact_zoom;
}

function get_rolling_camera_zoom(camera: CameraState): number {
  const progress_range =
    camera_config.shot_zoom_full_progress - camera_config.shot_zoom_start_progress;
  const zoom_progress =
    (camera.shot_progress - camera_config.shot_zoom_start_progress) / progress_range;
  const maximum_zoom = get_mode_impact_zoom_ceiling(camera.rack_bounds.pin_count);
  return 1 + (maximum_zoom - 1) * smoothstep(zoom_progress);
}

/** Records monotonic physical travel that drives the deck-focused projection. */
export function advance_camera_for_ball(camera: CameraState, ball_y: number): CameraState {
  const head_pin_y = Math.max(camera.rack_bounds.front, 0.001);
  const sampled_progress = Math.min(1, Math.max(0, ball_y / head_pin_y));
  return {
    ...camera,
    shot_progress: Math.max(camera.shot_progress, sampled_progress),
  };
}

export function reset_camera_for_roll(camera: CameraState): CameraState {
  return { ...camera, shot_progress: 0, shot_phase: "rolling", result_transition_progress: 0 };
}

/**
 * Switches from the held impact corridor to the resolving result composition.
 * Call this only after a non-timeout authoritative physics settlement.
 */
export function show_camera_result(camera: CameraState): CameraState {
  return { ...camera, shot_phase: "result", result_transition_progress: 0 };
}

/** Advances a bounded presentation-only result transition after physics has settled. */
export function advance_camera_result(
  camera: CameraState,
  transition_progress: number,
): CameraState {
  if (camera.shot_phase !== "result") return camera;
  return {
    ...camera,
    result_transition_progress: Math.max(
      camera.result_transition_progress,
      Math.min(1, Math.max(0, transition_progress)),
    ),
  };
}

/**
 * Presentation-edge adapter for reduced motion. It returns a neutral camera
 * projection while leaving the normal camera's deterministic travel model
 * independent of accessibility preference.
 */
export function with_reduced_motion(camera: CameraState, reduced_motion: boolean): CameraState {
  return reduced_motion
    ? { ...camera, shot_progress: 0, shot_phase: "rolling", result_transition_progress: 0 }
    : camera;
}
