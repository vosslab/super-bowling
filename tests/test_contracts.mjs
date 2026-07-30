import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { is_supported_pin_count } from "../src/config/pin_counts.ts";

test("normalizes a recognizable compact ball design", () => {
  const design = normalize_ball_design({
    base_color: "#10a0ff",
    accent_color: "#ffcc00",
    monogram: "m! 7",
    pattern: "chevron",
  });

  assert.deepEqual(design, {
    base_color: "#10A0FF",
    accent_color: "#FFCC00",
    monogram: "M7",
    pattern: "chevron",
  });
});

test("accepts the largest supported rack and rejects adjacent counts", () => {
  assert.equal(is_supported_pin_count(1000), true);
  assert.equal(is_supported_pin_count(999), false);
});
