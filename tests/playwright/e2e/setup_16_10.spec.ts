// Selector contract: src/app/setup.tsx exposes the rack buttons, player roster, shared ball garage,
// and exact match start control. src/style.css supplies the two-column 16:10 board layout.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function expect_in_viewport(locator: import("@playwright/test").Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? Infinity) + (box?.height ?? Infinity)).toBeLessThanOrEqual(1000);
}

test("setup: a compact 16:10 board keeps match start visible and edits only the selected garage ball", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Set up your super match" })).toBeVisible();
  for (const mode_label of [
    "10 mode - 10 pins",
    "20 mode - 21 pins",
    "50 mode - 45 pins",
    "100 mode - 105 pins",
    "500 mode - 496 pins",
    "1,000 mode - 990 pins",
  ]) {
    await expect(page.getByRole("button", { name: mode_label, exact: true })).toBeVisible();
  }
  await expect_in_viewport(
    page.getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true }),
  );

  const add_player = page.getByRole("button", { name: "Add player" });
  await add_player.click();
  await add_player.click();
  await add_player.click();
  await expect(page.getByRole("button", { name: "Customize Player 4: Player 4" })).toBeVisible();
  await expect_in_viewport(
    page.getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true }),
  );

  await page.getByRole("button", { name: "Customize Player 1: Player 1" }).click();
  await page.getByRole("radio", { name: "Chevron" }).check();
  await expect(page.getByRole("heading", { name: "Player 1's ball" })).toBeVisible();
  await page.getByRole("button", { name: "Customize Player 2: Player 2" }).click();
  await page.getByRole("radio", { name: "Double band" }).check();
  await expect(page.getByRole("heading", { name: "Player 2's ball" })).toBeVisible();
  await page.getByRole("button", { name: "Customize Player 1: Player 1" }).click();
  await expect(page.getByRole("radio", { name: "Chevron" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Double band" })).not.toBeChecked();

  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
});
