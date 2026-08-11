/**
 * Visual information that a top-down 2D capsule cannot publish. These values
 * are deterministic presentation cues: the simulation remains authoritative
 * for position, long axis, velocity, and whether the pin is fallen.
 */
export type FallenPinPresentation = {
  /** Foreshortens the physical long axis to imply the pin has rolled toward camera. */
  long_axis_scale: number;
  /** Broadens or narrows the body as the unresolved roll exposes its side. */
  cross_axis_scale: number;
  /** Small perspective-only adjustment around the published capsule axis. */
  screen_rotation_offset: number;
  /** Selects a stable light-facing side and end-cap treatment. */
  roll_phase: number;
  /** Physical motion makes the contact shadow loosen briefly during a tumble. */
  contact_softness: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stable_phase(pin_index: number): number {
  // The physical capsule axis can make tiny solver corrections after the pin
  // has nearly stopped. Keep the unresolved roll-about-axis pose attached to
  // pin identity so those corrections cannot reshuffle its apparent side.
  const seed = Math.sin(pin_index * 12.9898 + 5.398) * 43_758.5453;
  return seed - Math.floor(seed);
}

/**
 * Supplies the missing roll-about-the-long-axis degree of freedom for a fallen
 * pin. It never moves the rigid body's projected centre or replaces its
 * physical capsule axis. Pin identity makes a settled deck stable; velocity
 * only increases tumble and slide cues while physics says the pin is moving.
 */
export function derive_fallen_pin_presentation(
  pin_index: number,
  axis_angle: number,
  velocity_x: number,
  velocity_y: number,
  motion_energy: number,
): FallenPinPresentation {
  const phase = stable_phase(pin_index);
  const roll_phase = phase * Math.PI * 2;
  const speed = Math.hypot(velocity_x, velocity_y);
  const moving = clamp(motion_energy, 0, 1);
  const side_exposure = Math.sin(roll_phase);
  const slide_direction = speed > 0.0001 ? Math.atan2(velocity_y, velocity_x) - axis_angle : 0;
  const lateral_slide = Math.sin(slide_direction);

  return {
    long_axis_scale: 0.7 + (phase * 0.19 - moving * 0.08),
    cross_axis_scale: 0.88 + Math.abs(side_exposure) * 0.19 + moving * 0.05,
    screen_rotation_offset: side_exposure * 0.085 + lateral_slide * moving * 0.06,
    roll_phase,
    contact_softness: 0.18 + moving * 0.48,
  };
}
