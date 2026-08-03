import assert from "node:assert/strict";
import test from "node:test";

import {
  create_default_save,
  normalize_save_file,
  record_completed_match,
} from "../src/save/save_file.ts";
import { create_save_settings } from "../src/save/settings.ts";

test("migrates a literal version-one save and clears incomparable records", () => {
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
  assert.equal(save.version, 4);
  assert.deepEqual(save.mode_records, {});
});

test("returns useful defaults for missing or obsolete save schemas", () => {
  assert.deepEqual(normalize_save_file(undefined), create_default_save());
  assert.deepEqual(normalize_save_file({ version: 9 }), create_default_save());
});

test("migrates version-two best scores to classic mode records", () => {
  const save = normalize_save_file({
    version: 2,
    mute_enabled: false,
    reduced_motion: false,
    recent_setup: { pin_count: 10, players: [] },
    best_scores: { 10: 300 },
  });
  assert.deepEqual(save.mode_records["10:2"], {
    best_score: 300,
    recent_scores: [],
    best_frame_score: 0,
    best_strike_streak: 0,
    matches_played: 1,
  });
  assert.equal(save.recent_setup.bowls_per_frame, 2);
});

test("migrates version-three best scores without fabricating recent results", () => {
  const save = normalize_save_file({
    version: 3,
    mute_enabled: true,
    reduced_motion: false,
    recent_setup: { bowls_per_frame: 3, pin_count: 10, players: [] },
    best_scores: { "10:2": 300, "10:3": 130 },
  });

  assert.deepEqual(save.mode_records, {
    "10:2": {
      best_score: 300,
      recent_scores: [],
      best_frame_score: 0,
      best_strike_streak: 0,
      matches_played: 1,
    },
    "10:3": {
      best_score: 130,
      recent_scores: [],
      best_frame_score: 0,
      best_strike_streak: 0,
      matches_played: 1,
    },
  });
});

test("falls back to two bowls and rejects custom scores over their real ceiling", () => {
  const malformed = normalize_save_file({
    version: 4,
    recent_setup: { bowls_per_frame: 9, pin_count: 10, players: [] },
    mode_records: {
      "10:5": {
        best_score: 151,
        recent_scores: [],
        best_frame_score: 0,
        best_strike_streak: 0,
        matches_played: 1,
      },
    },
  });
  assert.equal(malformed.recent_setup.bowls_per_frame, 2);
  assert.deepEqual(malformed.mode_records, {});
});

test("repairs score histories while dropping only corrupt mode records", () => {
  const save = normalize_save_file({
    version: 4,
    recent_setup: { bowls_per_frame: 1, pin_count: 10, players: [] },
    mode_records: {
      "10:1": {
        best_score: 110,
        recent_scores: [110, "bad", 100, 90, 80, 70, 60],
        best_frame_score: 10,
        best_strike_streak: 3,
        matches_played: 4,
      },
      "10:5": {
        best_score: 150,
        recent_scores: [],
        best_frame_score: 10,
        best_strike_streak: 2.5,
        matches_played: 1,
      },
    },
  });

  assert.deepEqual(save.mode_records["10:1"]?.recent_scores, [110, 100, 90, 80, 70]);
  assert.equal(save.mode_records["10:5"], undefined);
});

test("records completed match values with a five-game newest-first history", () => {
  let save = create_default_save();
  for (const top_score of [100, 110, 120, 130, 140, 150]) {
    save = record_completed_match(save, 10, 2, {
      top_score,
      best_frame_score: 30,
      longest_strike_streak: 3,
    });
  }

  assert.deepEqual(save.mode_records["10:2"], {
    best_score: 150,
    recent_scores: [150, 140, 130, 120, 110],
    best_frame_score: 30,
    best_strike_streak: 3,
    matches_played: 6,
  });
});

test("rejects corrupt completed-match scalars without changing a record", () => {
  const save = record_completed_match(create_default_save(), 10, 2, {
    top_score: 200,
    best_frame_score: 30,
    longest_strike_streak: 4,
  });
  const unchanged = record_completed_match(save, 10, 2, {
    top_score: 201,
    best_frame_score: 30.5,
    longest_strike_streak: 5,
  });

  assert.deepEqual(unchanged, save);
});

test("commits completed matches through the settings controller", () => {
  let stored_value = null;
  const settings = create_save_settings({
    getItem: () => stored_value,
    setItem: (_key, value) => {
      stored_value = value;
    },
  });

  const saved = settings.record_completed_match(10, 2, {
    top_score: 210,
    best_frame_score: 30,
    longest_strike_streak: 4,
  });

  assert.equal(settings.get_mode_record(10, 2)?.best_score, 210);
  assert.deepEqual(JSON.parse(stored_value), saved);
});
