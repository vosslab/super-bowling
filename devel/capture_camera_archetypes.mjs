/*
 * M9 production-browser evidence for shot-camera readability.
 *
 * This is deliberately a maintainer probe, not a timing or pixel-equivalence
 * test. It drives the built app over HTTP, observes the same public DOM
 * diagnostics used by the UI tests, and instruments the Canvas 2D ellipse
 * which draw_ball emits at the exposed ball centre. Generated per-frame JSON
 * belongs under ignored artifacts/m9; the durable Markdown report records the
 * resulting distributions and any qualitative conclusion.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import { start_aiming_state } from "./capture_live_support.mjs";

const viewport = { width: 1600, height: 1000 };
const output_directory = "artifacts/m9";

const cases = [
  // The 105 rack samples the named ten-pin archetypes with legal controls.
  { name: "105_center", mode: 100, power: 1, start: 0.5, angle: 0.5, spin: 0.5 },
  { name: "105_strong_hook", mode: 100, power: 1, start: 0.49, angle: 0.5, spin: 1 },
  { name: "105_off_center", mode: 100, power: 1, start: 0.52, angle: 0.5, spin: 0.5 },
  { name: "105_gutter", mode: 100, power: 1, start: 1, angle: 0.5, spin: 1 },
  // Large-rack controls are deliberately named by their selected lane entry,
  // not by a promised pin result. The trace classifies contact afterwards.
  { name: "496_center", mode: 500, power: 1, start: 0.5, angle: 0.5, spin: 0.5 },
  { name: "496_mid", mode: 500, power: 1, start: 0.52, angle: 0.5, spin: 0.5 },
  { name: "496_outside", mode: 500, power: 1, start: 0.86, angle: 0.5, spin: 0.5 },
  { name: "990_center", mode: 1000, power: 1, start: 0.5, angle: 0.5, spin: 0.5 },
  { name: "990_mid", mode: 1000, power: 1, start: 0.52, angle: 0.5, spin: 0.5 },
  { name: "990_outside", mode: 1000, power: 1, start: 0.86, angle: 0.5, spin: 0.5 },
];

function usage() {
  console.log("Usage: node devel/capture_camera_archetypes.mjs --base-url URL [--case NAME]");
}

function parse_arguments(arguments_list) {
  let base_url;
  let case_name;
  for (let index = 0; index < arguments_list.length; index += 1) {
    const argument = arguments_list[index];
    if (argument === "--base-url") {
      base_url = arguments_list[index + 1];
      index += 1;
    } else if (argument === "--case") {
      case_name = arguments_list[index + 1];
      index += 1;
    } else if (argument === "-h" || argument === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}.`);
    }
  }
  if (base_url === undefined) throw new Error("--base-url is required.");
  if (case_name !== undefined && !cases.some((definition) => definition.name === case_name)) {
    throw new Error(`Unknown --case ${case_name}.`);
  }
  return { base_url, case_name };
}

function quantile(values, fraction) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function summarize(values) {
  if (values.length === 0) return undefined;
  return {
    count: values.length,
    minimum: Math.min(...values),
    median: quantile(values, 0.5),
    maximum: Math.max(...values),
  };
}

function thirds_by_progress(samples) {
  const progress = samples.map((sample) => sample.camera_physical_progress);
  const minimum = Math.min(...progress);
  const maximum = Math.max(...progress);
  const span = maximum - minimum;
  if (!Number.isFinite(span) || span <= 0) return [samples, [], []];
  const low = minimum + span / 3;
  const high = minimum + (span * 2) / 3;
  return [
    samples.filter((sample) => sample.camera_physical_progress <= low),
    samples.filter(
      (sample) => sample.camera_physical_progress > low && sample.camera_physical_progress <= high,
    ),
    samples.filter((sample) => sample.camera_physical_progress > high),
  ];
}

async function install_ball_ellipse_probe(context) {
  await context.addInitScript(() => {
    const key = "__super_bowling_m9_ball_ellipses";
    if (Array.isArray(globalThis[key])) return;
    const calls = [];
    globalThis[key] = calls;
    const original = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function m9_ball_ellipse(
      x,
      y,
      radius_x,
      radius_y,
      rotation,
      start_angle,
      end_angle,
      counterclockwise,
    ) {
      calls.push({ x, y, radius_x, radius_y, at_ms: performance.now() });
      if (calls.length > 8_000) calls.splice(0, calls.length - 8_000);
      return original.call(
        this,
        x,
        y,
        radius_x,
        radius_y,
        rotation,
        start_angle,
        end_angle,
        counterclockwise,
      );
    };
  });
}

async function set_control_fraction(page, control, fraction) {
  const locator = page.locator(`[data-control="${control}"]`);
  await locator.evaluate((element, next_fraction) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Expected range input.");
    const minimum = Number(element.min);
    const maximum = Number(element.max);
    const step = Number(element.step) || 1;
    const raw = minimum + (maximum - minimum) * next_fraction;
    const value = Math.round(raw / step) * step;
    element.value = String(Math.min(maximum, Math.max(minimum, value)));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, fraction);
}

async function read_sample(page) {
  return page.evaluate(() => {
    const root = document.querySelector("main.play_shell");
    const canvas = document.querySelector("canvas.game_canvas");
    const calls = globalThis.__super_bowling_m9_ball_ellipses;
    if (root === null || !(canvas instanceof HTMLCanvasElement) || !Array.isArray(calls))
      return undefined;
    const drawn = root.getAttribute("data-drawn-ball") === "true";
    const center_x = Number(root.getAttribute("data-drawn-ball-screen-x"));
    const center_y = Number(root.getAttribute("data-drawn-ball-screen-y"));
    const matching =
      drawn && Number.isFinite(center_x) && Number.isFinite(center_y)
        ? calls
            .filter(
              (call) =>
                Number.isFinite(call.x) &&
                Number.isFinite(call.y) &&
                Math.abs(call.x - center_x) < 0.75 &&
                Math.abs(call.y - center_y) < 0.75 &&
                call.radius_x > 0 &&
                call.radius_y > 0 &&
                call.radius_x / call.radius_y > 0.8 &&
                call.radius_x / call.radius_y < 1.25,
            )
            .sort((left, right) => right.at_ms - left.at_ms || right.radius_x - left.radius_x)[0]
        : undefined;
    const bounds =
      matching === undefined
        ? undefined
        : {
            left: matching.x - matching.radius_x,
            right: matching.x + matching.radius_x,
            top: matching.y - matching.radius_y,
            bottom: matching.y + matching.radius_y,
          };
    // Consume the preceding production draw. The next rAF must emit a fresh
    // ellipse; an old stationary-frame call cannot satisfy continuity.
    calls.splice(0, calls.length);
    return {
      phase: root.getAttribute("data-phase"),
      drawn_ball: drawn,
      ball_in_pit: root.getAttribute("data-ball-in-pit") === "true",
      first_impact_seen: root.getAttribute("data-first-impact-seen") === "true",
      impact_window_count: Number(root.getAttribute("data-impact-window-count")),
      camera_progress: Number(root.getAttribute("data-camera-progress")),
      camera_physical_progress: Number(root.getAttribute("data-camera-physical-progress")),
      camera_zoom: Number(root.getAttribute("data-camera-zoom")),
      near_lane_foreground_fraction: Number(
        root.getAttribute("data-drawn-launch-platform-fraction"),
      ),
      foul_line_screen_y: Number(canvas.dataset.foulLineScreenY),
      collision_zone_visible: canvas.dataset.collisionZoneVisible === "true",
      collision_zone_world_present: canvas.dataset.collisionZoneWorldPresent === "true",
      collision_zone_coverage_fraction: Number(canvas.dataset.collisionZoneCoverage),
      collision_zone_center_x_fraction: Number(canvas.dataset.collisionZoneCenterX),
      collision_zone_center_y_fraction: Number(canvas.dataset.collisionZoneCenterY),
      collision_zone_fully_on_canvas: canvas.dataset.collisionZoneFullyOnCanvas === "true",
      center_x,
      center_y,
      radius_x: matching?.radius_x,
      radius_y: matching?.radius_y,
      matching_ball_ellipse: matching !== undefined,
      canvas_width: canvas.width,
      canvas_height: canvas.height,
      fully_on_canvas:
        bounds === undefined
          ? false
          : bounds.left >= 0 &&
            bounds.top >= 0 &&
            bounds.right <= canvas.width &&
            bounds.bottom <= canvas.height,
    };
  });
}

function analyze_case(definition, samples, control_values) {
  const first_drawn_index = samples.findIndex((sample) => sample.drawn_ball);
  const renderable_window =
    first_drawn_index < 0
      ? []
      : samples.slice(first_drawn_index).filter((sample) => !sample.ball_in_pit);
  const impact_index = renderable_window.findIndex((sample) => sample.first_impact_seen);
  const through_impact =
    impact_index < 0 ? renderable_window : renderable_window.slice(0, impact_index + 1);
  const readable = renderable_window.filter(
    (sample) => sample.drawn_ball && sample.matching_ball_ellipse && sample.fully_on_canvas,
  );
  const width_values = through_impact
    .filter((sample) => sample.matching_ball_ellipse)
    .map((sample) => sample.radius_x * 2);
  const apron_values = through_impact.map((sample) => sample.near_lane_foreground_fraction);
  const visible_foreground = (sample) =>
    sample !== undefined && Number.isFinite(sample.foul_line_screen_y)
      ? Math.max(
          0,
          Math.min(1, (sample.canvas_height - sample.foul_line_screen_y) / sample.canvas_height),
        )
      : undefined;
  const foreground_values = through_impact
    .map(visible_foreground)
    .filter((value) => value !== undefined);
  const first = through_impact[0];
  const last = through_impact.at(-1);
  const impact_sample = impact_index < 0 ? undefined : renderable_window[impact_index];
  const missing_drawn = renderable_window.filter((sample) => !sample.drawn_ball);
  const unmatched = renderable_window.filter(
    (sample) => sample.drawn_ball && !sample.matching_ball_ellipse,
  );
  const clipped = renderable_window.filter(
    (sample) => sample.matching_ball_ellipse && !sample.fully_on_canvas,
  );
  const continuity =
    renderable_window.length > 0 &&
    missing_drawn.length === 0 &&
    unmatched.length === 0 &&
    clipped.length === 0;
  const growth_ratio =
    first === undefined || last === undefined
      ? undefined
      : (last.radius_x * 2) / (first.radius_x * 2);
  // First and last camera samples include the unchanged opening/held frames;
  // partitioning the forward-only samples avoids mistaking that stable setup
  // geometry for travel. This does not require a tuned pixel amount.
  const forward_through_impact = through_impact.filter(
    (sample, index) =>
      index === 0 ||
      sample.camera_physical_progress > through_impact[index - 1].camera_physical_progress,
  );
  const diameter_by_progress_third = thirds_by_progress(forward_through_impact).map((third) =>
    summarize(
      third.filter((sample) => sample.matching_ball_ellipse).map((sample) => sample.radius_x * 2),
    ),
  );
  const diameter_medians = diameter_by_progress_third.map((summary) => summary?.median);
  const diameter_rises_by_progress =
    diameter_medians.every((value) => value !== undefined) &&
    diameter_medians[0] <= diameter_medians[1] &&
    diameter_medians[1] <= diameter_medians[2];
  const first_foreground = visible_foreground(forward_through_impact[0]);
  const impact_foreground = visible_foreground(forward_through_impact.at(-1));
  const zone_center_distance_fraction =
    impact_sample?.collision_zone_visible === true
      ? Math.hypot(
          impact_sample.collision_zone_center_x_fraction - 0.5,
          impact_sample.collision_zone_center_y_fraction - 0.5,
        ) / Math.hypot(0.5, 0.5)
      : undefined;
  const collision_center_distance_fraction =
    impact_sample === undefined
      ? undefined
      : Math.hypot(
          impact_sample.center_x - impact_sample.canvas_width / 2,
          impact_sample.center_y - impact_sample.canvas_height / 2,
        ) / Math.hypot(impact_sample.canvas_width / 2, impact_sample.canvas_height / 2);
  return {
    case: definition.name,
    rack_pin_count: definition.mode === 100 ? 105 : definition.mode === 500 ? 496 : 990,
    requested_controls: definition,
    actual_controls: control_values,
    first_impact_observed: impact_sample !== undefined,
    impact_windows: Math.max(0, ...samples.map((sample) => sample.impact_window_count)),
    samples_observed: samples.length,
    rAF_samples_after_first_draw_through_pit_or_result: renderable_window.length,
    rAF_samples_through_first_impact: through_impact.length,
    readable_rAF_samples: readable.length,
    undrawn_rAF_samples_before_pit_or_result: missing_drawn.length,
    drawn_but_unmatched_ellipse_rAF_samples: unmatched.length,
    clipped_ellipse_rAF_samples: clipped.length,
    continuous_readable_ball_through_renderable_window: continuity,
    ball_diameter_px: summarize(width_values),
    ball_projected_area_px2: summarize(
      through_impact
        .filter((sample) => sample.matching_ball_ellipse)
        .map((sample) => Math.PI * sample.radius_x * sample.radius_y),
    ),
    ball_diameter_px_by_physical_progress_third: diameter_by_progress_third,
    ball_diameter_rises_across_physical_progress_thirds: diameter_rises_by_progress,
    ball_growth_ratio_through_first_impact: growth_ratio,
    visible_foreground_below_foul_line_fraction: summarize(foreground_values),
    visible_foreground_below_foul_line_first_to_impact_change:
      first_foreground === undefined || impact_foreground === undefined
        ? undefined
        : impact_foreground - first_foreground,
    launch_platform_projected_fraction: summarize(apron_values),
    collision_zone_at_first_impact:
      impact_sample?.collision_zone_visible === true
        ? {
            coverage_fraction: impact_sample.collision_zone_coverage_fraction,
            center_x_fraction: impact_sample.collision_zone_center_x_fraction,
            center_y_fraction: impact_sample.collision_zone_center_y_fraction,
            fully_on_canvas: impact_sample.collision_zone_fully_on_canvas,
          }
        : undefined,
    first_impact_ball_center_distance_from_canvas_center_fraction:
      collision_center_distance_fraction,
    first_impact_collision_zone_center_distance_from_canvas_center_fraction:
      zone_center_distance_fraction,
    first_impact_camera:
      impact_sample === undefined
        ? undefined
        : {
            progress: impact_sample.camera_progress,
            physical_progress: impact_sample.camera_physical_progress,
            zoom: impact_sample.camera_zoom,
          },
    ending_phase: samples.at(-1)?.phase,
    ending_ball_in_pit: samples.at(-1)?.ball_in_pit,
  };
}

async function capture_case(browser, base_url, definition) {
  const context = await browser.newContext({ viewport });
  await install_ball_ellipse_probe(context);
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  try {
    const pin_count = definition.mode === 100 ? 105 : definition.mode === 500 ? 496 : 990;
    const mode_label = `${definition.mode.toLocaleString()} mode - ${pin_count.toLocaleString()} pins`;
    const start_label = `Start ${definition.mode.toLocaleString()} mode - ${pin_count.toLocaleString()} pins for 1 player`;
    await start_aiming_state(page, base_url, mode_label, start_label, pin_count);
    for (const [control, fraction] of Object.entries({
      power: definition.power,
      "start-position": definition.start,
      angle: definition.angle,
      spin: definition.spin,
    })) {
      await set_control_fraction(page, control, fraction);
    }
    await page.waitForFunction(
      () =>
        document.querySelector("main.play_shell")?.getAttribute("data-preview-status") === "ready",
    );
    const actual_controls = await page.evaluate(() =>
      Object.fromEntries(
        ["start-position", "power", "angle", "spin"].map((name) => {
          const control = document.querySelector(`[data-control="${name}"]`);
          return [name, control instanceof HTMLInputElement ? control.value : undefined];
        }),
      ),
    );
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    const samples = [];
    let rolling = true;
    // The live worker is authoritative. Stop on its pit/result transition;
    // requiring a ball after its intentional in-pit renderer omission would
    // manufacture a false visual failure.
    while (rolling) {
      const sample = await read_sample(page);
      if (sample !== undefined) samples.push(sample);
      rolling = await page.evaluate(() => {
        const root = document.querySelector("main.play_shell");
        return (
          root?.getAttribute("data-phase") === "rolling" &&
          root.getAttribute("data-ball-in-pit") !== "true"
        );
      });
      if (rolling) await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    const result = analyze_case(definition, samples, actual_controls);
    if (result.rAF_samples_after_first_draw_through_pit_or_result === 0) {
      throw new Error(`${definition.name} did not expose a drawable live ball before pit/result.`);
    }
    if (!result.continuous_readable_ball_through_renderable_window) {
      throw new Error(
        `${definition.name} lost a readable live ball before pit/result; inspect its trace.`,
      );
    }
    return { result, samples };
  } finally {
    await context.close();
  }
}

async function main() {
  const { base_url, case_name } = parse_arguments(process.argv.slice(2));
  const capture_url = new URL(base_url);
  capture_url.searchParams.set("camera-diagnostics", "1");
  await mkdir(output_directory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const captures = [];
    for (const definition of cases.filter(
      (candidate) => case_name === undefined || candidate.name === case_name,
    )) {
      console.log(`==> M9 ${definition.name}`);
      captures.push(await capture_case(browser, capture_url.href, definition));
    }
    const results = captures.map((capture) => capture.result);
    const output = {
      evidence_kind: "production_browser_camera_archetypes",
      captured_at: new Date().toISOString(),
      viewport,
      methodology: {
        source: "built app served over HTTP; legal visible controls; real worker snapshots",
        ball_residency_window:
          "from the first rolling ball draw through first ball-pin impact and every later rolling frame until worker in-pit omission or result",
        readable_ball:
          "a matching draw_ball outer ellipse with positive area fully inside the live canvas",
        foreground_measure:
          "renderer-projected foul-line extent clipped to the canvas; descriptive visible-foreground proxy, not a semantic-pixel claim",
        collision_framing_measure:
          "renderer-projected active collision-zone polygon/coverage/center at first impact",
      },
      results,
      traces: captures.map((capture) => capture.samples),
    };
    const path = join(
      output_directory,
      case_name === undefined ? "camera_archetypes.json" : `camera_archetypes_${case_name}.json`,
    );
    await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ path, results }, null, 2));
  } finally {
    await browser.close();
  }
}

await main();
