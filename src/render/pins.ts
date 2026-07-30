export type PinSpriteKind = "standing_pin" | "fallen_pin";

export type PinDrawState = {
  kind: PinSpriteKind;
  x: number;
  y: number;
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

export function draw_pin(
  context: CanvasRenderingContext2D,
  assets: PinAssets,
  state: PinDrawState,
): void {
  const source = state.kind === "standing_pin" ? assets.upright : assets.fallen;
  context.save();
  context.translate(state.x, state.y);
  context.rotate(state.angle);
  context.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
  context.restore();
}
