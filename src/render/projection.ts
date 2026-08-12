import { camera_config, get_camera_composition } from "../config/camera";
import { gutter_width, lane_width } from "../config/lane";
import type { CameraState } from "./contracts";

export type ScreenPoint = { x: number; y: number };
export type WorldPoint = { x: number; y: number; z: number };

/** A rational, one-point perspective definition shared by lane and bodies. */
export type LaneProjection = {
  x_extent: number;
  near_y: number;
  far_y: number;
  lane_half_width: number;
  gutter_width: number;
  camera: {
    depth_distance: number;
    target_reveal_fraction: number;
    achieved_median_reveal_fraction: number;
    row_reveal_fractions: ReadonlyArray<number>;
    depth_exaggeration: number;
    calibration_clamped: boolean;
    calibration_reason: "solved" | "unsolved" | "lower_bound" | "upper_bound";
    head_pin_y: number;
    rack_top_target_fraction: number;
    achieved_rack_top_fraction: number;
    achieved_aiming_ball_bottom_fraction: number;
    maximum_launch_platform_screen_fraction: number;
    achieved_launch_platform_screen_fraction: number;
    occupied_vertical_span_fraction: number;
    unused_top_fraction: number;
    unused_bottom_fraction: number;
    reveal_residual_fraction: number;
    horizon_fraction: number;
    framing_clamped: boolean;
    framing_reason: "solved" | "unsolved" | "lower_bound" | "upper_bound";
    presentation_zoom: number;
    presentation_focus_y_fraction: number;
  };
  pixels_per_world_unit: number;
  horizon: ScreenPoint;
  near_screen_y: number;
};

type DeckFraming = {
  horizon_fraction: number;
  near_screen_fraction: number;
  rack_top_fraction: number;
  framing_clamped: boolean;
  framing_reason: LaneProjection["camera"]["framing_reason"];
};

type DeckExaggerationSolution = {
  depth_exaggeration: number;
  row_reveal_fractions: number[];
  calibration_clamped: boolean;
  calibration_reason: LaneProjection["camera"]["calibration_reason"];
  framing: DeckFraming;
};

/**
 * Camera behavior supplies these already-resolved presentation values. Keeping
 * them as input makes projection algebra independent from the camera module.
 */
export type CameraProjectionPresentation = {
  focus_y_fraction: number;
  horizon_x: number;
  zoom: number;
};

// This finite interval solves the deck reveal target without rack-specific factors.
const deck_exaggeration_bounds = { minimum: 0.02, maximum: 12 } as const;

// The camera projection calibrates an unzoomed presentation. Its bisection
// inputs are therefore fixed by the complete rack layout and canvas size:
// focus translation and horizon x cancel from the vertical solve, while live
// zoom is applied only after this solved geometry is complete.
const deck_exaggeration_cache = new Map<string, DeckExaggerationSolution>();

function deck_exaggeration_cache_key(pin_count: number, width: number, height: number): string {
  return `${pin_count}:${width}:${height}`;
}

function copy_deck_exaggeration_solution(
  solution: DeckExaggerationSolution,
): DeckExaggerationSolution {
  return {
    ...solution,
    row_reveal_fractions: [...solution.row_reveal_fractions],
    framing: { ...solution.framing },
  };
}

export function get_aiming_ball_world_y(): number {
  return -camera_config.launch_platform_depth * camera_config.aiming_ball_platform_fraction;
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Maps deck rows through the one monotonic perspective denominator. */
export function exaggerate_deck_y(projection: LaneProjection, y: number): number | undefined {
  const { head_pin_y, depth_exaggeration } = projection.camera;
  if (!Number.isFinite(y) || !Number.isFinite(head_pin_y) || !Number.isFinite(depth_exaggeration))
    return undefined;
  if (y < head_pin_y) return y;
  const exaggerated = head_pin_y + (y - head_pin_y) * depth_exaggeration;
  return Number.isFinite(exaggerated) ? exaggerated : undefined;
}

/**
 * Applies the same deck-aware perspective denominator used by the renderer.
 * Camera framing passes only this narrow immutable geometry into its pure
 * composition solve, avoiding a camera-to-projection construction cycle.
 */
export function get_projected_depth_scale(
  depth_distance: number,
  near_y: number,
  head_pin_y: number,
  depth_exaggeration: number,
  y: number,
): number | undefined {
  if (
    !Number.isFinite(depth_distance) ||
    depth_distance <= 0 ||
    !Number.isFinite(near_y) ||
    !Number.isFinite(head_pin_y) ||
    !Number.isFinite(depth_exaggeration) ||
    !Number.isFinite(y)
  )
    return undefined;
  const projected_y = y < head_pin_y ? y : head_pin_y + (y - head_pin_y) * depth_exaggeration;
  const depth = depth_distance + projected_y - near_y;
  return Number.isFinite(depth) && depth > 0 ? depth_distance / depth : undefined;
}

/**
 * Returns the common depth scale for either a complete projection or the
 * unexaggerated camera corridor used while choosing a lateral focus.
 */
export function get_depth_scale(projection: LaneProjection, y: number): number | undefined;
export function get_depth_scale(camera: CameraState, y: number): number;
export function get_depth_scale(
  projection_or_camera: LaneProjection | CameraState,
  y: number,
): number | undefined {
  if (!("near_y" in projection_or_camera)) {
    const depth_distance = get_camera_composition(
      projection_or_camera.rack_bounds.pin_count,
    ).depth_distance;
    const depth = depth_distance + y + camera_config.launch_platform_depth;
    return Number.isFinite(depth) && depth > 0 ? depth_distance / depth : 1;
  }
  const projection = projection_or_camera;
  if (
    !Number.isFinite(projection.camera.depth_distance) ||
    projection.camera.depth_distance <= 0 ||
    !Number.isFinite(projection.near_y) ||
    !Number.isFinite(y)
  )
    return undefined;
  return get_projected_depth_scale(
    projection.camera.depth_distance,
    projection.near_y,
    projection.camera.head_pin_y,
    projection.camera.depth_exaggeration,
    y,
  );
}

/**
 * Creates the uncalibrated shared projection used by both deck solvers.
 * Camera behavior stays in camera.ts; this module owns projection algebra.
 */
export function create_projection(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  depth_exaggeration: number,
  horizon_fraction: number = camera_config.horizon_fraction,
  near_screen_fraction: number = camera_config.near_lane_y_fraction,
  presentation: CameraProjectionPresentation,
): LaneProjection {
  const bounds = camera.rack_bounds;
  const lane_half_width = lane_width(bounds.pin_count) / 2;
  const full_half_width = lane_half_width + gutter_width;
  const focus_y = height * presentation.focus_y_fraction;
  const unzoomed_horizon_y = height * horizon_fraction;
  const unzoomed_near_screen_y = height * near_screen_fraction;
  return {
    x_extent: full_half_width + camera_config.horizontal_padding,
    near_y: -camera_config.launch_platform_depth,
    far_y: bounds.back + camera_config.lane_back_padding,
    lane_half_width,
    gutter_width,
    camera: {
      depth_distance,
      target_reveal_fraction,
      achieved_median_reveal_fraction: 0,
      row_reveal_fractions: [],
      depth_exaggeration,
      calibration_clamped: false,
      calibration_reason: "unsolved",
      head_pin_y,
      rack_top_target_fraction: camera_config.rack_top_fraction,
      achieved_rack_top_fraction: 0,
      achieved_aiming_ball_bottom_fraction: 0,
      maximum_launch_platform_screen_fraction:
        camera_config.maximum_launch_platform_screen_fraction,
      achieved_launch_platform_screen_fraction: 0,
      occupied_vertical_span_fraction: 0,
      unused_top_fraction: 0,
      unused_bottom_fraction: 0,
      reveal_residual_fraction: 0,
      horizon_fraction,
      framing_clamped: false,
      framing_reason: "unsolved",
      presentation_zoom: presentation.zoom,
      presentation_focus_y_fraction: presentation.focus_y_fraction,
    },
    pixels_per_world_unit:
      ((width * camera_config.near_rail_half_width_fraction) / full_half_width) * presentation.zoom,
    horizon: {
      x: presentation.horizon_x,
      y: focus_y + (unzoomed_horizon_y - focus_y) * presentation.zoom,
    },
    near_screen_y: focus_y + (unzoomed_near_screen_y - focus_y) * presentation.zoom,
  };
}

function projected_row_reveals(projection: LaneProjection, row_y_positions: number[]): number[] {
  const rows = row_y_positions.map((y) => {
    const base = project_world_point(projection, { x: 0, y, z: 0 });
    const crown = project_world_point(projection, { x: 0, y, z: 1.25 });
    if (base === undefined || crown === undefined) return undefined;
    const height = Math.abs(base.y - crown.y);
    return Number.isFinite(height) && height > 0 ? { crown_y: crown.y, height } : undefined;
  });
  const reveals: number[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const near = rows[index - 1];
    const rear = rows[index];
    if (near === undefined || rear === undefined) return [];
    const reveal = (near.crown_y - rear.crown_y) / rear.height;
    if (!Number.isFinite(reveal)) return [];
    reveals.push(reveal);
  }
  return reveals;
}

/** Solves the complete rack crown and compact launch-platform endpoints. */
export function solve_rack_framing(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  depth_exaggeration: number,
  row_y_positions: number[],
  presentation: CameraProjectionPresentation,
): DeckFraming {
  const rear_y = row_y_positions[row_y_positions.length - 1];
  if (rear_y === undefined) throw new Error("Rack framing requires a rear rack row.");
  const unframed = create_projection(
    camera,
    width,
    height,
    depth_distance,
    target_reveal_fraction,
    head_pin_y,
    depth_exaggeration,
    undefined,
    undefined,
    presentation,
  );
  const scale = get_depth_scale(unframed, rear_y);
  if (scale === undefined || scale >= 1) throw new Error("Rack framing requires a receding scale.");
  const crown_target_y = height * camera_config.rack_top_fraction;
  const rear_horizon_weight = 1 - scale;
  const rear_target_with_crown = crown_target_y + 1.25 * unframed.pixels_per_world_unit * scale;
  const required_near_screen_y = height * camera_config.near_lane_y_fraction;
  const required_horizon_y =
    (rear_target_with_crown - required_near_screen_y * scale) / rear_horizon_weight;
  const requested_fraction = required_horizon_y / height;
  if (
    requested_fraction < camera_config.horizon_fraction_bounds.minimum ||
    requested_fraction > camera_config.horizon_fraction_bounds.maximum
  )
    throw new Error(
      `Camera framing is infeasible: required horizon ${requested_fraction.toFixed(4)} is outside ` +
        `[${camera_config.horizon_fraction_bounds.minimum}, ` +
        `${camera_config.horizon_fraction_bounds.maximum}].`,
    );
  const horizon_fraction = requested_fraction;
  const framed = create_projection(
    camera,
    width,
    height,
    depth_distance,
    target_reveal_fraction,
    head_pin_y,
    depth_exaggeration,
    horizon_fraction,
    required_near_screen_y / height,
    presentation,
  );
  const crown = project_world_point(framed, { x: 0, y: rear_y, z: 1.25 });
  if (crown === undefined) throw new Error("Rack crown must be drawable.");
  return {
    horizon_fraction,
    near_screen_fraction: required_near_screen_y / height,
    rack_top_fraction: crown.y / height,
    framing_clamped: false,
    framing_reason: "solved",
  };
}

function solve_deck_exaggeration_uncached(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  row_y_positions: number[],
  presentation: CameraProjectionPresentation,
): DeckExaggerationSolution {
  function measure(depth_exaggeration: number): { reveals: number[]; framing: DeckFraming } {
    const framing = solve_rack_framing(
      camera,
      width,
      height,
      depth_distance,
      target_reveal_fraction,
      head_pin_y,
      depth_exaggeration,
      row_y_positions,
      presentation,
    );
    const projection = create_projection(
      camera,
      width,
      height,
      depth_distance,
      target_reveal_fraction,
      head_pin_y,
      depth_exaggeration,
      framing.horizon_fraction,
      framing.near_screen_fraction,
      presentation,
    );
    return { reveals: projected_row_reveals(projection, row_y_positions), framing };
  }
  const low_measurement = measure(deck_exaggeration_bounds.minimum);
  const high_measurement = measure(deck_exaggeration_bounds.maximum);
  const low = median(low_measurement.reveals);
  const high = median(high_measurement.reveals);
  if (target_reveal_fraction <= low)
    return {
      depth_exaggeration: deck_exaggeration_bounds.minimum,
      row_reveal_fractions: low_measurement.reveals,
      calibration_clamped: target_reveal_fraction < low,
      calibration_reason: target_reveal_fraction < low ? "lower_bound" : "solved",
      framing: low_measurement.framing,
    };
  if (target_reveal_fraction >= high)
    return {
      depth_exaggeration: deck_exaggeration_bounds.maximum,
      row_reveal_fractions: high_measurement.reveals,
      calibration_clamped: target_reveal_fraction > high,
      calibration_reason: target_reveal_fraction > high ? "upper_bound" : "solved",
      framing: high_measurement.framing,
    };
  let minimum: number = deck_exaggeration_bounds.minimum;
  let maximum: number = deck_exaggeration_bounds.maximum;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const midpoint = (minimum + maximum) / 2;
    const achieved = median(measure(midpoint).reveals);
    if (achieved < target_reveal_fraction) minimum = midpoint;
    else maximum = midpoint;
  }
  const depth_exaggeration = (minimum + maximum) / 2;
  const final_measurement = measure(depth_exaggeration);
  return {
    depth_exaggeration,
    row_reveal_fractions: final_measurement.reveals,
    calibration_clamped: false,
    calibration_reason: "solved",
    framing: final_measurement.framing,
  };
}

/**
 * Reuses the rack-and-canvas calibration across draw frames. Camera motion is
 * presentation-only here, so it cannot invalidate this complete-rack solve.
 */
export function solve_deck_exaggeration(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  row_y_positions: number[],
  presentation: CameraProjectionPresentation,
): DeckExaggerationSolution {
  const key = deck_exaggeration_cache_key(camera.rack_bounds.pin_count, width, height);
  const cached = deck_exaggeration_cache.get(key);
  if (cached !== undefined) return copy_deck_exaggeration_solution(cached);
  const solved = solve_deck_exaggeration_uncached(
    camera,
    width,
    height,
    depth_distance,
    target_reveal_fraction,
    head_pin_y,
    row_y_positions,
    presentation,
  );
  deck_exaggeration_cache.set(key, copy_deck_exaggeration_solution(solved));
  return solved;
}

/** Projects one finite world point through the shared lane/body transform. */
export function project_world_point(
  projection: LaneProjection,
  point: WorldPoint,
): ScreenPoint | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))
    return undefined;
  const scale = get_depth_scale(projection, point.y);
  if (scale === undefined) return undefined;
  const x = projection.horizon.x + point.x * projection.pixels_per_world_unit * scale;
  const ground_y = projection.horizon.y + (projection.near_screen_y - projection.horizon.y) * scale;
  const y = ground_y - point.z * projection.pixels_per_world_unit * scale;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}
