import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const mode_cases = [
  ["10 mode - 10 pins", "Start 10 mode - 10 pins for 1 player"],
  ["20 mode - 21 pins", "Start 20 mode - 21 pins for 1 player"],
  ["50 mode - 45 pins", "Start 50 mode - 45 pins for 1 player"],
  ["100 mode - 105 pins", "Start 100 mode - 105 pins for 1 player"],
  ["500 mode - 496 pins", "Start 500 mode - 496 pins for 1 player"],
  ["1,000 mode - 990 pins", "Start 1,000 mode - 990 pins for 1 player"],
] as const;

function first_number(text: string): number {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (match === null) throw new Error(`Expected a numeric slider output, received: ${text}`);
  return Number(match[0]);
}

async function expect_signed_endpoints(
  page: import("@playwright/test").Page,
  control_name: "start-position" | "angle" | "spin",
): Promise<void> {
  const input = page.locator(`[data-control="${control_name}"]`);
  const output = input.locator("xpath=..").locator("output");
  const minimum = await input.getAttribute("min");
  const maximum = await input.getAttribute("max");
  if (minimum === null || maximum === null) throw new Error(`${control_name} needs endpoints.`);

  await input.focus();
  await input.press("Home");
  await expect(input).toHaveValue(minimum);
  await expect(output).toContainText("left");
  const left_value = first_number((await output.textContent()) ?? "");

  await input.press("End");
  await expect(input).toHaveValue(maximum);
  await expect(output).toContainText("right");
  const right_value = first_number((await output.textContent()) ?? "");

  expect(Math.abs(left_value)).toBeCloseTo(Math.abs(right_value), 5);
  await expect(input).toHaveAttribute("aria-valuetext", (await output.textContent())?.trim() ?? "");
}

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

test("every rack mode exposes exact and symmetric slider endpoints", async ({ page }) => {
  for (const [mode_label, start_label] of mode_cases) {
    await test.step(mode_label, async () => {
      await page.goto("/");
      await page.getByRole("button", { name: mode_label, exact: true }).click();
      await page.getByRole("button", { name: start_label, exact: true }).click();
      await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");

      for (const control of ["start-position", "angle", "spin"] as const) {
        await expect_signed_endpoints(page, control);
      }

      const power = page.locator('[data-control="power"]');
      const minimum_power = await power.getAttribute("min");
      const maximum_power = await power.getAttribute("max");
      if (minimum_power === null || maximum_power === null)
        throw new Error("Power needs endpoints.");
      await power.press("Home");
      await expect(power).toHaveValue(minimum_power);
      await power.press("End");
      await expect(power).toHaveValue(maximum_power);
    });
  }
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
