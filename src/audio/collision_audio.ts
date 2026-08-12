export const collision_intensity_pin_cap = 12;

export type ImpactPathCue = {
  contact_count: number;
  impulse: number;
  pan: number;
};

/** A bounded simulation-independent impact window at the audio boundary. */
export type CollisionSound = {
  first_contact: boolean;
  ball_pin: ImpactPathCue;
  pin_pin: ImpactPathCue;
  deck: ImpactPathCue;
};

function clamp_unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clamp_pan(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
}

function create_impact_path_cue(input: ImpactPathCue): ImpactPathCue {
  return {
    contact_count: Math.min(
      Math.max(0, Math.floor(input.contact_count)),
      collision_intensity_pin_cap,
    ),
    impulse: clamp_unit(input.impulse),
    pan: clamp_pan(input.pan),
  };
}

/** Safely accepts transport values without making audio depend on simulation types. */
export function create_collision_sound(input: CollisionSound): CollisionSound | undefined {
  const ball_pin = create_impact_path_cue(input.ball_pin);
  const pin_pin = create_impact_path_cue(input.pin_pin);
  const deck = create_impact_path_cue(input.deck);
  if (
    ball_pin.contact_count + pin_pin.contact_count + deck.contact_count === 0 &&
    ball_pin.impulse + pin_pin.impulse + deck.impulse === 0
  )
    return undefined;
  return {
    first_contact: input.first_contact && ball_pin.contact_count > 0,
    ball_pin,
    pin_pin,
    deck,
  };
}
