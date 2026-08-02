import { board_width } from "../config/lane";
import { aim_control_steps, normalize_aim, type AimValues } from "../game/aim";
import type { RackPinCount } from "../config/pin_counts";

export type InputController = {
  dispose(): void;
};

export type InputControllerOptions = {
  get_phase(): "aiming" | "other";
  get_pin_count(): RackPinCount;
  get_aim(): AimValues;
  set_aim(aim: AimValues): void;
  launch(): void;
};

const start_position_step_in_boards = 1;
const power_step = 1;

function is_control_key(key: string): boolean {
  const keys = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "a",
    "A",
    "d",
    "D",
    "q",
    "Q",
    "e",
    "E",
    " ",
    "Spacebar",
  ];
  return keys.includes(key);
}

export function adjust_aim(
  pin_count: RackPinCount,
  aim: AimValues,
  adjustment: Partial<AimValues>,
): AimValues {
  const control_steps = aim_control_steps(pin_count);
  const angle_step = (control_steps.angle_degrees * Math.PI) / 180;
  const start_position_delta = (adjustment.start_position ?? 0) * board_width(pin_count);
  return normalize_aim(pin_count, {
    power: aim.power + (adjustment.power ?? 0) * power_step,
    start_position: aim.start_position + start_position_delta,
    angle: aim.angle + (adjustment.angle ?? 0) * angle_step,
    spin: aim.spin + (adjustment.spin ?? 0) * control_steps.spin,
  });
}

function change_aim(options: InputControllerOptions, adjustment: Partial<AimValues>): void {
  const aim = options.get_aim();
  options.set_aim(adjust_aim(options.get_pin_count(), aim, adjustment));
}

export function create_input_controller(
  target: Window,
  options: InputControllerOptions,
): InputController {
  function keydown(event: KeyboardEvent): void {
    if (!is_control_key(event.key)) return;
    const phase = options.get_phase();
    if (phase === "other") return;
    event.preventDefault();
    if (phase === "aiming") {
      if (event.key === "ArrowLeft")
        change_aim(options, { start_position: -start_position_step_in_boards });
      if (event.key === "ArrowRight")
        change_aim(options, { start_position: start_position_step_in_boards });
      if (event.key === "ArrowUp") change_aim(options, { power: 1 });
      if (event.key === "ArrowDown") change_aim(options, { power: -1 });
      if (event.key === "a" || event.key === "A") change_aim(options, { angle: -1 });
      if (event.key === "d" || event.key === "D") change_aim(options, { angle: 1 });
      if (event.key === "q" || event.key === "Q") change_aim(options, { spin: -1 });
      if (event.key === "e" || event.key === "E") change_aim(options, { spin: 1 });
      if (event.key === " " || event.key === "Spacebar") options.launch();
    }
  }

  target.addEventListener("keydown", keydown);

  function dispose(): void {
    target.removeEventListener("keydown", keydown);
  }

  return { dispose };
}
