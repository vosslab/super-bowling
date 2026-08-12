import { ball_radius, board_width, pin_radius, row_spacing } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { create_rack } from "../simulation/rack";
import type { CollisionZone, RackBounds } from "./contracts";

export type CollisionZoneInput = {
  rack_bounds: RackBounds;
  /** Pairs of world-space coordinates from the committed Rapier free path. */
  committed_path: Float32Array;
  /** The authoritative live ball position selects how much uncertainty remains. */
  ball: { x: number; y: number };
};

/** The worker's first ball-pin contact centroid, in rack-local world space. */
export type ConfirmedCollisionZoneInput = {
  rack_bounds: RackBounds;
  centroid: { x: number; y: number };
};

type WorldPoint = { x: number; y: number };
type ZoneBounds = Pick<RackBounds, "left" | "right" | "front" | "back">;

// These are physical ten-pin lane units, deliberately not a fraction of a rack.
// Thirty-nine boards and four row spacings cover the complete ten-pin footprint.
export const collision_zone_width_boards = 39;
export const collision_zone_depth_rows = 4;
const maximum_approach_expansion = 1.5;
const ten_pin_rack: RackPinCount = 10;

function require_finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Collision zone requires finite ${label}.`);
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  const clipped = Math.min(maximum, Math.max(minimum, value));
  return clipped;
}

function read_path_point(path: Float32Array, index: number): WorldPoint {
  const x = path[index];
  const y = path[index + 1];
  if (x === undefined || y === undefined) throw new Error("Collision path point is incomplete.");
  return { x: require_finite(x, "path coordinate"), y: require_finite(y, "path coordinate") };
}

function require_path(path: Float32Array): void {
  if (path.length < 4 || path.length % 2 !== 0)
    throw new Error("Collision zone requires at least two complete path points.");
}

function interpolate_at_y(first: WorldPoint, second: WorldPoint, target_y: number): WorldPoint {
  const y_span = second.y - first.y;
  if (y_span === 0) return first;
  const progress = (target_y - first.y) / y_span;
  const point = { x: first.x + (second.x - first.x) * progress, y: target_y };
  return point;
}

function find_deck_entry(path: Float32Array, deck_front: number): WorldPoint {
  for (let index = 0; index + 3 < path.length; index += 2) {
    const first = read_path_point(path, index);
    const second = read_path_point(path, index + 2);
    if (first.y <= deck_front && second.y >= deck_front)
      return interpolate_at_y(first, second, deck_front);
  }
  throw new Error("Committed collision path does not reach the rack front.");
}

/**
 * Returns when a moving ball centre first enters a standing pin's contact
 * circle during this path segment.  The contact time, not the segment's
 * closest approach, determines which pin is physically encountered first.
 */
function find_segment_circle_entry(
  first: WorldPoint,
  second: WorldPoint,
  center: WorldPoint,
  radius: number,
): number | undefined {
  const x_span = second.x - first.x;
  const y_span = second.y - first.y;
  const length_squared = x_span ** 2 + y_span ** 2;
  const offset_x = first.x - center.x;
  const offset_y = first.y - center.y;
  const start_distance_squared = offset_x ** 2 + offset_y ** 2;
  if (start_distance_squared <= radius ** 2) return 0;
  if (length_squared === 0) return undefined;

  const linear = 2 * (offset_x * x_span + offset_y * y_span);
  const constant = start_distance_squared - radius ** 2;
  const discriminant = linear ** 2 - 4 * length_squared * constant;
  if (discriminant < 0) return undefined;

  const entry = (-linear - Math.sqrt(discriminant)) / (2 * length_squared);
  return entry >= 0 && entry <= 1 ? entry : undefined;
}

/**
 * Finds the first rack pin the committed ball centre can physically reach.
 * This is deliberately geometry only: the Rapier path remains the trajectory
 * authority and the immutable rack supplies the possible first obstacle.
 */
function find_first_reachable_pin(
  path: Float32Array,
  pin_count: RackPinCount,
): WorldPoint | undefined {
  const reach = ball_radius + pin_radius;
  const rack = create_rack(pin_count);
  for (let index = 0; index + 3 < path.length; index += 2) {
    const first = read_path_point(path, index);
    const second = read_path_point(path, index + 2);
    let first_contact: { pin: WorldPoint; progress: number } | undefined;
    for (const pin of rack.slots) {
      const progress = find_segment_circle_entry(first, second, pin, reach);
      if (
        progress !== undefined &&
        (first_contact === undefined || progress < first_contact.progress)
      ) {
        first_contact = { pin, progress };
      }
    }
    if (first_contact !== undefined) return first_contact.pin;
  }
  return undefined;
}

function find_nearest_path_point(path: Float32Array, ball: WorldPoint): WorldPoint {
  const first = read_path_point(path, 0);
  let nearest = first;
  let nearest_distance_squared = (first.x - ball.x) ** 2 + (first.y - ball.y) ** 2;
  for (let index = 2; index + 1 < path.length; index += 2) {
    const point = read_path_point(path, index);
    const distance_squared = (point.x - ball.x) ** 2 + (point.y - ball.y) ** 2;
    if (distance_squared < nearest_distance_squared) {
      nearest = point;
      nearest_distance_squared = distance_squared;
    }
  }
  return nearest;
}

function get_remaining_approach_fraction(path_point: WorldPoint, deck_front: number): number {
  const remaining = (deck_front - path_point.y) / Math.max(deck_front, 0.001);
  const fraction = clamp(remaining, 0, 1);
  return fraction;
}

/**
 * Rack bounds surround the outside of the standing-pin circles, while a ball
 * can first contact an outside pin with its centre one ball radius beyond
 * that footprint. Keep that reachable contact shell in the camera subject;
 * it is derived from the same ball-pin reach used to select the obstacle,
 * rather than an empirical framing tolerance.
 */
function get_contact_reachable_bounds(rack_bounds: RackBounds): ZoneBounds {
  const ball_pin_reach = ball_radius + pin_radius;
  const extension = ball_pin_reach - pin_radius;
  return {
    left: rack_bounds.left - extension,
    right: rack_bounds.right + extension,
    front: rack_bounds.front - extension,
    back: rack_bounds.back + extension,
  };
}

function clip_zone(
  entry: WorldPoint,
  half_width: number,
  depth: number,
  reachable_bounds: ZoneBounds,
): CollisionZone {
  // A pin center sits one row behind the nearest local entry row. Starting
  // there keeps the first collision inside the local four-row wave instead of
  // placing it on the leading edge of the camera subject.
  const front = clamp(entry.y - row_spacing, reachable_bounds.front, reachable_bounds.back);
  const back = clamp(front + depth, reachable_bounds.front, reachable_bounds.back);
  const zone = {
    left: clamp(entry.x - half_width, reachable_bounds.left, reachable_bounds.right),
    right: clamp(entry.x + half_width, reachable_bounds.left, reachable_bounds.right),
    front,
    back,
    // The local neighborhood's trailing edge is the honest journey endpoint:
    // it stays beyond first contact without guessing a rack-relative camera depth.
    journey_depth: back,
  };
  return zone;
}

function require_rack_bounds(rack_bounds: RackBounds): void {
  require_finite(rack_bounds.left, "rack left");
  require_finite(rack_bounds.right, "rack right");
  require_finite(rack_bounds.front, "rack front");
  require_finite(rack_bounds.back, "rack back");
  if (rack_bounds.left > rack_bounds.right || rack_bounds.front > rack_bounds.back)
    throw new Error("Collision zone requires ordered rack bounds.");
}

function get_local_wave_size(): { half_width: number; depth: number } {
  return {
    half_width: (collision_zone_width_boards * board_width(ten_pin_rack)) / 2,
    depth: collision_zone_depth_rows * row_spacing,
  };
}

/**
 * Anchors the held subject on the worker's actual first ball-pin contact.
 *
 * A contact centroid represents the local collision itself, rather than the
 * center of a predicted standing pin.  It sits one physical row behind the
 * subject's leading edge, matching the pre-impact zone's pin-centered
 * placement: this gives the incoming ball and the immediately-forward local
 * wave equal useful context without inventing a rack-relative offset.  The
 * subject still has the same absolute four-row / 39-board dimensions and is
 * clipped only to the reachable ball-contact shell.
 */
export function create_confirmed_collision_zone(input: ConfirmedCollisionZoneInput): CollisionZone {
  const { rack_bounds, centroid } = input;
  require_rack_bounds(rack_bounds);
  const entry = {
    x: require_finite(centroid.x, "impact centroid x"),
    y: require_finite(centroid.y, "impact centroid y"),
  };
  const { half_width, depth } = get_local_wave_size();
  return clip_zone(entry, half_width, depth, get_contact_reachable_bounds(rack_bounds));
}

/**
 * Predicts the local rack neighborhood that the committed Rapier path can
 * first collide with. The immutable path and immutable rack geometry select
 * the reachable obstacle; the live authoritative ball sample selects an
 * uncertainty envelope that contracts as the ball approaches it.
 */
export function create_collision_zone(input: CollisionZoneInput): CollisionZone {
  const { rack_bounds, committed_path, ball } = input;
  require_rack_bounds(rack_bounds);
  const ball_point = {
    x: require_finite(ball.x, "ball x"),
    y: require_finite(ball.y, "ball y"),
  };
  require_path(committed_path);
  const entry =
    find_first_reachable_pin(committed_path, rack_bounds.pin_count) ??
    find_deck_entry(committed_path, rack_bounds.front);
  const nearest_path_point = find_nearest_path_point(committed_path, ball_point);
  const remaining_approach = get_remaining_approach_fraction(nearest_path_point, rack_bounds.front);
  const expansion = 1 + remaining_approach * (maximum_approach_expansion - 1);
  const { half_width, depth } = get_local_wave_size();
  const zone = clip_zone(
    entry,
    half_width * expansion,
    depth * expansion,
    get_contact_reachable_bounds(rack_bounds),
  );
  return zone;
}
