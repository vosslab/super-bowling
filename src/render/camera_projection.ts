import { camera_config, get_camera_composition } from "../config/camera";
import { gutter_width, lane_width } from "../config/lane";
import { create_rack } from "../simulation/rack";
import { get_camera_focus_y_fraction, get_camera_horizon_x, get_camera_zoom } from "./camera";
import type { CameraState } from "./contracts";
import type { ShotFramingGeometry } from "./shot_framing";
import {
  create_projection,
  get_aiming_ball_world_y,
  project_world_point,
  solve_deck_exaggeration,
  type CameraProjectionPresentation,
  type LaneProjection,
} from "./projection";

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (values.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function create_presentation(
  camera: CameraState,
  width: number,
  geometry: ShotFramingGeometry | undefined = undefined,
): CameraProjectionPresentation {
  const full_half_width = lane_width(camera.rack_bounds.pin_count) / 2 + gutter_width;
  return {
    focus_y_fraction: get_camera_focus_y_fraction(camera, geometry),
    horizon_x: get_camera_horizon_x(camera, width, full_half_width),
    zoom: get_camera_zoom(camera),
  };
}

/**
 * Composes camera behavior with pure projection algebra for one render frame.
 */
export function create_camera_projection(
  camera: CameraState,
  width = 1600,
  height = 1000,
): LaneProjection {
  if (!Number.isFinite(width) || width <= 0)
    throw new Error("Camera projection requires a finite positive canvas width.");
  if (!Number.isFinite(height) || height <= 0)
    throw new Error("Camera projection requires a finite positive canvas height.");
  const composition = get_camera_composition(camera.rack_bounds.pin_count);
  const depth_distance = composition.depth_distance;
  if (!Number.isFinite(depth_distance) || depth_distance <= 0)
    throw new Error("Camera projection requires a finite positive depth distance.");
  const rack = create_rack(camera.rack_bounds.pin_count);
  const row_y_positions = [...new Set(rack.slots.map((slot) => slot.y))].sort(
    (first, second) => first - second,
  );
  const head_pin_y = row_y_positions[0];
  if (head_pin_y === undefined)
    throw new Error("Camera projection requires a rack head-pin plane.");
  const initial_presentation = create_presentation(camera, width);
  // The established framing solve calibrates the unzoomed lane geometry, then
  // applies the live camera zoom only to the completed presentation.
  const solving_presentation = { ...initial_presentation, zoom: 1 };
  const solved = solve_deck_exaggeration(
    camera,
    width,
    height,
    depth_distance,
    composition.target_reveal_fraction,
    head_pin_y,
    row_y_positions,
    solving_presentation,
  );
  const geometry = {
    height,
    depth_distance,
    near_y: -camera_config.launch_platform_depth,
    head_pin_y,
    depth_exaggeration: solved.depth_exaggeration,
    horizon_fraction: solved.framing.horizon_fraction,
    near_screen_fraction: solved.framing.near_screen_fraction,
  };
  const presentation = create_presentation(camera, width, geometry);
  const projection = create_projection(
    camera,
    width,
    height,
    depth_distance,
    composition.target_reveal_fraction,
    head_pin_y,
    solved.depth_exaggeration,
    solved.framing.horizon_fraction,
    solved.framing.near_screen_fraction,
    presentation,
  );
  const rear_y = row_y_positions[row_y_positions.length - 1];
  if (rear_y === undefined) throw new Error("Camera projection requires a rear rack row.");
  const rear_crown = project_world_point(projection, { x: 0, y: rear_y, z: 1.25 });
  const aiming_ball_bottom = project_world_point(projection, {
    x: 0,
    y: get_aiming_ball_world_y(),
    z: 0,
  });
  const foul_line = project_world_point(projection, { x: 0, y: 0, z: 0 });
  if (rear_crown === undefined || aiming_ball_bottom === undefined || foul_line === undefined)
    throw new Error("Camera projection requires finite framing anchors.");
  const achieved_rack_top_fraction = rear_crown.y / height;
  const achieved_aiming_ball_bottom_fraction = aiming_ball_bottom.y / height;
  const achieved_launch_platform_screen_fraction =
    (projection.near_screen_y - foul_line.y) / height;
  return {
    ...projection,
    camera: {
      ...projection.camera,
      achieved_median_reveal_fraction: median(solved.row_reveal_fractions),
      row_reveal_fractions: solved.row_reveal_fractions,
      calibration_clamped: solved.calibration_clamped,
      calibration_reason: solved.calibration_reason,
      rack_top_target_fraction: camera_config.rack_top_fraction,
      achieved_rack_top_fraction,
      achieved_aiming_ball_bottom_fraction,
      maximum_launch_platform_screen_fraction:
        camera_config.maximum_launch_platform_screen_fraction,
      achieved_launch_platform_screen_fraction,
      occupied_vertical_span_fraction:
        achieved_aiming_ball_bottom_fraction - achieved_rack_top_fraction,
      unused_top_fraction: achieved_rack_top_fraction,
      unused_bottom_fraction: 1 - achieved_aiming_ball_bottom_fraction,
      reveal_residual_fraction:
        median(solved.row_reveal_fractions) - composition.target_reveal_fraction,
      horizon_fraction: solved.framing.horizon_fraction,
      framing_clamped: solved.framing.framing_clamped,
      framing_reason: solved.framing.framing_reason,
      presentation_zoom: presentation.zoom,
      presentation_focus_y_fraction: presentation.focus_y_fraction,
    },
  };
}
