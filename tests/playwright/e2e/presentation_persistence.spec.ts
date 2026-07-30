// Selector contract: src/app/setup.tsx:126-164 exposes preferences and exact rack-mode buttons;
// src/app/setup.tsx:206-208 exposes the exact start name; src/app/game.tsx:324-332 exposes game state.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const save_key = "super_bowling.save";

function mode_label(mode: number, rack_pin_count: number): string {
  return `${mode.toLocaleString()} mode - ${rack_pin_count.toLocaleString()} pins`;
}

test("saved setup and preferences restore across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: mode_label(100, 105), exact: true }).click();
  await page.getByLabel("Player 1 name").fill("Ari");
  await page.getByRole("button", { name: "Mute off" }).press("Space");
  await page.getByRole("button", { name: "Reduced motion off" }).press("Space");
  await page
    .getByRole("button", { name: `Start ${mode_label(100, 105)} for 1 player`, exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
  await page.getByRole("button", { name: "New match" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: mode_label(100, 105), exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Player 1 name")).toHaveValue("Ari");
  await expect(page.getByRole("button", { name: "Mute on" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Reduced motion on" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("malformed saved data falls back to a playable setup", async ({ page }) => {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: save_key,
    value: "this is not json",
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: mode_label(10, 10), exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
});

test("perfect match stores the selected mode best score", async ({ page }) => {
  await page.goto("/?fixture=perfect_game");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Final score" })).toContainText("300");
  await page.getByRole("button", { name: "New match" }).click();
  await expect(page.getByText("Best for 10 mode - 10 pins: 300")).toBeVisible();
});

for (const [pin_count, rack_pin_count] of [
  [10, 10],
  [100, 105],
  [1000, 990],
] as const) {
  test(`camera: ${pin_count.toLocaleString()}-pin deck framing stays observable`, async ({
    page,
  }) => {
    await page.goto("/?fixture=camera_deck");
    await page
      .getByRole("button", { name: mode_label(pin_count, rack_pin_count), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Start ${mode_label(pin_count, rack_pin_count)} for 1 player`,
        exact: true,
      })
      .click();
    const play_shell = page.locator("main.play_shell");
    await expect(play_shell).toHaveAttribute("data-camera-mode", "lane");
    await page.getByRole("button", { name: "Bowl now" }).click();
    await expect(play_shell).toHaveAttribute("data-camera-mode", "deck");
    await expect(play_shell).toHaveAttribute("data-drawn-pin-count", String(rack_pin_count));
    await page.screenshot({ path: `test-results/m6_camera_${pin_count}.png`, fullPage: true });
  });
}

test("reduced motion keeps the fixture in lane view", async ({ page }) => {
  await page.goto("/?fixture=camera_deck");
  await page.getByRole("button", { name: "Reduced motion off" }).press("Space");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-camera-mode", "lane");
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-reduced-motion", "true");
});
