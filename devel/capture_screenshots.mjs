/* global document, requestAnimationFrame */
// capture_screenshots.mjs - browser interactions for durable captures and M1 evidence.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import { create_camera_state } from "../src/render/camera.ts";
import {
  camera_projection_diagnostics,
  camera_source_provenance,
  capture_live_screenshot as capture_live_screenshot_with_viewport,
  freeze_mid_roll_canvas,
  install_canvas_ellipse_probe,
  live_canvas_geometry as live_canvas_geometry_with_viewport,
  png_metadata as png_metadata_with_viewport,
  remove_frozen_mid_roll_canvas,
  start_aiming_state,
} from "./capture_live_support.mjs";
import { capture_projection_probes as capture_projection_probes_with_viewport } from "./capture_projection_probes.mjs";
import { measure_frame_window as measure_frame_window_with_dependencies } from "./capture_frame_window.mjs";
import { capture_documentation_showcase } from "./capture_documentation_showcase.mjs";

const viewport = { width: 1600, height: 1000 };
const valid_modes = new Set(["documentation", "milestone", "all"]);
const capture_live_screenshot = (page, path, state, expected_pin_count, geometry) =>
  capture_live_screenshot_with_viewport(page, path, state, expected_pin_count, viewport, geometry);
const live_canvas_geometry = (page) => live_canvas_geometry_with_viewport(page, viewport);
const png_metadata = (path) => png_metadata_with_viewport(path, viewport);
const capture_projection_probes = (browser, output_directory) =>
  capture_projection_probes_with_viewport(browser, output_directory, viewport, png_metadata);
const measure_frame_window = (browser, base_url, output_directory) =>
  measure_frame_window_with_dependencies(
    browser,
    base_url,
    output_directory,
    viewport,
    start_aiming_state,
    capture_live_screenshot,
  );

function usage() {
  console.log(
    "Usage: node devel/capture_screenshots.mjs --base-url URL --mode MODE\n" +
      "       node devel/capture_screenshots.mjs --check-provenance",
  );
}

function parse_arguments(arguments_list) {
  const options = {
    base_url: undefined,
    mode: "documentation",
    timeout_seconds: 90,
    check_provenance: false,
  };
  for (let index = 0; index < arguments_list.length; index += 1) {
    const argument = arguments_list[index];
    if (argument === "--base-url") {
      options.base_url = arguments_list[index + 1];
      index += 1;
    } else if (argument === "--mode") {
      options.mode = arguments_list[index + 1];
      index += 1;
    } else if (argument === "--timeout-seconds") {
      options.timeout_seconds = Number(arguments_list[index + 1]);
      index += 1;
    } else if (argument === "--check-provenance") {
      options.check_provenance = true;
    } else if (argument === "-h" || argument === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!options.check_provenance && options.base_url === undefined) {
    throw new Error("--base-url is required unless --check-provenance is used.");
  }
  if (!valid_modes.has(options.mode)) throw new Error(`Unknown capture mode: ${options.mode}`);
  if (!Number.isInteger(options.timeout_seconds) || options.timeout_seconds <= 0) {
    throw new Error("--timeout-seconds must be a positive whole number.");
  }
  return options;
}

async function capture_milestone_decks(browser, base_url, output_directory) {
  const cases = [
    ["10", "10 mode - 10 pins", "Start 10 mode - 10 pins for 1 player", 10],
    ["105", "100 mode - 105 pins", "Start 100 mode - 105 pins for 1 player", 105],
    ["990", "1,000 mode - 990 pins", "Start 1,000 mode - 990 pins for 1 player", 990],
  ];
  const states = [];
  for (const [state, mode_label, start_label, pin_count] of cases) {
    console.log(`==> Capturing live-app ${state}-pin aiming probe`);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      const play_shell = await start_aiming_state(
        page,
        base_url,
        mode_label,
        start_label,
        pin_count,
      );
      const path = join(output_directory, `deck_aiming_${state}.png`);
      const capture = await capture_live_screenshot(page, path, "aiming", pin_count);
      states.push({
        evidence_kind: "live_app_aiming",
        state,
        expected_pin_count: pin_count,
        identity: {
          phase: await play_shell.getAttribute("data-phase"),
          drawn_pin_count: await play_shell.getAttribute("data-drawn-pin-count"),
          camera_mode: await play_shell.getAttribute("data-camera-mode"),
        },
        ...capture,
      });
    } finally {
      await context.close();
    }
  }
  return states;
}

const lane_state_matrix_cases = [
  {
    rack: 10,
    mode_label: "10 mode - 10 pins",
    start_label: "Start 10 mode - 10 pins for 1 player",
  },
  {
    rack: 105,
    mode_label: "100 mode - 105 pins",
    start_label: "Start 100 mode - 105 pins for 1 player",
  },
  {
    rack: 990,
    mode_label: "1,000 mode - 990 pins",
    start_label: "Start 1,000 mode - 990 pins for 1 player",
  },
];

function expected_lane_state_counts(state, pin_count) {
  const common = { rack_total: pin_count };
  if (state === "aiming") {
    return { ...common, visible_total: pin_count, standing: pin_count, fallen: 0 };
  }
  if (state === "mid_roll") {
    return { ...common, visible_total: pin_count, standing: "observed", fallen: "observed" };
  }
  // Settled pins may have been cleared into the pit. Only the still-visible
  // standing and fallen bodies are required to balance the visible draw count.
  return {
    ...common,
    visible_total: "0..rack_total",
    standing: "observed",
    fallen: "observed",
    pit_cleared: "rack_total - visible_total",
  };
}

async function read_lane_state_counts(page, pin_count, lane_state) {
  const state = await page.evaluate(() => {
    const root = document.querySelector("main.play_shell");
    const standing = document.querySelector("[data-standing-count]")?.textContent ?? "";
    if (root === null) return undefined;
    return {
      phase: root.getAttribute("data-phase"),
      drawn_pin_count: root.getAttribute("data-drawn-pin-count"),
      drawn_fallen_pin_count: root.getAttribute("data-drawn-fallen-pin-count"),
      drawn_ball: root.getAttribute("data-drawn-ball"),
      camera_progress: root.getAttribute("data-camera-progress"),
      standing,
    };
  });
  if (state === undefined)
    throw new Error("Lane-state capture could not find the live play shell.");
  const standing_match = state.standing.match(/([\d,]+) of ([\d,]+) pins standing/);
  if (standing_match === null) {
    throw new Error(`Lane-state capture could not parse standing pins: ${state.standing}`);
  }
  const standing = Number(standing_match[1].replaceAll(",", ""));
  const total = Number(standing_match[2].replaceAll(",", ""));
  const fallen = numeric_attribute(state.drawn_fallen_pin_count, "data-drawn-fallen-pin-count");
  const drawn_total = numeric_attribute(state.drawn_pin_count, "data-drawn-pin-count");
  const visible_total = standing + fallen;
  const strict_visible_count = lane_state !== "settled_result";
  if (
    total !== pin_count ||
    drawn_total !== visible_total ||
    drawn_total > pin_count ||
    (strict_visible_count && drawn_total !== pin_count)
  ) {
    throw new Error(
      `Lane-state count conservation failed for ${pin_count} ${lane_state}: standing=${standing}, fallen=${fallen}, rack_total=${total}, visible_drawn=${drawn_total}.`,
    );
  }
  return {
    phase: state.phase,
    standing,
    fallen,
    rack_total: total,
    drawn_total,
    pit_cleared: pin_count - drawn_total,
    drawn_ball: state.drawn_ball,
    camera_progress: numeric_attribute(state.camera_progress, "data-camera-progress"),
    standing_text: state.standing,
  };
}

async function wait_for_matrix_mid_roll(page, pin_count) {
  await page.waitForFunction((expected_pin_count) => {
    const root = document.querySelector("main.play_shell");
    if (
      root?.getAttribute("data-phase") !== "rolling" ||
      root.getAttribute("data-drawn-pin-count") !== String(expected_pin_count) ||
      root.getAttribute("data-drawn-ball") !== "true"
    ) {
      return false;
    }
    const progress = Number(root.getAttribute("data-camera-progress"));
    return Number.isFinite(progress) && progress >= 0.45 && progress <= 0.8;
  }, pin_count);
}

async function capture_lane_state_matrix(browser, base_url, output_directory) {
  const records = [];
  for (const fixture of lane_state_matrix_cases) {
    for (const state of ["aiming", "mid_roll", "settled_result"]) {
      console.log(`==> Capturing fresh ${fixture.rack}-pin ${state} lane state`);
      // Each cell owns its own clean browser storage and its own fresh match.
      // Mid-roll and result cells additionally own a distinct newly launched roll.
      const context = await browser.newContext({ viewport });
      if (state === "mid_roll") await install_canvas_ellipse_probe(context);
      const page = await context.newPage();
      page.setDefaultTimeout(90_000);
      try {
        const match_started_at = new Date().toISOString();
        const play_shell = await start_aiming_state(
          page,
          base_url,
          fixture.mode_label,
          fixture.start_label,
          fixture.rack,
        );
        let roll_launched_at = null;
        if (state === "mid_roll" || state === "settled_result") {
          await page.keyboard.press("Space");
          roll_launched_at = new Date().toISOString();
          if (state === "mid_roll") {
            await wait_for_matrix_mid_roll(page, fixture.rack);
          } else {
            await page.waitForFunction(
              () =>
                document.querySelector("main.play_shell")?.getAttribute("data-phase") === "result",
            );
          }
        }
        const state_acquired_at = new Date().toISOString();
        const observed_counts = await read_lane_state_counts(page, fixture.rack, state);
        const expected_phase =
          state === "aiming" ? "aiming" : state === "mid_roll" ? "rolling" : "result";
        if (observed_counts.phase !== expected_phase) {
          throw new Error(
            `Lane-state capture expected ${expected_phase} for ${fixture.rack} ${state}, got ${observed_counts.phase}.`,
          );
        }
        const artifact_name = `lane_state_${fixture.rack}_${state}.png`;
        // State-specific browser canvases can differ after responsive layout
        // changes. Capture the live backing-store geometry before the image,
        // then solve the immutable complete-rack camera against those exact
        // pixels. The same data is emitted for aiming, rolling, and result;
        // the report intentionally records rather than asserts their equality.
        const game_canvas = await live_canvas_geometry(page);
        const projection = camera_projection_diagnostics(
          create_camera_state(fixture.rack),
          game_canvas,
        );
        let rendered_ball;
        let capture;
        if (state === "mid_roll") {
          rendered_ball = await freeze_mid_roll_canvas(page);
          try {
            capture = await capture_live_screenshot(
              page,
              join(output_directory, artifact_name),
              state,
              fixture.rack,
              game_canvas,
            );
          } finally {
            await remove_frozen_mid_roll_canvas(page, rendered_ball);
          }
        } else {
          capture = await capture_live_screenshot(
            page,
            join(output_directory, artifact_name),
            state,
            fixture.rack,
            game_canvas,
          );
        }
        records.push({
          evidence_kind: "fresh_live_lane_state_matrix",
          artifact_name,
          mode: `${fixture.rack} pins`,
          rack: fixture.rack,
          state,
          expected: {
            phase: expected_phase,
            counts: expected_lane_state_counts(state, fixture.rack),
          },
          observed: { counts: observed_counts },
          projection,
          rendered_ball,
          state_acquisition: {
            fresh_browser_context: true,
            fresh_match: true,
            fresh_roll: state !== "aiming",
            match_started_at,
            roll_launched_at,
            state_acquired_at,
          },
          route: page.url(),
          source:
            state === "mid_roll"
              ? "live_browser_new_match_frozen_canvas_overlay"
              : "live_browser_new_match",
          identity: {
            phase: await play_shell.getAttribute("data-phase"),
            camera_mode: await play_shell.getAttribute("data-camera-mode"),
          },
          ...capture,
        });
      } finally {
        await context.close();
      }
    }
  }
  return records;
}

/**
 * A non-judgmental index of the repeated complete-rack framing evidence. It
 * lets reviewers compare all three live states for one rack without inferring
 * framing from different survivor counts or CSS dimensions.
 */
function lane_state_matrix_framing_index(records) {
  return {
    comparison_intent:
      "Each record independently solves the default immutable complete-rack camera against its own captured backing-store canvas; this index groups those repeated diagnostics without asserting a pass or fail.",
    groups: lane_state_matrix_cases.map(({ rack }) => ({
      rack,
      records: records
        .filter((record) => record.rack === rack)
        .map(({ artifact_name, state, projection }) => ({
          state,
          artifact_name,
          canvas_geometry: projection.canvas_geometry,
          full_rack_framing_source: projection.full_rack_framing_source,
          camera: projection.camera,
        })),
    })),
  };
}

async function capture_m3_behavior_evidence(browser, base_url, output_directory) {
  const evidence = [];
  const ten_mode = "10 mode - 10 pins";
  const ten_start = "Start 10 mode - 10 pins for 1 player";

  async function aiming_identity(play_shell) {
    return {
      phase: await play_shell.getAttribute("data-phase"),
      preview_status: await play_shell.getAttribute("data-preview-status"),
      aim_guide: await play_shell.getAttribute("data-aim-guide"),
    };
  }

  async function wait_for_preview(page) {
    await page.waitForFunction(() => {
      const root = document.querySelector("main.play_shell");
      return (
        root?.getAttribute("data-preview-status") === "ready" &&
        root.getAttribute("data-aim-guide") === "visible"
      );
    });
  }

  async function deadwood_identity(page, play_shell) {
    const standing_text = await page.locator("[data-standing-count]").textContent();
    const standing_match = standing_text?.match(/([\d,]+) of ([\d,]+) pins standing/);
    if (standing_match === null || standing_match === undefined) {
      throw new Error("Could not read the visible standing-pin count for deadwood evidence.");
    }
    return {
      phase: await play_shell.getAttribute("data-phase"),
      drawn_fallen_pin_count: await play_shell.getAttribute("data-drawn-fallen-pin-count"),
      drawn_pin_count: await play_shell.getAttribute("data-drawn-pin-count"),
      standing_text,
      standing_count: Number(standing_match[1].replaceAll(",", "")),
    };
  }

  async function capture_aiming_case(
    name,
    configure,
    { requires_preview = true, read_identity = aiming_identity } = {},
  ) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      const play_shell = await start_aiming_state(page, base_url, ten_mode, ten_start, 10);
      await configure(page, play_shell);
      if (requires_preview) await wait_for_preview(page);
      const path = join(output_directory, `${name}.png`);
      const capture = await capture_live_screenshot(page, path, name, 10);
      evidence.push({
        evidence_kind: name,
        identity: await read_identity(play_shell),
        ...capture,
      });
    } finally {
      await context.close();
    }
  }

  await capture_aiming_case("control_panel_10", async () => {});
  await capture_aiming_case("spin_zero_10", async () => {});
  await capture_aiming_case("spin_full_10", async (page) => {
    await page.locator('[data-control="spin"]').focus();
    await page.keyboard.press("End");
  });
  await capture_aiming_case(
    "minimum_power_pit_10",
    async (page, _play_shell) => {
      await page.locator('[data-control="power"]').focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("Space");
      await page.waitForFunction(
        () =>
          document.querySelector("main.play_shell")?.getAttribute("data-ball-in-pit") === "true",
      );
    },
    {
      requires_preview: false,
      read_identity: async (play_shell) => ({
        phase: await play_shell.getAttribute("data-phase"),
        ball_in_pit: await play_shell.getAttribute("data-ball-in-pit"),
      }),
    },
  );

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await page.goto(`${base_url}?fixture=partial_knock`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: ten_start, exact: true }).click();
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "result",
    );
    const before_path = join(output_directory, "deadwood_before_sweep_10.png");
    const before_capture = await capture_live_screenshot(page, before_path, "deadwood_result", 10);
    evidence.push({
      evidence_kind: "deadwood_before_sweep_10",
      identity: await deadwood_identity(page, page.locator("main.play_shell")),
      ...before_capture,
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("main.play_shell");
      return (
        root?.getAttribute("data-phase") === "aiming" &&
        root.getAttribute("data-drawn-fallen-pin-count") === "0"
      );
    });
    const after_path = join(output_directory, "deadwood_after_sweep_10.png");
    const after_capture = await capture_live_screenshot(
      page,
      after_path,
      "deadwood_swept_aiming",
      10,
    );
    evidence.push({
      evidence_kind: "deadwood_after_sweep_10",
      identity: await deadwood_identity(page, page.locator("main.play_shell")),
      ...after_capture,
    });
  } finally {
    await context.close();
  }
  return evidence;
}

function numeric_attribute(value, name) {
  if (value === null || value === "") throw new Error(`Missing ${name} capture diagnostic.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${name} capture diagnostic: ${value}.`);
  return number;
}

async function read_centered_shot_sample(page) {
  const attributes = await page.evaluate(() => {
    const root = document.querySelector("main.play_shell");
    if (root === null) return undefined;
    return {
      phase: root.getAttribute("data-phase"),
      progress: root.getAttribute("data-camera-progress"),
      zoom: root.getAttribute("data-camera-zoom"),
      ball_screen_x: root.getAttribute("data-drawn-ball-screen-x"),
      ball_screen_y: root.getAttribute("data-drawn-ball-screen-y"),
    };
  });
  if (
    attributes === undefined ||
    attributes.phase !== "rolling" ||
    attributes.ball_screen_x === "" ||
    attributes.ball_screen_y === ""
  ) {
    return undefined;
  }
  return {
    phase: attributes.phase,
    progress: numeric_attribute(attributes.progress, "data-camera-progress"),
    zoom: numeric_attribute(attributes.zoom, "data-camera-zoom"),
    ball_screen_x: numeric_attribute(attributes.ball_screen_x, "data-drawn-ball-screen-x"),
    ball_screen_y: numeric_attribute(attributes.ball_screen_y, "data-drawn-ball-screen-y"),
  };
}

function analyze_centered_shot_motion(samples) {
  const progress_samples = [];
  let last_progress = -1;
  for (const sample of samples) {
    // Several requestAnimationFrames can observe the same worker snapshot. Keep
    // each meaningful forward advance and permit two screen pixels of renderer
    // interpolation noise instead of imposing an artificial pixel-equivalence gate.
    if (sample.progress > last_progress + 0.005) {
      progress_samples.push(sample);
      last_progress = sample.progress;
    }
  }
  if (progress_samples.length < 3) {
    throw new Error("Centered-shot probe recorded too few forward camera samples.");
  }
  const monotonic_violations = [];
  for (let index = 1; index < progress_samples.length; index += 1) {
    const previous = progress_samples[index - 1];
    const current = progress_samples[index];
    if (current.ball_screen_y > previous.ball_screen_y + 2) {
      monotonic_violations.push({ previous, current });
    }
  }
  const first = progress_samples[0];
  const last = progress_samples.at(-1);
  const upward_travel_px = first.ball_screen_y - last.ball_screen_y;
  const x_values = progress_samples.map((sample) => sample.ball_screen_x);
  return {
    sample_count: samples.length,
    forward_sample_count: progress_samples.length,
    progress_start: first.progress,
    progress_end: last.progress,
    screen_y_start: first.ball_screen_y,
    screen_y_end: last.ball_screen_y,
    upward_travel_px,
    minimum_required_upward_travel_px: viewport.height * 0.3,
    monotonic_tolerance_px: 2,
    monotonic_violations,
    ball_screen_x_range_px: Math.max(...x_values) - Math.min(...x_values),
    camera_mode: "centered-shot",
    horizon: "fixed by the centered-shot renderer; the app exposes no separate horizon coordinate",
    lateral_camera:
      "fixed framing; the centered default ball x range is reported as an observable proxy",
  };
}

async function capture_centered_shot_evidence(browser, base_url, output_directory) {
  console.log("==> Capturing real-worker centered-shot travel and result evidence");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    const play_shell = await start_aiming_state(
      page,
      base_url,
      "10 mode - 10 pins",
      "Start 10 mode - 10 pins for 1 player",
      10,
    );
    const aiming_path = join(output_directory, "centered_shot_aiming_10.png");
    const aiming_capture = await capture_live_screenshot(page, aiming_path, "aiming", 10);
    const aiming = {
      phase: await play_shell.getAttribute("data-phase"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      aim_offset: await play_shell.getAttribute("data-aim-guide-offset"),
      power: await page.locator('[data-control="power"]').inputValue(),
      ...aiming_capture,
    };

    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    await page.waitForFunction(() => {
      const root = document.querySelector("main.play_shell");
      return (
        root?.getAttribute("data-drawn-ball") === "true" &&
        root.getAttribute("data-drawn-ball-screen-x") !== "" &&
        root.getAttribute("data-drawn-ball-screen-y") !== ""
      );
    });
    const samples = [];
    let mid_path;
    let mid_capture;
    // Collect through Playwright so the same DOM diagnostics feed both captures and JSON.
    while ((await play_shell.getAttribute("data-phase")) === "rolling") {
      const sample = await read_centered_shot_sample(page);
      if (sample !== undefined) samples.push(sample);
      if (sample !== undefined && mid_path === undefined && sample.progress >= 0.45) {
        mid_path = join(output_directory, "centered_shot_mid_roll_10.png");
        const capture = await capture_live_screenshot(page, mid_path, "mid_roll", 10);
        mid_capture = {
          phase: sample.phase,
          camera_progress: sample.progress,
          camera_zoom: sample.zoom,
          ...capture,
        };
      }
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    // A browser can move from launch to settlement before the first polling turn on
    // exceptionally fast hosts. In that case this is an evidence failure, not a
    // substituted fixture or synthetic screenshot.
    if (mid_path === undefined) {
      throw new Error("Centered-shot probe missed a live mid-roll frame.");
    }
    const motion = analyze_centered_shot_motion(samples);
    if (motion.monotonic_violations.length > 0) {
      throw new Error("Centered-shot ball screen y reversed while camera progress increased.");
    }
    if (motion.upward_travel_px < motion.minimum_required_upward_travel_px) {
      throw new Error(
        `Centered-shot ball travel ${motion.upward_travel_px.toFixed(1)}px is below the required ${motion.minimum_required_upward_travel_px}px.`,
      );
    }
    const result_path = join(output_directory, "centered_shot_result_10.png");
    const result_capture = await capture_live_screenshot(page, result_path, "settled_result", 10);
    const standing_text = await page.locator("[data-standing-count]").textContent();
    const is_strike =
      (await page.locator("p.roll_result").textContent())?.includes("Strike!") ?? false;
    const result = {
      phase: await play_shell.getAttribute("data-phase"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      standing_text,
      legal_centered_strike: {
        observed: is_strike,
        input: { start_position: aiming.aim_offset, power: aiming.power, angle: "0", spin: "0" },
      },
      ...result_capture,
    };
    return {
      aiming,
      mid_roll: mid_capture,
      result,
      motion,
    };
  } finally {
    await context.close();
  }
}

async function capture_second_roll_after_sweep(browser, base_url, output_directory) {
  console.log("==> Capturing real-worker second-roll aiming state after sweep acknowledgement");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    const play_shell = await start_aiming_state(
      page,
      base_url,
      "10 mode - 10 pins",
      "Start 10 mode - 10 pins for 1 player",
      10,
    );
    // The legal minimum centered power leaves standing pins, ensuring the first
    // frame remains on its rack and the production worker must acknowledge
    // prepare_next_roll before controls return. Unlike a gutter probe, this
    // follows the same deck-impact/settlement path as a normal bowl.
    await page.locator('[data-control="power"]').focus();
    await page.keyboard.press("Home");
    const first_roll_power = await page.locator('[data-control="power"]').inputValue();
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "result",
    );
    const first_result_standing = await page.locator("[data-standing-count]").textContent();
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "aiming",
    );
    await page.waitForFunction(() => {
      const root = document.querySelector("main.play_shell");
      return (
        root?.getAttribute("data-preview-status") === "ready" &&
        root.getAttribute("data-drawn-aim-guide") === "true"
      );
    });
    const path = join(output_directory, "centered_shot_second_roll_aiming_10.png");
    const capture = await capture_live_screenshot(page, path, "second_roll_aiming", 10);
    return {
      first_roll_power,
      first_result_standing,
      phase: await play_shell.getAttribute("data-phase"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      drawn_ball: await play_shell.getAttribute("data-drawn-ball"),
      drawn_aim_guide: await play_shell.getAttribute("data-drawn-aim-guide"),
      sweep_acknowledged: true,
      ...capture,
    };
  } finally {
    await context.close();
  }
}

async function capture_reduced_motion_evidence(browser, base_url, output_directory) {
  console.log("==> Capturing reduced-motion centered-shot fixed-view evidence");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    // Reduced motion is a camera-composition preference, so use the existing
    // deterministic production-client fixture here. The roll/cascade captures
    // above remain real-worker evidence; this keeps the accessibility probe
    // quick and repeatable without claiming a separate physical result.
    await page.goto(`${base_url}?fixture=camera_deck`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reduced motion off", exact: true }).click();
    await page
      .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
      .click();
    const play_shell = page.locator("main.play_shell");
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    const path = join(output_directory, "centered_shot_reduced_motion_rolling_10.png");
    const capture = await capture_live_screenshot(page, path, "reduced_motion_rolling", 10);
    const result = {
      evidence_kind: "deterministic_production_client_fixture",
      reduced_motion: await play_shell.getAttribute("data-reduced-motion"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      ...capture,
    };
    if (
      result.reduced_motion !== "true" ||
      result.camera_progress !== "0.0000" ||
      result.camera_zoom !== "1.0000"
    ) {
      throw new Error(
        "Reduced-motion capture did not retain the fixed centered composition at neutral zoom.",
      );
    }
    return result;
  } finally {
    await context.close();
  }
}

async function capture_milestone(browser, base_url) {
  const output_directory = "artifacts/milestone";
  await mkdir(output_directory, { recursive: true });
  const camera_source = await camera_source_provenance();
  const projection_probes = await capture_projection_probes(browser, output_directory);
  const live_app_states = await capture_milestone_decks(browser, base_url, output_directory);
  const lane_state_matrix = await capture_lane_state_matrix(browser, base_url, output_directory);
  const m3_behavior_evidence = await capture_m3_behavior_evidence(
    browser,
    base_url,
    output_directory,
  );
  const centered_shot = await capture_centered_shot_evidence(browser, base_url, output_directory);
  const second_roll_after_sweep = await capture_second_roll_after_sweep(
    browser,
    base_url,
    output_directory,
  );
  const frame_window = await measure_frame_window(browser, base_url, output_directory);
  const reduced_motion = await capture_reduced_motion_evidence(browser, base_url, output_directory);
  const report = {
    capture_report_format: 2,
    full_page_viewport: viewport,
    camera_source,
    legacy_artifact_exclusions: [
      {
        path_glob: "test-results/m6_camera_*.png",
        reason:
          "Legacy Playwright test output is excluded from milestone evidence; live artifacts are captured during this run under artifacts/milestone/.",
      },
    ],
    viewport,
    projection_probes,
    live_app_states,
    lane_state_matrix,
    lane_state_matrix_framing_index: lane_state_matrix_framing_index(lane_state_matrix),
    m3_behavior_evidence,
    centered_shot,
    second_roll_after_sweep,
    reduced_motion,
    frame_window,
  };
  await writeFile(
    join(output_directory, "capture_report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function main() {
  const options = parse_arguments(process.argv.slice(2));
  if (options.check_provenance) {
    console.log(JSON.stringify(await camera_source_provenance(), null, 2));
    return;
  }
  const browser = await chromium.launch({ headless: true });
  let timed_out = false;
  let deadline_id;
  const deadline = new Promise((_, reject) => {
    deadline_id = setTimeout(() => {
      timed_out = true;
      void browser.close();
      reject(new Error(`Browser capture exceeded ${options.timeout_seconds} seconds.`));
    }, options.timeout_seconds * 1000);
  });
  let shutting_down = false;
  async function close_on_signal(signal) {
    if (shutting_down) return;
    shutting_down = true;
    console.error(`Stopping browser capture after ${signal}.`);
    await browser.close();
    process.exit(128);
  }
  process.once("SIGTERM", () => void close_on_signal("SIGTERM"));
  process.once("SIGINT", () => void close_on_signal("SIGINT"));
  try {
    const capture = (async () => {
      const report = {};
      if (options.mode === "documentation" || options.mode === "all") {
        report.documentation = await capture_documentation_showcase(browser, options.base_url);
      }
      if (options.mode === "milestone" || options.mode === "all") {
        report.milestone = await capture_milestone(browser, options.base_url);
      }
      console.log(JSON.stringify(report, null, 2));
    })();
    await Promise.race([capture, deadline]);
  } finally {
    clearTimeout(deadline_id);
    if (!timed_out) await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
