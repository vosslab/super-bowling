// Selector contract: src/benchmark.html exposes the Canvas, status region, and metric list.
import { expect, test } from "@playwright/test";

import { get_mode_tuning } from "../../src/config/physics";

test.use({ viewport: { width: 1600, height: 1000 } });
test.setTimeout(60_000);

test("benchmark: a 1,000-pin worker roll draws every pin through settlement", async ({ page }) => {
  const console_errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") console_errors.push(message.text());
  });
  await page.goto("/benchmark.html?pin_count=1000&fixture=head_on");
  await expect(page.getByRole("status")).toContainText("Launching 1000-mode 990-pin");
  await expect(page.locator("body")).toHaveAttribute("data-drawn-pin-count", "990");
  await expect(page.getByRole("status")).toContainText("Simulation settled.", { timeout: 55_000 });
  await expect(page.locator("body")).toHaveAttribute("data-settlement-outcome", "settled");
  await page.screenshot({ path: "test-results/01_simulation_benchmark_1000.png", fullPage: true });
  const metrics = await page.locator("#benchmark_metrics").innerText();
  expect(metrics).toContain("Drawn pins\n990");
  expect(metrics).toMatch(/Mean delivery ms\n[0-9.]+/);
  expect(metrics).toMatch(/Mean draw ms\n[0-9.]+/);
  const counts = await page.locator("body").evaluate((body) => ({
    standing: Number(body.dataset.standingPinCount),
    fallen: Number(body.dataset.fallenPinCount),
  }));
  expect(counts.standing + counts.fallen).toBe(990);
  expect(console_errors).toEqual([]);
});

test("worker lifecycle: reset replaces an active roll and dispose ends delivery", async ({
  page,
}) => {
  const snapshot_interval_ms = 1000 / get_mode_tuning(10).snapshot_hz;
  const quiet_interval_ms = Math.ceil(snapshot_interval_ms * 3);
  await page.goto("/");
  const lifecycle = await page.evaluate(
    (quiet_interval) =>
      new Promise<string[]>((resolve, reject) => {
        const worker = new Worker("/simulation_worker.js", { type: "module" });
        const events: string[] = [];
        let phase = "initializing";
        const fail_timer = window.setTimeout(
          () => reject(new Error(`Lifecycle timed out at ${phase}.`)),
          20_000,
        );
        worker.addEventListener("error", (event) => reject(new Error(event.message)));
        worker.addEventListener(
          "message",
          (event: MessageEvent<{ type: string; simulation_time_ms?: number }>) => {
            events.push(event.data.type);
            if (event.data.type === "ready") return;
            if (event.data.type === "snapshot" && phase === "initializing") {
              phase = "launched";
              worker.postMessage({ type: "launch", power: 18, lateral_offset: 0 });
              return;
            }
            if (
              event.data.type === "snapshot" &&
              phase === "launched" &&
              (event.data.simulation_time_ms ?? 0) > 0
            ) {
              phase = "reset";
              worker.postMessage({ type: "reset_rack", pin_count: 10 });
              return;
            }
            if (
              event.data.type === "snapshot" &&
              phase === "reset" &&
              event.data.simulation_time_ms === 0
            ) {
              phase = "second_roll";
              worker.postMessage({ type: "launch", power: 18, lateral_offset: 0 });
              return;
            }
            if (event.data.type === "settled" && phase === "second_roll") {
              const events_before_dispose = events.length;
              worker.postMessage({ type: "dispose" });
              window.setTimeout(() => {
                clearTimeout(fail_timer);
                if (events.length !== events_before_dispose) {
                  reject(new Error("Worker delivered an event after dispose."));
                  return;
                }
                resolve(events);
              }, quiet_interval);
            }
          },
        );
        worker.postMessage({ type: "initialize", pin_count: 10 });
      }),
    quiet_interval_ms,
  );
  expect(lifecycle).toContain("ready");
  expect(lifecycle.filter((event) => event === "snapshot").length).toBeGreaterThan(2);
  expect(lifecycle).toContain("settled");
  expect(lifecycle).not.toContain("fatal");
});
