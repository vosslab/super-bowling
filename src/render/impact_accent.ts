import { pin_radius } from "../config/lane";

export type ScreenPoint = { x: number; y: number };
export type WorldPoint = { x: number; y: number; z: number };

/** A compact, worker-derived contact location in lane world units. */
export type ImpactPresentation = Readonly<{
  x: number;
  y: number;
  strength: number;
  first_contact: boolean;
}>;

export type ImpactAccentCommand = {
  kind: "impact_accent";
  x: number;
  y: number;
  radius: number;
  inner_radius: number;
  alpha: number;
  line_width: number;
  base_depth: number;
  first_contact: boolean;
};

export type ImpactAccentState = Readonly<{
  presentation: ImpactPresentation;
  recorded_at_ms: number;
}>;

export type ImpactAccentSelection = Readonly<{
  active: ImpactAccentState | undefined;
  last_secondary_at_ms: number;
}>;

export type ProjectWorldPoint = (point: WorldPoint) => ScreenPoint | undefined;
export type GetDepthScale = (y: number) => number | undefined;

const impact_accent_duration_ms = { first_contact: 170, secondary: 120 } as const;
const minimum_secondary_impact_interval_ms = 46;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalized_impact_presentation(
  presentation: ImpactPresentation,
): ImpactPresentation | undefined {
  if (!Number.isFinite(presentation.x) || !Number.isFinite(presentation.y)) return undefined;
  if (!Number.isFinite(presentation.strength)) return undefined;
  return {
    x: presentation.x,
    y: presentation.y,
    strength: clamp(presentation.strength, 0, 1),
    first_contact: presentation.first_contact,
  };
}

/** Keeps first contact sharp and secondary accents brief and rate limited. */
export function select_impact_accent(
  active: ImpactAccentState | undefined,
  presentation: ImpactPresentation,
  timestamp_ms: number,
  last_secondary_at_ms: number,
): ImpactAccentSelection {
  const normalized = normalized_impact_presentation(presentation);
  if (!Number.isFinite(timestamp_ms) || normalized === undefined)
    return { active, last_secondary_at_ms };
  const next: ImpactAccentState = { presentation: normalized, recorded_at_ms: timestamp_ms };
  if (normalized.first_contact) return { active: next, last_secondary_at_ms };
  if (active === undefined) return { active: next, last_secondary_at_ms: timestamp_ms };
  if (active.presentation.first_contact) return { active, last_secondary_at_ms };
  const elapsed = timestamp_ms - last_secondary_at_ms;
  if (elapsed >= minimum_secondary_impact_interval_ms)
    return { active: next, last_secondary_at_ms: timestamp_ms };
  if (normalized.strength > active.presentation.strength)
    return { active: next, last_secondary_at_ms: timestamp_ms };
  return { active, last_secondary_at_ms };
}

/** Produces the projected, short-lived visual command or nothing after expiry. */
export function create_impact_accent_command(
  state: ImpactAccentState,
  timestamp_ms: number,
  project_world_point: ProjectWorldPoint,
  get_depth_scale: GetDepthScale,
): ImpactAccentCommand | undefined {
  if (!Number.isFinite(timestamp_ms)) return undefined;
  const presentation = normalized_impact_presentation(state.presentation);
  if (presentation === undefined || !Number.isFinite(state.recorded_at_ms)) return undefined;
  const elapsed = Math.max(0, timestamp_ms - state.recorded_at_ms);
  const duration = presentation.first_contact
    ? impact_accent_duration_ms.first_contact
    : impact_accent_duration_ms.secondary;
  if (elapsed >= duration) return undefined;
  const center = project_world_point({ x: presentation.x, y: presentation.y, z: 0.025 });
  const edge = project_world_point({ x: presentation.x + pin_radius, y: presentation.y, z: 0.025 });
  const depth_scale = get_depth_scale(presentation.y);
  if (center === undefined || edge === undefined || depth_scale === undefined) return undefined;
  const pin_screen_radius = Math.max(1, Math.abs(edge.x - center.x));
  const lifetime = 1 - elapsed / duration;
  const strength = 0.22 + presentation.strength * 0.78;
  const maximum_radius = pin_screen_radius * (presentation.first_contact ? 3.4 : 2.15);
  const radius = clamp(
    pin_screen_radius * (0.7 + (1 - lifetime) * 1.25) * strength,
    2,
    maximum_radius,
  );
  const alpha = clamp(
    lifetime * (presentation.first_contact ? 0.5 : 0.29) * strength,
    0,
    presentation.first_contact ? 0.5 : 0.29,
  );
  return {
    kind: "impact_accent",
    x: center.x,
    y: center.y,
    radius,
    inner_radius: clamp(radius * 0.34, 1, radius),
    alpha,
    line_width: clamp(pin_screen_radius * (presentation.first_contact ? 0.24 : 0.16), 1, 5),
    base_depth: 1 / depth_scale,
    first_contact: presentation.first_contact,
  };
}

export function draw_impact_accent(
  context: CanvasRenderingContext2D,
  command: ImpactAccentCommand,
): void {
  if (command.alpha <= 0 || command.radius <= 0) return;
  context.save();
  const glow = context.createRadialGradient(
    command.x,
    command.y,
    command.inner_radius * 0.2,
    command.x,
    command.y,
    command.radius,
  );
  const hue = command.first_contact ? "255, 236, 146" : "213, 239, 255";
  glow.addColorStop(0, `rgba(${hue}, ${command.alpha * 0.56})`);
  glow.addColorStop(0.58, `rgba(${hue}, ${command.alpha * 0.18})`);
  glow.addColorStop(1, `rgba(${hue}, 0)`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = command.alpha;
  context.strokeStyle = command.first_contact ? "#FFE995" : "#D5EFFF";
  context.lineWidth = command.line_width;
  context.beginPath();
  context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
