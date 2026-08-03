import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { get_ball_pattern_label } from "../src/designer/ball_designer.tsx";

test("normalizes each visible ball-design choice for setup and gameplay", () => {
  for (const pattern of ["solid", "single_band", "double_band", "chevron"]) {
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
  }
});
