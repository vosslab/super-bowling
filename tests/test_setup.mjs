import assert from "node:assert/strict";
import test from "node:test";

import { create_match_setup } from "../src/app/setup.tsx";

test("creates ordered player ids, trimmed fallback names, and normalized ball designs", () => {
  const setup = create_match_setup({
    pin_count: 100,
    bowls_per_frame: 3,
    players: [
      {
        name: " Ari ",
        ball_design: {
          base_color: "#aa3300",
          accent_color: "#00ccaa",
          pattern: "solid",
          monogram: "ar!",
        },
      },
      {
        name: " ",
        ball_design: {
          base_color: "#2200ee",
          accent_color: "#ffffff",
          pattern: "chevron",
          monogram: "be",
        },
      },
      {
        name: "Chen",
        ball_design: { base_color: "#44cc55", accent_color: "#112233", pattern: "double_band" },
      },
      {
        name: "Dia",
        ball_design: { base_color: "#cc22aa", accent_color: "#eecc22", pattern: "single_band" },
      },
    ],
  });
  assert.deepEqual(
    setup.players.map((player) => player.name),
    ["Ari", "Player 2", "Chen", "Dia"],
  );
  assert.deepEqual(
    setup.players.map((player) => Number(player.player_id)),
    [0, 1, 2, 3],
  );
  assert.equal(setup.players[0]?.ball_design.monogram, "AR");
  assert.equal(setup.players[1]?.ball_design.base_color, "#2200EE");
  assert.equal(setup.bowls_per_frame, 3);
});

test("preserves the classic two-bowl rule in an explicit setup", () => {
  const setup = create_match_setup({
    pin_count: 10,
    bowls_per_frame: 2,
    players: [{ name: "Ari", ball_design: {} }],
  });
  assert.equal(setup.bowls_per_frame, 2);
});

test("rejects a setup outside the shared bowls-per-frame bounds", () => {
  assert.throws(() =>
    create_match_setup({
      pin_count: 10,
      bowls_per_frame: 6,
      players: [{ name: "Ari", ball_design: {} }],
    }),
  );
});
