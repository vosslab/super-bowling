import { camera_config } from "../config/camera";
import { gutter_width, lane_width } from "../config/lane";
import { get_camera_composition } from "../config/camera";
import type { CollisionZone, RackBounds, ShotZoomEnvelope } from "./contracts";
import { get_projected_depth_scale } from "./projection";
import { project_world_point, type LaneProjection } from "./projection";

export type ShotFramingGeometry = {
  height: number;
  depth_distance: number;
  near_y: number;
  head_pin_y: number;
  depth_exaggeration: number;
  horizon_fraction: number;
  near_screen_fraction: number;
};

/**
 * Devel-facing projection facts for the active collision subject. This is
 * intentionally derived by the renderer from its live camera rather than a
 * second browser-side physics or camera model.
 */
export type CollisionZoneScreenDiagnostic = {
  polygon: ReadonlyArray<{ x: number; y: number }>;
  coverage_fraction: number;
  center_x_fraction: number;
  center_y_fraction: number;
  fully_on_canvas: boolean;
};

type ZoneCenter = { x: number; y: number };
type WorldPoint = { x: number; y: number };

function smoothstep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function get_vertical_progress(shot_progress: number): number {
  const range =
    camera_config.shot_vertical_focus_full_progress -
    camera_config.shot_vertical_focus_start_progress;
  return smoothstep((shot_progress - camera_config.shot_vertical_focus_start_progress) / range);
}

/** Returns the absolute-world center shared by the lateral and vertical shot composition. */
export function get_collision_zone_center(zone: CollisionZone): ZoneCenter {
  return { x: (zone.left + zone.right) / 2, y: (zone.front + zone.back) / 2 };
}

function polygon_area(points: ReadonlyArray<{ x: number; y: number }>): number {
  let double_area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current === undefined || next === undefined) return 0;
    double_area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(double_area) / 2;
}

/** Projects the actual local world-space subject used by the rolling camera. */
export function get_collision_zone_screen_diagnostic(
  zone: CollisionZone | undefined,
  projection: LaneProjection,
  width: number,
  height: number,
): CollisionZoneScreenDiagnostic | undefined {
  if (zone === undefined || width <= 0 || height <= 0) return undefined;
  const corners = [
    { x: zone.left, y: zone.front, z: 0 },
    { x: zone.right, y: zone.front, z: 0 },
    { x: zone.right, y: zone.back, z: 0 },
    { x: zone.left, y: zone.back, z: 0 },
  ];
  const polygon = corners.map((corner) => project_world_point(projection, corner));
  if (polygon.some((corner) => corner === undefined)) return undefined;
  const points = polygon as ReadonlyArray<{ x: number; y: number }>;
  const center = get_collision_zone_center(zone);
  const projected_center = project_world_point(projection, { ...center, z: 0 });
  if (projected_center === undefined) return undefined;
  return {
    polygon: points,
    coverage_fraction: polygon_area(points) / (width * height),
    center_x_fraction: projected_center.x / width,
    center_y_fraction: projected_center.y / height,
    fully_on_canvas: points.every(
      (point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height,
    ),
  };
}

function is_finite_point(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function read_path_points(path: Float32Array): WorldPoint[] {
  if (path.length < 4 || path.length % 2 !== 0) return [];
  const points: WorldPoint[] = [];
  for (let index = 0; index < path.length; index += 2) {
    const point = { x: path[index] ?? Number.NaN, y: path[index + 1] ?? Number.NaN };
    if (!is_finite_point(point)) return [];
    points.push(point);
  }
  return points;
}

function find_nearest_path_index(points: ReadonlyArray<WorldPoint>, ball: WorldPoint): number {
  let selected = 0;
  let selected_distance = Number.POSITIVE_INFINITY;
  for (const [index, point] of points.entries()) {
    const distance = (point.x - ball.x) ** 2 + (point.y - ball.y) ** 2;
    if (distance < selected_distance) {
      selected = index;
      selected_distance = distance;
    }
  }
  return selected;
}

/**
 * Retains only the committed path still ahead of the live ball, then closes
 * that path with the accepted local contact shell.  The result is deliberately
 * independent of frame cadence: the worker path and one authoritative sample
 * are its only dynamic inputs.
 */
export function create_shot_zoom_envelope(
  committed_path: Float32Array,
  ball: WorldPoint,
  zone: CollisionZone,
): ShotZoomEnvelope {
  const path = read_path_points(committed_path);
  const future = path
    .slice(find_nearest_path_index(path, ball))
    .filter((point) => point.y <= zone.back);
  const shell = [
    { x: zone.left, y: zone.front },
    { x: zone.left, y: zone.back },
    { x: zone.right, y: zone.front },
    { x: zone.right, y: zone.back },
  ];
  return { points: [ball, ...future, ...shell].filter(is_finite_point) };
}

/**
 * Converts the forward envelope into a perspective-safe zoom ceiling.  It is
 * centered on the committed collision subject rather than the whole rack, so
 * large decks retain a useful close view without promising a later retreat.
 */
export function get_shot_zoom_envelope_ceiling(
  envelope: ShotZoomEnvelope | undefined,
  zone: CollisionZone | undefined,
  rack_bounds: RackBounds,
): number {
  if (envelope === undefined || zone === undefined || envelope.points.length === 0)
    return Number.POSITIVE_INFINITY;
  const full_half_width = lane_width(rack_bounds.pin_count) / 2 + gutter_width;
  const horizontal_scale = camera_config.near_rail_half_width_fraction / full_half_width;
  const focus_scale = get_projected_depth_scale(
    get_camera_composition(rack_bounds.pin_count).depth_distance,
    -camera_config.launch_platform_depth,
    rack_bounds.front,
    1,
    rack_bounds.front,
  );
  if (focus_scale === undefined || horizontal_scale <= 0) return Number.POSITIVE_INFINITY;
  const center = get_collision_zone_center(zone);
  const maximum_span = Math.max(
    ...envelope.points.map((point) => {
      const point_scale = get_projected_depth_scale(
        get_camera_composition(rack_bounds.pin_count).depth_distance,
        -camera_config.launch_platform_depth,
        rack_bounds.front,
        1,
        point.y,
      );
      return point_scale === undefined
        ? 0
        : Math.abs(point.x * point_scale - center.x * focus_scale);
    }),
  );
  if (!Number.isFinite(maximum_span) || maximum_span <= 0) return Number.POSITIVE_INFINITY;
  const available_half_width = 0.5 - camera_config.shot_focus_subject_margin_fraction;
  return Math.max(1, available_half_width / (horizontal_scale * maximum_span));
}

/**
 * Finds the focus translation that projects the zone center to the actual
 * canvas center at the current zoom. This is algebra over the renderer's
 * shared depth scale, not a rack-relative anchor or a tuned screen fraction.
 */
export function get_zone_focus_y_fraction(
  zone: CollisionZone | undefined,
  shot_progress: number,
  zoom: number,
  geometry: ShotFramingGeometry | undefined,
): number {
  const baseline = camera_config.shot_zoom_focus_y_fraction;
  if (zone === undefined || geometry === undefined || zoom <= 1) return baseline;
  const center = get_collision_zone_center(zone);
  const depth_scale = get_projected_depth_scale(
    geometry.depth_distance,
    geometry.near_y,
    geometry.head_pin_y,
    geometry.depth_exaggeration,
    center.y,
  );
  if (depth_scale === undefined) return baseline;
  const unzoomed_y =
    geometry.horizon_fraction +
    (geometry.near_screen_fraction - geometry.horizon_fraction) * depth_scale;
  const canvas_center_fraction = 0.5;
  const requested_focus = (canvas_center_fraction - zoom * unzoomed_y) / (1 - zoom);
  if (!Number.isFinite(requested_focus)) return baseline;
  const progress = get_vertical_progress(shot_progress);
  return baseline + (requested_focus - baseline) * progress;
}
