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

export function draw_pin(
  context: CanvasRenderingContext2D,
  assets: PinAssets,
  state: PinDrawState,
): void {
  const source = state.kind === "standing_pin" ? assets.upright : assets.fallen;
  context.save();
  if (state.kind === "standing_pin") {
    // The upright SVG already spans its viewBox from foot to crown. The small
    // projected contact shadow makes that exact physical base legible against
    // the receding deck instead of visually lifting the pin into empty space.
    context.fillStyle = "rgba(66, 45, 27, 0.58)";
    context.beginPath();
    context.ellipse(
      state.ground_x,
      state.ground_y,
      Math.max(1, state.width * 0.38),
      Math.min(2, Math.max(1, state.width * 0.14)),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.translate(state.x, state.y);
  // The SVG's crown points right before rotation. Its screen-space y offset
  // is therefore proportional to sin(angle), so the canonical angle above
  // guarantees that the crown cannot land below the base.
  context.rotate(
    state.kind === "fallen_pin" ? canonical_fallen_pin_angle(state.angle) : state.angle,
  );
  context.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
  context.restore();
}
