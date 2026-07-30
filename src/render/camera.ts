import { camera_config } from "../config/camera";
import type { RackPinCount } from "../config/pin_counts";
import { create_rack } from "../simulation/rack";
import type { CameraMode, CameraState, RackBounds } from "./contracts";

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

export function select_camera_mode(ball_y: number, reduced_motion: boolean): CameraMode {
  if (reduced_motion) return "lane";
  return ball_y >= camera_config.deck_trigger_y ? "deck" : "lane";
}

export function create_camera_state(
  pin_count: RackPinCount,
  ball_y: number,
  reduced_motion: boolean,
): CameraState {
  const state: CameraState = {
    mode: select_camera_mode(ball_y, reduced_motion),
    rack_bounds: create_rack_bounds(pin_count),
  };
  return state;
}

/** Preserves rack bounds while updating only the selected stable camera mode. */
export function with_camera_mode(
  camera: CameraState,
  ball_y: number,
  reduced_motion: boolean,
): CameraState {
  const mode = reduced_motion
    ? "lane"
    : camera.mode === "deck"
      ? "deck"
      : select_camera_mode(ball_y, false);
  const state: CameraState = {
    mode,
    rack_bounds: camera.rack_bounds,
  };
  return state;
}

/** Starts a roll in the stable lane composition while retaining immutable rack bounds. */
export function reset_camera_for_roll(camera: CameraState): CameraState {
  const state: CameraState = {
    mode: "lane",
    rack_bounds: camera.rack_bounds,
  };
  return state;
}
