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
  await expect(guide_readout).toContainText("center start");
  const initial_guide_readout = await guide_readout.textContent();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("KeyD");
  await page.keyboard.press("KeyE");
  await expect(power_control).toHaveValue("18");
  await expect(guide_readout).toContainText("right hook");
  expect(await guide_readout.textContent()).not.toBe(initial_guide_readout);
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");

  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "rolling");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "hidden");
});

test("21-pin mode reaches a ready, playable aiming state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "20 mode - 21 pins", exact: true }).click();
  await page
    .getByRole("button", { name: "Start 20 mode - 21 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(play_shell).toHaveAttribute("data-drawn-pin-count", "21");
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute("data-drawn-ball", "true");
  await expect(page.locator(".game_canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});
