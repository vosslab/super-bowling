// Selector contract: src/app/setup.tsx:206-208 exposes the exact start control;
// src/app/game.tsx:324-332 and 398-408 expose phase, standing count, and the lane.
// The test loads dist/ through playwright.config.ts's managed HTTP server.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("smoke: the built app reaches a real ten-pin aiming state", async ({ page }) => {
  const console_errors: string[] = [];
  const page_errors: string[] = [];
  const failed_responses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      console_errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    page_errors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:") && response.status() >= 400) {
      failed_responses.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("main.game_shell")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Set up your super match" })).toBeVisible();
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Bowling lane with 10 mode and 10 pins for Player 1" }),
  ).toBeVisible();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
  await expect(page.locator("[data-standing-count]")).toHaveText("10 of 10 pins standing");
  for (const path of [
    "/assets/pin_upright.svg",
    "/assets/pin_fallen.svg",
    "/assets/ball_surface.svg",
  ]) {
    const asset_response = await page.request.get(path);
    expect(asset_response.status()).toBe(200);
  }
  await page.screenshot({ path: "test-results/00_initial.png", fullPage: true });
  expect(console_errors).toEqual([]);
  expect(page_errors).toEqual([]);
  expect(failed_responses).toEqual([]);
});
