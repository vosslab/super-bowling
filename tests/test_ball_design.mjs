import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import {
  draw_static_ball_preview,
  get_ball_pattern_label,
} from "../src/designer/ball_designer.tsx";
import { get_ball_pattern_commands } from "../src/render/ball.ts";

test("normalizes each visible ball-design choice for setup and gameplay", () => {
  const expected_commands = {
    solid: [{ kind: "solid", color: "base", offset: 0 }],
    single_band: [{ kind: "band", color: "accent", offset: 0 }],
    double_band: [
      { kind: "band", color: "accent", offset: -0.18 },
      { kind: "band", color: "accent", offset: 0.18 },
    ],
    chevron: [{ kind: "chevron", color: "accent", offset: 0 }],
  };
  for (const [pattern, commands] of Object.entries(expected_commands)) {
    const design = normalize_ball_design({
      base_color: "#0d82db",
      accent_color: "#c9f3ff",
      pattern,
      monogram: "s!b3",
    });
    assert.equal(design.base_color, "#0D82DB");
    assert.equal(design.accent_color, "#C9F3FF");
    assert.equal(design.monogram, "SB");
    assert.equal(get_ball_pattern_label(design.pattern).length > 0, true);
    assert.deepEqual(get_ball_pattern_commands(design.pattern), commands);
  }
});

test("uses one shared draw_ball call for a static preview frame", () => {
  let clear_count = 0;
  let ellipse_count = 0;
  const context = {
    clearRect() {
      clear_count += 1;
    },
    save() {},
    restore() {},
    beginPath() {},
    ellipse() {
      ellipse_count += 1;
    },
    clip() {},
    fillRect() {},
    fill() {},
    stroke() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    drawImage() {},
    fillText() {},
    moveTo() {},
    lineTo() {},
    set fillStyle(value) {},
    set strokeStyle(value) {},
    set lineWidth(value) {},
    set globalAlpha(value) {},
    set font(value) {},
    set textAlign(value) {},
    set textBaseline(value) {},
  };
  draw_static_ball_preview(context, 320, 160, normalize_ball_design({ pattern: "chevron" }), {});
  assert.equal(clear_count, 1);
  assert.ok(ellipse_count >= 2);
});
