import { camera_config, get_camera_composition } from "../config/camera";
import { gutter_width, lane_width } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { create_rack } from "../simulation/rack";
import type { CameraState, RackBounds } from "./contracts";

function create_bounds_from_rack(pin_count: RackPinCount): RackBounds {
  const rack = create_rack(pin_count);
  const select_entry = (direction: -1 | 1): (typeof rack.slots)[number] =>
    rack.slots
      .filter((slot) => direction * slot.x > 0)
      .reduce((selected, slot) => (slot.y < selected.y ? slot : selected));
  const left_entry = select_entry(-1);
  const right_entry = select_entry(1);
  return {
    left: rack.bounds.min_x,
    right: rack.bounds.max_x,
    front: rack.bounds.min_y,
    back: rack.bounds.max_y,
    left_entry: { x: left_entry.x, y: left_entry.y },
    right_entry: { x: right_entry.x, y: right_entry.y },
    pin_count,
  };
}

/** Immutable rack framing used to bound the camera around the active ball corridor. */
export function create_rack_bounds(pin_count: RackPinCount): RackBounds {
  return create_bounds_from_rack(pin_count);
}

/** Creates the normal-motion camera state. */
export function create_camera_state(pin_count: RackPinCount): CameraState {
  return {
    rack_bounds: create_rack_bounds(pin_count),
    shot_progress: 0,
    focus_x: 0,
    focus_subject_x: 0,
    focus_y: 0,
    focus_latched: false,
    shot_phase: "rolling",
    result_transition_progress: 0,
  };
}

export function get_camera_depth_distance(camera: CameraState): number {
  return get_camera_composition(camera.rack_bounds.pin_count).depth_distance;
}

type FocusInterval = { minimum: number; maximum: number };

function get_depth_scale(camera: CameraState, y: number): number {
  const depth_distance = get_camera_depth_distance(camera);
  const depth = depth_distance + y + camera_config.launch_platform_depth;
  return Number.isFinite(depth) && depth > 0 ? depth_distance / depth : 1;
}

function intersect_focus_intervals(first: FocusInterval, second: FocusInterval): FocusInterval {
  const minimum = Math.max(first.minimum, second.minimum);
  const maximum = Math.min(first.maximum, second.maximum);
  return minimum <= maximum ? { minimum, maximum } : first;
}

function get_projected_focus_interval(
  camera: CameraState,
  point_x: number,
  point_y: number,
  screen_margin_fraction: number,
): FocusInterval {
  const full_half_width = lane_width(camera.rack_bounds.pin_count) / 2 + gutter_width;
  const zoom = get_camera_zoom(camera);
  const horizontal_scale = (camera_config.near_rail_half_width_fraction / full_half_width) * zoom;
  const focus_scale = get_depth_scale(camera, camera.rack_bounds.front);
  const point_scale = get_depth_scale(camera, point_y);
  if (!Number.isFinite(point_x) || !Number.isFinite(horizontal_scale) || horizontal_scale <= 0)
    return { minimum: 0, maximum: 0 };
  const visible_half_width = (0.5 - screen_margin_fraction) / horizontal_scale;
  const projected_center = point_x * point_scale;
  return {
    minimum: (projected_center - visible_half_width) / focus_scale,
    maximum: (projected_center + visible_half_width) / focus_scale,
  };
}

function get_entry_side_rack_point(
  camera: CameraState,
  subject_x: number,
): { x: number; y: number } {
  return subject_x < 0 ? camera.rack_bounds.left_entry : camera.rack_bounds.right_entry;
}

/**
 * Bounds focus in the same normalized perspective used by the renderer. The
 * active ball keeps a small screen-safe margin and the nearest edge pin stays
 * on screen, so a gutter corridor is composed as an edge event rather than
 * silently pulled back toward the head pin.
 */
function clamp_focus_x(camera: CameraState, x: number, subject_y: number): number {
  const subject_x = Number.isFinite(x) ? x : 0;
  const ball_interval = get_projected_focus_interval(
    camera,
    subject_x,
    subject_y,
    camera_config.shot_focus_subject_margin_fraction,
  );
  const entry_pin = get_entry_side_rack_point(camera, subject_x);
  const entry_interval = get_projected_focus_interval(camera, entry_pin.x, entry_pin.y, 0);
  const bounds = intersect_focus_intervals(ball_interval, entry_interval);
  return Math.min(bounds.maximum, Math.max(bounds.minimum, subject_x));
}

function get_focus_progress(camera: CameraState): number {
  const range = camera_config.shot_focus_full_progress - camera_config.shot_focus_start_progress;
  return smoothstep((camera.shot_progress - camera_config.shot_focus_start_progress) / range);
}

/** Computes the one shared perspective horizon after the close shot biases to its corridor. */
export function get_camera_horizon_x(
  camera: CameraState,
  width: number,
  full_half_width: number,
): number {
  const presentation_zoom = get_camera_zoom(camera);
  const depth_distance = get_camera_depth_distance(camera);
  const head_pin_y = camera.rack_bounds.front;
  const pixels_per_world_unit =
    ((width * camera_config.near_rail_half_width_fraction) / full_half_width) * presentation_zoom;
  const depth_scale =
    depth_distance / (depth_distance + head_pin_y + camera_config.launch_platform_depth);
  return width / 2 - get_camera_focus_x(camera) * pixels_per_world_unit * depth_scale;
}

function smoothstep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Returns the rendered corridor; result progress eases the held focus back to neutral. */
export function get_camera_focus_x(camera: CameraState): number {
  if (camera.shot_phase !== "result") return camera.focus_x;
  return camera.focus_x * (1 - smoothstep(camera.result_transition_progress));
}

function get_vertical_focus_relief(progress: number): number {
  const rising = smoothstep(
    (progress - camera_config.shot_vertical_focus_start_progress) /
      (camera_config.shot_vertical_focus_peak_progress -
        camera_config.shot_vertical_focus_start_progress),
  );
  const releasing = smoothstep(
    (progress - camera_config.shot_vertical_focus_peak_progress) /
      (camera_config.shot_vertical_focus_release_progress -
        camera_config.shot_vertical_focus_peak_progress),
  );
  return rising * (1 - releasing);
}

/**
 * Returns the bounded screen-space zoom anchor for the live ball-plus-deck
 * composition. The anchor is state-derived rather than recursively smoothed,
 * so equal worker snapshots retain the same framing at every draw cadence.
 */
export function get_camera_focus_y_fraction(camera: CameraState): number {
  const head_pin_y = Math.max(camera.rack_bounds.front, 0.001);
  const focused_progress = Math.min(1, Math.max(0, camera.focus_y / head_pin_y));
  const large_rack_weight = get_large_rack_weight(camera.rack_bounds.pin_count);
  const rack_relief =
    camera_config.shot_vertical_focus_relief_fraction * large_rack_weight * large_rack_weight;
  const approach_fraction =
    camera_config.shot_zoom_focus_y_fraction +
    rack_relief * get_vertical_focus_relief(focused_progress);
  // The close deck projection has a natural depth lift: a real deeper impact
  // already moves upward on screen. Keep its common anchor instead of adding
  // a second depth shift that can crop the ball at the bottom edge.
  const bounded_fraction = camera.focus_latched
    ? camera_config.shot_vertical_impact_focus_fraction
    : approach_fraction;
  if (camera.shot_phase !== "result") return bounded_fraction;
  const transition = smoothstep(camera.result_transition_progress);
  return (
    bounded_fraction + (camera_config.shot_zoom_focus_y_fraction - bounded_fraction) * transition
  );
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

function get_corridor_zoom_limit(camera: CameraState): number {
  if (camera.shot_progress < camera_config.shot_focus_start_progress)
    return Number.POSITIVE_INFINITY;
  const subject_x = camera.focus_subject_x;
  const subject_y = camera.focus_y;
  if (!Number.isFinite(subject_x) || !Number.isFinite(subject_y)) return Number.POSITIVE_INFINITY;
  const entry = get_entry_side_rack_point(camera, subject_x);
  const full_half_width = lane_width(camera.rack_bounds.pin_count) / 2 + gutter_width;
  const transformed_span = Math.abs(
    subject_x * get_depth_scale(camera, subject_y) - entry.x * get_depth_scale(camera, entry.y),
  );
  const unzoomed_span_fraction =
    (camera_config.near_rail_half_width_fraction / full_half_width) * transformed_span;
  if (!Number.isFinite(unzoomed_span_fraction) || unzoomed_span_fraction <= 0)
    return Number.POSITIVE_INFINITY;
  const available_fraction = 1 - 2 * camera_config.shot_focus_subject_margin_fraction;
  return Math.max(1, available_fraction / unzoomed_span_fraction);
}

/** Returns the shared projection scale for the ball's physical lane progress. */
export function get_camera_zoom(camera: CameraState): number {
  const impact_zoom = get_rolling_camera_zoom(camera);
  const held_zoom = Math.min(impact_zoom, get_corridor_zoom_limit(camera));
  if (camera.shot_phase === "result") {
    const result_zoom = get_mode_result_zoom(camera.rack_bounds.pin_count);
    const transition = smoothstep(camera.result_transition_progress);
    return held_zoom + (result_zoom - held_zoom) * transition;
  }
  return held_zoom;
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
export function advance_camera_for_ball(
  camera: CameraState,
  ball_y: number,
  ball_x = 0,
): CameraState {
  const head_pin_y = Math.max(camera.rack_bounds.front, 0.001);
  const sampled_progress = Math.min(1, Math.max(0, ball_y / head_pin_y));
  const shot_progress = Math.max(camera.shot_progress, sampled_progress);
  const progressed_camera = { ...camera, shot_progress };
  if (camera.focus_latched) return progressed_camera;
  const focus_progress = get_focus_progress(progressed_camera);
  const target_x = Number.isFinite(ball_x) ? ball_x : 0;
  const target_y = Number.isFinite(ball_y) ? ball_y : 0;
  const subject_camera = {
    ...progressed_camera,
    focus_subject_x: target_x,
    focus_y: target_y,
  };
  return {
    ...subject_camera,
    focus_x: clamp_focus_x(subject_camera, target_x * focus_progress, target_y),
  };
}

/** Holds the real first-contact corridor while secondary impacts propagate around it. */
export function latch_camera_impact(
  camera: CameraState,
  impact_x: number,
  impact_y = camera.rack_bounds.front,
): CameraState {
  if (camera.focus_latched) return camera;
  const subject_x = Number.isFinite(impact_x) ? impact_x : 0;
  const subject_y = Number.isFinite(impact_y) ? impact_y : camera.rack_bounds.front;
  const subject_camera = {
    ...camera,
    focus_subject_x: subject_x,
    focus_y: subject_y,
  };
  return {
    ...subject_camera,
    focus_x: clamp_focus_x(subject_camera, subject_x, subject_y),
    focus_latched: true,
  };
}

export function reset_camera_for_roll(camera: CameraState): CameraState {
  return {
    ...camera,
    shot_progress: 0,
    focus_x: 0,
    focus_subject_x: 0,
    focus_y: 0,
    focus_latched: false,
    shot_phase: "rolling",
    result_transition_progress: 0,
  };
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
    ? {
        ...camera,
        shot_progress: 0,
        focus_x: 0,
        focus_subject_x: 0,
        focus_y: 0,
        focus_latched: false,
        shot_phase: "rolling",
        result_transition_progress: 0,
      }
    : camera;
}
