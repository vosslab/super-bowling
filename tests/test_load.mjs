import assert from "node:assert/strict";
import test from "node:test";

import { load_save, store_save } from "../src/save/load.ts";
import { create_save_settings } from "../src/save/settings.ts";
import { save_storage_key } from "../src/save/save_file.ts";

function create_memory_storage(initial_value = null) {
  let saved_value = initial_value;
  return {
    getItem: () => saved_value,
    setItem: (_key, value) => {
      saved_value = value;
    },
    value: () => saved_value,
  };
}

test("loads defaults from missing, malformed, and obsolete storage values", () => {
  for (const value of [null, "not json", JSON.stringify({ version: 9 })]) {
    const save = load_save(create_memory_storage(value));
    assert.equal(save.version, 4);
    assert.equal(save.recent_setup.pin_count, 10);
  }
});

test("stores one normalized versioned schema and reads it back", () => {
  const storage = create_memory_storage();
  store_save(storage, {
    version: 4,
    mute_enabled: true,
    reduced_motion: true,
    recent_setup: {
      bowls_per_frame: 3,
      pin_count: 50,
      players: [
        {
          name: "Ari",
          ball_design: { base_color: "#0099ff", accent_color: "#ffffff", pattern: "single_band" },
        },
      ],
    },
    mode_records: {
      "50:3": {
        best_score: 500,
        recent_scores: [500],
        best_frame_score: 50,
        best_strike_streak: 3,
        matches_played: 1,
      },
    },
  });

  assert.equal(JSON.parse(storage.value())["version"], 4);
  assert.deepEqual(load_save(storage), {
    version: 4,
    mute_enabled: true,
    reduced_motion: true,
    recent_setup: {
      bowls_per_frame: 3,
      pin_count: 50,
      players: [
        {
          name: "Ari",
          ball_design: { base_color: "#0099FF", accent_color: "#FFFFFF", pattern: "single_band" },
        },
      ],
    },
    mode_records: {
      "50:3": {
        best_score: 500,
        recent_scores: [500],
        best_frame_score: 50,
        best_strike_streak: 3,
        matches_played: 1,
      },
    },
  });
});

test("keeps in-memory settings usable when browser storage throws", () => {
  const throwing_storage = {
    getItem: () => {
      throw new Error("private storage");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  const settings = create_save_settings(throwing_storage);
  settings.set_mute_enabled(true);
  settings.set_reduced_motion(true);
  settings.record_completed_match(20, 2, {
    top_score: 600,
    best_frame_score: 30,
    longest_strike_streak: 2,
  });

  assert.deepEqual(settings.get_settings(), { mute_enabled: true, reduced_motion: true });
  assert.equal(settings.get_mode_record(20, 2)?.best_score, 600);
});

test("uses the single named storage key", () => {
  let written_key = "";
  store_save(
    {
      getItem: () => null,
      setItem: (key) => {
        written_key = key;
      },
    },
    load_save(create_memory_storage()),
  );

  assert.equal(written_key, save_storage_key);
});
