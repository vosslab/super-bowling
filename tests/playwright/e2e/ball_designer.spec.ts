// Selector contract: src/designer/ball_designer.tsx exposes labeled controls and preview images.
// The fixture is built by pipeline/build.mjs and served through playwright.config.ts.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("fixture: every shared ball pattern has a static production preview", async ({ page }) => {
  const console_errors: string[] = [];
  const page_errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") console_errors.push(message.text());
  });
  page.on("pageerror", (error) => page_errors.push(error.message));

  await page.goto("/designer_fixture.html");
  await expect(page.getByRole("heading", { name: "Ball pattern gallery" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Preview for .* bowling ball/ })).toHaveCount(4);
  for (const pattern of ["Solid", "Single band", "Double band", "Chevron"]) {
    await expect(page.getByRole("heading", { name: pattern })).toBeVisible();
  }
  await page.screenshot({ path: "test-results/03_ball_patterns.png", fullPage: true });
  const solid_card = page.locator('[data-ball-pattern="solid"]');
  await solid_card.getByRole("radio", { name: "Chevron" }).check();
  await expect(solid_card.locator(".ball_designer_heading strong")).toHaveText("Chevron");
  const solid_monogram = solid_card.getByLabel(
    "Optional two-character monogram for Solid showcase",
  );
  await solid_monogram.fill("a!");
  await expect(solid_monogram).toHaveValue("A");
  await expect(page.getByLabel("Optional two-character monogram for Chevron showcase")).toHaveValue(
    "SB",
  );
  expect(console_errors).toEqual([]);
  expect(page_errors).toEqual([]);
});
