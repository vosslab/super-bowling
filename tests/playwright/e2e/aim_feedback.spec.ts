// Selector contract: src/app/game.tsx exposes real-worker preview readiness and four control sliders.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function expect_in_viewport(locator: import("@playwright/test").Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? Infinity) + (box?.height ?? Infinity)).toBeLessThanOrEqual(1000);
}

test("aiming: keyboard controls update the projected path before launch", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  const power_control = page.locator('[data-control="power"]');
  const guide_readout = page.locator("[data-aim-guide-readout]");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");
  await expect_in_viewport(page.locator(".play_header"));
  await expect_in_viewport(page.locator(".match_roster"));
  await expect_in_viewport(page.locator(".score_strip"));
  await expect_in_viewport(page.locator(".lane_panel"));
  await expect_in_viewport(page.locator(".control_deck"));
  await expect(power_control).toHaveValue("16");
  await expect(guide_readout).toContainText("0.0 boards");
  const initial_guide_readout = await guide_readout.textContent();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("KeyD");
  await page.keyboard.press("KeyE");
  await expect(power_control).toHaveValue("18");
  await expect(guide_readout).toContainText("spin");
  expect(await guide_readout.textContent()).not.toBe(initial_guide_readout);
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");
  await page.screenshot({ path: "test-results/aim_feedback_16_10.png", fullPage: true });

  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "rolling");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "hidden");
});
