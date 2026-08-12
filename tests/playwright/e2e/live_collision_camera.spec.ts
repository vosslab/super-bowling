// Selector contract: src/app/game.tsx exposes phase/impact state; src/render/game_renderer.ts
// annotates the real Canvas with the active collision-zone projection diagnostic.
import { expect, test } from "@playwright/test";

type CameraSample = {
  first_impact_seen: boolean;
  in_pit: boolean;
  progress: number;
  zone_fully_on_canvas: boolean;
  zone_visible: boolean;
  zone_world_present: boolean;
  zoom: number;
};

test.use({ viewport: { width: 1600, height: 1000 } });

test("collision-zone capture diagnostics are off unless explicitly requested", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();
  await expect(page.locator("canvas.game_canvas")).not.toHaveAttribute(
    "data-collision-zone-world-present",
  );
});

test("a visible live roll holds its local collision view through the result handoff", async ({
  page,
}) => {
  await page.goto("/?camera-diagnostics=1");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await page.getByRole("button", { name: "Bowl now", exact: true }).click();

  const samples = await page.evaluate(async (): Promise<CameraSample[]> => {
    const shell = document.querySelector<HTMLElement>("main.play_shell");
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.game_canvas");
    if (shell === null || canvas === null) throw new Error("The visible game lane is required.");
    return new Promise((resolve) => {
      const samples: CameraSample[] = [];
      let saw_rolling = false;
      const collect = (): void => {
        if (shell.dataset.phase === "rolling") {
          saw_rolling = true;
          samples.push({
            first_impact_seen: shell.dataset.firstImpactSeen === "true",
            in_pit: shell.dataset.ballInPit === "true",
            progress: Number(shell.dataset.cameraProgress),
            zone_fully_on_canvas: canvas.dataset.collisionZoneFullyOnCanvas === "true",
            zone_visible: canvas.dataset.collisionZoneVisible === "true",
            zone_world_present: canvas.dataset.collisionZoneWorldPresent === "true",
            zoom: Number(shell.dataset.cameraZoom),
          });
        }
        if (saw_rolling && shell.dataset.phase === "result") {
          resolve(samples);
          return;
        }
        window.requestAnimationFrame(collect);
      };
      window.requestAnimationFrame(collect);
    });
  });

  expect(samples.length).toBeGreaterThan(0);
  expect(samples.some((sample) => sample.zone_world_present && sample.zone_visible)).toBe(true);
  const pre_impact = samples.filter((sample) => !sample.first_impact_seen);
  expect(pre_impact.some((sample) => sample.progress < 1)).toBe(true);
  expect(
    samples.every((sample, index) => index === 0 || sample.zoom >= samples[index - 1]!.zoom),
  ).toBe(true);
  const after_first_impact = samples.filter((sample) => sample.first_impact_seen);
  expect(
    after_first_impact.some(
      (sample) => sample.zone_world_present && sample.zone_visible && sample.zone_fully_on_canvas,
    ),
  ).toBe(true);
  const rolling_pit_samples = samples.filter((sample) => sample.in_pit);
  if (rolling_pit_samples.length > 0) {
    expect(
      rolling_pit_samples.every(
        (sample) => sample.zone_world_present && sample.zone_visible && sample.zone_fully_on_canvas,
      ),
    ).toBe(true);
  }
  await expect(play_shell).toHaveAttribute("data-phase", "result");
});
