import type { BallDesign, BallPattern } from "../designer/ball_design";

export type BallDrawState = {
  x: number;
  y: number;
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
  const surface_offset = state.surface_offset ?? state.roll_angle;
  const band_x = state.x + Math.sin(surface_offset) * state.width * 0.12 + offset * state.width;
  context.fillStyle = state.design.accent_color;
  context.fillRect(
    band_x - state.width * 0.055,
    state.y - state.height * 0.4,
    state.width * 0.11,
    state.height * 0.8,
  );
}

function draw_chevron(context: CanvasRenderingContext2D, state: BallDrawState): void {
  const surface_offset = state.surface_offset ?? state.roll_angle;
  const shift = Math.sin(surface_offset) * state.width * 0.12;
  context.strokeStyle = state.design.accent_color;
  context.lineWidth = Math.max(2, state.width * 0.08);
  context.beginPath();
  context.moveTo(state.x - state.width * 0.25 + shift, state.y - state.height * 0.26);
  context.lineTo(state.x + shift, state.y);
  context.lineTo(state.x - state.width * 0.25 + shift, state.y + state.height * 0.26);
  context.stroke();
}

function draw_monogram(context: CanvasRenderingContext2D, state: BallDrawState): void {
  if (state.design.monogram === undefined) return;
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.max(9, state.height * 0.31)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(state.design.monogram, state.x + state.width * 0.2, state.y);
}

function draw_finger_holes(context: CanvasRenderingContext2D, state: BallDrawState): void {
  const surface_offset = state.surface_offset ?? state.roll_angle;
  const shift = Math.sin(surface_offset) * state.width * 0.08;
  const holes = [
    { x: 0.08, y: -0.18 },
    { x: 0.23, y: -0.25 },
    { x: 0.2, y: -0.04 },
  ];
  context.fillStyle = "rgba(5, 20, 43, 0.82)";
  for (const hole of holes) {
    context.beginPath();
    context.ellipse(
      state.x + hole.x * state.width + shift,
      state.y + hole.y * state.height,
      state.width * 0.075,
      state.height * 0.075,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
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
  context.beginPath();
  context.ellipse(state.x, state.y, state.width / 2, state.height / 2, 0, 0, Math.PI * 2);
  context.clip();
  const gradient = context.createLinearGradient(left, top, left, top + state.height);
  gradient.addColorStop(0, state.design.base_color);
  gradient.addColorStop(0.55, state.design.base_color);
  gradient.addColorStop(1, "#122A4D");
  context.fillStyle = gradient;
  context.fillRect(left, top, state.width, state.height);
  if (asset !== undefined) {
    const surface_width = state.width * 1.8;
    const surface_offset = state.surface_offset ?? state.roll_angle;
    const surface_left = left - ((surface_offset * state.width * 0.18) % surface_width);
    context.globalAlpha = 0.42;
    context.drawImage(asset, surface_left, top, surface_width, state.height);
    context.drawImage(asset, surface_left + surface_width, top, surface_width, state.height);
    context.globalAlpha = 1;
  }
  for (const command of get_ball_pattern_commands(state.design.pattern)) {
    if (command.kind === "band") draw_band(context, state, command.offset);
    if (command.kind === "chevron") draw_chevron(context, state);
  }
  draw_finger_holes(context, state);
  context.fillStyle = "rgba(255, 255, 255, 0.38)";
  context.beginPath();
  context.ellipse(
    state.x - state.width * 0.18 + (state.highlight_offset ?? 0),
    state.y - state.height * 0.2,
    state.width * 0.2,
    state.height * 0.12,
    -0.25,
    0,
    Math.PI * 2,
  );
  context.fill();
  draw_monogram(context, state);
  context.restore();
  context.strokeStyle = "#18253D";
  context.lineWidth = Math.max(1, state.width * 0.045);
  context.beginPath();
  context.ellipse(state.x, state.y, state.width / 2, state.height / 2, 0, 0, Math.PI * 2);
  context.stroke();
}
