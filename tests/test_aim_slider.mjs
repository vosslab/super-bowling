import assert from "node:assert/strict";
import test from "node:test";

import {
  centered_slider_tick,
  centered_slider_value,
  create_centered_slider_scale,
} from "../src/app/aim_slider.ts";

test("centered slider maps both endpoints and zero to exact integer ticks", () => {
  const scale = create_centered_slider_scale(1, 0.02771);
  assert.deepEqual(
    [-scale.maximum_tick, 0, scale.maximum_tick].map((tick) => centered_slider_value(scale, tick)),
    [-1, 0, 1],
  );
});

test("centered slider maps physical endpoints back to symmetric ticks", () => {
  const scale = create_centered_slider_scale(4, 0.35);
  assert.deepEqual(
    [-4, 0, 4].map((value) => centered_slider_tick(scale, value)),
    [-scale.maximum_tick, 0, scale.maximum_tick],
  );
});
