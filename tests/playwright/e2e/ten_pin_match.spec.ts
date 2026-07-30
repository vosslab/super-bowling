// Selector contract: src/app/app.tsx exposes the fixture launch; src/app/game.tsx exposes score cells.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("fixture: one player completes a perfect ten-pin match", async ({ page }) => {
  await page.goto("/?fixture=perfect_game");
  await expect(page.getByRole("button", { name: "Run deterministic perfect game" })).toBeVisible();
  await page.screenshot({ path: "test-results/01_ready_play.png", fullPage: true });
  await page.getByRole("button", { name: "Run deterministic perfect game" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Final score" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Final score" })).toContainText("300");
  await expect(page.locator("[data-frame-cell]")).toHaveCount(10);
  await expect(page.locator('[data-roll-mark="strike"]')).toHaveCount(12);
  await page.screenshot({ path: "test-results/02_final_score.png", fullPage: true });
});
