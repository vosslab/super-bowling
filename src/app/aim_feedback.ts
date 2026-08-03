import type { AimValues } from "../game/aim";

export type ShotPlanInput = {
  aim: AimValues;
  angle_degrees: number;
  maximum_power: number;
  maximum_spin_magnitude: number;
  minimum_power: number;
  start_position_boards: number;
};

function lateral_direction(value: number): "left" | "right" {
  return value < 0 ? "left" : "right";
}

export function format_start_position(boards: number): string {
  if (Math.abs(boards) < 0.05) return "center";

  const magnitude = Math.abs(boards).toFixed(1);
  const unit = magnitude === "1.0" ? "board" : "boards";
  const label = `${magnitude} ${unit} ${lateral_direction(boards)}`;
  return label;
}

export function format_angle(angle_degrees: number): string {
  if (Math.abs(angle_degrees) < 0.05) return "straight";

  const magnitude = Math.abs(angle_degrees).toFixed(1);
  const label = `${magnitude} deg ${lateral_direction(angle_degrees)}`;
  return label;
}

export function describe_angle(angle_degrees: number): string {
  const magnitude = Math.abs(angle_degrees);
  if (magnitude < 0.05) return "straight angle";

  const strength = magnitude <= 1 ? "slight" : magnitude <= 3 ? "clear" : "sharp";
  const label = `${strength} ${lateral_direction(angle_degrees)} angle`;
  return label;
}

export function describe_spin(spin: number, maximum_spin_magnitude: number): string {
  if (Math.abs(spin) < 0.005) return "straight roll";

  const fraction = Math.abs(spin) / maximum_spin_magnitude;
  const strength = fraction <= 0.25 ? "light" : fraction <= 0.65 ? "medium" : "strong";
  const label = `${strength} ${lateral_direction(spin)} hook`;
  return label;
}

export function describe_power(
  power: number,
  minimum_power: number,
  maximum_power: number,
): string {
  const range = maximum_power - minimum_power;
  const fraction = range === 0 ? 0 : (power - minimum_power) / range;
  if (fraction <= 0.3) return "soft pace";
  if (fraction <= 0.7) return "steady pace";
  return "hard pace";
}

export function format_shot_plan(input: ShotPlanInput): string {
  const start = format_start_position(input.start_position_boards);
  const angle = describe_angle(input.angle_degrees);
  const spin = describe_spin(input.aim.spin, input.maximum_spin_magnitude);
  const pace = describe_power(input.aim.power, input.minimum_power, input.maximum_power);
  const plan = `Shot plan: ${start} start; ${angle}; ${spin}; ${pace}.`;
  return plan;
}
