import assert from "node:assert/strict";
import test from "node:test";

import { aim_limits, default_aim } from "../src/game/aim.ts";
import { create_input_controller } from "../src/app/input_controller.ts";

function create_keyboard_event(key) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  return event;
}

function create_options(phase = "aiming") {
  let current_phase = phase;
  const aim = default_aim(10);
  const calls = { launches: 0, aim: [] };
  return {
    options: {
      get_phase: () => current_phase,
      get_pin_count: () => 10,
      get_aim: () => aim,
      set_aim: (next_aim) => {
        Object.assign(aim, next_aim);
        calls.aim.push({ ...next_aim });
      },
      launch: () => {
        calls.launches += 1;
      },
    },
    calls,
    set_phase: (value) => {
      current_phase = value;
    },
  };
}

test("input controller clamps every pre-roll control and launches on space", () => {
  const target = new EventTarget();
  const fixture = create_options();
  const controller = create_input_controller(target, fixture.options);
  for (let index = 0; index < 80; index += 1) {
    target.dispatchEvent(create_keyboard_event("ArrowLeft"));
    target.dispatchEvent(create_keyboard_event("ArrowDown"));
    target.dispatchEvent(create_keyboard_event("a"));
    target.dispatchEvent(create_keyboard_event("q"));
  }
  target.dispatchEvent(create_keyboard_event(" "));
  const limits = aim_limits(10);
  assert.deepEqual(fixture.calls.aim.at(-1), {
    power: limits.minimum_power,
    start_position: limits.minimum_start_position,
    angle: limits.minimum_angle,
    spin: limits.minimum_spin,
  });
  assert.equal(fixture.calls.launches, 1);
  controller.dispose();
});

test("input controller changes angle and spin only while aiming", () => {
  const target = new EventTarget();
  const fixture = create_options();
  const controller = create_input_controller(target, fixture.options);
  target.dispatchEvent(create_keyboard_event("d"));
  target.dispatchEvent(create_keyboard_event("e"));
  const changed = fixture.calls.aim.at(-1);
  assert.ok(changed.angle > 0);
  assert.ok(changed.spin > 0);
  fixture.set_phase("other");
  const call_count = fixture.calls.aim.length;
  target.dispatchEvent(create_keyboard_event("ArrowRight"));
  assert.equal(fixture.calls.aim.length, call_count);
  controller.dispose();
});
