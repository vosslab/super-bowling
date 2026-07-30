import { normalize_ball_design, type BallDesign } from "../designer/ball_design";
import { camera_config } from "../config/camera";
import type { RackPinCount } from "../config/pin_counts";
import {
  pin_snapshot_stride,
  snapshot_state_flag_offset,
  snapshot_velocity_x_offset,
  snapshot_velocity_y_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../simulation/protocol";
import { draw_ball, type BallDrawState } from "./ball";
import { create_camera_state } from "./camera";
import { load_game_assets, type AssetLoadState, type GameAssets } from "./game_assets";
import { choose_pin_sprite, draw_pin, type PinDrawState } from "./pins";
import type { CameraState } from "./contracts";

export type GameDrawCommand =
  | { kind: "lane"; width: number; height: number; geometry: LaneGeometry }
  | ({ kind: "ball" } & BallDrawState)
  | { kind: "aim_guide"; x: number; y: number; end_x: number; end_y: number; width: number }
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
  power: number;
};

export function get_aim_guide_end_y(power: number): number {
  const normalized_power = clamp((power - 8) / 16, 0, 1);
  // Weak power previews the near lane; full power reaches the head-pin plane.
  const end_y = 1 + normalized_power * 6;
  return end_y;
}

type ProjectedPoint = { x: number; y: number; scale: number; x_per_world_unit: number };

export type LaneDiamond = {
  x: number;
  y: number;
  size: number;
};

export type LaneProjection = {
  x_extent: number;
  near_y: number;
  far_y: number;
};

/**
 * One rack-aware screen-space silhouette shared by projected bodies and the
 * painted lane. Keeping it in the lane command makes the visual contract
 * observable in deterministic renderer tests.
 */
export type LaneGeometry = {
  horizon_y: number;
  foreground_y: number;
  top_half_width: number;
  bottom_half_width: number;
  rail_top_half_width: number;
  rail_bottom_half_width: number;
  diamonds: LaneDiamond[];
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
 * A cascade changes pin positions, never the camera that frames it.
 */
export function create_camera_projection(camera: CameraState): LaneProjection {
  const bounds = camera.rack_bounds;
  const bounds_half_width = Math.max(Math.abs(bounds.left), Math.abs(bounds.right));
  if (camera.mode === "deck") {
    const projection: LaneProjection = {
      x_extent: Math.max(
        camera_config.deck_min_half_width,
        bounds_half_width + camera_config.horizontal_padding,
      ),
      near_y: bounds.front - camera_config.deck_front_padding,
      far_y: bounds.back + camera_config.deck_back_padding,
    };
    return projection;
  }
  const projection: LaneProjection = {
    x_extent: Math.max(
      camera_config.lane_min_half_width,
      bounds_half_width + camera_config.horizontal_padding,
    ),
    near_y: camera_config.lane_near_y,
    far_y: bounds.back + camera_config.lane_back_padding,
  };
  return projection;
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
): LaneGeometry {
  const minimum_extent = camera_config.lane_min_half_width;
  const added_extent = Math.max(0, projection.x_extent - minimum_extent);
  const rack_width_progress = clamp(added_extent / (minimum_extent * 3), 0, 1);
  const horizon_y = height * 0.25;
  const foreground_y = height * 0.84;
  // Keep the variable-width Super Bowling deck, with a deliberately shallow
  // trapezoid so rack rows read as a dense front-facing triangle.
  const top_half_width = width * (0.28 + rack_width_progress * 0.1);
  const bottom_half_width = width * (0.44 + rack_width_progress * 0.12);
  const rail_gap = Math.max(9, width * 0.007);
  const geometry: LaneGeometry = {
    horizon_y,
    foreground_y,
    top_half_width,
    bottom_half_width,
    rail_top_half_width: top_half_width + rail_gap,
    rail_bottom_half_width: bottom_half_width + rail_gap,
    diamonds: create_lane_diamonds(width, height, top_half_width, bottom_half_width, horizon_y),
  };
  return geometry;
}

function create_lane_diamonds(
  width: number,
  height: number,
  top_half_width: number,
  bottom_half_width: number,
  horizon_y: number,
): LaneDiamond[] {
  const diamonds: LaneDiamond[] = [];
  const lateral_positions = [-0.52, -0.26, 0, 0.26, 0.52];
  const depth_positions = [0.57, 0.7];
  for (const depth of depth_positions) {
    const half_width = top_half_width + (bottom_half_width - top_half_width) * depth;
    const y = horizon_y + (height - horizon_y) * depth;
    const size = Math.max(7, width * (0.004 + depth * 0.003));
    for (const lateral of lateral_positions) {
      diamonds.push({ x: width / 2 + half_width * lateral, y, size });
    }
  }
  return diamonds;
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
  const scale = 0.25 + foreground_depth * 0.83;
  const lane_half_width =
    geometry.top_half_width +
    foreground_depth * (geometry.bottom_half_width - geometry.top_half_width);
  const normalized_x = clamp(x / projection.x_extent, -1.1, 1.1);
  return {
    x: width / 2 + normalized_x * lane_half_width,
    y: geometry.horizon_y + foreground_depth * (geometry.foreground_y - geometry.horizon_y),
    scale,
    x_per_world_unit: lane_half_width / projection.x_extent,
  };
}

function compare_depth(first: GameDrawCommand, second: GameDrawCommand): number {
  if (first.kind === "lane") return -1;
  if (second.kind === "lane") return 1;
  return first.y - second.y;
}

function create_aim_guide_command(
  aim_guide: AimGuideState,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
): Extract<GameDrawCommand, { kind: "aim_guide" }> {
  const normalized_power = clamp((aim_guide.power - 8) / 16, 0, 1);
  const guide_start_y = -9;
  const guide_end_y = get_aim_guide_end_y(aim_guide.power);
  const start = project_point(aim_guide.lateral_offset, guide_start_y, width, projection, geometry);
  const end = project_point(aim_guide.lateral_offset, guide_end_y, width, projection, geometry);
  return {
    kind: "aim_guide",
    x: start.x,
    y: start.y,
    end_x: end.x,
    end_y: end.y,
    width: Math.max(3, width * (0.002 + normalized_power * 0.0015)),
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
): GameDrawCommand {
  const offset = pin_index * pin_snapshot_stride;
  const x = interpolate(
    previous_snapshot[offset + snapshot_x_offset] ?? 0,
    current_snapshot[offset + snapshot_x_offset] ?? 0,
    alpha,
  );
  const y = interpolate(
    previous_snapshot[offset + snapshot_y_offset] ?? 0,
    current_snapshot[offset + snapshot_y_offset] ?? 0,
    alpha,
  );
  const velocity_x = interpolate(
    previous_snapshot[offset + snapshot_velocity_x_offset] ?? 0,
    current_snapshot[offset + snapshot_velocity_x_offset] ?? 0,
    alpha,
  );
  const velocity_y = interpolate(
    previous_snapshot[offset + snapshot_velocity_y_offset] ?? 0,
    current_snapshot[offset + snapshot_velocity_y_offset] ?? 0,
    alpha,
  );
  const point = project_point(x, y, width, projection, geometry);
  const kind = choose_pin_sprite(
    (current_snapshot[offset + snapshot_state_flag_offset] ?? 0) === 1,
  );
  // Each sprite occupies a consistent share of its projected physical rack
  // spacing. This preserves collision spacing while making all triangle modes
  // read as compact, countable racks rather than scattered icons.
  const standing_width = clamp(point.x_per_world_unit * 0.5, 10, 64);
  const standing_height = standing_width * 2.15;
  const fallen = kind === "fallen_pin";
  const angle =
    fallen && Math.hypot(velocity_x, velocity_y) > 0.001 ? Math.atan2(velocity_y, velocity_x) : 0;
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

function create_ball_command(
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: RackPinCount,
  alpha: number,
  width: number,
  projection: LaneProjection,
  geometry: LaneGeometry,
  design: BallDesign,
  aim_guide: AimGuideState | undefined,
): GameDrawCommand {
  const offset = pin_count * pin_snapshot_stride;
  const ball_x =
    aim_guide?.lateral_offset ??
    interpolate(previous_snapshot[offset] ?? 0, current_snapshot[offset] ?? 0, alpha);
  const ball_y =
    aim_guide === undefined
      ? interpolate(previous_snapshot[offset + 1] ?? -9, current_snapshot[offset + 1] ?? -9, alpha)
      : -9;
  const point = project_point(ball_x, ball_y, width, projection, geometry);
  const ball_state: BallDrawState = {
    x: point.x,
    y: point.y,
    // Bowling balls remain circular at every rack scale; pattern motion is the roll cue.
    width: Math.max(22, width * 0.045),
    height: Math.max(22, width * 0.045),
    roll_angle: derive_ball_roll_angle(
      previous_snapshot[offset + 1] ?? -9,
      current_snapshot[offset + 1] ?? -9,
      alpha,
      current_snapshot[offset + 4] ?? 0,
    ),
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
  camera: CameraState = create_camera_state(pin_count, Number.NEGATIVE_INFINITY, false),
  aim_guide: AimGuideState | undefined = undefined,
): GameDrawCommand[] {
  if (camera.rack_bounds.pin_count !== pin_count) {
    throw new Error("Camera rack bounds must match the snapshot pin count.");
  }
  const projection = create_camera_projection(camera);
  const geometry = create_lane_geometry(width, height, projection);
  const commands: GameDrawCommand[] = [{ kind: "lane", width, height, geometry }];
  for (let pin_index = 0; pin_index < pin_count; pin_index += 1) {
    commands.push(
      create_pin_command(
        pin_index,
        previous_snapshot,
        current_snapshot,
        alpha,
        width,
        projection,
        geometry,
      ),
    );
  }
  commands.push(
    create_ball_command(
      previous_snapshot,
      current_snapshot,
      pin_count,
      alpha,
      width,
      projection,
      geometry,
      design,
      aim_guide,
    ),
  );
  if (aim_guide !== undefined) {
    commands.push(create_aim_guide_command(aim_guide, width, projection, geometry));
  }
  commands.sort(compare_depth);
  return commands;
}

function draw_aim_guide(
  context: CanvasRenderingContext2D,
  command: Extract<GameDrawCommand, { kind: "aim_guide" }>,
): void {
  const angle = Math.atan2(command.end_y - command.y, command.end_x - command.x);
  const head_length = Math.max(9, command.width * 3.5);
  context.save();
  context.strokeStyle = "rgba(255, 239, 117, 0.94)";
  context.fillStyle = "rgba(255, 239, 117, 0.94)";
  context.lineWidth = command.width;
  context.lineCap = "round";
  context.setLineDash([0, command.width * 3.2]);
  context.beginPath();
  context.moveTo(command.x, command.y);
  context.lineTo(command.end_x, command.end_y);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(command.end_x, command.end_y);
  context.lineTo(
    command.end_x - Math.cos(angle - Math.PI / 6) * head_length,
    command.end_y - Math.sin(angle - Math.PI / 6) * head_length,
  );
  context.lineTo(
    command.end_x - Math.cos(angle + Math.PI / 6) * head_length,
    command.end_y - Math.sin(angle + Math.PI / 6) * head_length,
  );
  context.closePath();
  context.fill();
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
  context.strokeStyle = "#3B5F6F";
  context.lineWidth = Math.max(5, width * 0.014);
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
  context.fillStyle = "rgba(80, 50, 24, 0.58)";
  for (const diamond of geometry.diamonds) {
    context.beginPath();
    context.moveTo(diamond.x, diamond.y - diamond.size);
    context.lineTo(diamond.x + diamond.size, diamond.y);
    context.lineTo(diamond.x, diamond.y + diamond.size);
    context.lineTo(diamond.x - diamond.size, diamond.y);
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
      camera = create_camera_state(pair.pin_count, Number.NEGATIVE_INFINITY, false);
    }
  }

  function set_camera(next_camera: CameraState): void {
    camera = next_camera;
  }

  function set_ball_design(design: BallDesign): void {
    ball_design = normalize_ball_design(design);
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
    );
    if (asset_state.status === "ready") draw_commands(context, commands, asset_state.assets);
    return commands;
  }

  return { get_asset_state, set_snapshot_pair, set_camera, set_ball_design, set_aim_guide, draw };
}
