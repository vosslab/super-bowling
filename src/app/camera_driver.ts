import {
  advance_camera_for_ball,
  hold_camera_collision_zone,
  reset_camera_for_roll,
  set_camera_collision_zone,
} from "../render/camera";
import { create_collision_zone, create_confirmed_collision_zone } from "../render/collision_zone";
import { create_shot_zoom_envelope } from "../render/shot_framing";
import type { CameraState } from "../render/contracts";
import type { ImpactPathSummary } from "../simulation/protocol";

type BallSample = { x: number; y: number };

/**
 * Owns the short-lived worker-preview reference for one shot. CameraState
 * remains the single owner of all presentation state, including the current
 * and held collision zone.
 */
export type CameraDriver = {
  committed_path: Float32Array | undefined;
};

export function create_camera_driver(): CameraDriver {
  return { committed_path: undefined };
}

/**
 * Captures the exact public worker preview already accepted for the committed
 * aim before aiming's asynchronous preview lifecycle clears or replaces it.
 */
export function begin_camera_shot(
  driver: CameraDriver,
  camera: CameraState,
  preview_path: Float32Array | undefined,
): CameraState {
  driver.committed_path = preview_path;
  return reset_camera_for_roll(camera);
}

/** Clears the previous committed path whenever the rack returns to aiming. */
export function reset_camera_driver(driver: CameraDriver, camera: CameraState): CameraState {
  driver.committed_path = undefined;
  return reset_camera_for_roll(camera);
}

function refine_collision_zone(
  driver: CameraDriver,
  camera: CameraState,
  ball: BallSample,
): CameraState {
  if (driver.committed_path === undefined || camera.collision_zone_held) return camera;
  const collision_zone = create_collision_zone({
    rack_bounds: camera.rack_bounds,
    committed_path: driver.committed_path,
    ball,
  });
  return set_camera_collision_zone(
    camera,
    collision_zone,
    create_shot_zoom_envelope(driver.committed_path, ball, collision_zone),
  );
}

/** Advances normal travel and refines uncertainty from an authoritative live ball sample. */
export function advance_camera_driver(
  driver: CameraDriver,
  camera: CameraState,
  ball: BallSample,
): CameraState {
  // Establish the committed world-space journey endpoint before this sample
  // contributes ratcheted progress. Otherwise a sparse first sample at the
  // rack front could permanently saturate against the fallback denominator.
  const refined = refine_collision_zone(driver, camera, ball);
  return advance_camera_for_ball(refined, ball.y, ball.x);
}

/**
 * Ball-pin summaries confirm the local subject. Pin-pin-only cascade windows
 * are deliberately presentation-only and cannot retarget the shot.
 */
export function confirm_camera_impact(
  driver: CameraDriver,
  camera: CameraState,
  ball_pin: ImpactPathSummary | undefined,
): CameraState {
  if (ball_pin === undefined) return camera;
  if (camera.collision_zone_held) return camera;
  const collision_zone = create_confirmed_collision_zone({
    rack_bounds: camera.rack_bounds,
    centroid: { x: ball_pin.centroid_x, y: ball_pin.centroid_y },
  });
  const envelope =
    driver.committed_path === undefined
      ? camera.shot_zoom_envelope
      : create_shot_zoom_envelope(
          driver.committed_path,
          { x: ball_pin.centroid_x, y: ball_pin.centroid_y },
          collision_zone,
        );
  return hold_camera_collision_zone(set_camera_collision_zone(camera, collision_zone, envelope));
}
