import { normalize_ball_design, type BallDesign } from "../designer/ball_design";
import { camera_config, get_camera_composition } from "../config/camera";
import { ball_radius, board_count, gutter_width, lane_width, pin_radius } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { pin_snapshot_stride, read_snapshot_ball, read_snapshot_pin } from "../simulation/protocol";
import { create_rack } from "../simulation/rack";
import { draw_ball, type BallDrawState } from "./ball";
import { create_camera_state, get_camera_zoom } from "./camera";
import type { CameraState } from "./contracts";
import { load_game_assets, type AssetLoadState, type GameAssets } from "./game_assets";
import { interpolate_shortest_angle } from "./interpolation";
import { choose_pin_sprite, draw_pin, type PinDrawState } from "./pins";

export type ScreenPoint = { x: number; y: number };

export type GameDrawCommand =
  | { kind: "lane"; width: number; height: number; geometry: LaneGeometry }
  | ({ kind: "ball"; base_depth: number } & BallDrawState)
  | {
      kind: "aim_guide";
      x: number;
      y: number;
      end_x: number;
      end_y: number;
      width: number;
      points: ReadonlyArray<ScreenPoint>;
    }
  | ({ kind: "standing_pin" | "fallen_pin"; pin_index: number; base_depth: number } & PinDrawState);

export type SnapshotPair = {
  previous_snapshot: Float32Array;
  current_snapshot: Float32Array;
  pin_count: RackPinCount;
};

export type GameRenderer = {
  get_asset_state(): AssetLoadState;
  set_snapshot_pair(pair: SnapshotPair): void;
  set_camera(camera: CameraState): void;
  set_ball_design(design: BallDesign): void;
  set_aim_presentation(lateral_offset: number | undefined): void;
  set_ball_visible(visible: boolean): void;
  set_aim_guide(aim_guide: AimGuideState | undefined): void;
  draw(alpha: number): GameDrawCommand[];
};

export type AimGuideState = { lateral_offset: number; preview_path: Float32Array };
export type LaneArrow = { x: number; y: number; size: number; tip_y: number; base_y: number };

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

export type LaneGeometry = {
  horizon: ScreenPoint;
  lane_near: Readonly<[ScreenPoint, ScreenPoint]>;
  lane_far: Readonly<[ScreenPoint, ScreenPoint]>;
  rail_near: Readonly<[ScreenPoint, ScreenPoint]>;
  rail_far: Readonly<[ScreenPoint, ScreenPoint]>;
  arrows: LaneArrow[];
  foul_line: Readonly<[ScreenPoint, ScreenPoint]>;
  deck_boundary: Readonly<[ScreenPoint, ScreenPoint]>;
  guide_dots: ScreenPoint[];
  lane_world_half_width: number;
  gutter_world_width: number;
};

export type WorldPoint = { x: number; y: number; z: number };
type ProjectedBody = { base: ScreenPoint; crown: ScreenPoint; width: number; base_depth: number };

// Values below one compress the complete deck; values above one exaggerate it.
// The finite interval solves the shipped reveal target at every supported rack
// size without a rack-specific factor.
const deck_exaggeration_bounds = { minimum: 0.02, maximum: 12 } as const;

const default_ball_design = normalize_ball_design({});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(first: number, second: number, alpha: number): number {
  const result = first + (second - first) * clamp(alpha, 0, 1);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Maps forward world distance through one monotonic perspective denominator.
 * `y = near_y` is the foreground and every larger y recedes toward the one
 * fixed horizon. This deliberately has no camera follow, pitch basis, or
 * pixel-space warp.
 */
function exaggerate_deck_y(projection: LaneProjection, y: number): number | undefined {
  const { head_pin_y, depth_exaggeration } = projection.camera;
  if (!Number.isFinite(y) || !Number.isFinite(head_pin_y) || !Number.isFinite(depth_exaggeration))
    return undefined;
  if (y < head_pin_y) return y;
  const exaggerated = head_pin_y + (y - head_pin_y) * depth_exaggeration;
  return Number.isFinite(exaggerated) ? exaggerated : undefined;
}

function get_depth_scale(projection: LaneProjection, y: number): number | undefined {
  if (
    !Number.isFinite(projection.camera.depth_distance) ||
    projection.camera.depth_distance <= 0 ||
    !Number.isFinite(projection.near_y) ||
    !Number.isFinite(y)
  )
    return undefined;
  const projected_y = exaggerate_deck_y(projection, y);
  if (projected_y === undefined) return undefined;
  const depth = projection.camera.depth_distance + projected_y - projection.near_y;
  if (!Number.isFinite(depth) || depth <= 0) return undefined;
  return projection.camera.depth_distance / depth;
}

function get_aiming_ball_world_y(): number {
  return -camera_config.launch_platform_depth * camera_config.aiming_ball_platform_fraction;
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

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function create_projection(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  depth_exaggeration: number,
  horizon_fraction: number = camera_config.horizon_fraction,
  near_screen_fraction: number = camera_config.near_lane_y_fraction,
  presentation_zoom = 1,
): LaneProjection {
  const bounds = camera.rack_bounds;
  const lane_half_width = lane_width(bounds.pin_count) / 2;
  const full_half_width = lane_half_width + gutter_width;
  const focus_y = height * camera_config.shot_zoom_focus_y_fraction;
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
      presentation_zoom,
      presentation_focus_y_fraction: camera_config.shot_zoom_focus_y_fraction,
    },
    pixels_per_world_unit:
      ((width * camera_config.near_rail_half_width_fraction) / full_half_width) * presentation_zoom,
    horizon: {
      x: width / 2,
      y: focus_y + (unzoomed_horizon_y - focus_y) * presentation_zoom,
    },
    near_screen_y: focus_y + (unzoomed_near_screen_y - focus_y) * presentation_zoom,
  };
}

type DeckFraming = {
  horizon_fraction: number;
  near_screen_fraction: number;
  rack_top_fraction: number;
  framing_clamped: boolean;
  framing_reason: LaneProjection["camera"]["framing_reason"];
};

/**
 * Solves the complete rack crown and compact launch-platform endpoints from
 * the shared world-space projection. The authoritative rack, never a survivor
 * snapshot, supplies the rear row; this makes framing stable through every
 * game state.
 */
function solve_rack_framing(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  depth_exaggeration: number,
  row_y_positions: number[],
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
  );
  const scale = get_depth_scale(unframed, rear_y);
  if (scale === undefined || scale >= 1) throw new Error("Rack framing requires a receding scale.");

  // Rear crown: h * (1 - rearScale) + n * rearScale - pinHeightPx * rearScale.
  // Keep the physical near lane edge at the foot of the canvas, then solve the
  // horizon from the rear crown. The aiming ball can now move forward without
  // pulling the lane edge up and creating a blank strip beneath it.
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
  // Do not clamp the horizon: the two-anchor solve is only valid when both
  // solved endpoints share this exact value. An infeasible request is rejected
  // above rather than silently returning a mis-framed camera.
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

function solve_deck_exaggeration(
  camera: CameraState,
  width: number,
  height: number,
  depth_distance: number,
  target_reveal_fraction: number,
  head_pin_y: number,
  row_y_positions: number[],
): {
  depth_exaggeration: number;
  row_reveal_fractions: number[];
  calibration_clamped: boolean;
  calibration_reason: LaneProjection["camera"]["calibration_reason"];
  framing: DeckFraming;
} {
  const measure = (depth_exaggeration: number): { reveals: number[]; framing: DeckFraming } => {
    const framing = solve_rack_framing(
      camera,
      width,
      height,
      depth_distance,
      target_reveal_fraction,
      head_pin_y,
      depth_exaggeration,
      row_y_positions,
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
    );
    return { reveals: projected_row_reveals(projection, row_y_positions), framing };
  };
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
 * Projects one finite world point through the renderer's shared lane/body
 * transform. Points on or behind the near-depth boundary are not drawable.
 */
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

function project_body(
  projection: LaneProjection,
  base: WorldPoint,
  crown: WorldPoint,
  width: number,
): ProjectedBody | undefined {
  const base_point = project_world_point(projection, base);
  const crown_point = project_world_point(projection, crown);
  const scale = get_depth_scale(projection, base.y);
  if (base_point === undefined || crown_point === undefined || scale === undefined)
    return undefined;
  return {
    base: base_point,
    crown: crown_point,
    width: width * projection.pixels_per_world_unit * scale,
    base_depth: 1 / scale,
  };
}

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
  const solved = solve_deck_exaggeration(
    camera,
    width,
    height,
    depth_distance,
    composition.target_reveal_fraction,
    head_pin_y,
    row_y_positions,
  );
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
    get_camera_zoom(camera),
  );
  const row_reveal_fractions = solved.row_reveal_fractions;
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
      achieved_median_reveal_fraction: median(row_reveal_fractions),
      row_reveal_fractions,
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
      reveal_residual_fraction: median(row_reveal_fractions) - composition.target_reveal_fraction,
      horizon_fraction: solved.framing.horizon_fraction,
      framing_clamped: solved.framing.framing_clamped,
      framing_reason: solved.framing.framing_reason,
      presentation_zoom: get_camera_zoom(camera),
      presentation_focus_y_fraction: camera_config.shot_zoom_focus_y_fraction,
    },
  };
}

function project_cross_section(
  projection: LaneProjection,
  y: number,
  half_width: number,
): Readonly<[ScreenPoint, ScreenPoint]> {
  const left = project_world_point(projection, { x: -half_width, y, z: 0 });
  const right = project_world_point(projection, { x: half_width, y, z: 0 });
  if (left === undefined || right === undefined)
    throw new Error("Lane cross-section is behind the camera.");
  return [left, right];
}

function create_lane_arrows(projection: LaneProjection): LaneArrow[] {
  const arrows: LaneArrow[] = [];
  for (const board of [5, 10, 15, 20, 25, 30, 35]) {
    const centered_board = board - (board_count + 1) / 2;
    const x = (centered_board / board_count) * projection.lane_half_width * 2;
    const y = 15;
    const center = project_world_point(projection, { x, y, z: 0 });
    const tip = project_world_point(projection, { x, y: y + 0.18, z: 0 });
    const base = project_world_point(projection, { x, y: y - 0.18, z: 0 });
    const size_scale = get_depth_scale(projection, y);
    if (center === undefined || tip === undefined || base === undefined || size_scale === undefined)
      continue;
    arrows.push({
      x: center.x,
      y: center.y,
      size: 0.22 * projection.pixels_per_world_unit * size_scale,
      tip_y: tip.y,
      base_y: base.y,
    });
  }
  return arrows;
}

export function create_lane_geometry(
  _width: number,
  _height: number,
  projection: LaneProjection,
): LaneGeometry {
  const rail_half_width = projection.lane_half_width + projection.gutter_width;
  return {
    horizon: projection.horizon,
    lane_near: project_cross_section(projection, projection.near_y, projection.lane_half_width),
    lane_far: project_cross_section(projection, projection.far_y, projection.lane_half_width),
    rail_near: project_cross_section(projection, projection.near_y, rail_half_width),
    rail_far: project_cross_section(projection, projection.far_y, rail_half_width),
    arrows: create_lane_arrows(projection),
    foul_line: project_cross_section(projection, 0, projection.lane_half_width),
    deck_boundary: project_cross_section(
      projection,
      projection.far_y - camera_config.lane_back_padding,
      projection.lane_half_width,
    ),
    guide_dots: [-0.66, -0.33, 0, 0.33, 0.66].map((lateral) => {
      const point = project_world_point(projection, {
        x: projection.lane_half_width * lateral,
        y: 4,
        z: 0,
      });
      if (point === undefined) throw new Error("Guide dot is behind the camera.");
      return point;
    }),
    lane_world_half_width: projection.lane_half_width,
    gutter_world_width: projection.gutter_width,
  };
}

function compare_depth(first: GameDrawCommand, second: GameDrawCommand): number {
  if (first.kind === "lane") return -1;
  if (second.kind === "lane") return 1;
  if (first.kind === "aim_guide") return 1;
  if (second.kind === "aim_guide") return -1;
  return second.base_depth - first.base_depth;
}

function create_aim_guide_command(
  aim_guide: AimGuideState,
  ball: Extract<GameDrawCommand, { kind: "ball" }>,
  projection: LaneProjection,
): Extract<GameDrawCommand, { kind: "aim_guide" }> {
  const points: ScreenPoint[] = [];
  for (let index = 0; index + 1 < aim_guide.preview_path.length; index += 2) {
    const x = aim_guide.preview_path[index];
    const y = aim_guide.preview_path[index + 1];
    if (x === undefined || y === undefined) continue;
    const point = project_world_point(projection, { x, y, z: 0 });
    if (point !== undefined) points.push(point);
  }
  if (points.length < 2) throw new Error("Aim guides require a sampled visible preview path.");
  const clear_radius = ball.width * 0.7;
  const visible = points.filter(
    (point) => Math.hypot(point.x - ball.x, point.y - ball.y) >= clear_radius,
  );
  const rendered =
    visible.length >= 2
      ? visible
      : ((): ScreenPoint[] => {
          const end = points[points.length - 1] ?? { x: ball.x, y: ball.y - clear_radius };
          const distance = Math.hypot(end.x - ball.x, end.y - ball.y) || 1;
          return [
            {
              x: ball.x + ((end.x - ball.x) / distance) * clear_radius,
              y: ball.y + ((end.y - ball.y) / distance) * clear_radius,
            },
            end,
          ];
        })();
  const start = rendered[0] ?? { x: ball.x, y: ball.y };
  const end = rendered[rendered.length - 1] ?? start;
  return {
    kind: "aim_guide",
    x: start.x,
    y: start.y,
    end_x: end.x,
    end_y: end.y,
    width: Math.max(2, ball.width * 0.1),
    points: rendered,
  };
}

function create_pin_command(
  pin_index: number,
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  alpha: number,
  projection: LaneProjection,
): Extract<GameDrawCommand, { kind: "standing_pin" | "fallen_pin" }> | undefined {
  const offset = pin_index * pin_snapshot_stride;
  const previous_pin = read_snapshot_pin(previous_snapshot, offset);
  const current_pin = read_snapshot_pin(current_snapshot, offset);
  if (current_pin.removed || current_pin.in_pit) return undefined;
  const x = interpolate(previous_pin.x, current_pin.x, alpha);
  const y = interpolate(previous_pin.y, current_pin.y, alpha);
  const velocity_x = interpolate(previous_pin.velocity_x, current_pin.velocity_x, alpha);
  const velocity_y = interpolate(previous_pin.velocity_y, current_pin.velocity_y, alpha);
  const body = project_body(projection, { x, y, z: 0 }, { x, y, z: 1.25 }, pin_radius * 2);
  if (body === undefined) return undefined;
  const kind = choose_pin_sprite(current_pin.state_flag === 1);
  const standing_height = Math.abs(body.base.y - body.crown.y);
  const fallen = kind === "fallen_pin";
  const angle = fallen
    ? interpolate_shortest_angle(
        previous_pin.fallen_axis_angle,
        current_pin.fallen_axis_angle,
        alpha,
      )
    : 0;
  const speed = Math.hypot(velocity_x, velocity_y);
  const motion_energy = fallen ? clamp(speed / 16, 0, 1) : 0;
  const lift = fallen ? standing_height * 0.22 * motion_energy : 0;
  const trail_world = project_world_point(projection, {
    x: x - velocity_x * 0.035,
    y: y - velocity_y * 0.035,
    z: 0,
  });
  const trail_x = trail_world === undefined ? 0 : (trail_world.x - body.base.x) * 2.4;
  const trail_y = trail_world === undefined ? 0 : (trail_world.y - body.base.y) * 2.4;
  return {
    kind,
    pin_index,
    base_depth: body.base_depth,
    x: body.base.x,
    y: fallen ? body.base.y - body.width / 2 - lift : (body.base.y + body.crown.y) / 2,
    ground_x: body.base.x,
    ground_y: body.base.y,
    width: fallen ? standing_height : body.width,
    height: fallen ? body.width : standing_height,
    angle,
    lift,
    motion_energy,
    trail_x,
    trail_y,
  };
}

export function derive_ball_roll_angle(
  previous_forward_y: number,
  current_forward_y: number,
  alpha: number,
  physical_rotation: number,
): number {
  const forward_y = interpolate(previous_forward_y, current_forward_y, alpha);
  const roll_angle = derive_ball_surface_offset(forward_y, physical_rotation);
  return Number.isFinite(roll_angle) ? roll_angle : 0;
}

export function derive_ball_surface_offset(forward_y: number, physical_rotation = 0): number {
  // Physical travel begins at the foul line; the aiming presentation below
  // supplies its own upright starting surface.
  const offset = physical_rotation + forward_y / ball_radius;
  return Number.isFinite(offset) ? offset : 0;
}

function create_ball_command(
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: RackPinCount,
  alpha: number,
  projection: LaneProjection,
  design: BallDesign,
  aim_lateral_offset: number | undefined,
): Extract<GameDrawCommand, { kind: "ball" }> | undefined {
  const offset = pin_count * pin_snapshot_stride;
  const previous_ball = read_snapshot_ball(previous_snapshot, offset);
  const current_ball = read_snapshot_ball(current_snapshot, offset);
  if (current_ball.in_pit) return undefined;
  const x = aim_lateral_offset ?? interpolate(previous_ball.x, current_ball.x, alpha);
  const y =
    aim_lateral_offset === undefined
      ? interpolate(previous_ball.y, current_ball.y, alpha)
      : get_aiming_ball_world_y();
  const body = project_body(
    projection,
    { x, y, z: ball_radius },
    { x, y, z: ball_radius },
    ball_radius * 2,
  );
  if (body === undefined) return undefined;
  return {
    kind: "ball",
    base_depth: body.base_depth,
    x: body.base.x,
    y: body.base.y,
    width: body.width,
    height: body.width,
    roll_angle: derive_ball_roll_angle(
      previous_ball.y,
      current_ball.y,
      alpha,
      current_ball.rotation,
    ),
    surface_offset:
      aim_lateral_offset === undefined ? derive_ball_surface_offset(y, current_ball.rotation) : 0,
    highlight_offset: 0,
    design,
  };
}

export function create_game_draw_commands(
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: RackPinCount,
  alpha: number,
  width: number,
  height: number,
  design: BallDesign = default_ball_design,
  camera: CameraState = create_camera_state(pin_count, false),
  aim_guide: AimGuideState | undefined = undefined,
  aim_lateral_offset: number | undefined = aim_guide?.lateral_offset,
  ball_visible = true,
): GameDrawCommand[] {
  if (camera.rack_bounds.pin_count !== pin_count)
    throw new Error("Camera rack bounds must match the snapshot pin count.");
  const projection = create_camera_projection(camera, width, height);
  const commands: GameDrawCommand[] = [
    { kind: "lane", width, height, geometry: create_lane_geometry(width, height, projection) },
  ];
  for (let pin_index = 0; pin_index < pin_count; pin_index += 1) {
    const pin = create_pin_command(
      pin_index,
      previous_snapshot,
      current_snapshot,
      alpha,
      projection,
    );
    if (pin !== undefined) commands.push(pin);
  }
  const ball = ball_visible
    ? create_ball_command(
        previous_snapshot,
        current_snapshot,
        pin_count,
        alpha,
        projection,
        design,
        aim_lateral_offset,
      )
    : undefined;
  if (ball !== undefined) commands.push(ball);
  if (aim_guide !== undefined && ball !== undefined)
    commands.push(create_aim_guide_command(aim_guide, ball, projection));
  commands.sort(compare_depth);
  return commands;
}

function draw_aim_guide(
  context: CanvasRenderingContext2D,
  command: Extract<GameDrawCommand, { kind: "aim_guide" }>,
): void {
  context.save();
  context.strokeStyle = "rgba(255, 239, 117, 0.94)";
  context.lineWidth = command.width;
  context.lineCap = "round";
  context.setLineDash([0, command.width * 3.2]);
  const first = command.points[0];
  if (first !== undefined) {
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of command.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}

function draw_lane(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: LaneGeometry,
): void {
  const [lane_near_left, lane_near_right] = geometry.lane_near;
  const [lane_far_left, lane_far_right] = geometry.lane_far;
  const [rail_near_left, rail_near_right] = geometry.rail_near;
  const [rail_far_left, rail_far_right] = geometry.rail_far;
  const wood = context.createLinearGradient(0, geometry.horizon.y, 0, height);
  wood.addColorStop(0, "#EAD69C");
  wood.addColorStop(0.58, "#C88E43");
  wood.addColorStop(1, "#82542A");
  context.fillStyle = "#182438";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#3D7390";
  context.fillRect(0, 0, width, geometry.horizon.y);
  context.fillStyle = "#1D3040";
  const gutters: ReadonlyArray<Readonly<[ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint]>> = [
    [rail_near_left, lane_near_left, lane_far_left, rail_far_left],
    [lane_near_right, rail_near_right, rail_far_right, lane_far_right],
  ];
  for (const points of gutters) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
  }
  context.fillStyle = wood;
  context.beginPath();
  context.moveTo(lane_near_left.x, lane_near_left.y);
  context.lineTo(lane_near_right.x, lane_near_right.y);
  context.lineTo(lane_far_right.x, lane_far_right.y);
  context.lineTo(lane_far_left.x, lane_far_left.y);
  context.closePath();
  context.fill();
  context.strokeStyle = "#527384";
  context.lineWidth = Math.max(3, width * 0.004);
  context.beginPath();
  context.moveTo(rail_near_left.x, rail_near_left.y);
  context.lineTo(rail_far_left.x, rail_far_left.y);
  context.moveTo(rail_near_right.x, rail_near_right.y);
  context.lineTo(rail_far_right.x, rail_far_right.y);
  context.stroke();
  context.strokeStyle = "rgba(255, 246, 214, 0.72)";
  context.lineWidth = Math.max(2, width * 0.003);
  for (const [left, right] of [geometry.foul_line, geometry.deck_boundary]) {
    context.beginPath();
    context.moveTo(left.x, left.y);
    context.lineTo(right.x, right.y);
    context.stroke();
  }
  context.fillStyle = "rgba(255, 246, 214, 0.72)";
  for (const point of geometry.guide_dots) {
    context.beginPath();
    context.arc(point.x, point.y, Math.max(3, width * 0.003), 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "rgba(80, 50, 24, 0.72)";
  for (const arrow of geometry.arrows) {
    context.beginPath();
    context.moveTo(arrow.x, arrow.tip_y);
    context.lineTo(arrow.x + arrow.size, arrow.base_y);
    context.lineTo(arrow.x - arrow.size, arrow.base_y);
    context.closePath();
    context.fill();
  }
}

function draw_commands(
  context: CanvasRenderingContext2D,
  commands: GameDrawCommand[],
  assets: GameAssets,
): void {
  for (const command of commands) {
    if (command.kind === "lane")
      draw_lane(context, command.width, command.height, command.geometry);
    else if (command.kind === "ball") draw_ball(context, command, assets.ball);
    else if (command.kind === "aim_guide") draw_aim_guide(context, command);
    else draw_pin(context, assets, command);
  }
}

export function create_game_renderer(context: CanvasRenderingContext2D): GameRenderer {
  let asset_state: AssetLoadState = { status: "loading" };
  let snapshot_pair: SnapshotPair | undefined;
  let camera: CameraState | undefined;
  let ball_design = default_ball_design;
  let aim_lateral_offset: number | undefined;
  let ball_visible = true;
  let aim_guide: AimGuideState | undefined;
  void load_game_assets().then(
    (assets) => {
      asset_state = { status: "ready", assets };
    },
    (error: unknown) => {
      asset_state = {
        status: "failed",
        message: error instanceof Error ? error.message : "Could not load game renderer assets.",
      };
    },
  );
  return {
    get_asset_state: () => asset_state,
    set_snapshot_pair(pair): void {
      snapshot_pair = pair;
      if (camera === undefined || camera.rack_bounds.pin_count !== pair.pin_count)
        camera = create_camera_state(pair.pin_count, false);
    },
    set_camera(next_camera): void {
      camera = next_camera;
    },
    set_ball_design(design): void {
      ball_design = normalize_ball_design(design);
    },
    set_aim_presentation(offset): void {
      aim_lateral_offset = offset;
    },
    set_ball_visible(visible): void {
      ball_visible = visible;
    },
    set_aim_guide(next_aim_guide): void {
      aim_guide = next_aim_guide;
    },
    draw(alpha): GameDrawCommand[] {
      if (snapshot_pair === undefined) return [];
      const commands = create_game_draw_commands(
        snapshot_pair.previous_snapshot,
        snapshot_pair.current_snapshot,
        snapshot_pair.pin_count,
        alpha,
        context.canvas.width,
        context.canvas.height,
        ball_design,
        camera,
        aim_guide,
        aim_lateral_offset,
        ball_visible,
      );
      if (asset_state.status === "ready") draw_commands(context, commands, asset_state.assets);
      return commands;
    },
  };
}
