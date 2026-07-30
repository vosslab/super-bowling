// Selector contract: src/app/setup.tsx:149-164 exposes exact rack-mode buttons;
// src/app/game.tsx:324-332 and 398-408 expose phase, counts, and lane accessibility state.
import { expect, test } from "@playwright/test";

const pin_counts = [10, 20, 50, 100, 500, 1000];
const rack_pin_counts: Record<number, number> = {
  10: 10,
  20: 21,
  50: 45,
  100: 105,
  500: 496,
  1000: 990,
};

test.use({ viewport: { width: 1600, height: 1000 } });
test.setTimeout(60_000);

function pin_label(pin_count: number): string {
  return `${pin_count.toLocaleString()} mode - ${rack_pin_counts[pin_count]!.toLocaleString()} pins`;
}

for (const pin_count of pin_counts) {
  test(`selection: ${pin_label(pin_count)} reaches the worker and canvas`, async ({ page }) => {
    await page.goto("/");
    const count_button = page.getByRole("button", { name: pin_label(pin_count), exact: true });
    await count_button.click();
    await expect(count_button).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: `Start ${pin_label(pin_count)} for 1 player`, exact: true })
      .click();
    await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
    await expect(
      page.getByRole("img", {
        name: `Bowling lane with ${pin_count.toLocaleString()} mode and ${rack_pin_counts[pin_count]!.toLocaleString()} pins`,
      }),
    ).toBeVisible();
    await expect(page.locator("[data-standing-count]")).toContainText(
      `${rack_pin_counts[pin_count]} of ${rack_pin_counts[pin_count]!.toLocaleString()} pins standing`,
    );
    await expect(page.locator("main.play_shell")).toHaveAttribute(
      "data-drawn-pin-count",
      String(rack_pin_counts[pin_count]),
    );
    await expect(page.locator("main.play_shell")).toHaveAttribute(
      "data-draw-command-count",
      String(rack_pin_counts[pin_count]! + 3),
    );
    if (pin_count === 50 || pin_count === 100 || pin_count === 1000) {
      await page.screenshot({
        path: `test-results/super_lane_${pin_count}_mode.png`,
        fullPage: true,
      });
    }
  });
}
