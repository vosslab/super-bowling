// Selector contract: result fixtures exercise visible rolls through the production SimulationClient boundary.
import { expect, test } from "@playwright/test";

const start_label = "Start 10 mode - 10 pins for 1 player";

test.use({ viewport: { width: 1600, height: 1000 } });

test("a visible fixture roll zooms the deck and celebrates a strike", async ({ page }) => {
  await page.goto("/?fixture=strike_result");
  await page.getByRole("button", { name: start_label, exact: true }).click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(page.getByRole("status").filter({ hasText: "Strike!" })).toBeVisible();
  const stinger = page.locator('[data-celebration="strike"]');
  await expect(stinger).toContainText("STRIKE");
  await expect(stinger).toHaveAttribute("data-celebration-presentation", "deck-safe-stinger");
  const stinger_box = await stinger.boundingBox();
  const lane_box = await page.locator(".lane_panel").boundingBox();
  expect(stinger_box).not.toBeNull();
  expect(lane_box).not.toBeNull();
  expect(stinger_box?.y).toBeGreaterThan((lane_box?.y ?? 0) + (lane_box?.height ?? 0) / 2);
  await expect
    .poll(async () => Number(await play_shell.getAttribute("data-camera-zoom")))
    .toBeGreaterThan(1);
});

test("an explicit Normal motion choice keeps celebration motion under an OS reduced-motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?fixture=strike_result");
  await page.getByRole("button", { name: "Reduced motion on", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Reduced motion off", exact: true })).toBeVisible();
  await page.getByRole("button", { name: start_label, exact: true }).click();
  await page.keyboard.press("Space");

  const play_shell = page.locator("main.play_shell");
  const stinger = page.locator('[data-celebration="strike"]');
  await expect(play_shell).toHaveAttribute("data-reduced-motion", "false");
  await expect(stinger).toBeVisible();
  await expect(stinger).toHaveCSS("animation-name", "roll_celebration_arrive");
});

test("two visible fixture rolls celebrate a spare after the deadwood sweep", async ({ page }) => {
  await page.goto("/?fixture=spare_pickup");
  await page.getByRole("button", { name: start_label, exact: true }).click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(page.getByRole("status").filter({ hasText: "3 pins down" })).toBeVisible();
  await expect(page.locator(".roll_celebration")).toHaveCount(0);

  await page.getByRole("button", { name: "Continue to the next roll" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(page.getByRole("status").filter({ hasText: "Spare!" })).toBeVisible();
  await expect(page.locator('[data-celebration="spare"]')).toContainText("SPARE");
});
