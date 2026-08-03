import assert from "node:assert/strict";
import test from "node:test";

import {
  ball_radius,
  board_count,
  board_width,
  lane_width,
  pit_back_y,
  rack_row_count,
} from "../src/config/lane.ts";
import { mode_to_rack_pin_count } from "../src/config/pin_counts.ts";
import { default_hook_tuning, hook_lateral_acceleration } from "../src/simulation/hook.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  read_snapshot_ball,
  read_snapshot_pin,
  write_snapshot_ball,
  write_snapshot_pin,
} from "../src/simulation/protocol.ts";
import { create_preview_path } from "../src/simulation/preview.ts";
import { apply_ball_force } from "../src/simulation/ball_force.ts";

test("derives regulation lane geometry from complete triangular racks", () => {
  assert.equal(rack_row_count(10), 4);
  assert.ok(Math.abs(lane_width(10) * 12 - 41.5) < 0.01);
  for (const pin_count of Object.values(mode_to_rack_pin_count)) {
    assert.ok(board_width(pin_count) > 0);
    assert.ok(pit_back_y(pin_count) > 60);
  }
  assert.equal(board_count, 39);
});

test("snapshot ball records round trip at their declared stride and reject truncation", () => {
  const data = new Float32Array(ball_snapshot_stride);
  const record = {
    x: 1.25,
    y: 2.5,
    velocity_x: -0.5,
    velocity_y: 0.75,
    rotation: 0.3,
    in_pit: true,
  };
  write_snapshot_ball(data, 0, record);
  const restored = read_snapshot_ball(data, 0);
  assert.equal(restored.in_pit, record.in_pit);
  for (const field of ["x", "y", "velocity_x", "velocity_y", "rotation"]) {
    assert.ok(Math.abs(restored[field] - record[field]) < 0.000001);
  }
  assert.throws(() => read_snapshot_ball(new Float32Array(ball_snapshot_stride - 1), 0));
  assert.throws(() => read_snapshot_pin(new Float32Array(pin_snapshot_stride - 1), 0));
});

test("snapshot pin records round trip at the declared stride for every rack", () => {
  for (const pin_count of Object.values(mode_to_rack_pin_count)) {
    const data = new Float32Array(pin_count * pin_snapshot_stride);
    const final_offset = (pin_count - 1) * pin_snapshot_stride;
    const record = {
      x: 1.25,
      y: 2.5,
      velocity_x: -0.5,
      velocity_y: 0.75,
      state_flag: 1,
      removed: true,
      in_pit: false,
      fallen_axis_angle: Math.PI / 3,
    };
    write_snapshot_pin(data, final_offset, record);
    const restored = read_snapshot_pin(data, final_offset);
    assert.deepEqual({ ...restored, fallen_axis_angle: 0 }, { ...record, fallen_axis_angle: 0 });
    assert.ok(Math.abs(restored.fallen_axis_angle - record.fallen_axis_angle) < 0.000001);
  }
});

test("hook preserves its spin and speed-phase behavioral contract", () => {
  const { skid_speed, hook_speed, roll_speed } = default_hook_tuning;
  assert.equal(hook_lateral_acceleration(0, hook_speed), 0);
  assert.equal(hook_lateral_acceleration(1, skid_speed + 1), 0);
  const peak = hook_lateral_acceleration(1, hook_speed);
  assert.ok(peak > 0);
  assert.equal(hook_lateral_acceleration(-1, hook_speed), -peak);
  assert.ok(Math.abs(hook_lateral_acceleration(1, roll_speed / 2)) < peak);
});

test("pins-free preview curves with spin direction in the shared physics world", async () => {
  const zero_spin = await create_preview_path(10, {
    power: 16,
    start_position: 0,
    angle: 0,
    spin: 0,
  });
  const right_spin = await create_preview_path(10, {
    power: 16,
    start_position: 0,
    angle: 0,
    spin: 1,
  });
  const left_spin = await create_preview_path(10, {
    power: 16,
    start_position: 0,
    angle: 0,
    spin: -1,
  });
  assert.ok(
    zero_spin.length >= 4 &&
      right_spin.length >= 4 &&
      left_spin.length >= 4 &&
      zero_spin.length % 2 === 0,
  );
  assert.ok([...zero_spin, ...right_spin, ...left_spin].every(Number.isFinite));
  const x_values = (path) => Array.from(path).filter((_, index) => index % 2 === 0);
  const y_values = (path) => Array.from(path).filter((_, index) => index % 2 === 1);
  const rightmost_x = Math.max(...x_values(right_spin));
  const rightmost_abs_x = Math.max(...x_values(right_spin).map(Math.abs));
  const leftmost_x = Math.min(...x_values(left_spin));
  assert.ok(
    rightmost_x > 0,
    `${rightmost_x} / ${rightmost_abs_x} should curve right; y=${Math.max(...y_values(right_spin))}`,
  );
  assert.ok(leftmost_x < 0, `${leftmost_x} should curve left`);
});

test("gutter entry disables hook and captures only at the pit", () => {
  const position = { x: lane_width(10) / 2 + 0.01, y: 0 };
  let velocity = { x: 0, y: default_hook_tuning.hook_speed };
  const body = {
    linvel: () => velocity,
    setLinvel: (next) => {
      velocity = next;
    },
    translation: () => position,
  };
  const options = { pin_count: 10, timestep_seconds: 1 / 120, damping: 0, spin_decay: 0 };
  const entered_gutter = apply_ball_force(
    body,
    {
      spin: 1,
      in_gutter: false,
      in_pit: false,
      has_hit_pin: true,
      deck_assist_acceleration: 0,
      forward_progress_speed: 0,
      last_y: 0,
    },
    options,
  );
  assert.equal(entered_gutter.in_gutter, true);
  assert.equal(entered_gutter.in_pit, false);

  position.x = 0;
  velocity = { x: 0, y: default_hook_tuning.hook_speed };
  const still_in_gutter = apply_ball_force(body, entered_gutter, options);
  assert.equal(still_in_gutter.in_gutter, true);
  assert.equal(still_in_gutter.in_pit, false);
  assert.equal(velocity.x, 0);

  let capture_count = 0;
  position.y = 0;
  const before_pit = apply_ball_force(
    body,
    {
      spin: 0,
      in_gutter: false,
      in_pit: false,
      has_hit_pin: false,
      deck_assist_acceleration: 0,
      forward_progress_speed: 0,
      last_y: 0,
    },
    {
      ...options,
      capture_ball: () => {
        capture_count += 1;
      },
    },
  );
  assert.equal(before_pit.in_pit, false);
  assert.equal(capture_count, 0);

  position.y = pit_back_y(10) - ball_radius - 0.01;
  const before_capture_boundary = apply_ball_force(body, before_pit, {
    ...options,
    capture_ball: () => {
      capture_count += 1;
    },
  });
  assert.equal(before_capture_boundary.in_pit, false);
  assert.equal(capture_count, 0);

  position.y = pit_back_y(10) - ball_radius + 0.01;
  const in_pit = apply_ball_force(body, before_capture_boundary, {
    ...options,
    capture_ball: () => {
      capture_count += 1;
    },
  });
  assert.equal(in_pit.in_pit, true);
  assert.equal(capture_count, 1);
});
