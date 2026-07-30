import assert from "node:assert/strict";
import test from "node:test";

import { create_input_controller } from "../src/app/input_controller.ts";

function create_keyboard_event(key, type = "keydown") {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  return event;
}

function create_options(phase = "aiming") {
  let current_phase = phase;
  const aim = { lateral_offset: 0, power: 16 };
  const calls = { launches: 0, steer: [], aim: [] };
  const options = {
    get_phase: () => current_phase,
    get_aim: () => aim,
    set_aim: (lateral_offset, power) => {
      aim.lateral_offset = lateral_offset;
      aim.power = power;
      calls.aim.push({ lateral_offset, power });
    },
    launch: () => {
      calls.launches += 1;
    },
    steer: (direction) => {
      calls.steer.push(direction);
    },
  };
  return {
    options,
    calls,
    set_phase: (value) => {
      current_phase = value;
    },
  };
}

test("input controller clamps aim and power and launches on space", () => {
  const target = new EventTarget();
  const fixture = create_options();
  const controller = create_input_controller(target, fixture.options);
  for (let index = 0; index < 30; index += 1)
    target.dispatchEvent(create_keyboard_event("ArrowLeft"));
  for (let index = 0; index < 30; index += 1)
    target.dispatchEvent(create_keyboard_event("ArrowDown"));
  target.dispatchEvent(create_keyboard_event(" "));
  assert.deepEqual(fixture.calls.aim.at(-1), { lateral_offset: -4.5, power: 8 });
  assert.equal(fixture.calls.launches, 1);
  controller.dispose();
});

test("input controller resolves held directions, releases, blur, and cleanup", () => {
  const target = new EventTarget();
  const fixture = create_options("rolling");
  const controller = create_input_controller(target, fixture.options);
  target.dispatchEvent(create_keyboard_event("ArrowLeft"));
  target.dispatchEvent(create_keyboard_event("ArrowRight"));
  const release_right = create_keyboard_event("ArrowRight", "keyup");
  target.dispatchEvent(release_right);
  target.dispatchEvent(new Event("blur"));
  controller.dispose();
  assert.deepEqual(fixture.calls.steer, [-1, 0, -1, 0, 0]);
});
