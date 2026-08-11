/* global document, requestAnimationFrame */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function measure_frame_window(
  browser,
  base_url,
  output_directory,
  viewport,
  start_aiming_state,
  capture_live_screenshot,
) {
  console.log("==> Measuring the 990-pin frame window");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await start_aiming_state(
      page,
      base_url,
      "1,000 mode - 990 pins",
      "Start 1,000 mode - 990 pins for 1 player",
      990,
    );
    const screenshot_path = join(output_directory, "frame_window_990.png");
    const json_path = join(output_directory, "frame_window_990.json");
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    try {
      await page.waitForFunction(
        () =>
          document.querySelector("main.play_shell")?.getAttribute("data-first-impact-seen") ===
          "true",
        { timeout: 20_000 },
      );
    } catch (_error) {
      const screenshot = await capture_live_screenshot(
        page,
        screenshot_path,
        "rolling_frame_window_contact_unavailable",
        990,
      );
      const result = {
        viewport,
        pin_count: 990,
        contact_proxy: "unavailable",
        blocker:
          "No authoritative first ball-pin impact window arrived within 20 seconds after a real Space launch.",
        screenshot,
      };
      await writeFile(json_path, `${JSON.stringify(result, null, 2)}\n`);
      return result;
    }
    const metrics = await page.evaluate(async () => {
      const samples = [];
      let previous = performance.now();
      const end_time = previous + 3000;
      while (performance.now() < end_time) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        samples.push(now - previous);
        previous = now;
      }
      samples.sort((left, right) => left - right);
      function percentile(proportion) {
        return samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * proportion))];
      }
      return {
        samples: samples.length,
        median_ms: percentile(0.5),
        p5_ms: percentile(0.05),
        p95_ms: percentile(0.95),
      };
    });
    if (metrics.samples === 0)
      throw new Error("Frame measurement captured no animation-frame samples.");
    const screenshot = await capture_live_screenshot(
      page,
      screenshot_path,
      "rolling_frame_window",
      990,
    );
    const result = {
      viewport,
      pin_count: 990,
      contact_proxy: "first physics-derived ball-pin impact window after launch",
      ...metrics,
      screenshot,
    };
    await writeFile(json_path, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await context.close();
  }
}
