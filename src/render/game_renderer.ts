import { normalize_ball_design, type BallDesign } from "../designer/ball_design";
import { camera_config } from "../config/camera";
import { board_count, gutter_width, lane_width } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { pin_snapshot_stride, read_snapshot_ball, read_snapshot_pin } from "../simulation/protocol";
import { draw_ball, type BallDrawState } from "./ball";
import { create_camera_state } from "./camera";
import { load_game_assets, type AssetLoadState, type GameAssets } from "./game_assets";
import { interpolate_shortest_angle } from "./interpolation";
import { choose_pin_sprite, draw_pin, type PinDrawState } from "./pins";
import type { CameraState } from "./contracts";

export type GameDrawCommand =
  | { kind: "lane"; width: number; height: number; geometry: LaneGeometry }
  | ({ kind: "ball" } & BallDrawState)
  | {
      kind: "aim_guide";
      x: number;
      y: number;
      end_x: number;
      end_y: number;
      width: number;
      points: ReadonlyArray<{ x: number; y: number }>;
    }
  | ({ kind: "standing_pin" | "fallen_pin"; pin_index: number } & PinDrawState);

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
  /** Draws the virtual foul-line ball during aiming, before preview sampling finishes. */
  set_aim_presentation(lateral_offset: number | undefined): void;
  set_ball_visible(visible: boolean): void;
  set_aim_guide(aim_guide: AimGuideState | undefined): void;
  draw(alpha: number): GameDrawCommand[];
};

/**
 * The guide consumes the same lateral offset and power values sent in the
 * launch request. It describes the initial straight lane path, rather than a
 * separate decorative aim model.
 */
export type AimGuideState = {
  lateral_offset: number;
  preview_path: Float32Array;
};

type ProjectedPoint = { x: number; y: number; scale: number; x_per_world_unit: number };

export type LaneArrow = {
  x: number;
  y: number;
  size: number;
  // Screen y decreases toward the deck, so the tip is always down-lane.
  tip_y: number;
  base_y: number;
};

export type LaneProjection = {
  x_extent: number;
  near_y: number;
  far_y: number;
  lane_half_width: number;
  gutter_width: number;
};

/**
 * One rack-aware screen-space silhouette shared by projected bodies and the
 * painted lane. Keeping it in the lane command makes the visual contract
 * observable in deterministic renderer tests.
 */
export type LaneGeometry = {
  horizon_y: number;
  foreground_y: number;
  shot_zoom: number;
  top_half_width: number;
  bottom_half_width: number;
  rail_top_half_width: number;
  rail_bottom_half_width: number;
  gutter_top_width: number;
  gutter_bottom_width: number;
  arrows: LaneArrow[];
  foul_line_y: number;
  guide_dot_y: number;
  deck_boundary_y: number;
  lane_world_half_width: number;
  gutter_world_width: number;
};

const default_ball_design = normalize_ball_design({});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(first: number, second: number, alpha: number): number {
  const result = first + (second - first) * clamp(alpha, 0, 1);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Keeps the foul-line ball and original rack in one fixed visual coordinate system.
 * The mild shot zoom is applied afterward around the fixed center and horizon.
 */
export function create_camera_projection(camera: CameraState): LaneProjection {
  const bounds = camera.rack_bounds;
  const lane_half_width = lane_width(bounds.pin_count) / 2;
  const full_half_width = lane_half_width + gutter_width;
  return {
    x_extent: full_half_width + camera_config.horizontal_padding,
    near_y: camera_config.lane_near_y,
    far_y: bounds.back + camera_config.lane_back_padding,
    lane_half_width,
    gutter_width,
  };
}

/**
 * Expands the visible Super Bowling lane with the immutable rack width.
 * The initial ten-pin triangle stays compact, while complete 105- and
 * 990-pin triangles gain enough deck width to remain visually legible.
 */
export function create_lane_geometry(
  width: number,
  height: number,
  projection: LaneProjection,
  zoom = 0,
): LaneGeometry {
  const horizon_y = height * 0.25;
  const zoom_scale = 1 + clamp(zoom, 0, camera_config.maximum_shot_zoom);
  const foreground_y = horizon_y + (height * 0.84 - horizon_y) * zoom_scale;
  const top_half_width = width * 0.34;
  const bottom_half_width = width * 0.45 * zoom_scale;
  const gutter_top_width = (top_half_width / projection.lane_half_width) * projection.gutter_width;
  const gutter_bottom_width =
    (bottom_half_width / projection.lane_half_width) * projection.gutter_width;
  const rail_top_half_width = top_half_width + gutter_top_width;
  const rail_bottom_half_width = bottom_half_width + gutter_bottom_width;
  const foul_line_y = project_lane_y(0, projection, horizon_y, foreground_y);
  const guide_dot_y = project_lane_y(4, projection, horizon_y, foreground_y);
  const deck_boundary_y = project_lane_y(
    projection.far_y - camera_config.lane_back_padding,
    projection,
    horizon_y,
    foreground_y,
  );
  const geometry: LaneGeometry = {
    horizon_y,
    foreground_y,
    shot_zoom: zoom_scale - 1,
    top_half_width,
    bottom_half_width,
    rail_top_half_width,
    rail_bottom_half_width,
    gutter_top_width,
    gutter_bottom_width,
    arrows: create_lane_arrows(
      width,
      projection,
      top_half_width,
      bottom_half_width,
      horizon_y,
      foreground_y,
    ),
    foul_line_y,
    guide_dot_y,
    deck_boundary_y,
    lane_world_half_width: projection.lane_half_width,
    gutter_world_width: projection.gutter_width,
  };
  return geometry;
}

function project_lane_y(
  y: number,
  projection: LaneProjection,
  horizon_y: number,
  foreground_y: number,
): number {
  const foreground_depth = clamp(
    (projection.far_y - y) / (projection.far_y - projection.near_y),
    0,
    1,
  );
  const projected_y = horizon_y + foreground_depth * (foreground_y - horizon_y);
  return projected_y;
}

function create_lane_arrows(
  width: number,
  projection: LaneProjection,
  top_half_width: number,
  bottom_half_width: number,
  horizon_y: number,
  foreground_y: number,
): LaneArrow[] {
  const arrows: LaneArrow[] = [];
  const board_positions = [5, 10, 15, 20, 25, 30, 35];
  for (const board of board_positions) {
    const centered_board = board - (board_count + 1) / 2;
    const world_x = (centered_board / board_count) * lane_width_from_projection(projection);
    const depth = 13 + (1 - Math.abs(centered_board) / 16) * 3;
    const y = project_lane_y(depth, projection, horizon_y, foreground_y);
    const foreground_depth = clamp(
      (projection.far_y - depth) / (projection.far_y - projection.near_y),
      0,
      1,
    );
    const half_width = top_half_width + (bottom_half_width - top_half_width) * foreground_depth;
    const size = Math.max(6, width * 0.008);
    arrows.push({
      x: width / 2 + (world_x / projection.lane_half_width) * half_width,
      y,
      size,
      tip_y: y - size,
      base_y: y + size,
    });
  }
  return arrows;
}

function lane_width_from_projection(projection: LaneProjection): number {
  return projection.lane_half_width * 2;
}

function project_point(
  x: number,
  y: number,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
): ProjectedPoint {
  const foreground_depth = clamp(
    (projection.far_y - y) / (projection.far_y - projection.near_y),
    0,
    1,
  );
  // Leave a full distant-pin sprite inside the lane for the largest immutable rack.
  const scale = (0.25 + foreground_depth * 0.83) * (1 + geometry.shot_zoom);
  const lane_half_width =
    geometry.top_half_width +
    foreground_depth * (geometry.bottom_half_width - geometry.top_half_width);
  const normalized_x = x / geometry.lane_world_half_width;
  return {
    x: width / 2 + normalized_x * lane_half_width,
    y: geometry.horizon_y + foreground_depth * (geometry.foreground_y - geometry.horizon_y),
    scale,
    x_per_world_unit: lane_half_width / geometry.lane_world_half_width,
  };
}

function compare_depth(first: GameDrawCommand, second: GameDrawCommand): number {
  if (first.kind === "lane") return -1;
  if (second.kind === "lane") return 1;
  return first.y - second.y;
}

function create_aim_guide_command(
  aim_guide: AimGuideState,
  ball: Extract<GameDrawCommand, { kind: "ball" }>,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
): Extract<GameDrawCommand, { kind: "aim_guide" }> {
  const world_points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < aim_guide.preview_path.length; index += 2) {
    const x = aim_guide.preview_path[index];
    const y = aim_guide.preview_path[index + 1];
    if (x !== undefined && y !== undefined) world_points.push({ x, y });
  }
  if (world_points.length < 2) throw new Error("Aim guides require a sampled preview path.");
  const projected_points = world_points.map((point) => {
    const projected = project_point(point.x, point.y, width, projection, geometry);
    return { x: projected.x, y: projected.y };
  });
  // Leave a visible gap for the dashed stroke as well as the circular ball.
  const clear_radius = ball.width / 2 + Math.max(14, width * 0.009);
  const visible_points = projected_points.filter(
    (point) => Math.hypot(point.x - ball.x, point.y - ball.y) >= clear_radius,
  );
  let points = visible_points;
  if (points.length < 2) {
    const end = projected_points[projected_points.length - 1] ?? {
      x: ball.x,
      y: ball.y - clear_radius,
    };
    const distance = Math.hypot(end.x - ball.x, end.y - ball.y) || 1;
    const start = {
      x: ball.x + ((end.x - ball.x) / distance) * clear_radius,
      y: ball.y + ((end.y - ball.y) / distance) * clear_radius,
    };
    points = [start, end];
  }
  const start = points[0] ?? { x: ball.x, y: ball.y };
  const end = points[points.length - 1] ?? start;
  return {
    kind: "aim_guide",
    x: start.x,
    y: start.y,
    end_x: end.x,
    end_y: end.y,
    width: Math.max(3, width * 0.003),
    points,
  };
}

function create_pin_command(
  pin_index: number,
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  alpha: number,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
): Extract<GameDrawCommand, { kind: "standing_pin" | "fallen_pin" }> | undefined {
  const offset = pin_index * pin_snapshot_stride;
  const previous_pin = read_snapshot_pin(previous_snapshot, offset);
  const current_pin = read_snapshot_pin(current_snapshot, offset);
  if (current_pin.removed || current_pin.in_pit) return undefined;
  const x = interpolate(previous_pin.x, current_pin.x, alpha);
  const y = interpolate(previous_pin.y, current_pin.y, alpha);
  const point = project_point(x, y, width, projection, geometry);
  const kind = choose_pin_sprite(current_pin.state_flag === 1);
  // Each sprite occupies a consistent share of its projected physical rack
  // spacing. This preserves collision spacing while making all triangle modes
  // read as compact, countable racks rather than scattered icons.
  const standing_width = clamp(point.x_per_world_unit * 0.5, 10, 64);
  const standing_height = standing_width * 3.15;
  const fallen = kind === "fallen_pin";
  const angle = fallen
    ? interpolate_shortest_angle(
        previous_pin.fallen_axis_angle,
        current_pin.fallen_axis_angle,
        alpha,
      )
    : 0;
  const state: PinDrawState = {
    kind,
    x: point.x,
    y: point.y,
    width: fallen ? standing_height : standing_width,
    height: fallen ? standing_width : standing_height,
    angle,
  };
  return { ...state, kind, pin_index };
}

/**
 * Uses forward lane travel for the cylinder artwork while Rapier keeps the
 * collision body's rotation constrained. A stable physical rotation still
 * contributes when a future world representation supplies one.
 */
export function derive_ball_roll_angle(
  previous_forward_y: number,
  current_forward_y: number,
  alpha: number,
  physical_rotation: number,
): number {
  const forward_y = interpolate(previous_forward_y, current_forward_y, alpha);
  const travel_rotation = forward_y * Math.PI * 1.6;
  const roll_angle = physical_rotation + travel_rotation;
  return Number.isFinite(roll_angle) ? roll_angle : 0;
}

/** Surface motion combines down-lane rolling with sideways travel from hook spin. */
export function derive_ball_surface_offset(forward_y: number, lateral_x: number): number {
  const offset = forward_y * Math.PI * 1.6 + lateral_x * Math.PI * 0.7;
  return Number.isFinite(offset) ? offset : 0;
}

function create_ball_command(
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: RackPinCount,
  alpha: number,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
  design: BallDesign,
  aim_lateral_offset: number | undefined,
): Extract<GameDrawCommand, { kind: "ball" }> | undefined {
  const offset = pin_count * pin_snapshot_stride;
  const previous_ball = read_snapshot_ball(previous_snapshot, offset);
  const current_ball = read_snapshot_ball(current_snapshot, offset);
  if (current_ball.in_pit) return undefined;
  const ball_x = aim_lateral_offset ?? interpolate(previous_ball.x, current_ball.x, alpha);
  const ball_y =
    aim_lateral_offset === undefined ? interpolate(previous_ball.y, current_ball.y, alpha) : -9;
  const point = project_point(ball_x, ball_y, width, projection, geometry);
  const ball_diameter = Math.max(22, width * 0.045) * (1 + geometry.shot_zoom);
  const ball_state: BallDrawState = {
    x: point.x,
    y: point.y,
    // Bowling balls remain circular at every rack scale; pattern motion is the roll cue.
    width: ball_diameter,
    height: ball_diameter,
    roll_angle: derive_ball_roll_angle(
      previous_ball.y,
      current_ball.y,
      alpha,
      current_ball.rotation,
    ),
    surface_offset: derive_ball_surface_offset(ball_y, ball_x),
    // Reflections belong to the camera, not the ball surface.
    highlight_offset: 0,
    design,
  };
  return { kind: "ball", ...ball_state };
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
  if (camera.rack_bounds.pin_count !== pin_count) {
    throw new Error("Camera rack bounds must match the snapshot pin count.");
  }
  const projection = create_camera_projection(camera);
  const geometry = create_lane_geometry(width, height, projection, camera.zoom);
  const commands: GameDrawCommand[] = [{ kind: "lane", width, height, geometry }];
  for (let pin_index = 0; pin_index < pin_count; pin_index += 1) {
    const pin = create_pin_command(
      pin_index,
      previous_snapshot,
      current_snapshot,
      alpha,
      width,
      projection,
      geometry,
    );
    if (pin !== undefined) commands.push(pin);
  }
  const ball = ball_visible
    ? create_ball_command(
        previous_snapshot,
        current_snapshot,
        pin_count,
        alpha,
        width,
        projection,
        geometry,
        design,
        aim_lateral_offset,
      )
    : undefined;
  if (ball !== undefined) commands.push(ball);
  if (aim_guide !== undefined && ball !== undefined) {
    commands.push(create_aim_guide_command(aim_guide, ball, width, projection, geometry));
  }
  commands.sort(compare_depth);
  return commands;
}

function draw_aim_guide(
  context: CanvasRenderingContext2D,
  command: Extract<GameDrawCommand, { kind: "aim_guide" }>,
): void {
  context.save();
  context.strokeStyle = "rgba(255, 239, 117, 0.94)";
  context.fillStyle = "rgba(255, 239, 117, 0.94)";
  context.lineWidth = command.width;
  context.lineCap = "round";
  context.setLineDash([0, command.width * 3.2]);
  const first = command.points[0];
  if (first === undefined) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of command.points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

function draw_lane(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: LaneGeometry,
): void {
  const {
    horizon_y,
    top_half_width,
    bottom_half_width,
    rail_top_half_width,
    rail_bottom_half_width,
  } = geometry;
  const wood = context.createLinearGradient(0, horizon_y, 0, height);
  wood.addColorStop(0, "#EAD69C");
  wood.addColorStop(0.58, "#C88E43");
  wood.addColorStop(1, "#82542A");
  context.fillStyle = "#182438";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#3D7390";
  context.fillRect(0, 0, width, horizon_y);
  context.fillStyle = "#1D3040";
  context.beginPath();
  context.moveTo(width / 2 - rail_top_half_width, horizon_y);
  context.lineTo(width / 2 - top_half_width, horizon_y);
  context.lineTo(width / 2 - bottom_half_width, height);
  context.lineTo(width / 2 - rail_bottom_half_width, height);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(width / 2 + top_half_width, horizon_y);
  context.lineTo(width / 2 + rail_top_half_width, horizon_y);
  context.lineTo(width / 2 + rail_bottom_half_width, height);
  context.lineTo(width / 2 + bottom_half_width, height);
  context.closePath();
  context.fill();
  context.fillStyle = wood;
  context.beginPath();
  context.moveTo(width / 2 - top_half_width, horizon_y);
  context.lineTo(width / 2 + top_half_width, horizon_y);
  context.lineTo(width / 2 + bottom_half_width, height);
  context.lineTo(width / 2 - bottom_half_width, height);
  context.closePath();
  context.fill();
  context.fillStyle = "rgba(255, 245, 214, 0.25)";
  context.fillRect(width * 0.1, horizon_y * 0.25, width * 0.8, height * 0.05);
  context.strokeStyle = "#527384";
  context.lineWidth = Math.max(3, width * 0.004);
  context.beginPath();
  context.moveTo(width / 2 - rail_top_half_width, horizon_y);
  context.lineTo(width / 2 - rail_bottom_half_width, height);
  context.moveTo(width / 2 + rail_top_half_width, horizon_y);
  context.lineTo(width / 2 + rail_bottom_half_width, height);
  context.stroke();
  context.strokeStyle = "rgba(255, 247, 218, 0.34)";
  context.lineWidth = Math.max(2, width * 0.004);
  for (let line = 0; line < 5; line += 1) {
    const fraction = (line + 1) / 6;
    const y = horizon_y + (height - horizon_y) * fraction;
    const half_width = top_half_width + (bottom_half_width - top_half_width) * fraction;
    context.beginPath();
    context.moveTo(width / 2 - half_width, y);
    context.lineTo(width / 2 + half_width, y);
    context.stroke();
  }
  context.strokeStyle = "rgba(255, 246, 214, 0.72)";
  context.lineWidth = Math.max(2, width * 0.003);
  for (const line_y of [geometry.foul_line_y, geometry.deck_boundary_y]) {
    const fraction = clamp((line_y - horizon_y) / (height - horizon_y), 0, 1);
    const half_width = top_half_width + (bottom_half_width - top_half_width) * fraction;
    context.beginPath();
    context.moveTo(width / 2 - half_width, line_y);
    context.lineTo(width / 2 + half_width, line_y);
    context.stroke();
  }
  context.fillStyle = "rgba(255, 246, 214, 0.72)";
  for (const lateral of [-0.66, -0.33, 0, 0.33, 0.66]) {
    const fraction = clamp((geometry.guide_dot_y - horizon_y) / (height - horizon_y), 0, 1);
    const half_width = top_half_width + (bottom_half_width - top_half_width) * fraction;
    context.beginPath();
    context.arc(
      width / 2 + half_width * lateral,
      geometry.guide_dot_y,
      Math.max(3, width * 0.003),
      0,
      Math.PI * 2,
    );
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
    if (command.kind === "lane") {
      draw_lane(context, command.width, command.height, command.geometry);
      continue;
    }
    if (command.kind === "ball") {
      draw_ball(context, command, assets.ball);
      continue;
    }
    if (command.kind === "aim_guide") {
      draw_aim_guide(context, command);
      continue;
    }
    draw_pin(context, assets, command);
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
      const message =
        error instanceof Error ? error.message : "Could not load game renderer assets.";
      asset_state = { status: "failed", message };
    },
  );

  function get_asset_state(): AssetLoadState {
    return asset_state;
  }

  function set_snapshot_pair(pair: SnapshotPair): void {
    snapshot_pair = pair;
    if (camera === undefined || camera.rack_bounds.pin_count !== pair.pin_count) {
      camera = create_camera_state(pair.pin_count, false);
    }
  }

  function set_camera(next_camera: CameraState): void {
    camera = next_camera;
  }

  function set_ball_design(design: BallDesign): void {
    ball_design = normalize_ball_design(design);
  }

  function set_aim_presentation(next_lateral_offset: number | undefined): void {
    aim_lateral_offset = next_lateral_offset;
  }

  function set_ball_visible(next_visible: boolean): void {
    ball_visible = next_visible;
  }

  function set_aim_guide(next_aim_guide: AimGuideState | undefined): void {
    aim_guide = next_aim_guide;
  }

  function draw(alpha: number): GameDrawCommand[] {
    const pair = snapshot_pair;
    if (pair === undefined) return [];
    const width = context.canvas.width;
    const height = context.canvas.height;
    const commands = create_game_draw_commands(
      pair.previous_snapshot,
      pair.current_snapshot,
      pair.pin_count,
      alpha,
      width,
      height,
      ball_design,
      camera,
      aim_guide,
      aim_lateral_offset,
      ball_visible,
    );
    if (asset_state.status === "ready") draw_commands(context, commands, asset_state.assets);
    return commands;
  }

  return {
    get_asset_state,
    set_snapshot_pair,
    set_camera,
    set_ball_design,
    set_aim_presentation,
    set_ball_visible,
    set_aim_guide,
    draw,
  };
}
