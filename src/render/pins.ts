export type PinSpriteKind = "standing_pin" | "fallen_pin";

export type PinDrawState = {
  kind: PinSpriteKind;
  x: number;
  y: number;
  /** Projected physical base: the standing sprite foot and contact cue meet here. */
  ground_x: number;
  ground_y: number;
  width: number;
  height: number;
  angle: number;
  lift: number;
  motion_energy: number;
  trail_x: number;
  trail_y: number;
};

export type PinAssets = {
  upright: CanvasImageSource;
  fallen: CanvasImageSource;
};

export function choose_pin_sprite(is_fallen: boolean): PinSpriteKind {
  return is_fallen ? "fallen_pin" : "standing_pin";
}

/**
 * A fallen capsule has an axis, not a crown-to-base direction: `angle` and
 * `angle + PI` describe the same physics. The fallen artwork does have a
 * crown, so choose that equivalent screen orientation with its crown at or
 * above its base. This keeps a settled pin from reading as upside down
 * without changing the published physical axis.
 */
export function canonical_fallen_pin_angle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const axis_angle = ((angle % Math.PI) + Math.PI) % Math.PI;
  return axis_angle === 0 ? 0 : axis_angle - Math.PI;
}

function set_rotated_transform(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
): void {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  context.setTransform(cosine, sine, -sine, cosine, x, y);
}

export function draw_pin(
  context: CanvasRenderingContext2D,
  assets: PinAssets,
  state: PinDrawState,
): void {
  const source = state.kind === "standing_pin" ? assets.upright : assets.fallen;
  const display_angle =
    state.kind === "fallen_pin" ? canonical_fallen_pin_angle(state.angle) : state.angle;
  context.fillStyle = `rgba(39, 27, 20, ${Math.max(0.16, 0.54 - state.motion_energy * 0.28)})`;
  context.beginPath();
  context.ellipse(
    state.ground_x,
    state.ground_y,
    Math.max(1, state.width * (state.kind === "fallen_pin" ? 0.43 : 0.38)),
    Math.max(1, state.height * (state.kind === "fallen_pin" ? 0.18 : 0.055)),
    display_angle,
    0,
    Math.PI * 2,
  );
  context.fill();

  if (state.motion_energy > 0.16) {
    // This is an intentionally small, single trailing exposure. It makes a
    // local physical wave legible at 990 pins without multiplying sprites or
    // obscuring the settled rack.
    context.globalAlpha = state.motion_energy * (state.kind === "fallen_pin" ? 0.16 : 0.1);
    set_rotated_transform(context, state.x + state.trail_x, state.y + state.trail_y, display_angle);
    context.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
  }

  context.globalAlpha = 1;
  set_rotated_transform(context, state.x, state.y, display_angle);
  // The SVG's crown points right before rotation. Its screen-space y offset
  // is therefore proportional to sin(angle), so the canonical angle above
  // guarantees that the crown cannot land below the base.
  context.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
  context.resetTransform();
}
