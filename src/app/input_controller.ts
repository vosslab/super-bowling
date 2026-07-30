export type InputController = {
  dispose(): void;
};

export type InputControllerOptions = {
  get_phase(): "aiming" | "rolling" | "other";
  get_aim(): { lateral_offset: number; power: number };
  set_aim(lateral_offset: number, power: number): void;
  launch(): void;
  steer(direction: -1 | 0 | 1): void;
};

const aim_step = 0.45;
const power_step = 1;
const minimum_aim = -4.5;
const maximum_aim = 4.5;
const minimum_power = 8;
const maximum_power = 24;

function clamp(value: number, minimum: number, maximum: number): number {
  const result = Math.min(maximum, Math.max(minimum, value));
  return result;
}

function is_control_key(key: string): boolean {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar"];
  return keys.includes(key);
}

function change_aim(
  options: InputControllerOptions,
  lateral_delta: number,
  power_delta: number,
): void {
  const aim = options.get_aim();
  const lateral_offset = clamp(aim.lateral_offset + lateral_delta, minimum_aim, maximum_aim);
  const power = clamp(aim.power + power_delta, minimum_power, maximum_power);
  options.set_aim(lateral_offset, power);
}

export function create_input_controller(
  target: Window,
  options: InputControllerOptions,
): InputController {
  const pressed_directions = new Set<-1 | 1>();

  function steer_from_pressed_directions(): void {
    const left_pressed = pressed_directions.has(-1);
    const right_pressed = pressed_directions.has(1);
    const direction = left_pressed === right_pressed ? 0 : left_pressed ? -1 : 1;
    options.steer(direction);
  }

  function keydown(event: KeyboardEvent): void {
    if (!is_control_key(event.key)) return;
    const phase = options.get_phase();
    if (phase === "other") return;
    event.preventDefault();
    if (phase === "aiming") {
      if (event.key === "ArrowLeft") change_aim(options, -aim_step, 0);
      if (event.key === "ArrowRight") change_aim(options, aim_step, 0);
      if (event.key === "ArrowUp") change_aim(options, 0, power_step);
      if (event.key === "ArrowDown") change_aim(options, 0, -power_step);
      if (event.key === " " || event.key === "Spacebar") options.launch();
      return;
    }
    if (phase === "rolling") {
      if (event.key === "ArrowLeft") pressed_directions.add(-1);
      if (event.key === "ArrowRight") pressed_directions.add(1);
      steer_from_pressed_directions();
    }
  }

  function keyup(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (options.get_phase() !== "rolling") return;
    event.preventDefault();
    if (event.key === "ArrowLeft") pressed_directions.delete(-1);
    if (event.key === "ArrowRight") pressed_directions.delete(1);
    steer_from_pressed_directions();
  }

  function blur(): void {
    pressed_directions.clear();
    options.steer(0);
  }

  target.addEventListener("keydown", keydown);
  target.addEventListener("keyup", keyup);
  target.addEventListener("blur", blur);

  function dispose(): void {
    target.removeEventListener("keydown", keydown);
    target.removeEventListener("keyup", keyup);
    target.removeEventListener("blur", blur);
    pressed_directions.clear();
    options.steer(0);
  }

  return { dispose };
}
