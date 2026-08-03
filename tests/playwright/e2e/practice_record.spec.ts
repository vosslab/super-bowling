// Selector contract: src/app/game.tsx:537-556 exposes earned-moment state and toast text;
// src/app/game.tsx:808-826 exposes the match summary; src/app/setup.tsx:166-218 exposes records.
// Named-run selection is covered by the pure Node decision tests; this fixture fast-forwards
// through those transient states, so this spec covers browser-observable record feedback.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const save_key = "super_bowling.save";
const start_label = "Start 10 mode - 10 pins for 1 player";

function tiny_record_save(): string {
  return JSON.stringify({
    version: 4,
    mute_enabled: false,
    reduced_motion: false,
    recent_setup: {
      bowls_per_frame: 2,
      pin_count: 10,
      players: [{ name: "Player 1", ball_design: {} }],
    },
    mode_records: {
      "10:2": {
        best_score: 5,
        recent_scores: [5],
        best_frame_score: 5,
        best_strike_streak: 0,
        matches_played: 1,
      },
    },
  });
}

async function seed_tiny_record(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: save_key,
    value: tiny_record_save(),
  });
}

test("practice record: a high game feeds the summary and keeps repeated completed scores", async ({
  page,
}) => {
  await seed_tiny_record(page);
  await page.goto("/?fixture=perfect_game");
  await page.getByRole("button", { name: start_label, exact: true }).click();

  const high_game = page.getByRole("status").filter({ hasText: "HIGH GAME" });
  await expect(high_game).toBeVisible();

  const summary = page.locator(".match_summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Previous high game");
  await expect(
    summary
      .locator("dt", { hasText: "Previous high game" })
      .locator("xpath=following-sibling::dd[1]"),
  ).toHaveText("5");
  await expect(summary).toContainText("High game delta: +295");
  await expect(summary).toContainText("Perfect game");

  await page.getByRole("button", { name: "New match" }).click();
  const practice_record = page.locator('[data-practice-record="record"]');
  await expect(practice_record).toContainText("HIGH GAME");
  await expect(practice_record).toContainText("300");
  await expect(practice_record).toContainText("300, 5");

  await page.getByRole("button", { name: start_label, exact: true }).click();
  await expect(page.locator(".match_summary")).toBeVisible();
  await page.getByRole("button", { name: "New match" }).click();
  await expect(practice_record).toContainText("300, 300, 5");
});

test("earned moment: reduced motion still shows high-game feedback", async ({ page }) => {
  await seed_tiny_record(page);
  await page.goto("/?fixture=perfect_game");
  await page.getByRole("button", { name: "Reduced motion off" }).press("Space");
  await page.getByRole("button", { name: start_label, exact: true }).click();

  await expect(page.locator("main.play_shell")).toHaveAttribute("data-reduced-motion", "true");
  await expect(page.getByRole("status").filter({ hasText: "HIGH GAME" })).toBeVisible();
});
