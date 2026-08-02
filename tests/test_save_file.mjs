import assert from "node:assert/strict";
import test from "node:test";

import {
  create_default_save,
  normalize_save_file,
  update_best_score,
} from "../src/save/save_file.ts";

test("migrates a literal version-one save and clears incomparable best scores", () => {
  const save = normalize_save_file({
    version: 1,
    mute_enabled: true,
    reduced_motion: "yes",
    recent_setup: {
      bowls_per_frame: 4,
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
    bowls_per_frame: 2,
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
  assert.equal(save.version, 3);
  assert.deepEqual(save.best_scores, {});
});

test("returns useful defaults for missing or obsolete save schemas", () => {
  assert.deepEqual(normalize_save_file(undefined), create_default_save());
  assert.deepEqual(normalize_save_file({ version: 9 }), create_default_save());
});

test("migrates version-two best scores to the classic rule partition", () => {
  const save = normalize_save_file({
    version: 2,
    mute_enabled: false,
    reduced_motion: false,
    recent_setup: { pin_count: 10, players: [] },
    best_scores: { 10: 300 },
  });
  assert.equal(save.best_scores["10:2"], 300);
  assert.equal(save.recent_setup.bowls_per_frame, 2);
});

test("records legal best scores independently for every bowls rule", () => {
  const saved_200 = update_best_score(create_default_save(), 10, 2, 200);
  const kept_200 = update_best_score(saved_200, 10, 2, 150);
  const saved_300 = update_best_score(kept_200, 10, 2, 300);
  const custom = update_best_score(saved_300, 10, 3, 130);
  const rejected = update_best_score(custom, 10, 3, 131);

  assert.equal(rejected.best_scores["10:2"], 300);
  assert.equal(rejected.best_scores["10:3"], 130);
  assert.deepEqual(rejected.best_scores, { "10:2": 300, "10:3": 130 });
});

test("falls back to two bowls and rejects custom scores over their real ceiling", () => {
  const malformed = normalize_save_file({
    version: 3,
    recent_setup: { bowls_per_frame: 9, pin_count: 10, players: [] },
    best_scores: { "10:5": 151 },
  });
  assert.equal(malformed.recent_setup.bowls_per_frame, 2);
  assert.deepEqual(malformed.best_scores, {});
});

test("keeps endpoint bowl-rule setup and best-score partitions independent", () => {
  const normalized = normalize_save_file({
    version: 3,
    recent_setup: { bowls_per_frame: 1, pin_count: 10, players: [] },
    best_scores: { "10:1": 110, "10:5": 150 },
  });
  const with_five_bowls = update_best_score(normalized, 10, 5, 151);

  assert.equal(normalized.recent_setup.bowls_per_frame, 1);
  assert.equal(with_five_bowls.best_scores["10:1"], 110);
  assert.equal(with_five_bowls.best_scores["10:5"], 150);
});
