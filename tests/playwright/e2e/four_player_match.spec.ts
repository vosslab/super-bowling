// Selector contract: src/app/setup.tsx exposes roster names, player selection, garage radios, and start;
// src/app/game.tsx:453-461 exposes phase plus the ball and aim-guide draw diagnostics.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const player_names = ["Ari", "Bea", "Chen", "Dia"];

async function finish_zero_turn(page: import("@playwright/test").Page): Promise<void> {
  const play_shell = page.locator("main.play_shell");
  const bowl_button = page.getByRole("button", { name: "Bowl now" });

  await bowl_button.click();
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(bowl_button).toBeEnabled();
  await expect(play_shell).toHaveAttribute("data-drawn-ball", "true");
  await expect(play_shell).toHaveAttribute("data-drawn-aim-guide", "true");
  await bowl_button.click();
}

test("fixture: four players pass one keyboard in frame order with their own balls", async ({
  page,
}) => {
  await page.goto("/?fixture=zero_knock");
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  for (const [index, name] of player_names.entries()) {
    await page.getByLabel(`Player ${index + 1} name`).fill(name);
  }
  const patterns = ["Solid", "Single band", "Double band", "Chevron"];
  for (const [index, pattern] of patterns.entries()) {
    await page
      .getByRole("button", { name: `Customize Player ${index + 1}: ${player_names[index]}` })
      .click();
    await page.getByRole("radio", { name: pattern }).check();
  }
  await page.screenshot({ path: "test-results/04_four_player_setup.png" });
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
    .click();
  await expect(page.getByText("Ari", { exact: true }).last()).toBeVisible();
  for (const [index, next_name] of ["Bea", "Chen", "Dia", "Ari"].entries()) {
    await finish_zero_turn(page);
    await expect(page.getByRole("dialog")).toContainText(
      `${next_name}, your fresh rack is ready next.`,
    );
    if (index === 0)
      await page.screenshot({ path: "test-results/05_four_player_handoff.png", fullPage: true });
    const button = page.getByRole("button", { name: `${next_name}, start your turn` });
    await expect(button).toBeFocused();
    await button.press("Enter");
    await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
  }
  await expect(page.locator(".match_roster .active_player")).toContainText("Ari");
});
