import type { FallenPinPresentation } from "./fallen_pin_presentation";

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
  fallen_presentation?: FallenPinPresentation;
};

export type PinAssets = {
  upright: CanvasImageSource;
  fallen: CanvasImageSource;
};

type PinGeometryState = Pick<
  PinDrawState,
  | "kind"
  | "x"
  | "y"
  | "ground_x"
  | "ground_y"
  | "width"
  | "height"
  | "angle"
  | "lift"
  | "fallen_presentation"
>;

export type PinShadowGeometry = {
  x: number;
  y: number;
  radius_x: number;
  radius_y: number;
};

export type PinScreenBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
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

function get_pin_display_angle(state: PinGeometryState): number {
  if (state.kind === "standing_pin") return state.angle;
  const physical_angle = canonical_fallen_pin_angle(state.angle);
  const presentation_offset = state.fallen_presentation?.screen_rotation_offset ?? 0;
  const display_angle =
    physical_angle +
    (Math.sin(physical_angle + presentation_offset) > 0
      ? -Math.abs(presentation_offset)
      : presentation_offset);
  return display_angle;
}

function get_scaled_pin_size(state: PinGeometryState): { width: number; height: number } {
  const size = {
    width: state.width * (state.fallen_presentation?.long_axis_scale ?? 1),
    height: state.height * (state.fallen_presentation?.cross_axis_scale ?? 1),
  };
  return size;
}

/** Returns the complete rotated sprite footprint used by result-camera fitting. */
export function get_pin_screen_bounds(state: PinGeometryState): PinScreenBounds {
  const display_angle = get_pin_display_angle(state);
  const size = get_scaled_pin_size(state);
  const half_width =
    (Math.abs(Math.cos(display_angle)) * size.width +
      Math.abs(Math.sin(display_angle)) * size.height) /
    2;
  const half_height =
    (Math.abs(Math.sin(display_angle)) * size.width +
      Math.abs(Math.cos(display_angle)) * size.height) /
    2;
  return {
    left: state.x - half_width,
    right: state.x + half_width,
    top: state.y - half_height,
    bottom: state.y + half_height,
  };
}

export function get_pin_vertical_extent(state: PinGeometryState): number {
  if (state.kind === "standing_pin") return state.height / 2;
  const display_angle = get_pin_display_angle(state);
  const size = get_scaled_pin_size(state);
  const extent =
    (Math.abs(Math.sin(display_angle)) * size.width +
      Math.abs(Math.cos(display_angle)) * size.height) /
    2;
  return extent;
}

export function get_pin_body_center_y(state: PinGeometryState): number {
  return state.ground_y - get_pin_vertical_extent(state) - state.lift;
}

export function get_pin_shadow_geometry(state: PinGeometryState): PinShadowGeometry {
  const display_angle = get_pin_display_angle(state);
  const size = get_scaled_pin_size(state);
  const horizontal_extent =
    (Math.abs(Math.cos(display_angle)) * size.width +
      Math.abs(Math.sin(display_angle)) * size.height) /
    2;
  const radius_x = Math.max(1, horizontal_extent * (state.kind === "fallen_pin" ? 0.78 : 0.76));
  const radius_y = Math.max(
    1,
    Math.min(size.width, size.height) *
      (state.kind === "fallen_pin"
        ? 0.18 + (state.fallen_presentation?.contact_softness ?? 0) * 0.08
        : 0.17),
  );
  const gap = Math.max(1, radius_y * 0.25);
  return { x: state.ground_x, y: state.ground_y + radius_y + gap, radius_x, radius_y };
}

export function draw_pin_shadow(context: CanvasRenderingContext2D, state: PinDrawState): void {
  const shadow = get_pin_shadow_geometry(state);
  context.fillStyle = `rgba(39, 27, 20, ${Math.max(0.16, 0.54 - state.motion_energy * 0.28)})`;
  context.beginPath();
  context.ellipse(shadow.x, shadow.y, shadow.radius_x, shadow.radius_y, 0, 0, Math.PI * 2);
  context.fill();
}

export function draw_pin_body(
  context: CanvasRenderingContext2D,
  assets: PinAssets,
  state: PinDrawState,
): void {
  const source = state.kind === "standing_pin" ? assets.upright : assets.fallen;
  const pose = state.kind === "fallen_pin" ? state.fallen_presentation : undefined;
  const display_angle = get_pin_display_angle(state);

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
  if (pose !== undefined) context.scale(pose.long_axis_scale, pose.cross_axis_scale);
  // The SVG's crown points right before rotation. Its screen-space y offset
  // is therefore proportional to sin(angle), so the canonical angle above
  // guarantees that the crown cannot land below the base.
  context.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
  // Large nearby pins receive two inexpensive solid overlays. They give a
  // fallen profile a visible rounded end, side light, and contact depth;
  // distant 990-pin bodies keep the one-sprite fast path.
  if (pose !== undefined && state.width >= 22) {
    const end_x = -state.width * 0.39;
    const end_radius = state.height * 0.32;
    context.fillStyle = `rgba(92, 67, 46, ${0.22 + Math.abs(Math.sin(pose.roll_phase)) * 0.16})`;
    context.beginPath();
    context.ellipse(end_x, 0, end_radius, Math.max(1, end_radius * 0.58), 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255, 250, 230, 0.38)";
    context.beginPath();
    context.ellipse(
      end_x + Math.cos(pose.roll_phase) * end_radius * 0.3,
      -end_radius * 0.18,
      Math.max(1, end_radius * 0.38),
      Math.max(1, end_radius * 0.17),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.resetTransform();
}

export function draw_pin(
  context: CanvasRenderingContext2D,
  assets: PinAssets,
  state: PinDrawState,
): void {
  draw_pin_shadow(context, state);
  draw_pin_body(context, assets, state);
}
