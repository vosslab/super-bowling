// Selector contract: src/app/setup.tsx:206-208 exposes the exact start control;
// src/app/game.tsx exposes phase, result, score, standing, and lane state.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("real worker: untouched default Space launch reaches the rack and settles an eight-pin roll", async ({
  page,
}) => {
  const page_errors: string[] = [];
  page.on("pageerror", (error) => page_errors.push(error.message));

  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  const standing_count = page.locator("[data-standing-count]");
  await expect(standing_count).toHaveText("10 of 10 pins standing");

  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "rolling");
  await expect(play_shell).toHaveAttribute("data-phase", "result", { timeout: 20_000 });
  await expect(standing_count).toHaveText("2 of 10 pins standing");
  await expect(page.getByRole("status").filter({ hasText: "8 pins down" })).toBeVisible();
  await expect(
    page.locator("[data-frame-cell]").first().locator('[data-roll-mark="roll"]'),
  ).toHaveText("8");
  await page.screenshot({ path: "test-results/03_real_worker_roll.png", fullPage: true });
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  expect(page_errors).toEqual([]);
});
