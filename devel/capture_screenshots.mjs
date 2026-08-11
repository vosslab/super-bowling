/* global CanvasRenderingContext2D, document, HTMLCanvasElement, requestAnimationFrame, window */
// capture_screenshots.mjs - browser interactions for durable captures and M1 evidence.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, normalize } from "node:path";

import { chromium } from "playwright";

import {
  create_camera_projection,
  create_game_draw_commands,
  create_lane_geometry,
} from "../src/render/game_renderer.ts";
import { create_camera_state } from "../src/render/camera.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  write_snapshot_ball,
  write_snapshot_pin,
} from "../src/simulation/protocol.ts";
import {
  foul_to_head_pin,
  gutter_width,
  pin_spacing,
  rack_row_count,
  row_spacing,
} from "../src/config/lane.ts";
import { create_rack } from "../src/simulation/rack.ts";

const viewport = { width: 1600, height: 1000 };
const documentation_roll_timeout_ms = 30_000;
const valid_modes = new Set(["documentation", "milestone", "all"]);
const live_source_closure_seeds = ["src/main.ts", "src/simulation/worker.ts"];
const required_live_source_closure_paths = [
  "src/simulation/hook.ts",
  "src/game/scoring.ts",
  "src/audio/audio.ts",
];
const explicit_live_assets = [
  { path: "src/style.css", role: "live canvas and HUD page layout" },
  { path: "src/assets/pin_upright.svg", role: "upright pin visual asset" },
  { path: "src/assets/pin_fallen.svg", role: "fallen pin visual asset" },
  { path: "src/assets/ball_surface.svg", role: "ball surface visual asset" },
];

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
    sha256: createHash("sha256").update(header).digest("hex"),
  };
  if (metadata.width !== viewport.width || metadata.height !== viewport.height) {
    throw new Error(
      `Capture has unexpected dimensions at ${path}: expected ${viewport.width}x${viewport.height}, got ${metadata.width}x${metadata.height}.`,
    );
  }
  return metadata;
}

async function live_canvas_geometry(page) {
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.game_canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return undefined;
    const bounds = canvas.getBoundingClientRect();
    return {
      page_viewport: { width: window.innerWidth, height: window.innerHeight },
      device_pixel_ratio: window.devicePixelRatio,
      client_dimensions: { width: canvas.clientWidth, height: canvas.clientHeight },
      backing_store_dimensions: { width: canvas.width, height: canvas.height },
      bounding_client_rect: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
      },
      page_position: { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY },
    };
  });
  if (geometry === undefined) throw new Error("Live capture requires a .game_canvas element.");
  if (
    geometry.page_viewport.width !== viewport.width ||
    geometry.page_viewport.height !== viewport.height
  ) {
    throw new Error(
      `Live capture has unexpected page viewport: ${geometry.page_viewport.width}x${geometry.page_viewport.height}.`,
    );
  }
  return geometry;
}

async function install_canvas_ellipse_probe(context) {
  // The application intentionally exposes a ball center but not its dimensions.
  // This capture-only probe records Canvas 2D ellipse arguments before the app
  // loads, so evidence can prove that the renderer painted a non-clipped ball.
  await context.addInitScript(() => {
    const probe_key = "__super_bowling_capture_ellipse_calls";
    if (Array.isArray(globalThis[probe_key])) return;
    const calls = [];
    globalThis[probe_key] = calls;
    const original_ellipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function capture_ellipse(
      x,
      y,
      radius_x,
      radius_y,
      rotation,
      start_angle,
      end_angle,
      counterclockwise,
    ) {
      calls.push({ x, y, radius_x, radius_y, captured_at_ms: performance.now() });
      if (calls.length > 2_000) calls.splice(0, calls.length - 2_000);
      return original_ellipse.call(
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

async function freeze_mid_roll_canvas(page) {
  const rendered_ball = await page.evaluate(() => {
    const root = document.querySelector("main.play_shell");
    const canvas = document.querySelector("canvas.game_canvas");
    const calls = globalThis.__super_bowling_capture_ellipse_calls;
    if (root === null || !(canvas instanceof HTMLCanvasElement) || !Array.isArray(calls)) {
      return undefined;
    }
    const center_x = Number(root.getAttribute("data-drawn-ball-screen-x"));
    const center_y = Number(root.getAttribute("data-drawn-ball-screen-y"));
    if (!Number.isFinite(center_x) || !Number.isFinite(center_y)) return undefined;
    const tolerance = 1;
    const candidate = calls
      .filter(
        (call) =>
          Number.isFinite(call.x) &&
          Number.isFinite(call.y) &&
          Number.isFinite(call.radius_x) &&
          Number.isFinite(call.radius_y) &&
          Math.abs(call.x - center_x) <= tolerance &&
          Math.abs(call.y - center_y) <= tolerance &&
          call.radius_x > 0 &&
          call.radius_y > 0,
      )
      .sort(
        (left, right) =>
          right.radius_x * right.radius_y - left.radius_x * left.radius_y ||
          right.captured_at_ms - left.captured_at_ms,
      )[0];
    if (candidate === undefined) return undefined;
    const bounds = {
      left: candidate.x - candidate.radius_x,
      top: candidate.y - candidate.radius_y,
      right: candidate.x + candidate.radius_x,
      bottom: candidate.y + candidate.radius_y,
    };
    const canvas_bounds = { left: 0, top: 0, right: canvas.width, bottom: canvas.height };
    const fully_contained =
      bounds.left >= canvas_bounds.left &&
      bounds.top >= canvas_bounds.top &&
      bounds.right <= canvas_bounds.right &&
      bounds.bottom <= canvas_bounds.bottom;
    if (!fully_contained) return { clipped: true, bounds, canvas_bounds };

    const rect = canvas.getBoundingClientRect();
    const overlay = document.createElement("canvas");
    const token = `frozen-mid-roll-${performance.now().toFixed(3)}-${calls.length}`;
    overlay.dataset.captureToken = token;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    Object.assign(overlay.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    const overlay_context = overlay.getContext("2d");
    if (overlay_context === null) return undefined;
    overlay_context.drawImage(canvas, 0, 0);
    const original_visibility = canvas.style.visibility;
    canvas.style.visibility = "hidden";
    document.body.append(overlay);
    return {
      token,
      frozen_at_ms: performance.now(),
      center_canvas: { x: center_x, y: center_y },
      radius_canvas: { x: candidate.radius_x, y: candidate.radius_y },
      bounds_canvas: bounds,
      canvas_bounds,
      bounds_page: {
        left: rect.left + (bounds.left / canvas.width) * rect.width,
        top: rect.top + (bounds.top / canvas.height) * rect.height,
        right: rect.left + (bounds.right / canvas.width) * rect.width,
        bottom: rect.top + (bounds.bottom / canvas.height) * rect.height,
      },
      fully_contained,
      canvas: {
        page_viewport: { width: window.innerWidth, height: window.innerHeight },
        backing_store_dimensions: { width: canvas.width, height: canvas.height },
        bounding_client_rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      },
      original_visibility,
    };
  });
  if (rendered_ball === undefined) {
    throw new Error("Mid-roll capture could not freeze a matching rendered ball ellipse.");
  }
  if (rendered_ball.clipped === true) {
    throw new Error(
      `Mid-roll rendered ball is clipped by the canvas: ${JSON.stringify(rendered_ball)}.`,
    );
  }
  return {
    ...rendered_ball,
    evidence_method:
      "one page.evaluate matched the exposed ball center, copied that live canvas bitmap to an overlay, and recorded its ellipse bounds before the screenshot",
  };
}

async function remove_frozen_mid_roll_canvas(page, frozen_canvas) {
  await page.evaluate(({ token, original_visibility }) => {
    const overlay = document.querySelector(`canvas[data-capture-token="${token}"]`);
    const canvas = document.querySelector("canvas.game_canvas");
    if (canvas instanceof HTMLCanvasElement) canvas.style.visibility = original_visibility;
    overlay?.remove();
  }, frozen_canvas);
}

async function capture_live_screenshot(
  page,
  path,
  state,
  expected_pin_count,
  known_canvas_geometry = undefined,
) {
  if (typeof state !== "string" || state.length === 0) {
    throw new Error("Live capture requires an explicit state.");
  }
  if (!Number.isInteger(expected_pin_count) || expected_pin_count <= 0) {
    throw new Error("Live capture requires a positive expected pin count.");
  }
  const captured_at = new Date().toISOString();
  const game_canvas = known_canvas_geometry ?? (await live_canvas_geometry(page));
  await page.screenshot({ path });
  const png = await png_metadata(path);
  return {
    evidence_source: "live_browser",
    captured_at,
    state,
    expected_pin_count,
    game_canvas,
    ...png,
  };
}

/**
 * Identifies the immutable, complete rack used by the production framing
 * solver. This deliberately derives from create_rack rather than from a live
 * survivor snapshot, so result-state captures remain comparable to aiming.
 */
function complete_rack_framing_source(pin_count) {
  const rack = create_rack(pin_count);
  const rows = [...new Set(rack.slots.map((slot) => slot.row_index))]
    .sort((first, second) => first - second)
    .map((row_index) => {
      const slots = rack.slots.filter((slot) => slot.row_index === row_index);
      const first = slots[0];
      if (first === undefined) throw new Error(`Complete rack ${pin_count} has an empty row.`);
      return {
        row_index,
        y: first.y,
        pin_count: slots.length,
      };
    });
  const rear_row = rows.at(-1);
  if (rear_row === undefined) throw new Error(`Complete rack ${pin_count} has no rear row.`);
  return {
    derivation: "create_rack(pin_count): complete immutable rack, never a live survivor snapshot",
    pin_count,
    slot_count: rack.slots.length,
    bounds: rack.bounds,
    rows,
    rear_row,
  };
}

/**
 * Records the exact production projection used for a live canvas. Its backing-store
 * dimensions and full-rack source make the capture straightforward to inspect.
 */
function camera_projection_diagnostics(camera, game_canvas) {
  const { width, height } = game_canvas.backing_store_dimensions;
  const projection = create_camera_projection(camera, width, height);
  return {
    canvas_geometry: game_canvas,
    full_rack_framing_source: complete_rack_framing_source(camera.rack_bounds.pin_count),
    camera: {
      ...projection.camera,
      // These aliases make the report self-describing for visual review.
      target_rear_row_reveal_fraction: projection.camera.target_reveal_fraction,
      achieved_rear_row_reveal_fraction: projection.camera.achieved_median_reveal_fraction,
      measured_local_reveal_by_row_pair: projection.camera.row_reveal_fractions,
      reveal_residual: projection.camera.reveal_residual_fraction,
      solved_depth_exaggeration: projection.camera.depth_exaggeration,
      solved_horizon_fraction: projection.camera.horizon_fraction,
      rack_top_fraction: projection.camera.achieved_rack_top_fraction,
      aiming_ball_bottom_fraction: projection.camera.achieved_aiming_ball_bottom_fraction,
      launch_platform_screen_fraction: projection.camera.achieved_launch_platform_screen_fraction,
      maximum_launch_platform_screen_fraction:
        projection.camera.maximum_launch_platform_screen_fraction,
      occupied_span_fraction: projection.camera.occupied_vertical_span_fraction,
      unused_vertical_bands: {
        top_fraction: projection.camera.unused_top_fraction,
        bottom_fraction: projection.camera.unused_bottom_fraction,
      },
      clamp: {
        calibration: projection.camera.calibration_clamped,
        calibration_reason: projection.camera.calibration_reason,
        framing: projection.camera.framing_clamped,
        framing_reason: projection.camera.framing_reason,
      },
    },
  };
}

async function camera_source_provenance() {
  const pending_paths = [...live_source_closure_seeds];
  const discovered_paths = new Set();
  const imported_by = new Map();
  const supported_extensions = [".ts", ".tsx", ".js", ".mjs"];
  while (pending_paths.length > 0) {
    const path = pending_paths.pop();
    if (path === undefined || discovered_paths.has(path)) continue;
    const contents = await readFile(path, "utf8");
    discovered_paths.add(path);
    const import_pattern = /(?:from\s*|import\s*)["'](\.[^"']+)["']/g;
    for (const match of contents.matchAll(import_pattern)) {
      const specifier = match[1];
      const base_path = normalize(join(dirname(path), specifier));
      const candidates =
        extname(base_path) === ""
          ? [
              ...supported_extensions.map((extension) => `${base_path}${extension}`),
              ...supported_extensions.map((extension) => join(base_path, `index${extension}`)),
            ]
          : [base_path];
      let resolved_path;
      for (const candidate of candidates) {
        try {
          await stat(candidate);
          resolved_path = candidate;
          break;
        } catch (_error) {
          // Try the remaining valid repository-local module spellings.
        }
      }
      if (resolved_path === undefined) {
        throw new Error(`Unresolved repository-local import ${specifier} from ${path}.`);
      }
      if (!resolved_path.startsWith("src/")) {
        throw new Error(
          `Local import ${specifier} from ${path} resolved outside src/: ${resolved_path}.`,
        );
      }
      const parents = imported_by.get(resolved_path) ?? new Set();
      parents.add(path);
      imported_by.set(resolved_path, parents);
      pending_paths.push(resolved_path);
    }
  }
  const missing_required_paths = required_live_source_closure_paths.filter(
    (path) => !discovered_paths.has(path),
  );
  if (missing_required_paths.length > 0) {
    throw new Error(
      `Generated live source closure missed required transitive paths: ${missing_required_paths.join(", ")}.`,
    );
  }
  const generated_sources = [...discovered_paths].sort().map((path) => ({
    path,
    role: live_source_closure_seeds.includes(path)
      ? "recursive local-import closure seed"
      : "recursive repository-local import",
    imported_by: [...(imported_by.get(path) ?? [])].sort(),
  }));
  const provenance_scope_files = [...generated_sources, ...explicit_live_assets];
  const files = await Promise.all(
    provenance_scope_files.map(async ({ path, role, imported_by: parents }) => {
      const contents = await readFile(path);
      return {
        path,
        role,
        ...(parents === undefined ? {} : { imported_by: parents }),
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    }),
  );
  const manifest = JSON.stringify(files);
  return {
    provenance_scope:
      "Generated recursive closure of every resolvable repository-local import from the browser entry and production simulation worker seeds, plus explicit live styles and canvas assets. Any unresolved repository-local import fails capture before artifacts are produced.",
    closure_seeds: live_source_closure_seeds,
    explicit_live_assets,
    provenance_scope_files,
    captured_before_live_artifacts_at: new Date().toISOString(),
    files,
    manifest_sha256: createHash("sha256").update(manifest).digest("hex"),
  };
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

async function wait_for_best_frame_earned(page) {
  await page.waitForFunction(() => {
    const play_shell = document.querySelector("main.play_shell");
    const toast = document.querySelector(".earned_moment_toast[role='status']");
    return (
      play_shell?.getAttribute("data-earned-moment") === "best_frame" &&
      toast !== null &&
      toast.textContent?.includes("BEST FRAME") === true &&
      toast.textContent.includes("New best frame")
    );
  });
  const toast = page.locator(".earned_moment_toast[role='status']");
  const visible_after_entrance = await toast.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
  });
  if (!visible_after_entrance)
    throw new Error("BEST FRAME toast was not visible after its entrance.");
}

async function capture_documentation(browser, base_url) {
  console.log("==> Capturing README thousand-pin BEST FRAME view");
  const deck_path = "docs/screenshots/thousand_pin_deck.png";
  {
    // This is the fresh-player production path: two actual default 990-pin
    // rolls establish the first finalized frame and its BEST FRAME moment.
    // The per-operation allowance reflects the dense live simulation while
    // the front-door capture deadline still bounds the complete document run.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(documentation_roll_timeout_ms);
    try {
      await start_aiming_state(
        page,
        base_url,
        "1,000 mode - 990 pins",
        "Start 1,000 mode - 990 pins for 1 player",
        990,
      );
      await page.keyboard.press("Space");
      console.log("==> Waiting for first 990-pin roll result");
      await page.waitForFunction(
        () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "result",
        { timeout: documentation_roll_timeout_ms },
      );
      console.log("==> Waiting for second 990-pin roll aiming readiness");
      await page.waitForFunction(
        () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "aiming",
        { timeout: documentation_roll_timeout_ms },
      );
      await page.keyboard.press("Space");
      console.log("==> Waiting for 990-pin BEST FRAME earned moment");
      await wait_for_best_frame_earned(page);
      await capture_live_screenshot(page, deck_path, "best_frame_earned", 990);
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

  return Promise.all([png_metadata(deck_path), png_metadata(handoff_path)]).then(
    ([deck, handoff]) => [deck, handoff],
  );
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
          create_camera_state(fixture.rack, false),
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
  return create_camera_state(pin_count, false);
}

function number_for_svg(value) {
  return Number(value.toFixed(2));
}

function point_for_svg(point) {
  return `${number_for_svg(point.x)},${number_for_svg(point.y)}`;
}

function create_gutter_overlay(geometry) {
  const [lane_near_left, lane_near_right] = geometry.lane_near;
  const [lane_far_left, lane_far_right] = geometry.lane_far;
  const [rail_near_left, rail_near_right] = geometry.rail_near;
  const [rail_far_left, rail_far_right] = geometry.rail_far;
  const left = [
    point_for_svg(rail_near_left),
    point_for_svg(lane_near_left),
    point_for_svg(lane_far_left),
    point_for_svg(rail_far_left),
  ].join(" ");
  const right = [
    point_for_svg(lane_near_right),
    point_for_svg(rail_near_right),
    point_for_svg(rail_far_right),
    point_for_svg(lane_far_right),
  ].join(" ");
  return {
    left,
    right,
    gutter_pixel_width_at_deck: Math.hypot(
      rail_far_left.x - lane_far_left.x,
      rail_far_left.y - lane_far_left.y,
    ),
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
      const points = [
        point_for_svg(geometry.lane_near[0]),
        point_for_svg(geometry.lane_near[1]),
        point_for_svg(geometry.lane_far[1]),
        point_for_svg(geometry.lane_far[0]),
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
        `<rect x="${number_for_svg(command.x - command.width / 2)}" y="${number_for_svg(command.y - command.height / 2)}" width="${number_for_svg(command.width)}" height="${number_for_svg(command.height)}" rx="${number_for_svg(command.width / 2)}" fill="#f5f0df" stroke="#b32d38"/>`,
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
      const gutter_overlay = create_gutter_overlay(geometry);
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
        evidence_kind: "synthetic_projection_probe",
        evidence_source: "synthetic_renderer_input_not_live_app_canvas",
        viewport,
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
