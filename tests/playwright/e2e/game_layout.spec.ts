import { expect, test } from "@playwright/test";

type Rectangle = { x: number; y: number; width: number; height: number };

const selectors = {
  header: ".play_header",
  roster: ".match_roster",
  score: ".score_strip",
  lane: ".lane_panel",
  controls: ".control_deck",
} as const;

type LayoutRectangles = Record<keyof typeof selectors, Rectangle>;

async function start_match(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
}

async function start_four_player_match(page: import("@playwright/test").Page): Promise<void> {
  const player_names = ["Ari", "Bea", "Chen", "Dia"];
  await page.goto("/?fixture=zero_knock");
  for (let index = 1; index < player_names.length; index += 1) {
    await page.getByRole("button", { name: "Add player" }).click();
  }
  for (const [index, name] of player_names.entries()) {
    await page.getByLabel(`Player ${index + 1} name`).fill(name);
  }
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
}

async function layout_rectangles(page: import("@playwright/test").Page): Promise<LayoutRectangles> {
  return page.evaluate((layout_selectors) => {
    const rectangles = Object.fromEntries(
      Object.entries(layout_selectors).map(([name, selector]) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        if (box === undefined) throw new Error(`Missing ${selector}`);
        return [name, { x: box.x, y: box.y, width: box.width, height: box.height }];
      }),
    );
    return rectangles as LayoutRectangles;
  }, selectors);
}

function expect_visible_rectangle(rectangle: Rectangle): void {
  expect(rectangle.width).toBeGreaterThan(0);
  expect(rectangle.height).toBeGreaterThan(0);
}

function expect_inside(inner: Rectangle, outer: Rectangle): void {
  // One CSS pixel accommodates browser subpixel rounding without prescribing layout dimensions.
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

function expect_vertical_order(upper: Rectangle, lower: Rectangle): void {
  expect(lower.y).toBeGreaterThanOrEqual(upper.y + upper.height - 1);
}

function expect_desktop_layout(rectangles: LayoutRectangles, viewport: Rectangle): void {
  const { header, roster, score, lane, controls } = rectangles;
  for (const rectangle of Object.values(rectangles)) expect_visible_rectangle(rectangle);
  expect_inside(roster, header);
  expect_vertical_order(header, score);
  expect_vertical_order(score, lane);
  expect(controls.x).toBeGreaterThanOrEqual(lane.x + lane.width - 1);
  expect(lane.width).toBeGreaterThan(controls.width);
  expect_inside(lane, viewport);
  expect_inside(controls, viewport);
}

test("desktop keeps the lane dominant and the controls alongside it", async ({ page }) => {
  const viewport = { x: 0, y: 0, width: 1600, height: 1000 };
  await page.setViewportSize(viewport);
  await start_match(page);

  expect_desktop_layout(await layout_rectangles(page), viewport);
  await expect(page.locator("[data-frame-cell]")).toHaveCount(10);
  await expect(page.locator("[data-bowls-per-frame]")).toContainText("frame 10");
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});

test("short desktop keeps every control keyboard-reachable", async ({ page }) => {
  const viewport = { x: 0, y: 0, width: 1600, height: 720 };
  await page.setViewportSize(viewport);
  await start_match(page);

  expect_desktop_layout(await layout_rectangles(page), viewport);
  for (const control of [
    page.locator('[data-control="power"]'),
    page.getByRole("button", { name: "Mute off" }),
  ]) {
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await expect(control).toBeFocused();
  }
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});

test("four-player roster remains readable inside the desktop header", async ({ page }) => {
  const viewport = { x: 0, y: 0, width: 1600, height: 1000 };
  await page.setViewportSize(viewport);
  await start_four_player_match(page);

  const rectangles = await layout_rectangles(page);
  expect_desktop_layout(rectangles, viewport);
  const roster_entries = await page.locator(".match_roster p").evaluateAll((entries) =>
    entries.map((entry) => {
      const bounds = entry.getBoundingClientRect();
      return {
        text: entry.textContent?.trim() ?? "",
        rectangle: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      };
    }),
  );
  expect(roster_entries).toHaveLength(4);
  for (const entry of roster_entries) {
    expect(entry.text).not.toBe("");
    expect_visible_rectangle(entry.rectangle);
    expect_inside(entry.rectangle, rectangles.roster);
  }
});

test("completed frame score remains visible without changing the desktop structure", async ({
  page,
}) => {
  const viewport = { x: 0, y: 0, width: 1600, height: 1000 };
  await page.setViewportSize(viewport);
  await page.goto("/?fixture=zero_knock");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await page.getByRole("button", { name: "Continue to the next roll" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "result");

  expect_desktop_layout(await layout_rectangles(page), viewport);
  const score = page.locator("[data-frame-cell]").first().locator("strong");
  await expect(score).toHaveText("0");
  await expect(page.locator("[data-frame-cell]").first().locator("[data-roll-box]")).toHaveCount(2);
  expect(
    await score.evaluate(
      (element) =>
        element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
    ),
  ).toBe(false);
});

test("narrow layout stacks reachable controls below the lane", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await start_match(page);

  const { header, roster, score, lane, controls } = await layout_rectangles(page);
  for (const rectangle of [header, roster, score, lane, controls]) {
    expect_visible_rectangle(rectangle);
  }
  expect_inside(roster, header);
  expect_vertical_order(header, score);
  expect_vertical_order(score, lane);
  expect_vertical_order(lane, controls);

  const power = page.locator('[data-control="power"]');
  await power.scrollIntoViewIfNeeded();
  await power.focus();
  await expect(power).toBeFocused();
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});
