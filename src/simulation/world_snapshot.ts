import type RAPIER from "@dimforge/rapier2d-compat";

import {
  ball_snapshot_in_pit_flag_offset,
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_fallen_axis_angle_offset,
  snapshot_in_pit_flag_offset,
  snapshot_removed_flag_offset,
  snapshot_state_flag_offset,
  snapshot_velocity_x_offset,
  snapshot_velocity_y_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "./protocol";
import { get_pin_state_flag } from "./pin_state";
import type { BallRecord, BallSnapshot, PinRecord, SimulationSnapshot } from "./world_contracts";

export function create_simulation_snapshot(options: {
  pin_count: SimulationSnapshot["pin_count"];
  pins_by_id: Map<PinRecord["pin_id"], PinRecord>;
  rapier_world: RAPIER.World;
  ball: BallRecord | undefined;
  retained_ball_snapshot: BallSnapshot;
  ball_in_pit: boolean;
  counts: { standing_pin_count: number; fallen_pin_count: number };
}): SimulationSnapshot {
  const data = new Float32Array(options.pin_count * pin_snapshot_stride + ball_snapshot_stride);
  for (const record of options.pins_by_id.values()) {
    const offset = Number(record.pin_id) * pin_snapshot_stride;
    if (!record.removed) {
      const collider = options.rapier_world.getCollider(record.collider_handle);
      if (collider === null) {
        throw new Error(`Pin ${record.pin_id} is missing its collider for its snapshot.`);
      }
      // Fallen artwork is centered on the capsule's world-space center,
      // rather than the retained upright body origin. The latter sits at the
      // capsule's tail by construction and would visibly desynchronize it.
      const position = record.fallen_collider ? collider.translation() : record.body.translation();
      const velocity = record.body.linvel();
      data[offset + snapshot_x_offset] = position.x;
      data[offset + snapshot_y_offset] = position.y;
      data[offset + snapshot_velocity_x_offset] = velocity.x;
      data[offset + snapshot_velocity_y_offset] = velocity.y;
      if (record.fallen_collider) {
        // Rapier capsules use local y as their long axis; Canvas sprites use
        // their local x axis, so the published drawing axis is +90 degrees.
        data[offset + snapshot_fallen_axis_angle_offset] = collider.rotation() + Math.PI / 2;
      }
    }
    data[offset + snapshot_state_flag_offset] = get_pin_state_flag(record.state);
    data[offset + snapshot_removed_flag_offset] = Number(record.removed);
    data[offset + snapshot_in_pit_flag_offset] = Number(record.in_pit);
  }
  const ball_offset = options.pin_count * pin_snapshot_stride;
  const ball_snapshot =
    options.ball === undefined
      ? options.retained_ball_snapshot
      : {
          x: options.ball.body.translation().x,
          y: options.ball.body.translation().y,
          velocity_x: options.ball.body.linvel().x,
          velocity_y: options.ball.body.linvel().y,
          rotation: options.ball.body.rotation(),
        };
  data[ball_offset] = ball_snapshot.x;
  data[ball_offset + 1] = ball_snapshot.y;
  data[ball_offset + 2] = ball_snapshot.velocity_x;
  data[ball_offset + 3] = ball_snapshot.velocity_y;
  data[ball_offset + 4] = ball_snapshot.rotation;
  data[ball_offset + ball_snapshot_in_pit_flag_offset] = Number(options.ball_in_pit);
  return {
    pin_count: options.pin_count,
    standing_pin_count: options.counts.standing_pin_count,
    fallen_pin_count: options.counts.fallen_pin_count,
    data,
  };
}
