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

type CanvasMetrics = {
  canvas: Rectangle;
  lane: Rectangle;
  backing_width: number;
  backing_height: number;
  device_pixel_ratio: number;
};

async function start_match(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
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

async function canvas_metrics(page: import("@playwright/test").Page): Promise<CanvasMetrics> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".game_canvas");
    const lane = document.querySelector<HTMLElement>(".lane_panel");
    if (canvas === null || lane === null) throw new Error("Missing lane canvas or panel");

    const canvas_bounds = canvas.getBoundingClientRect();
    const lane_bounds = lane.getBoundingClientRect();
    return {
      canvas: {
        x: canvas_bounds.x,
        y: canvas_bounds.y,
        width: canvas_bounds.width,
        height: canvas_bounds.height,
      },
      lane: {
        x: lane_bounds.x,
        y: lane_bounds.y,
        width: lane_bounds.width,
        height: lane_bounds.height,
      },
      backing_width: canvas.width,
      backing_height: canvas.height,
      device_pixel_ratio: window.devicePixelRatio,
    };
  });
}

function expect_vertically_adjacent(upper: Rectangle, lower: Rectangle): void {
  expect(lower.y).toBeGreaterThanOrEqual(upper.y + upper.height - 0.5);
  expect(lower.y).toBeLessThanOrEqual(upper.y + upper.height + 0.5);
}

async function expect_canvas_fills_lane(page: import("@playwright/test").Page): Promise<void> {
  const metrics = await canvas_metrics(page);
  expect(metrics.canvas.x).toBeCloseTo(metrics.lane.x, 1);
  expect(metrics.canvas.y).toBeCloseTo(metrics.lane.y, 1);
  expect(metrics.canvas.width).toBeCloseTo(metrics.lane.width, 1);
  expect(metrics.canvas.height).toBeCloseTo(metrics.lane.height, 1);
  expect(
    Math.abs(metrics.backing_width - metrics.canvas.width * metrics.device_pixel_ratio),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(metrics.backing_height - metrics.canvas.height * metrics.device_pixel_ratio),
  ).toBeLessThanOrEqual(1);
}

async function start_four_player_match(page: import("@playwright/test").Page): Promise<void> {
  const player_names = ["Ari", "Bea", "Chen", "Dia"];
  await page.goto("/?fixture=zero_knock");
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  for (const [index, name] of player_names.entries()) {
    await page.getByLabel(`Player ${index + 1} name`).fill(name);
  }
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
    .click();
  await expect(page.locator("main.play_shell")).toHaveAttribute("data-phase", "aiming");
}

test("16:10 desktop puts controls beside a full-height lane after compact chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await start_match(page);

  const rectangles = await layout_rectangles(page);
  const { header, roster, score, lane, controls } = rectangles;
  const top_chrome_height = score.y + score.height - header.y;

  // WP-B6 locks the 16:10 desktop geometry before camera calibration resumes.
  expect(top_chrome_height).toBeLessThanOrEqual(1000 * 0.14);
  expect(roster.y).toBeGreaterThanOrEqual(header.y - 0.5);
  expect(roster.y + roster.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
  expect(roster.width).toBeGreaterThan(40);

  expect_vertically_adjacent(header, score);
  expect_vertically_adjacent(score, lane);
  expect(lane.width).toBeGreaterThanOrEqual(1600 * 0.75);
  expect(controls.width).toBeGreaterThanOrEqual(300);
  expect(controls.width).toBeLessThanOrEqual(360);
  expect(controls.x).toBeGreaterThanOrEqual(lane.x + lane.width - 0.5);
  expect(controls.y).toBeCloseTo(lane.y, 0);
  expect(controls.height).toBeCloseTo(lane.height, 0);
  expect(lane.y + lane.height).toBeCloseTo(1000, 0);
  expect(controls.y + controls.height).toBeCloseTo(1000, 0);
  expect(lane.height).toBeGreaterThan(850);
  await expect_canvas_fills_lane(page);

  await expect(page.locator("[data-frame-cell]")).toHaveCount(10);
  await expect(page.locator("[data-bowls-per-frame]")).toContainText("frame 10");
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});

test("short desktop retains a distinct right-side control panel without clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await start_match(page);

  const { header, score, lane, controls } = await layout_rectangles(page);
  expect(score.y + score.height - header.y).toBeLessThanOrEqual(720 * 0.2);
  expect_vertically_adjacent(score, lane);
  expect(controls.x).toBeGreaterThanOrEqual(lane.x + lane.width - 0.5);
  expect(controls.y).toBeCloseTo(lane.y, 0);
  expect(controls.height).toBeCloseTo(lane.height, 0);
  expect(lane.y + lane.height).toBeCloseTo(720, 0);
  expect(controls.y + controls.height).toBeCloseTo(720, 0);
  await expect_canvas_fills_lane(page);

  const power = page.locator('[data-control="power"]');
  await power.scrollIntoViewIfNeeded();
  await power.focus();
  await expect(power).toBeFocused();

  const mute = page.getByRole("button", { name: "Mute off" });
  await mute.scrollIntoViewIfNeeded();
  await mute.focus();
  await expect(mute).toBeFocused();
  await expect(mute).toBeVisible();
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});

test("four players stay readable in compact top chrome while lane and controls retain desktop geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await start_four_player_match(page);

  const { header, score, lane, controls } = await layout_rectangles(page);
  expect(score.y + score.height - header.y).toBeLessThanOrEqual(1000 * 0.14);
  expect_vertically_adjacent(header, score);
  expect_vertically_adjacent(score, lane);
  expect(lane.width).toBeGreaterThanOrEqual(1600 * 0.75);
  expect(controls.width).toBeGreaterThanOrEqual(300);
  expect(controls.width).toBeLessThanOrEqual(360);
  expect(controls.x).toBeGreaterThanOrEqual(lane.x + lane.width - 0.5);
  expect(controls.height).toBeCloseTo(lane.height, 0);
  await expect_canvas_fills_lane(page);

  const roster_entries = await page.locator(".match_roster p").evaluateAll((entries) =>
    entries.map((entry) => {
      const bounds = entry.getBoundingClientRect();
      return {
        text: entry.textContent?.trim() ?? "",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }),
  );
  expect(roster_entries).toHaveLength(4);
  for (const entry of roster_entries) {
    expect(entry.text).not.toBe("");
    expect(entry.width).toBeGreaterThan(30);
    expect(entry.height).toBeGreaterThan(10);
    expect(entry.x).toBeGreaterThanOrEqual(header.x - 0.5);
    expect(entry.y).toBeGreaterThanOrEqual(header.y - 0.5);
    expect(entry.x + entry.width).toBeLessThanOrEqual(header.x + header.width + 0.5);
    expect(entry.y + entry.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
  }
  for (const [index, entry] of roster_entries.entries()) {
    const next_entry = roster_entries[index + 1];
    if (next_entry === undefined) continue;
    expect(next_entry.x).toBeGreaterThanOrEqual(entry.x + entry.width - 0.5);
  }
  await expect(page.getByText("Ari", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Bea", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Chen", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Dia", { exact: true }).last()).toBeVisible();
});

test("zero-knock result keeps the compact desktop chrome and lane geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/?fixture=zero_knock");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  const aiming = await layout_rectangles(page);

  // Complete both zero-knock rolls so the score cell is genuinely populated,
  // rather than merely checking the first-roll result phase.
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming", { timeout: 2_000 });
  await page.getByRole("button", { name: "Bowl now" }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "result");
  const result = await layout_rectangles(page);
  const top_chrome_height = result.score.y + result.score.height - result.header.y;

  // A populated first frame must not make result-state chrome steal the lane.
  expect(top_chrome_height).toBeLessThanOrEqual(1000 * 0.14);
  for (const key of ["lane", "controls"] as const) {
    expect(result[key].x).toBeCloseTo(aiming[key].x, 0);
    expect(result[key].y).toBeCloseTo(aiming[key].y, 0);
    expect(result[key].width).toBeCloseTo(aiming[key].width, 0);
    expect(result[key].height).toBeCloseTo(aiming[key].height, 0);
  }
  expect(result.controls.x).toBeGreaterThanOrEqual(result.lane.x + result.lane.width - 0.5);
  expect(result.controls.y).toBeCloseTo(result.lane.y, 0);
  expect(result.controls.height).toBeCloseTo(result.lane.height, 0);
  await expect_canvas_fills_lane(page);

  const populated_score = page.locator("[data-frame-cell]").first().locator("strong");
  await expect(populated_score).toHaveText("0");
  await expect(page.locator("[data-frame-cell]").first().locator("[data-roll-box]")).toHaveCount(2);
  const score_metrics = await populated_score.evaluate((score) => {
    const score_bounds = score.getBoundingClientRect();
    const cell_bounds = score.closest<HTMLElement>("[data-frame-cell]")?.getBoundingClientRect();
    if (cell_bounds === undefined) throw new Error("Missing score frame cell");
    return {
      score: {
        x: score_bounds.x,
        y: score_bounds.y,
        width: score_bounds.width,
        height: score_bounds.height,
      },
      cell: {
        x: cell_bounds.x,
        y: cell_bounds.y,
        width: cell_bounds.width,
        height: cell_bounds.height,
      },
      // The score's normal line box can round one pixel taller than its grid
      // track. Horizontal overflow is the meaningful clipping risk here;
      // its rendered bounds are checked below on both axes.
      clipped_horizontally: score.scrollWidth > score.clientWidth,
    };
  });
  expect(score_metrics.clipped_horizontally).toBe(false);
  expect(score_metrics.score.x).toBeGreaterThanOrEqual(score_metrics.cell.x - 0.5);
  expect(score_metrics.score.y).toBeGreaterThanOrEqual(score_metrics.cell.y - 0.5);
  expect(score_metrics.score.x + score_metrics.score.width).toBeLessThanOrEqual(
    score_metrics.cell.x + score_metrics.cell.width + 0.5,
  );
  expect(score_metrics.score.y + score_metrics.score.height).toBeLessThanOrEqual(
    score_metrics.cell.y + score_metrics.cell.height + 0.5,
  );
});

test("narrow fallback stacks controls after the lane and keeps keyboard controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await start_match(page);

  const { header, roster, score, lane, controls } = await layout_rectangles(page);
  expect(roster.y).toBeGreaterThanOrEqual(header.y - 0.5);
  expect(roster.y + roster.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
  expect_vertically_adjacent(header, score);
  expect_vertically_adjacent(score, lane);
  expect(controls.y).toBeGreaterThanOrEqual(lane.y + lane.height - 0.5);
  expect(controls.x).toBeCloseTo(lane.x, 0);
  expect(controls.width).toBeCloseTo(lane.width, 0);
  expect(lane.height).toBeGreaterThanOrEqual(320);

  const power = page.locator('[data-control="power"]');
  await power.scrollIntoViewIfNeeded();
  await power.focus();
  await expect(power).toBeFocused();
  await expect(page.getByRole("button", { name: "Bowl now" })).toBeVisible();
});
