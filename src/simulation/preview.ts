import RAPIER from "@dimforge/rapier2d-compat";

import { ball_radius, gutter_width, lane_width, pit_back_y } from "../config/lane";
import { physics_config } from "../config/physics";
import type { RackPinCount } from "../config/pin_counts";
import { apply_ball_force, type BallForceState } from "./ball_force";
import { initialize_rapier } from "./world";

export type PreviewLaunch = {
  power: number;
  start_position: number;
  angle: number;
  spin: number;
};

function create_preview_lane(world: RAPIER.World, pin_count: RackPinCount): void {
  const half_width = lane_width(pin_count) / 2 + gutter_width;
  const length = pit_back_y(pin_count);
  for (const x of [-half_width, half_width]) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, length / 2));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, length / 2), body);
  }
  const backstop = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, length));
  world.createCollider(RAPIER.ColliderDesc.cuboid(half_width, 0.05), backstop);
}

export async function create_preview_path(
  pin_count: RackPinCount,
  launch: PreviewLaunch,
): Promise<Float32Array> {
  await initialize_rapier();
  const world = new RAPIER.World({ x: 0, y: 0 });
  world.timestep = physics_config.fixed_step_seconds;
  create_preview_lane(world, pin_count);
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(launch.start_position, 0)
      .setLinearDamping(0)
      .lockRotations(),
  );
  world.createCollider(RAPIER.ColliderDesc.ball(ball_radius), ball);
  ball.setLinvel(
    { x: Math.sin(launch.angle) * launch.power, y: Math.cos(launch.angle) * launch.power },
    true,
  );
  let state: BallForceState = { spin: launch.spin, in_gutter: false, in_pit: false };
  const points: number[] = [];
  for (let step = 0; step < 1200 && !state.in_pit; step += 1) {
    if (step % 6 === 0) {
      const position = ball.translation();
      points.push(position.x, position.y);
    }
    state = apply_ball_force(ball, state, {
      pin_count,
      timestep_seconds: physics_config.fixed_step_seconds,
      damping: physics_config.ball_linear_damping,
      spin_decay: physics_config.ball_spin_decay,
      capture_ball(body: RAPIER.RigidBody): void {
        body.setLinvel({ x: 0, y: 0 }, true);
      },
    });
    world.step();
  }
  const position = ball.translation();
  points.push(position.x, position.y);
  world.free();
  const path = new Float32Array(points);
  return path;
}
