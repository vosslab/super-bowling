import assert from "node:assert/strict";
import test from "node:test";

import { create_impact_window_accumulator } from "../src/simulation/impact_window.ts";

test("aggregates collision paths and drains each physical window once", () => {
  const impacts = create_impact_window_accumulator();
  impacts.record_collision("ball_pin", 2, [
    { x: 1, y: 3 },
    { x: 3, y: 5 },
  ]);
  impacts.record_collision("ball_pin", 6, [{ x: 6, y: 8 }]);
  impacts.record_collision("pin_pin", 4, [{ x: -2, y: 10 }]);

  assert.deepEqual(impacts.drain(), {
    ball_pin: {
      contact_count: 2,
      total_impulse: 8,
      maximum_impulse: 6,
      centroid_x: 5,
      centroid_y: 7,
    },
    pin_pin: {
      contact_count: 1,
      total_impulse: 4,
      maximum_impulse: 4,
      centroid_x: -2,
      centroid_y: 10,
    },
    fallen: undefined,
  });
  assert.deepEqual(impacts.drain(), {
    ball_pin: undefined,
    pin_pin: undefined,
    fallen: undefined,
  });
});

test("summarizes fall transitions and reset discards pending presentation data", () => {
  const impacts = create_impact_window_accumulator();
  impacts.record_fall(2, { x: 0, y: 4 });
  impacts.record_fall(6, { x: 8, y: 12 });
  assert.deepEqual(impacts.drain().fallen, {
    transition_count: 2,
    total_speed: 8,
    maximum_speed: 6,
    centroid_x: 6,
    centroid_y: 10,
  });

  impacts.record_collision("ball_pin", 3, [{ x: 1, y: 2 }]);
  impacts.reset();
  assert.deepEqual(impacts.drain(), {
    ball_pin: undefined,
    pin_pin: undefined,
    fallen: undefined,
  });
});
