import { normalize_ball_design, type BallDesign } from "../designer/ball_design";
import { camera_config } from "../config/camera";
import { ball_radius, board_count, pin_radius } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";
import { pin_snapshot_stride, read_snapshot_ball, read_snapshot_pin } from "../simulation/protocol";
import { create_aim_guide_command, draw_aim_guide } from "./aim_guide";
import { draw_ball, type BallDrawState } from "./ball";
import { create_camera_state } from "./camera";
import { create_camera_projection } from "./camera_projection";
import type { CameraState } from "./contracts";
import { derive_fallen_pin_presentation } from "./fallen_pin_presentation";
import { load_game_assets, type AssetLoadState, type GameAssets } from "./game_assets";
import { interpolate_shortest_angle } from "./interpolation";
import { get_collision_zone_screen_diagnostic } from "./shot_framing";
import {
  get_aiming_ball_world_y,
  get_depth_scale,
  project_world_point,
  type LaneProjection,
  type ScreenPoint,
  type WorldPoint,
} from "./projection";
import {
  create_impact_accent_command as create_projected_impact_accent_command,
  draw_impact_accent,
  select_impact_accent,
  type ImpactAccentCommand,
  type ImpactAccentState,
  type ImpactPresentation,
} from "./impact_accent";
import {
  choose_pin_sprite,
  draw_pin_body,
  draw_pin_shadow,
  get_pin_body_center_y,
  type PinDrawState,
} from "./pins";

export {
  select_impact_accent,
  type ImpactAccentCommand,
  type ImpactAccentSelection,
  type ImpactAccentState,
  type ImpactPresentation,
} from "./impact_accent";
/** A compact worker-derived contact location, projected with the shared camera. */
export type GameDrawCommand =
  | { kind: "lane"; width: number; height: number; geometry: LaneGeometry }
  | ImpactAccentCommand
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
  record_impact(presentation: ImpactPresentation, timestamp_ms: number): void;
  draw(alpha: number, timestamp_ms?: number): GameDrawCommand[];
};

export type GameRendererOptions = { capture_diagnostics?: boolean };

export type AimGuideState = { lateral_offset: number; preview_path: Float32Array };
export type LaneArrow = { x: number; y: number; size: number; tip_y: number; base_y: number };
export type RenderPhase = "lane_and_accents" | "pin_shadows" | "pin_bodies_and_overlays";
export type RenderPhaseObserver = (phase: RenderPhase, elapsed_ms: number) => void;

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

type ProjectedBody = { base: ScreenPoint; crown: ScreenPoint; width: number; base_depth: number };

const default_ball_design = normalize_ball_design({});
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(first: number, second: number, alpha: number): number {
  const result = first + (second - first) * clamp(alpha, 0, 1);
  return Number.isFinite(result) ? result : 0;
}

export function create_impact_accent_command(
  state: ImpactAccentState,
  timestamp_ms: number,
  projection: LaneProjection,
): ImpactAccentCommand | undefined {
  return create_projected_impact_accent_command(
    state,
    timestamp_ms,
    (point) => project_world_point(projection, point),
    (y) => get_depth_scale(projection, y),
  );
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
  if (first.kind === "impact_accent") return -1;
  if (second.kind === "impact_accent") return 1;
  if (first.kind === "aim_guide") return 1;
  if (second.kind === "aim_guide") return -1;
  return second.base_depth - first.base_depth;
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
  const speed_energy = clamp((speed - 0.35) / 11.5, 0, 1);
  const axis_turn = fallen
    ? Math.abs(
        Math.atan2(
          Math.sin(current_pin.fallen_axis_angle - previous_pin.fallen_axis_angle),
          Math.cos(current_pin.fallen_axis_angle - previous_pin.fallen_axis_angle),
        ),
      )
    : 0;
  const rotation_energy = clamp(axis_turn / 0.22, 0, 1) * 0.66;
  const motion_energy = Math.max(speed_energy, rotation_energy) * (fallen ? 0.92 : 0.62);
  const lift = standing_height * (fallen ? 0.19 : 0.065) * motion_energy;
  const trail_world = project_world_point(projection, {
    x: x - velocity_x * 0.035 * motion_energy,
    y: y - velocity_y * 0.035 * motion_energy,
    z: 0,
  });
  const raw_trail_x = trail_world === undefined ? 0 : (trail_world.x - body.base.x) * 2.4;
  const raw_trail_y = trail_world === undefined ? 0 : (trail_world.y - body.base.y) * 2.4;
  const maximum_trail = Math.max(body.width, standing_height) * (fallen ? 0.46 : 0.28);
  const raw_trail_length = Math.hypot(raw_trail_x, raw_trail_y);
  const trail_scale = raw_trail_length > maximum_trail ? maximum_trail / raw_trail_length : 1;
  const trail_x = raw_trail_x * trail_scale;
  const trail_y = raw_trail_y * trail_scale;
  const fallen_presentation = fallen
    ? derive_fallen_pin_presentation(pin_index, angle, velocity_x, velocity_y, motion_energy)
    : undefined;
  const pin: Extract<GameDrawCommand, { kind: "standing_pin" | "fallen_pin" }> = {
    kind,
    pin_index,
    base_depth: body.base_depth,
    x: body.base.x,
    y: 0,
    ground_x: body.base.x,
    ground_y: body.base.y,
    width: fallen ? standing_height : body.width,
    height: fallen ? body.width : standing_height,
    angle,
    lift,
    motion_energy,
    trail_x,
    trail_y,
    fallen_presentation,
  };
  pin.y = get_pin_body_center_y(pin);
  return pin;
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
  camera: CameraState = create_camera_state(pin_count),
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
    commands.push(
      create_aim_guide_command(aim_guide, ball, (x, y) =>
        project_world_point(projection, { x, y, z: 0 }),
      ),
    );
  commands.sort(compare_depth);
  return commands;
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

export function draw_game_commands(
  context: CanvasRenderingContext2D,
  commands: GameDrawCommand[],
  assets: GameAssets,
  shadows: boolean,
  observe_phase: RenderPhaseObserver | undefined = undefined,
): void {
  if (observe_phase === undefined) {
    for (const command of commands) {
      if (command.kind === "lane")
        draw_lane(context, command.width, command.height, command.geometry);
      else if (command.kind === "impact_accent") draw_impact_accent(context, command);
    }
    if (shadows)
      for (const command of commands)
        if (command.kind === "standing_pin" || command.kind === "fallen_pin")
          draw_pin_shadow(context, command);
    for (const command of commands) {
      if (command.kind === "ball") draw_ball(context, command, assets.ball);
      else if (command.kind === "aim_guide") draw_aim_guide(context, command);
      else if (command.kind === "standing_pin" || command.kind === "fallen_pin")
        draw_pin_body(context, assets, command);
    }
    return;
  }
  const draw_profiled_phase = (phase: RenderPhase, operation: () => void): void => {
    const started_at = performance.now();
    operation();
    observe_phase(phase, performance.now() - started_at);
  };
  draw_profiled_phase("lane_and_accents", () => {
    for (const command of commands) {
      if (command.kind === "lane")
        draw_lane(context, command.width, command.height, command.geometry);
      else if (command.kind === "impact_accent") draw_impact_accent(context, command);
    }
  });
  draw_profiled_phase("pin_shadows", () => {
    if (!shadows) return;
    for (const command of commands)
      if (command.kind === "standing_pin" || command.kind === "fallen_pin")
        draw_pin_shadow(context, command);
  });
  draw_profiled_phase("pin_bodies_and_overlays", () => {
    for (const command of commands) {
      if (command.kind === "ball") draw_ball(context, command, assets.ball);
      else if (command.kind === "aim_guide") draw_aim_guide(context, command);
      else if (command.kind === "standing_pin" || command.kind === "fallen_pin")
        draw_pin_body(context, assets, command);
    }
  });
}

export function create_game_renderer(
  context: CanvasRenderingContext2D,
  options: GameRendererOptions = {},
): GameRenderer {
  let asset_state: AssetLoadState = { status: "loading" };
  let snapshot_pair: SnapshotPair | undefined;
  let camera: CameraState | undefined;
  let ball_design = default_ball_design;
  let aim_lateral_offset: number | undefined;
  let ball_visible = true;
  let aim_guide: AimGuideState | undefined;
  let active_impact: ImpactAccentState | undefined;
  let last_secondary_impact_at_ms = Number.NEGATIVE_INFINITY;
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
        camera = create_camera_state(pair.pin_count);
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
    record_impact(presentation, timestamp_ms): void {
      const selection = select_impact_accent(
        active_impact,
        presentation,
        timestamp_ms,
        last_secondary_impact_at_ms,
      );
      active_impact = selection.active;
      last_secondary_impact_at_ms = selection.last_secondary_at_ms;
    },
    draw(alpha, timestamp_ms = Date.now()): GameDrawCommand[] {
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
      if (active_impact !== undefined) {
        const projection = create_camera_projection(
          camera ?? create_camera_state(snapshot_pair.pin_count),
          context.canvas.width,
          context.canvas.height,
        );
        const accent = create_impact_accent_command(active_impact, timestamp_ms, projection);
        if (accent === undefined) active_impact = undefined;
        else {
          commands.push(accent);
          commands.sort(compare_depth);
        }
      }
      if (asset_state.status === "ready")
        draw_game_commands(context, commands, asset_state.assets, snapshot_pair.pin_count <= 105);
      if (options.capture_diagnostics && context.canvas instanceof HTMLCanvasElement) {
        const canvas = context.canvas;
        const projection = create_camera_projection(
          camera ?? create_camera_state(snapshot_pair.pin_count),
          canvas.width,
          canvas.height,
        );
        const zone = get_collision_zone_screen_diagnostic(
          camera?.collision_zone,
          projection,
          canvas.width,
          canvas.height,
        );
        canvas.dataset.collisionZoneWorldPresent =
          camera?.collision_zone === undefined ? "false" : "true";
        canvas.dataset.collisionZoneVisible = zone === undefined ? "false" : "true";
        canvas.dataset.collisionZoneCoverage = zone?.coverage_fraction.toFixed(6) ?? "";
        canvas.dataset.collisionZoneCenterX = zone?.center_x_fraction.toFixed(6) ?? "";
        canvas.dataset.collisionZoneCenterY = zone?.center_y_fraction.toFixed(6) ?? "";
        canvas.dataset.collisionZoneFullyOnCanvas = zone?.fully_on_canvas ? "true" : "false";
        const lane = commands.find((command) => command.kind === "lane");
        const foul_line = lane?.kind === "lane" ? lane.geometry.foul_line : undefined;
        canvas.dataset.foulLineScreenY =
          foul_line === undefined ? "" : ((foul_line[0].y + foul_line[1].y) / 2).toFixed(3);
      }
      return commands;
    },
  };
}
