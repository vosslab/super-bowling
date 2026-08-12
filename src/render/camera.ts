import { camera_config, get_camera_composition } from "../config/camera";
import { gutter_width, lane_width } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { create_rack } from "../simulation/rack";
import type {
  CameraResultFrame,
  CameraState,
  CollisionZone,
  RackBounds,
  ShotZoomEnvelope,
} from "./contracts";
import { get_depth_scale } from "./projection";
import {
  get_collision_zone_center,
  get_shot_zoom_envelope_ceiling,
  get_zone_focus_y_fraction,
  type ShotFramingGeometry,
} from "./shot_framing";

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
    collision_zone: undefined,
    collision_zone_held: false,
    shot_zoom_envelope: undefined,
    shot_progress: 0,
    rolling_zoom: 1,
    focus_x: 0,
    focus_y: 0,
    shot_phase: "rolling",
    result_transition_progress: 0,
    result_frame: undefined,
  };
}

/**
 * Stores the current prediction without interpreting it as camera framing.
 * The first ball-pin contact may freeze this local subject; pin-pin cascade
 * summaries deliberately do not redirect a shot that has already entered it.
 */
export function set_camera_collision_zone(
  camera: CameraState,
  collision_zone: CollisionZone,
  shot_zoom_envelope: ShotZoomEnvelope | undefined = camera.shot_zoom_envelope,
): CameraState {
  return camera.collision_zone_held ? camera : { ...camera, collision_zone, shot_zoom_envelope };
}

/** Holds the last authoritative ball-pin-confirmed collision neighborhood. */
export function hold_camera_collision_zone(camera: CameraState): CameraState {
  return camera.collision_zone === undefined ? camera : { ...camera, collision_zone_held: true };
}

export function get_camera_depth_distance(camera: CameraState): number {
  return get_camera_composition(camera.rack_bounds.pin_count).depth_distance;
}

type FocusInterval = { minimum: number; maximum: number };

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
  const head_pin_y = camera.rack_bounds.front;
  const pixels_per_world_unit =
    ((width * camera_config.near_rail_half_width_fraction) / full_half_width) * presentation_zoom;
  const depth_scale = get_depth_scale(camera, head_pin_y);
  return width / 2 - get_camera_focus_x(camera) * pixels_per_world_unit * depth_scale;
}

function smoothstep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Returns the rendered corridor; result progress eases toward its settled content frame. */
export function get_camera_focus_x(camera: CameraState): number {
  if (camera.shot_phase !== "result") return camera.focus_x;
  const target_focus_x = camera.result_frame?.focus_x ?? 0;
  const transition = smoothstep(camera.result_transition_progress);
  return camera.focus_x + (target_focus_x - camera.focus_x) * transition;
}

/**
 * Returns the bounded screen-space zoom anchor for the live ball-plus-deck
 * composition. The anchor is state-derived rather than recursively smoothed,
 * so equal worker snapshots retain the same framing at every draw cadence.
 */
export function get_camera_focus_y_fraction(
  camera: CameraState,
  geometry: ShotFramingGeometry | undefined = undefined,
): number {
  const approach_fraction = get_zone_focus_y_fraction(
    camera.collision_zone,
    camera.shot_progress,
    get_camera_zoom(camera),
    geometry,
  );
  if (camera.shot_phase !== "result") return approach_fraction;
  const transition = smoothstep(camera.result_transition_progress);
  const result_fraction =
    camera.result_frame?.focus_y_fraction ?? camera_config.shot_zoom_focus_y_fraction;
  return approach_fraction + (result_fraction - approach_fraction) * transition;
}

function get_mode_result_zoom(pin_count: RackPinCount): number {
  const large_rack_weight = 1 - Math.sqrt(10 / pin_count);
  return (
    camera_config.ten_pin_result_zoom +
    (camera_config.large_rack_result_zoom - camera_config.ten_pin_result_zoom) * large_rack_weight
  );
}

/** Returns the shared projection scale for the ball's physical lane progress. */
export function get_camera_zoom(camera: CameraState): number {
  const held_zoom = camera.rolling_zoom;
  if (camera.shot_phase === "result") {
    const result_zoom =
      camera.result_frame?.zoom ?? get_mode_result_zoom(camera.rack_bounds.pin_count);
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
  const maximum_zoom = camera_config.maximum_shot_zoom;
  return 1 + (maximum_zoom - 1) * smoothstep(zoom_progress);
}

/**
 * Uses the accepted local collision subject as the physical journey endpoint.
 * Before a committed path has produced that subject, retain the established
 * rack-front fallback. A no-contact edge path still supplies a clipped local
 * deck neighborhood, rather than inventing a ball-pin impact or following the
 * ball into the pit.
 */
function get_shot_progress_depth(camera: CameraState): number {
  const collision_depth = camera.collision_zone?.journey_depth ?? camera.rack_bounds.front;
  const depth = Math.max(collision_depth, 0.001);
  return depth;
}

/** Records monotonic physical travel that drives the deck-focused projection. */
export function advance_camera_for_ball(
  camera: CameraState,
  ball_y: number,
  ball_x = 0,
): CameraState {
  const journey_depth = get_shot_progress_depth(camera);
  const sampled_progress = Math.min(1, Math.max(0, ball_y / journey_depth));
  const shot_progress = Math.max(camera.shot_progress, sampled_progress);
  const progressed_camera = { ...camera, shot_progress };
  const sampled_y = Number.isFinite(ball_y) ? ball_y : 0;
  const focus_y = Math.max(camera.focus_y, sampled_y);
  const focused_camera = { ...progressed_camera, focus_y };
  const focus_progress = get_focus_progress(focused_camera);
  const ball_target_x = Number.isFinite(ball_x) ? ball_x : 0;
  const zone_center =
    focused_camera.collision_zone === undefined
      ? undefined
      : get_collision_zone_center(focused_camera.collision_zone);
  const target_x = zone_center?.x ?? ball_target_x;
  const target_y = zone_center?.y ?? sampled_y;
  const requested_zoom = Math.min(
    get_rolling_camera_zoom(focused_camera),
    get_shot_zoom_envelope_ceiling(
      focused_camera.shot_zoom_envelope,
      focused_camera.collision_zone,
      focused_camera.rack_bounds,
    ),
  );
  const zoomed_camera = {
    ...focused_camera,
    rolling_zoom: Math.max(camera.rolling_zoom, requested_zoom),
  };
  return {
    ...zoomed_camera,
    focus_x: clamp_focus_x(zoomed_camera, target_x * focus_progress, target_y),
  };
}

export function reset_camera_for_roll(camera: CameraState): CameraState {
  return {
    ...camera,
    collision_zone: undefined,
    collision_zone_held: false,
    shot_zoom_envelope: undefined,
    shot_progress: 0,
    rolling_zoom: 1,
    focus_x: 0,
    focus_y: 0,
    shot_phase: "rolling",
    result_transition_progress: 0,
    result_frame: undefined,
  };
}

/**
 * Switches from the held impact corridor to the resolving result composition.
 * Call this only after a non-timeout authoritative physics settlement.
 */
export function show_camera_result(
  camera: CameraState,
  result_frame: CameraResultFrame | undefined = undefined,
): CameraState {
  return { ...camera, shot_phase: "result", result_transition_progress: 0, result_frame };
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
        collision_zone: undefined,
        collision_zone_held: false,
        shot_zoom_envelope: undefined,
        shot_progress: 0,
        rolling_zoom: 1,
        focus_x: 0,
        focus_y: 0,
        shot_phase: "rolling",
        result_transition_progress: 0,
        result_frame: undefined,
      }
    : camera;
}
