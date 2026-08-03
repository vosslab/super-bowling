import assert from "node:assert/strict";
import test from "node:test";

import {
  describe_spin,
  format_angle,
  format_shot_plan,
  format_start_position,
} from "../src/app/aim_feedback.ts";

test("describes board position with a player-facing direction", () => {
  assert.equal(format_start_position(0), "center");
  assert.equal(format_start_position(-1), "1.0 board left");
});

test("describes launch angle with a player-facing direction", () => {
  assert.equal(format_angle(0), "straight");
  assert.equal(format_angle(0.14), "0.1 deg right");
});

test("scales hook language to the current spin range", () => {
  assert.equal(describe_spin(-0.2, 1), "light left hook");
  assert.equal(describe_spin(3, 4), "strong right hook");
});

test("summarizes a shot plan without repeating raw control values", () => {
  const plan = format_shot_plan({
    aim: { power: 18, start_position: 0, angle: 0, spin: 0.2 },
    angle_degrees: 0.2,
    maximum_power: 24,
    maximum_spin_magnitude: 1,
    minimum_power: 8,
    start_position_boards: 1,
  });
  assert.equal(
    plan,
    "Shot plan: 1.0 board right start; slight right angle; light right hook; steady pace.",
  );
});
