export type ScreenPoint = { x: number; y: number };
export type AimGuidePath = { preview_path: Float32Array };
export type AimGuideBall = { x: number; y: number; width: number };
export type AimGuideCommand = {
  kind: "aim_guide";
  x: number;
  y: number;
  end_x: number;
  end_y: number;
  width: number;
  points: ReadonlyArray<ScreenPoint>;
};
export type ProjectLanePoint = (x: number, y: number) => ScreenPoint | undefined;

export function create_aim_guide_command(
  aim_guide: AimGuidePath,
  ball: AimGuideBall,
  project_lane_point: ProjectLanePoint,
): AimGuideCommand {
  const points: ScreenPoint[] = [];
  for (let index = 0; index + 1 < aim_guide.preview_path.length; index += 2) {
    const x = aim_guide.preview_path[index];
    const y = aim_guide.preview_path[index + 1];
    if (x === undefined || y === undefined) continue;
    const point = project_lane_point(x, y);
    if (point !== undefined) points.push(point);
  }
  if (points.length < 2) throw new Error("Aim guides require a sampled visible preview path.");
  const clear_radius = ball.width * 0.7;
  const visible = points.filter(
    (point) => Math.hypot(point.x - ball.x, point.y - ball.y) >= clear_radius,
  );
  const rendered =
    visible.length >= 2
      ? visible
      : ((): ScreenPoint[] => {
          const end = points[points.length - 1] ?? { x: ball.x, y: ball.y - clear_radius };
          const distance = Math.hypot(end.x - ball.x, end.y - ball.y) || 1;
          return [
            {
              x: ball.x + ((end.x - ball.x) / distance) * clear_radius,
              y: ball.y + ((end.y - ball.y) / distance) * clear_radius,
            },
            end,
          ];
        })();
  const start = rendered[0] ?? { x: ball.x, y: ball.y };
  const end = rendered[rendered.length - 1] ?? start;
  return {
    kind: "aim_guide",
    x: start.x,
    y: start.y,
    end_x: end.x,
    end_y: end.y,
    width: Math.max(2, ball.width * 0.1),
    points: rendered,
  };
}

export function draw_aim_guide(context: CanvasRenderingContext2D, command: AimGuideCommand): void {
  context.save();
  context.strokeStyle = "rgba(255, 239, 117, 0.94)";
  context.lineWidth = command.width;
  context.lineCap = "round";
  context.setLineDash([0, command.width * 3.2]);
  const first = command.points[0];
  if (first !== undefined) {
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of command.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}
