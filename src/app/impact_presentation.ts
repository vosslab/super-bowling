import type { CollisionSound } from "../audio/collision_audio";
import type { FallTransitionSummary, ImpactEvent, ImpactPathSummary } from "../simulation/protocol";

/**
 * The 990-pin probe observed a first ball-pin window near 58 impulse units,
 * then dense waves up to roughly 800 (ball-pin) and 1,350 (pin-pin).  This
 * log curve keeps the opening hit audible (about 0.52 at 58) while leaving
 * headroom for the visibly larger cascade windows.
 */
export const impact_impulse_reference = 1350;
export const impact_impulse_scale = 2;

/** The 990-mode legal launch ceiling, used by the rolling audio texture. */
export const legal_roll_speed_reference = 60;

export type ImpactVisualCue = {
  x: number;
  y: number;
  strength: number;
  first_contact: boolean;
};

export type ImpactPresentationCues = {
  audio: CollisionSound | undefined;
  visual: ImpactVisualCue | undefined;
};

type PhysicalCueSource = {
  contact_count: number;
  impulse: number;
  x: number;
  y: number;
};

function clamp_unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finite_nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finite_coordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function contact_count(value: number): number {
  return Math.floor(finite_nonnegative(value));
}

/** Maps a raw physical impulse to a bounded perceptual strength. */
export function normalize_impact_impulse(impulse: number): number {
  const safe_impulse = finite_nonnegative(impulse);
  const numerator = Math.log1p(safe_impulse / impact_impulse_scale);
  const denominator = Math.log1p(impact_impulse_reference / impact_impulse_scale);
  return clamp_unit(numerator / denominator);
}

/**
 * Maps the magnitude from a simulation snapshot to the normalized rolling
 * texture. A legal 990-mode power launch reaches 60 world-speed units.
 */
export function normalize_ball_roll_speed(snapshot_speed: number): number {
  return clamp_unit(finite_nonnegative(snapshot_speed) / legal_roll_speed_reference);
}

function map_path(path: ImpactPathSummary | undefined): PhysicalCueSource {
  if (path === undefined) return { contact_count: 0, impulse: 0, x: 0, y: 0 };
  return {
    contact_count: contact_count(path.contact_count),
    impulse: normalize_impact_impulse(Math.max(path.total_impulse, path.maximum_impulse)),
    x: finite_coordinate(path.centroid_x),
    y: finite_coordinate(path.centroid_y),
  };
}

function map_fall_transition(fallen: FallTransitionSummary | undefined): PhysicalCueSource {
  if (fallen === undefined) return { contact_count: 0, impulse: 0, x: 0, y: 0 };
  return {
    contact_count: contact_count(fallen.transition_count),
    // A deck cue comes only from observed standing-to-fallen body speed.
    impulse: normalize_ball_roll_speed(fallen.maximum_speed),
    x: finite_coordinate(fallen.centroid_x),
    y: finite_coordinate(fallen.centroid_y),
  };
}

function has_physical_signal(source: PhysicalCueSource): boolean {
  return source.contact_count > 0 || source.impulse > 0;
}

function strongest_source(
  first_ball_pin_impact: boolean,
  ball_pin: PhysicalCueSource,
  pin_pin: PhysicalCueSource,
  fallen: PhysicalCueSource,
): PhysicalCueSource | undefined {
  if (first_ball_pin_impact && has_physical_signal(ball_pin)) return ball_pin;
  const sources = [ball_pin, pin_pin, fallen];
  let strongest: PhysicalCueSource | undefined;
  for (const source of sources) {
    if (!has_physical_signal(source)) continue;
    if (strongest === undefined || source.impulse > strongest.impulse) strongest = source;
  }
  return strongest;
}

/**
 * Converts one bounded worker impact window into presentation-only cues.
 * Contact counts deliberately remain uncapped; the audio scheduler owns its
 * voice cap so visual and sound layers see the same physical event.
 */
export function map_impact_presentation(event: ImpactEvent): ImpactPresentationCues {
  const ball_pin = map_path(event.ball_pin);
  const pin_pin = map_path(event.pin_pin);
  const fallen = map_fall_transition(event.fallen);
  const visual_source = strongest_source(event.first_ball_pin_impact, ball_pin, pin_pin, fallen);
  const audio =
    has_physical_signal(ball_pin) || has_physical_signal(pin_pin) || fallen.impulse > 0
      ? {
          first_contact: event.first_ball_pin_impact && ball_pin.contact_count > 0,
          ball_pin: { contact_count: ball_pin.contact_count, impulse: ball_pin.impulse },
          pin_pin: { contact_count: pin_pin.contact_count, impulse: pin_pin.impulse },
          deck_impulse: fallen.impulse,
        }
      : undefined;
  const visual =
    visual_source === undefined
      ? undefined
      : {
          x: visual_source.x,
          y: visual_source.y,
          strength: visual_source.impulse,
          first_contact: event.first_ball_pin_impact && visual_source === ball_pin,
        };
  return { audio, visual };
}
