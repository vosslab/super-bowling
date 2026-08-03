export type CenteredSliderScale = {
  maximum_tick: number;
  maximum_value: number;
};

/**
 * Keeps a native range on an exact integer grid while retaining approximately
 * the requested physical sensitivity on each side of zero.
 */
export function create_centered_slider_scale(
  maximum_value: number,
  preferred_step: number,
): CenteredSliderScale {
  if (!Number.isFinite(maximum_value) || maximum_value <= 0)
    throw new Error("A centered slider requires a finite positive maximum value.");
  if (!Number.isFinite(preferred_step) || preferred_step <= 0)
    throw new Error("A centered slider requires a finite positive preferred step.");

  const maximum_tick = Math.max(1, Math.round(maximum_value / preferred_step));
  return { maximum_tick, maximum_value };
}

export function centered_slider_tick(scale: CenteredSliderScale, value: number): number {
  const bounded_value = Math.min(scale.maximum_value, Math.max(-scale.maximum_value, value));
  return Math.round((bounded_value / scale.maximum_value) * scale.maximum_tick);
}

export function centered_slider_value(scale: CenteredSliderScale, tick: number): number {
  const rounded_tick = Math.round(tick);
  const bounded_tick = Math.min(scale.maximum_tick, Math.max(-scale.maximum_tick, rounded_tick));
  return (bounded_tick / scale.maximum_tick) * scale.maximum_value;
}
