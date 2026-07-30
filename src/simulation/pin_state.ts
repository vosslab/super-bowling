import { physics_config } from "../config/physics";

export type PinState = "standing" | "fallen";

export const standing_pin_flag = 0;
export const fallen_pin_flag = 1;

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
