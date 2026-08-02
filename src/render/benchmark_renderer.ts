import { pin_snapshot_stride, read_snapshot_ball, read_snapshot_pin } from "../simulation/protocol";
import { interpolate_shortest_angle } from "./interpolation";

export type DrawCommand = {
  kind: "lane" | "standing_pin" | "fallen_pin" | "ball";
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

export type RenderSurface = {
  fillStyle: unknown;
  beginPath(): void;
  closePath(): void;
  fill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  ellipse(
    x: number,
    y: number,
    radius_x: number,
    radius_y: number,
    rotation: number,
    start_angle: number,
    end_angle: number,
  ): void;
};

type ProjectedPoint = { x: number; y: number; scale: number };

function project_point(x: number, y: number, width: number, height: number): ProjectedPoint {
  const normalized_y = Math.max(0, Math.min(1, (y + 10) / 40));
  const scale = 0.28 + normalized_y * 0.72;
  return { x: width / 2 + x * 26 * scale, y: height * 0.18 + normalized_y * height * 0.7, scale };
}

function interpolate(first: number, second: number, alpha: number): number {
  return first + (second - first) * alpha;
}

export function create_draw_commands(
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: number,
  alpha: number,
  width: number,
  height: number,
): DrawCommand[] {
  const commands: DrawCommand[] = [
    { kind: "lane", x: width / 2, y: height / 2, width, height, angle: 0 },
  ];
  for (let pin_index = 0; pin_index < pin_count; pin_index += 1) {
    const offset = pin_index * pin_snapshot_stride;
    const previous_pin = read_snapshot_pin(previous_snapshot, offset);
    const current_pin = read_snapshot_pin(current_snapshot, offset);
    if (current_pin.removed || current_pin.in_pit) continue;
    const x = interpolate(previous_pin.x, current_pin.x, alpha);
    const y = interpolate(previous_pin.y, current_pin.y, alpha);
    const point = project_point(x, y, width, height);
    const is_fallen = current_pin.state_flag === 1;
    const pin_width = point.scale * 11;
    const pin_height = point.scale * 30;
    commands.push({
      kind: is_fallen ? "fallen_pin" : "standing_pin",
      x: point.x,
      y: point.y,
      width: is_fallen ? pin_height : pin_width,
      height: is_fallen ? pin_width : pin_height,
      angle: is_fallen
        ? interpolate_shortest_angle(
            previous_pin.fallen_axis_angle,
            current_pin.fallen_axis_angle,
            alpha,
          )
        : 0,
    });
  }
  const ball_offset = pin_count * pin_snapshot_stride;
  const current_ball = read_snapshot_ball(current_snapshot, ball_offset);
  if (!current_ball.in_pit) {
    const ball = project_point(current_ball.x, current_ball.y, width, height);
    commands.push({
      kind: "ball",
      x: ball.x,
      y: ball.y,
      width: ball.scale * 24,
      height: ball.scale * 15,
      angle: 0,
    });
  }
  return commands;
}

export function draw_interpolated_snapshot(
  surface: RenderSurface,
  previous_snapshot: Float32Array,
  current_snapshot: Float32Array,
  pin_count: number,
  alpha: number,
  width: number,
  height: number,
): DrawCommand[] {
  const commands = create_draw_commands(
    previous_snapshot,
    current_snapshot,
    pin_count,
    alpha,
    width,
    height,
  );
  for (const command of commands) {
    if (command.kind === "lane") {
      surface.fillStyle = "#b78342";
      surface.beginPath();
      surface.moveTo(width * 0.26, height);
      surface.lineTo(width * 0.74, height);
      surface.lineTo(width * 0.58, height * 0.18);
      surface.lineTo(width * 0.42, height * 0.18);
      surface.closePath();
      surface.fill();
      continue;
    }
    surface.fillStyle =
      command.kind === "ball" ? "#2e9eea" : command.kind === "fallen_pin" ? "#c84b3f" : "#f5f0df";
    surface.beginPath();
    surface.ellipse(
      command.x,
      command.y,
      command.width / 2,
      command.height / 2,
      command.angle,
      0,
      Math.PI * 2,
    );
    surface.fill();
  }
  return commands;
}
