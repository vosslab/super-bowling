import assert from "node:assert/strict";
import test from "node:test";

import {
  create_default_save,
  normalize_save_file,
  update_best_score,
} from "../src/save/save_file.ts";

test("normalizes a version-one save into a bounded recent match setup", () => {
  const save = normalize_save_file({
    version: 1,
    mute_enabled: true,
    reduced_motion: "yes",
    recent_setup: {
      pin_count: 1000,
      players: [
        {
          name: "  LEX  ",
          ball_design: {
            base_color: "#10a0ff",
            accent_color: "invalid",
            pattern: "chevron",
            monogram: "z!9",
          },
        },
        "skip this entry",
        { name: "", ball_design: {} },
        { name: "Third", ball_design: {} },
        { name: "Fourth", ball_design: {} },
        { name: "Fifth", ball_design: {} },
      ],
    },
    best_scores: { 10: 300, 20: 601, 1000: 29700, 500: 15000.5 },
  });

  assert.deepEqual(save.recent_setup, {
    pin_count: 1000,
    players: [
      {
        name: "LEX",
        ball_design: {
          base_color: "#10A0FF",
          accent_color: "#c9f3ff",
          pattern: "chevron",
          monogram: "Z9",
        },
      },
      {
        name: "Player 2",
        ball_design: { base_color: "#1479d4", accent_color: "#c9f3ff", pattern: "solid" },
      },
      {
        name: "Third",
        ball_design: { base_color: "#1479d4", accent_color: "#c9f3ff", pattern: "solid" },
      },
      {
        name: "Fourth",
        ball_design: { base_color: "#1479d4", accent_color: "#c9f3ff", pattern: "solid" },
      },
    ],
  });
  assert.deepEqual(save.best_scores, { 10: 300, 20: 601, 1000: 29700 });
});

test("returns useful defaults for missing or obsolete save schemas", () => {
  assert.deepEqual(normalize_save_file(undefined), create_default_save());
  assert.deepEqual(normalize_save_file({ version: 2 }), create_default_save());
});

test("records only monotonic legal best scores for each rack", () => {
  const saved_200 = update_best_score(create_default_save(), 10, 200);
  const kept_200 = update_best_score(saved_200, 10, 150);
  const saved_300 = update_best_score(kept_200, 10, 300);
  const rejected = update_best_score(saved_300, 10, 301);

  assert.equal(rejected.best_scores[10], 300);
  assert.deepEqual(rejected.best_scores, { 10: 300 });
});
