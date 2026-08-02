import type { RackPinCount } from "./pin_counts";

// All distances are feet. Values through deck_tail are published regulation dimensions.
export const pin_spacing = 1;
export const row_spacing = Math.sqrt(3) / 2;
export const pin_radius = 0.1986;
// The collision footprint of a pin after it has fallen. Standing pins remain
// regulation base circles; this represents the body lying outward from its base.
export const fallen_pin_length = 1.25;
export const ball_radius = 0.3542;
export const foul_to_head_pin = 60;
export const lane_edge_margin = 0.2292;
export const gutter_width = 0.7708;
export const deck_tail = 1.25;
export const pit_depth = 3;
export const board_count = 39;

export function rack_row_count(pin_count: RackPinCount): number {
  return Math.ceil((Math.sqrt(8 * pin_count + 1) - 1) / 2);
}

export function lane_width(pin_count: RackPinCount): number {
  const width = (rack_row_count(pin_count) - 1) * pin_spacing + 2 * lane_edge_margin;
  return width;
}

export function board_width(pin_count: RackPinCount): number {
  const width = lane_width(pin_count) / board_count;
  return width;
}

export function deck_depth(pin_count: RackPinCount): number {
  const depth = (rack_row_count(pin_count) - 1) * row_spacing + deck_tail;
  return depth;
}

export function pit_back_y(pin_count: RackPinCount): number {
  const y = foul_to_head_pin + deck_depth(pin_count) + pit_depth;
  return y;
}
