import { camera_config } from "../config/camera";
import { advance_camera_result, get_camera_zoom, show_camera_result } from "./camera";
import type { CameraResultFrame, CameraState } from "./contracts";
import { create_game_draw_commands } from "./game_renderer";
import { get_pin_screen_bounds, type PinScreenBounds } from "./pins";
import { create_camera_projection } from "./camera_projection";
import { project_world_point } from "./projection";

function combine_bounds(bounds: readonly PinScreenBounds[]): PinScreenBounds {
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    right: Math.max(...bounds.map((item) => item.right)),
    top: Math.min(...bounds.map((item) => item.top)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

function create_neutral_result_camera(camera: CameraState): CameraState {
  const neutral_frame: CameraResultFrame = {
    focus_x: 0,
    focus_y_fraction: 0.5,
    zoom: 1,
  };
  const result_camera = show_camera_result(camera, neutral_frame);
  return advance_camera_result(result_camera, 1);
}

function get_preferred_result_zoom(camera: CameraState): number {
  const default_result = advance_camera_result(show_camera_result(camera), 1);
  return get_camera_zoom(default_result);
}

function get_result_focus_x(
  camera: CameraState,
  content_center_x: number,
  width: number,
  height: number,
): number {
  const projection = create_camera_projection(create_neutral_result_camera(camera), width, height);
  const head_center = project_world_point(projection, {
    x: 0,
    y: camera.rack_bounds.front,
    z: 0,
  });
  const head_unit = project_world_point(projection, {
    x: 1,
    y: camera.rack_bounds.front,
    z: 0,
  });
  if (head_center === undefined || head_unit === undefined) {
    throw new Error("Result camera requires a finite head-pin projection.");
  }
  const focus_scale = head_unit.x - head_center.x;
  if (!Number.isFinite(focus_scale) || focus_scale <= 0) {
    throw new Error("Result camera requires a positive lateral focus scale.");
  }
  return (content_center_x - width / 2) / focus_scale;
}

function get_result_focus_y_fraction(
  content_center_y: number,
  height: number,
  result_zoom: number,
): number {
  if (
    !Number.isFinite(content_center_y) ||
    !Number.isFinite(result_zoom) ||
    result_zoom <= 0 ||
    Math.abs(result_zoom - 1) < Number.EPSILON
  ) {
    return 0.5;
  }
  // Solve C' = Z*C + (1-Z)*F for the anchor F that puts the fitted
  // footprint center C' at mid-canvas after applying result zoom Z.
  return (result_zoom * content_center_y - height / 2) / (height * (result_zoom - 1));
}

/**
 * Starts the settled transition toward the largest frame that retains every
 * visible fallen-pin sprite. The authoritative terminal snapshot supplies the
 * footprint; the result camera never estimates scatter from the rack size.
 */
export function frame_camera_result(
  camera: CameraState,
  settled_snapshot: Float32Array,
  width: number,
  height: number,
): CameraState {
  const neutral_camera = create_neutral_result_camera(camera);
  const commands = create_game_draw_commands(
    settled_snapshot,
    settled_snapshot,
    camera.rack_bounds.pin_count,
    1,
    width,
    height,
    undefined,
    neutral_camera,
  );
  const fallen_bounds: PinScreenBounds[] = [];
  for (const command of commands) {
    if (command.kind === "fallen_pin") fallen_bounds.push(get_pin_screen_bounds(command));
  }
  if (fallen_bounds.length === 0) return show_camera_result(camera);

  const content_bounds = combine_bounds(fallen_bounds);
  const content_width = Math.max(1, content_bounds.right - content_bounds.left);
  const content_height = Math.max(1, content_bounds.bottom - content_bounds.top);
  const padding = camera_config.result_pin_screen_padding_fraction;
  const available_width = width * (1 - padding * 2);
  const available_height = height * (1 - padding * 2);
  const fit_zoom = Math.min(available_width / content_width, available_height / content_height);
  const result_zoom = Math.min(get_preferred_result_zoom(camera), fit_zoom);
  const content_center_y = (content_bounds.top + content_bounds.bottom) / 2;
  const result_frame: CameraResultFrame = {
    focus_x: get_result_focus_x(
      camera,
      (content_bounds.left + content_bounds.right) / 2,
      width,
      height,
    ),
    focus_y_fraction: get_result_focus_y_fraction(content_center_y, height, result_zoom),
    zoom: result_zoom,
  };
  return show_camera_result(camera, result_frame);
}
