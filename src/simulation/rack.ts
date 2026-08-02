import { create_pin_id, type PinId } from "../brands";
import { foul_to_head_pin, pin_radius, pin_spacing, row_spacing } from "../config/lane";
import type { RackPinCount } from "../config/pin_counts";

export type RackSlot = {
  pin_id: PinId;
  x: number;
  y: number;
  row_index: number;
  column_index: number;
};

export type RackBounds = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
};

export type Rack = {
  slots: RackSlot[];
  bounds: RackBounds;
};

function add_row(slots: RackSlot[], width: number, row_index: number): void {
  for (let column_index = 0; column_index < width; column_index += 1) {
    const x = (column_index - (width - 1) / 2) * pin_spacing;
    const y = foul_to_head_pin + row_index * row_spacing;
    slots.push({ pin_id: create_pin_id(slots.length), x, y, row_index, column_index });
  }
}

function calculate_bounds(slots: RackSlot[]): RackBounds {
  const first_slot = slots[0];
  if (first_slot === undefined) {
    throw new Error("A rack requires at least one pin.");
  }
  let min_x = first_slot.x;
  let max_x = first_slot.x;
  let min_y = first_slot.y;
  let max_y = first_slot.y;
  for (const slot of slots) {
    min_x = Math.min(min_x, slot.x);
    max_x = Math.max(max_x, slot.x);
    min_y = Math.min(min_y, slot.y);
    max_y = Math.max(max_y, slot.y);
  }
  const radius = pin_radius;
  return {
    min_x: min_x - radius,
    max_x: max_x + radius,
    min_y: min_y - radius,
    max_y: max_y + radius,
  };
}

export function create_rack(pin_count: RackPinCount): Rack {
  const slots: RackSlot[] = [];
  let row_index = 0;
  while (slots.length < pin_count) {
    add_row(slots, row_index + 1, row_index);
    row_index += 1;
  }
  const bounds = calculate_bounds(slots);
  return { slots, bounds };
}
