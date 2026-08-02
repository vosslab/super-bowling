import { physics_config } from "../config/physics";

export type PinState = "standing" | "fallen";

export const standing_pin_flag = 0;
export const fallen_pin_flag = 1;

// A sweep is intentionally tolerant: a tenth of a pin radius and five degrees
// are below a player's meaningful deck-position read, while avoiding false
// precision from a solver-island rebuild.
export const sweep_position_tolerance = physics_config.pin_radius * 0.1;
export const sweep_angle_tolerance_radians = (5 * Math.PI) / 180;

export function update_pin_state(
  current_state: PinState,
  displacement: number,
  contact_impulse: number,
): PinState {
  if (current_state === "fallen") {
    return "fallen";
  }
  const is_fallen =
    displacement >= physics_config.fall_distance || contact_impulse >= physics_config.fall_impulse;
  return is_fallen ? "fallen" : "standing";
}

export function get_pin_state_flag(state: PinState): number {
  return state === "fallen" ? fallen_pin_flag : standing_pin_flag;
}
