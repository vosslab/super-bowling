// Selector contract: src/app/game.tsx exposes phase and rendered-pin counts; src/app/app.tsx selects partial_knock.
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("production boundary: a same-rack roll restores the ball and aim guide before the next aim", async ({
  page,
}) => {
  await page.goto("/?fixture=partial_knock");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(play_shell).toHaveAttribute("data-drawn-fallen-pin-count", "3");
  await expect(play_shell).toHaveAttribute("data-drawn-pin-count", "10");

  await page.getByRole("button", { name: "Continue to the next roll" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(play_shell).toHaveAttribute("data-drawn-fallen-pin-count", "0");
  await expect(play_shell).toHaveAttribute("data-drawn-pin-count", "7");
  await expect(play_shell).toHaveAttribute("data-ball-in-pit", "false");
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");
  await expect(play_shell).toHaveAttribute("data-drawn-ball", "true");
  await expect(play_shell).toHaveAttribute("data-drawn-aim-guide", "true");
  await expect(page.locator("[data-standing-count]")).toContainText("7 of 10 pins standing");

  const ball_screen_x = await play_shell.getAttribute("data-drawn-ball-screen-x");
  const guide_first_screen_x = await play_shell.getAttribute("data-drawn-aim-guide-first-screen-x");
  await page.keyboard.press("ArrowLeft");
  await expect(play_shell).not.toHaveAttribute("data-drawn-ball-screen-x", ball_screen_x ?? "");
  await expect(play_shell).not.toHaveAttribute(
    "data-drawn-aim-guide-first-screen-x",
    guide_first_screen_x ?? "",
  );
  await expect(play_shell).toHaveAttribute("data-drawn-ball", "true");
  await expect(play_shell).toHaveAttribute("data-drawn-aim-guide", "true");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");
  await page.keyboard.press("Space");
  await expect(play_shell).toHaveAttribute("data-phase", "rolling");
});

test("newer preview wins when an older worker response arrives later", async ({ page }) => {
  await page.goto("/?fixture=preview_stale");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.keyboard.press("ArrowRight");
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  const current_guide_x = await play_shell.getAttribute("data-drawn-aim-guide-first-screen-x");
  await page.waitForTimeout(240);
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await expect(play_shell).toHaveAttribute(
    "data-drawn-aim-guide-first-screen-x",
    current_guide_x ?? "",
  );
});
