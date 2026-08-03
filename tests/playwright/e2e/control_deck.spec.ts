import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("control deck offers keyboard and pointer control for every launch value", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const control_deck = page.locator(".control_deck");
  const controls = ["start-position", "power", "angle", "spin"];
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
  await expect(control_deck).toBeVisible();
  const start_before = await page.locator('[data-control="start-position"]').inputValue();
  const power_before = await page.locator('[data-control="power"]').inputValue();
  const angle_before = await page.locator('[data-control="angle"]').inputValue();
  const spin_before = await page.locator('[data-control="spin"]').inputValue();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("KeyA");
  await page.keyboard.press("KeyQ");
  await expect(page.locator('[data-control="start-position"]')).not.toHaveValue(start_before);
  await expect(page.locator('[data-control="power"]')).not.toHaveValue(power_before);
  await expect(page.locator('[data-control="angle"]')).not.toHaveValue(angle_before);
  await expect(page.locator('[data-control="spin"]')).not.toHaveValue(spin_before);
  for (const control of controls) {
    const input = page.locator(`[data-control="${control}"]`);
    await expect(input).toBeVisible();
    const before = await input.inputValue();
    const box = await input.boundingBox();
    await input.click({ position: { x: Math.max(2, (box?.width ?? 4) - 2), y: 2 } });
    await expect(input).not.toHaveValue(before);
  }

  await expect(page.locator("[data-aim-guide-readout]")).toContainText("hook");
  const deck_box = await control_deck.boundingBox();
  expect((deck_box?.y ?? Infinity) + (deck_box?.height ?? Infinity)).toBeLessThanOrEqual(1000);
  await page.keyboard.press("Space");
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "rolling");
});

test("result and exit actions preserve pace without risking an unfinished score", async ({
  page,
}) => {
  await page.goto("/?fixture=zero_knock");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(page.getByRole("button", { name: "Continue to the next roll" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");

  await page.getByRole("button", { name: "End match" }).click();
  const confirmation = page.getByRole("dialog", { name: "End this match?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Keep bowling" })).toBeFocused();
  await confirmation.getByRole("button", { name: "Keep bowling" }).click();
  await expect(confirmation).toBeHidden();

  await page.getByRole("button", { name: "End match" }).click();
  await confirmation.getByRole("button", { name: "End match" }).click();
  await expect(page.getByRole("heading", { name: "Set up your super match" })).toBeVisible();
});
