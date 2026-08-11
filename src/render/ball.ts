import type { BallDesign, BallPattern } from "../designer/ball_design";

export type BallDrawState = {
  x: number;
  y: number;
  /** Camera-space base depth used to paint farther bodies first. */
  base_depth?: number;
  width: number;
  height: number;
  roll_angle: number;
  surface_offset?: number;
  highlight_offset?: number;
  design: BallDesign;
};

export type BallPatternCommand = {
  kind: "solid" | "band" | "chevron";
  color: string;
  offset: number;
};

export type BallHoleCommand = {
  x: number;
  y: number;
  radius_x: number;
  radius_y: number;
  opacity: number;
};

type ProjectedSurfacePoint = {
  x: number;
  y: number;
  depth: number;
};

const full_turn = Math.PI * 2;

function create_band_commands(pattern: BallPattern): BallPatternCommand[] {
  if (pattern === "single_band") {
    return [{ kind: "band", color: "accent", offset: 0 }];
  }
  if (pattern === "double_band") {
    return [
      { kind: "band", color: "accent", offset: -0.18 },
      { kind: "band", color: "accent", offset: 0.18 },
    ];
  }
  if (pattern === "chevron") {
    return [{ kind: "chevron", color: "accent", offset: 0 }];
  }
  return [{ kind: "solid", color: "base", offset: 0 }];
}

export function get_ball_pattern_commands(pattern: BallPattern): BallPatternCommand[] {
  return create_band_commands(pattern);
}

function draw_band(context: CanvasRenderingContext2D, state: BallDrawState, offset: number): void {
  // A pole-to-pole band stays fixed while the ball rolls around its horizontal axis.
  const band_x = state.x + offset * state.width;
  context.fillStyle = state.design.accent_color;
  context.fillRect(
    band_x - state.width * 0.055,
    state.y - state.height * 0.4,
    state.width * 0.11,
    state.height * 0.8,
  );
}

function project_surface_point(
  state: BallDrawState,
  local_x: number,
  local_y: number,
): ProjectedSurfacePoint | undefined {
  const local_z_squared = 1 - local_x * local_x - local_y * local_y;
  if (local_z_squared <= 0) return undefined;
  const local_z = Math.sqrt(local_z_squared);
  const surface_offset = state.surface_offset ?? state.roll_angle;
  const rotated_y = local_y * Math.cos(surface_offset) - local_z * Math.sin(surface_offset);
  const rotated_z = local_y * Math.sin(surface_offset) + local_z * Math.cos(surface_offset);
  if (rotated_z <= 0) return undefined;
  return {
    x: state.x + local_x * state.width * 0.5,
    y: state.y + rotated_y * state.height * 0.5,
    depth: rotated_z,
  };
}

function draw_chevron(context: CanvasRenderingContext2D, state: BallDrawState): void {
  const center = project_surface_point(state, -0.15, 0);
  if (center === undefined) return;
  context.strokeStyle = state.design.accent_color;
  context.lineWidth = Math.max(2, state.width * 0.08);
  context.globalAlpha = 0.35 + center.depth * 0.65;
  context.beginPath();
  context.moveTo(state.x - state.width * 0.25, center.y - state.height * 0.26);
  context.lineTo(state.x, center.y);
  context.lineTo(state.x - state.width * 0.25, center.y + state.height * 0.26);
  context.stroke();
  context.globalAlpha = 1;
}

function draw_monogram(context: CanvasRenderingContext2D, state: BallDrawState): void {
  if (state.design.monogram === undefined) return;
  const center = project_surface_point(state, 0.4, 0);
  if (center === undefined) return;
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.max(9, state.height * 0.31 * center.depth)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = 0.35 + center.depth * 0.65;
  context.fillText(state.design.monogram, center.x, center.y);
  context.globalAlpha = 1;
}

export function get_ball_hole_commands(state: BallDrawState): BallHoleCommand[] {
  const holes = [
    { x: 0.16, y: -0.36 },
    { x: 0.46, y: -0.5 },
    { x: 0.4, y: -0.08 },
  ];
  const commands: BallHoleCommand[] = [];
  for (const hole of holes) {
    const center = project_surface_point(state, hole.x, hole.y);
    if (center === undefined) continue;
    const size_scale = 0.55 + center.depth * 0.45;
    commands.push({
      x: center.x,
      y: center.y,
      radius_x: state.width * 0.075 * size_scale,
      radius_y: state.height * 0.075 * size_scale * Math.max(0.22, center.depth),
      opacity: 0.3 + center.depth * 0.7,
    });
  }
  return commands;
}

function draw_finger_holes(context: CanvasRenderingContext2D, state: BallDrawState): void {
  for (const hole of get_ball_hole_commands(state)) {
    context.globalAlpha = hole.opacity;
    context.fillStyle = "rgba(208, 239, 255, 0.24)";
    context.beginPath();
    context.ellipse(
      hole.x - hole.radius_x * 0.1,
      hole.y - hole.radius_y * 0.16,
      hole.radius_x * 1.2,
      hole.radius_y * 1.2,
      0,
      0,
      full_turn,
    );
    context.fill();
    context.fillStyle = "rgba(3, 11, 25, 0.94)";
    context.beginPath();
    context.ellipse(hole.x, hole.y, hole.radius_x, hole.radius_y, 0, 0, full_turn);
    context.fill();
    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    context.beginPath();
    context.ellipse(
      hole.x + hole.radius_x * 0.08,
      hole.y + hole.radius_y * 0.18,
      hole.radius_x * 0.7,
      hole.radius_y * 0.62,
      0,
      0,
      full_turn,
    );
    context.fill();
  }
  context.globalAlpha = 1;
}

function positive_modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function draw_rolling_surface(
  context: CanvasRenderingContext2D,
  state: BallDrawState,
  asset: CanvasImageSource,
): void {
  const left = state.x - state.width / 2;
  const top = state.y - state.height / 2;
  const surface_offset = state.surface_offset ?? state.roll_angle;
  const tile_height = state.height * 1.45;
  const surface_travel = positive_modulo((surface_offset / full_turn) * tile_height, tile_height);
  const surface_width = state.width * 1.16;
  const surface_left = left - (surface_width - state.width) / 2;
  const surface_top = top - surface_travel;
  context.globalAlpha = 0.32;
  context.drawImage(asset, surface_left, surface_top, surface_width, tile_height);
  context.drawImage(asset, surface_left, surface_top + tile_height, surface_width, tile_height);
  context.globalAlpha = 1;
}

function draw_sphere_lighting(context: CanvasRenderingContext2D, state: BallDrawState): void {
  const radius = Math.max(1, state.width * 0.58);
  const left = state.x - state.width / 2;
  const top = state.y - state.height / 2;
  const rim = context.createRadialGradient(
    state.x - state.width * 0.2,
    state.y - state.height * 0.24,
    state.width * 0.04,
    state.x,
    state.y,
    radius,
  );
  rim.addColorStop(0, "rgba(255, 255, 255, 0)");
  rim.addColorStop(0.52, "rgba(255, 255, 255, 0)");
  rim.addColorStop(0.78, "rgba(7, 25, 48, 0.18)");
  rim.addColorStop(1, "rgba(3, 11, 25, 0.82)");
  context.fillStyle = rim;
  context.fillRect(left, top, state.width, state.height);

  const gloss = context.createRadialGradient(
    state.x - state.width * 0.24,
    state.y - state.height * 0.27,
    0,
    state.x - state.width * 0.24,
    state.y - state.height * 0.27,
    state.width * 0.31,
  );
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.68)");
  gloss.addColorStop(0.3, "rgba(229, 248, 255, 0.32)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gloss;
  context.fillRect(left, top, state.width, state.height);

  const lane_reflection = context.createRadialGradient(
    state.x + state.width * 0.08,
    state.y + state.height * 0.38,
    0,
    state.x + state.width * 0.08,
    state.y + state.height * 0.38,
    state.width * 0.46,
  );
  lane_reflection.addColorStop(0, "rgba(255, 222, 142, 0.28)");
  lane_reflection.addColorStop(1, "rgba(255, 222, 142, 0)");
  context.fillStyle = lane_reflection;
  context.fillRect(left, top, state.width, state.height);
}

/** Draws the same circular bowling ball used by the setup preview and the lane. */
export function draw_ball(
  context: CanvasRenderingContext2D,
  state: BallDrawState,
  asset?: CanvasImageSource,
): void {
  const left = state.x - state.width / 2;
  const top = state.y - state.height / 2;
  context.save();
  context.fillStyle = "rgba(5, 13, 24, 0.36)";
  context.beginPath();
  context.ellipse(
    state.x,
    state.y + state.height * 0.44,
    state.width * 0.38,
    Math.max(1, state.height * 0.085),
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
  context.save();
  context.beginPath();
  context.ellipse(state.x, state.y, state.width / 2, state.height / 2, 0, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = state.design.base_color;
  context.fillRect(left, top, state.width, state.height);
  if (asset !== undefined) draw_rolling_surface(context, state, asset);
  for (const command of get_ball_pattern_commands(state.design.pattern)) {
    if (command.kind === "band") draw_band(context, state, command.offset);
    if (command.kind === "chevron") draw_chevron(context, state);
  }
  draw_monogram(context, state);
  draw_sphere_lighting(context, state);
  draw_finger_holes(context, state);
  context.restore();
  context.strokeStyle = "rgba(5, 16, 33, 0.88)";
  context.lineWidth = Math.max(1, state.width * 0.04);
  context.beginPath();
  context.ellipse(state.x, state.y, state.width / 2, state.height / 2, 0, 0, Math.PI * 2);
  context.stroke();
}
