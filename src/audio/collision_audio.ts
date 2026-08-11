export const collision_intensity_pin_cap = 12;

export type ImpactPathCue = {
  contact_count: number;
  impulse: number;
};

/**
 * A bounded, simulation-independent description of one physical impact window.
 * Values are normalized before reaching Web Audio so this module stays a stable
 * seam between the worker protocol and the presentation layer.
 */
export type CollisionSound = {
  first_contact: boolean;
  ball_pin: ImpactPathCue;
  pin_pin: ImpactPathCue;
  deck_impulse: number;
  pan?: number;
};

function clamp_unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Safely accepts transport values without making audio depend on simulation types. */
export function create_collision_sound(input: CollisionSound): CollisionSound | undefined {
  const ball_pin_contacts = Math.max(0, Math.floor(input.ball_pin.contact_count));
  const pin_pin_contacts = Math.max(0, Math.floor(input.pin_pin.contact_count));
  const ball_pin_impulse = clamp_unit(input.ball_pin.impulse);
  const pin_pin_impulse = clamp_unit(input.pin_pin.impulse);
  const deck_impulse = clamp_unit(input.deck_impulse);
  if (ball_pin_contacts + pin_pin_contacts === 0 && deck_impulse === 0) return undefined;

  return {
    first_contact: input.first_contact && ball_pin_contacts > 0,
    ball_pin: {
      contact_count: Math.min(ball_pin_contacts, collision_intensity_pin_cap),
      impulse: ball_pin_impulse,
    },
    pin_pin: {
      contact_count: Math.min(pin_pin_contacts, collision_intensity_pin_cap),
      impulse: pin_pin_impulse,
    },
    deck_impulse,
    ...(input.pan === undefined ? {} : { pan: Math.max(-1, Math.min(1, input.pan)) }),
  };
}
