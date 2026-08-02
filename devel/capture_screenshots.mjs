/* global document, requestAnimationFrame */
// capture_screenshots.mjs - browser interactions for durable captures and M1 evidence.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import {
  create_camera_projection,
  create_game_draw_commands,
  create_lane_geometry,
} from "../src/render/game_renderer.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  write_snapshot_ball,
  write_snapshot_pin,
} from "../src/simulation/protocol.ts";
import {
  foul_to_head_pin,
  gutter_width,
  lane_width,
  pin_radius,
  pin_spacing,
  rack_row_count,
  row_spacing,
} from "../src/config/lane.ts";

const viewport = { width: 1600, height: 1000 };
const valid_modes = new Set(["documentation", "milestone", "all"]);

function usage() {
  console.log("Usage: node devel/capture_screenshots.mjs --base-url URL --mode MODE");
}

function parse_arguments(arguments_list) {
  const options = { base_url: undefined, mode: "documentation", timeout_seconds: 90 };
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
    } else if (argument === "-h" || argument === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (options.base_url === undefined) throw new Error("--base-url is required.");
  if (!valid_modes.has(options.mode)) throw new Error(`Unknown capture mode: ${options.mode}`);
  if (!Number.isInteger(options.timeout_seconds) || options.timeout_seconds <= 0) {
    throw new Error("--timeout-seconds must be a positive whole number.");
  }
  return options;
}

async function png_metadata(path) {
  const [header, file_stat] = await Promise.all([readFile(path), stat(path)]);
  if (header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Expected PNG output at ${path}.`);
  }
  const metadata = {
    path,
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    bytes: file_stat.size,
  };
  if (metadata.width !== viewport.width || metadata.height !== viewport.height) {
    throw new Error(
      `Capture has unexpected dimensions at ${path}: expected ${viewport.width}x${viewport.height}, got ${metadata.width}x${metadata.height}.`,
    );
  }
  return metadata;
}

async function wait_for_aiming(page, expected_pin_count) {
  const play_shell = page.locator("main.play_shell");
  await play_shell.waitFor();
  await page.waitForFunction((pin_count) => {
    const root = document.querySelector("main.play_shell");
    return (
      root?.getAttribute("data-phase") === "aiming" &&
      root.getAttribute("data-drawn-pin-count") === String(pin_count)
    );
  }, expected_pin_count);
  return play_shell;
}

async function start_aiming_state(page, base_url, mode_label, start_label, pin_count) {
  console.log(`==> Opening ${pin_count}-pin aiming state`);
  await page.goto(base_url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: mode_label, exact: true }).click();
  await page.getByRole("button", { name: start_label, exact: true }).click();
  return wait_for_aiming(page, pin_count);
}

async function capture_documentation(browser, base_url) {
  console.log("==> Capturing README thousand-pin aiming view");
  const deck_path = "docs/screenshots/thousand_pin_deck.png";
  {
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
      await page.screenshot({ path: deck_path });
    } finally {
      await context.close();
    }
  }

  console.log("==> Capturing README pass-the-keyboard view");
  const handoff_path = "docs/screenshots/pass_the_keyboard.png";
  {
    // A separate storage context prevents the preceding 1,000-mode capture from
    // changing this fixture's setup button into a 1,000-mode label.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      await page.goto(`${base_url}?fixture=zero_knock`, { waitUntil: "networkidle" });
      const player_names = ["Ari", "Bea", "Chen", "Dia"];
      for (let player_index = 2; player_index <= 4; player_index += 1) {
        await page.getByRole("button", { name: "Add player" }).click();
      }
      for (const [index, name] of player_names.entries()) {
        await page.getByLabel(`Player ${index + 1} name`).fill(name);
      }
      await page
        .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
        .click();
      await page.getByRole("button", { name: "Bowl now" }).click();
      await page.getByRole("button", { name: "Bowl now" }).click();
      const handoff = page.getByRole("dialog");
      await handoff.waitFor();
      await handoff.getByRole("button", { name: "Bea, start your turn" }).focus();
      await page.screenshot({ path: handoff_path });
    } finally {
      await context.close();
    }
  }
  return Promise.all([png_metadata(deck_path), png_metadata(handoff_path)]);
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
      await page.screenshot({ path });
      states.push({
        evidence_kind: "live_app",
        state,
        expected_pin_count: pin_count,
        identity: {
          phase: await play_shell.getAttribute("data-phase"),
          drawn_pin_count: await play_shell.getAttribute("data-drawn-pin-count"),
          camera_mode: await play_shell.getAttribute("data-camera-mode"),
        },
        ...(await png_metadata(path)),
      });
    } finally {
      await context.close();
    }
  }
  return states;
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
      await page.screenshot({ path });
      evidence.push({
        evidence_kind: name,
        identity: await read_identity(play_shell),
        ...(await png_metadata(path)),
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
    await page.screenshot({ path: before_path });
    evidence.push({
      evidence_kind: "deadwood_before_sweep_10",
      identity: await deadwood_identity(page, page.locator("main.play_shell")),
      ...(await png_metadata(before_path)),
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("main.play_shell");
      return (
        root?.getAttribute("data-phase") === "aiming" &&
        root.getAttribute("data-drawn-fallen-pin-count") === "0"
      );
    });
    const after_path = join(output_directory, "deadwood_after_sweep_10.png");
    await page.screenshot({ path: after_path });
    evidence.push({
      evidence_kind: "deadwood_after_sweep_10",
      identity: await deadwood_identity(page, page.locator("main.play_shell")),
      ...(await png_metadata(after_path)),
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
    await page.screenshot({ path: aiming_path });
    const aiming = {
      phase: await play_shell.getAttribute("data-phase"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      aim_offset: await play_shell.getAttribute("data-aim-guide-offset"),
      power: await page.locator('[data-control="power"]').inputValue(),
      ...(await png_metadata(aiming_path)),
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
    // Collect through Playwright so the same DOM diagnostics feed both captures and JSON.
    while ((await play_shell.getAttribute("data-phase")) === "rolling") {
      const sample = await read_centered_shot_sample(page);
      if (sample !== undefined) samples.push(sample);
      if (sample !== undefined && mid_path === undefined && sample.progress >= 0.45) {
        mid_path = join(output_directory, "centered_shot_mid_roll_10.png");
        await page.screenshot({ path: mid_path });
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
    await page.screenshot({ path: result_path });
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
      ...(await png_metadata(result_path)),
    };
    return {
      aiming,
      mid_roll: await png_metadata(mid_path),
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
    await page.screenshot({ path });
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
      ...(await png_metadata(path)),
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
    await page.screenshot({ path });
    const result = {
      evidence_kind: "deterministic_production_client_fixture",
      reduced_motion: await play_shell.getAttribute("data-reduced-motion"),
      camera_mode: await play_shell.getAttribute("data-camera-mode"),
      camera_progress: await play_shell.getAttribute("data-camera-progress"),
      camera_zoom: await play_shell.getAttribute("data-camera-zoom"),
      ...(await png_metadata(path)),
    };
    if (
      result.reduced_motion !== "true" ||
      result.camera_progress !== "0.0000" ||
      result.camera_zoom !== "0.0000"
    ) {
      throw new Error(
        "Reduced-motion capture did not retain the fixed centered composition with zero zoom.",
      );
    }
    return result;
  } finally {
    await context.close();
  }
}

function create_foot_rack_snapshot(pin_count) {
  const snapshot = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  let pin_index = 0;
  const rows = rack_row_count(pin_count);
  for (let row_index = 0; row_index < rows; row_index += 1) {
    for (
      let column_index = 0;
      column_index <= row_index && pin_index < pin_count;
      column_index += 1
    ) {
      write_snapshot_pin(snapshot, pin_index * pin_snapshot_stride, {
        x: (column_index - row_index / 2) * pin_spacing,
        y: foul_to_head_pin + row_index * row_spacing,
        velocity_x: 0,
        velocity_y: 0,
        state_flag: 0,
        removed: false,
        in_pit: false,
      });
      pin_index += 1;
    }
  }
  write_snapshot_ball(snapshot, pin_count * pin_snapshot_stride, {
    x: 0,
    y: 0,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
    in_pit: false,
  });
  return snapshot;
}

function create_foot_camera(pin_count) {
  const half_rack_width = ((rack_row_count(pin_count) - 1) * pin_spacing) / 2;
  return {
    mode: "deck",
    rack_bounds: {
      left: -half_rack_width - pin_radius,
      right: half_rack_width + pin_radius,
      front: foul_to_head_pin - pin_radius,
      back: foul_to_head_pin + (rack_row_count(pin_count) - 1) * row_spacing + pin_radius,
      pin_count,
    },
  };
}

function number_for_svg(value) {
  return Number(value.toFixed(2));
}

function create_gutter_overlay(pin_count, camera, projection, geometry, width) {
  const depth_range = projection.far_y - projection.near_y;
  const near_depth = (projection.far_y - camera.rack_bounds.front) / depth_range;
  const far_depth = (projection.far_y - camera.rack_bounds.back) / depth_range;
  function projected_half_width(depth) {
    return geometry.top_half_width + depth * (geometry.bottom_half_width - geometry.top_half_width);
  }
  function screen_distance(world_distance, depth) {
    return (world_distance / projection.x_extent) * projected_half_width(depth);
  }
  const lane_half = lane_width(pin_count) / 2;
  const center = width / 2;
  const near_lane = screen_distance(lane_half, near_depth);
  const far_lane = screen_distance(lane_half, far_depth);
  const near_outer = screen_distance(lane_half + gutter_width, near_depth);
  const far_outer = screen_distance(lane_half + gutter_width, far_depth);
  const near_y = geometry.horizon_y + near_depth * (geometry.foreground_y - geometry.horizon_y);
  const far_y = geometry.horizon_y + far_depth * (geometry.foreground_y - geometry.horizon_y);
  const left = [
    `${number_for_svg(center - near_outer)},${number_for_svg(near_y)}`,
    `${number_for_svg(center - near_lane)},${number_for_svg(near_y)}`,
    `${number_for_svg(center - far_lane)},${number_for_svg(far_y)}`,
    `${number_for_svg(center - far_outer)},${number_for_svg(far_y)}`,
  ].join(" ");
  const right = [
    `${number_for_svg(center + near_lane)},${number_for_svg(near_y)}`,
    `${number_for_svg(center + near_outer)},${number_for_svg(near_y)}`,
    `${number_for_svg(center + far_outer)},${number_for_svg(far_y)}`,
    `${number_for_svg(center + far_lane)},${number_for_svg(far_y)}`,
  ].join(" ");
  return {
    left,
    right,
    gutter_pixel_width_at_deck: screen_distance(gutter_width, far_depth),
  };
}

function render_projection_svg(commands, width, height, label, gutter_overlay) {
  const fragments = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#182438"/>`,
  ];
  for (const command of commands) {
    if (command.kind === "lane") {
      const geometry = command.geometry;
      const center = width / 2;
      const points = [
        `${number_for_svg(center - geometry.top_half_width)},${number_for_svg(geometry.horizon_y)}`,
        `${number_for_svg(center + geometry.top_half_width)},${number_for_svg(geometry.horizon_y)}`,
        `${number_for_svg(center + geometry.bottom_half_width)},${height}`,
        `${number_for_svg(center - geometry.bottom_half_width)},${height}`,
      ].join(" ");
      fragments.push(
        `<polygon points="${points}" fill="#c88e43" stroke="#ead69c" stroke-width="4"/>`,
      );
      fragments.push(`<polygon points="${gutter_overlay.left}" fill="#263850"/>`);
      fragments.push(`<polygon points="${gutter_overlay.right}" fill="#263850"/>`);
      continue;
    }
    if (command.kind === "standing_pin") {
      fragments.push(
        `<rect x="${number_for_svg(command.x - command.width / 2)}" y="${number_for_svg(command.y - command.height)}" width="${number_for_svg(command.width)}" height="${number_for_svg(command.height)}" rx="${number_for_svg(command.width / 2)}" fill="#f5f0df" stroke="#b32d38"/>`,
      );
    }
  }
  fragments.push(`<text x="32" y="58" fill="#ffffff" font-size="28">${label}</text>`);
  fragments.push("</svg>");
  return fragments.join("");
}

async function capture_projection_probes(browser, output_directory) {
  const states = [];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    for (const pin_count of [10, 105, 990]) {
      console.log(`==> Capturing production projection probe for ${pin_count} pins`);
      const snapshot = create_foot_rack_snapshot(pin_count);
      const camera = create_foot_camera(pin_count);
      const projection = create_camera_projection(camera);
      const geometry = create_lane_geometry(viewport.width, viewport.height, projection);
      const commands = create_game_draw_commands(
        snapshot,
        snapshot,
        pin_count,
        1,
        viewport.width,
        viewport.height,
        undefined,
        camera,
      );
      const svg_path = join(output_directory, `projection_probe_${pin_count}.svg`);
      const png_path = join(output_directory, `projection_probe_${pin_count}.png`);
      const gutter_overlay = create_gutter_overlay(
        pin_count,
        camera,
        projection,
        geometry,
        viewport.width,
      );
      const svg = render_projection_svg(
        commands,
        viewport.width,
        viewport.height,
        `Projection probe: ${pin_count} pins at foot-based rack geometry`,
        gutter_overlay,
      );
      await writeFile(svg_path, svg);
      await page.setContent(svg);
      await page.screenshot({ path: png_path });
      states.push({
        evidence_kind: "projection_probe",
        pin_count,
        projection,
        lane_geometry: geometry,
        fixed_gutter_width_feet: gutter_width,
        gutter_pixel_width_at_deck: gutter_overlay.gutter_pixel_width_at_deck,
        standing_pin_commands: commands.filter((command) => command.kind === "standing_pin").length,
        svg_path,
        ...(await png_metadata(png_path)),
      });
    }
  } finally {
    await context.close();
  }
  return states;
}

async function measure_frame_window(browser, base_url, output_directory) {
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
    const standing_count = page.locator("[data-standing-count]");
    const initial_text = await standing_count.textContent();
    const initial_match = initial_text?.match(/([\d,]+) of ([\d,]+) pins standing/);
    if (initial_match === null || initial_match === undefined) {
      throw new Error("Could not read the initial visible standing-pin count for the frame probe.");
    }
    const initial_standing_count = Number(initial_match[1].replaceAll(",", ""));
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    try {
      await page.waitForFunction(
        (starting_count) => {
          const text = document.querySelector("[data-standing-count]")?.textContent ?? "";
          const match = text.match(/([\d,]+) of ([\d,]+) pins standing/);
          return match !== null && Number(match[1].replaceAll(",", "")) < starting_count;
        },
        initial_standing_count,
        { timeout: 20_000 },
      );
    } catch (_error) {
      await page.screenshot({ path: screenshot_path });
      const result = {
        viewport,
        pin_count: 990,
        contact_proxy: "unavailable",
        blocker:
          "The visible [data-standing-count] did not decrease from the initial 990 pins within 20 seconds after a real Space launch.",
        screenshot: await png_metadata(screenshot_path),
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
    await page.screenshot({ path: screenshot_path });
    const result = {
      viewport,
      pin_count: 990,
      contact_proxy: "first visible [data-standing-count] decrease after launch",
      ...metrics,
      screenshot: await png_metadata(screenshot_path),
    };
    await writeFile(json_path, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await context.close();
  }
}

async function capture_milestone(browser, base_url) {
  const output_directory = "artifacts/milestone";
  await mkdir(output_directory, { recursive: true });
  const projection_probes = await capture_projection_probes(browser, output_directory);
  const live_app_states = await capture_milestone_decks(browser, base_url, output_directory);
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
  const reduced_motion = await capture_reduced_motion_evidence(browser, base_url, output_directory);
  const frame_window = await measure_frame_window(browser, base_url, output_directory);
  const report = {
    viewport,
    projection_probes,
    live_app_states,
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
        report.documentation = await capture_documentation(browser, options.base_url);
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
