import type { PinId } from "../brands";
import type { RackSlot } from "./rack";

export type ActivationIndex = {
  cell_size: number;
  cells: Map<string, PinId[]>;
  slots_by_pin_id: Map<PinId, RackSlot>;
};

function get_cell_key(x: number, y: number, cell_size: number): string {
  return `${Math.floor(x / cell_size)}:${Math.floor(y / cell_size)}`;
}

export function create_activation_index(slots: RackSlot[], cell_size: number): ActivationIndex {
  const cells = new Map<string, PinId[]>();
  const slots_by_pin_id = new Map<PinId, RackSlot>();
  for (const slot of slots) {
    const key = get_cell_key(slot.x, slot.y, cell_size);
    const cell = cells.get(key) ?? [];
    cell.push(slot.pin_id);
    cells.set(key, cell);
    slots_by_pin_id.set(slot.pin_id, slot);
  }
  return { cell_size, cells, slots_by_pin_id };
}

export function find_nearby_pin_ids(
  index: ActivationIndex,
  x: number,
  y: number,
  radius: number,
): PinId[] {
  const nearby_pin_ids: PinId[] = [];
  const cell_radius = Math.ceil(radius / index.cell_size);
  const center_x = Math.floor(x / index.cell_size);
  const center_y = Math.floor(y / index.cell_size);
  const radius_squared = radius * radius;
  for (let offset_y = -cell_radius; offset_y <= cell_radius; offset_y += 1) {
    for (let offset_x = -cell_radius; offset_x <= cell_radius; offset_x += 1) {
      const cell = index.cells.get(`${center_x + offset_x}:${center_y + offset_y}`);
      if (cell === undefined) continue;
      for (const pin_id of cell) {
        const slot = index.slots_by_pin_id.get(pin_id);
        if (slot === undefined) continue;
        const distance_squared = (slot.x - x) ** 2 + (slot.y - y) ** 2;
        if (distance_squared <= radius_squared) nearby_pin_ids.push(pin_id);
      }
    }
  }
  return nearby_pin_ids;
}
