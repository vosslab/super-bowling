import {
  camera_candidates,
  default_camera_candidate,
  get_camera_composition,
  type CameraCandidate,
} from "../config/camera";
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

/**
 * Reads a bakeoff candidate only from the dedicated visual-capture fixture.
 * Normal games deliberately ignore this query so their camera stays fixed.
 */
export function parse_camera_candidate_search(search: string): CameraCandidate | undefined {
  const parameters = new URLSearchParams(search);
  if (parameters.get("fixture") !== "camera_deck") return undefined;
  const candidate = parameters.get("camera_candidate");
  return camera_candidates.find((value) => value === candidate);
}

/**
 * Resolves the capture-only URL override without assuming a browser exists.
 * This remains a default: an explicit create_camera_state candidate wins.
 */
export function resolve_default_camera_candidate(): CameraCandidate {
  if (typeof window === "undefined") return default_camera_candidate;
  return parse_camera_candidate_search(window.location.search) ?? default_camera_candidate;
}

export function create_camera_state(
  pin_count: RackPinCount,
  reduced_motion: boolean,
  candidate?: CameraCandidate,
): CameraState {
  return {
    rack_bounds: create_rack_bounds(pin_count),
    shot_progress: 0,
    reduced_motion,
    candidate: candidate ?? resolve_default_camera_candidate(),
  };
}

export function get_camera_depth_distance(camera: CameraState): number {
  return get_camera_composition(camera.rack_bounds.pin_count, camera.candidate).depth_distance;
}

/** Records travel for UI state only; projection and horizon remain fixed. */
export function advance_camera_for_ball(
  camera: CameraState,
  ball_y: number,
  reduced_motion: boolean,
): CameraState {
  if (reduced_motion) return { ...camera, shot_progress: 0, reduced_motion: true };
  const head_pin_y = Math.max(camera.rack_bounds.front, 0.001);
  const sampled_progress = Math.min(1, Math.max(0, ball_y / head_pin_y));
  return {
    ...camera,
    shot_progress: Math.max(camera.shot_progress, sampled_progress),
    reduced_motion: false,
  };
}

export function reset_camera_for_roll(camera: CameraState): CameraState {
  return { ...camera, shot_progress: 0 };
}

export function with_reduced_motion(camera: CameraState, reduced_motion: boolean): CameraState {
  return { ...camera, shot_progress: reduced_motion ? 0 : camera.shot_progress, reduced_motion };
}
