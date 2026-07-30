/** Stable menu and persistence labels for the six Super Bowling modes. */
export const supported_pin_counts = [10, 20, 50, 100, 500, 1000] as const;

export type PinCount = (typeof supported_pin_counts)[number];

/** Complete triangular rack totals used by simulation, scoring, and rendering. */
export const mode_to_rack_pin_count = {
  10: 10,
  20: 21,
  50: 45,
  100: 105,
  500: 496,
  1000: 990,
} as const satisfies Record<PinCount, number>;

export type RackPinCount = (typeof mode_to_rack_pin_count)[PinCount];

export function is_supported_pin_count(value: number): value is PinCount {
  return supported_pin_counts.some((pin_count) => pin_count === value);
}

export function get_rack_pin_count(mode: PinCount): RackPinCount {
  return mode_to_rack_pin_count[mode];
}

export function get_mode_label(mode: PinCount): string {
  return `${mode.toLocaleString()} mode - ${get_rack_pin_count(mode).toLocaleString()} pins`;
}

export function get_mode_for_rack_pin_count(pin_count: RackPinCount): PinCount {
  for (const mode of supported_pin_counts) {
    if (get_rack_pin_count(mode) === pin_count) return mode;
  }
  throw new Error(`No Super Bowling mode maps to ${pin_count} pins.`);
}
