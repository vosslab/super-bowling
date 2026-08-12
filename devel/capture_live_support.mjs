/* global CanvasRenderingContext2D, document, HTMLCanvasElement, window */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";

import { create_camera_projection } from "../src/render/camera_projection.ts";
import { create_rack } from "../src/simulation/rack.ts";

const closure_seeds = ["src/main.ts", "src/simulation/worker.ts"];
const required_closure_paths = [
  "src/simulation/hook.ts",
  "src/game/scoring.ts",
  "src/audio/audio.ts",
];
const explicit_live_assets = [
  { path: "src/style.css", role: "live canvas and HUD page layout" },
  {
    path: "src/style_setup.css",
    role: "imported global and setup-screen styles for the live page",
  },
  { path: "src/assets/pin_upright.svg", role: "upright pin visual asset" },
  { path: "src/assets/pin_fallen.svg", role: "fallen pin visual asset" },
  { path: "src/assets/ball_surface.svg", role: "ball surface visual asset" },
];

export async function png_metadata(path, viewport) {
  const [header, file_stat] = await Promise.all([readFile(path), stat(path)]);
  if (header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error(`Expected PNG output at ${path}.`);
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

export async function live_canvas_geometry(page, viewport) {
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
  )
    throw new Error(
      `Live capture has unexpected page viewport: ${geometry.page_viewport.width}x${geometry.page_viewport.height}.`,
    );
  return geometry;
}

export async function install_canvas_ellipse_probe(context) {
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

export async function freeze_mid_roll_canvas(page) {
  const rendered_ball = await page.evaluate(() => {
    const root = document.querySelector("main.play_shell");
    const canvas = document.querySelector("canvas.game_canvas");
    const calls = globalThis.__super_bowling_capture_ellipse_calls;
    if (root === null || !(canvas instanceof HTMLCanvasElement) || !Array.isArray(calls))
      return undefined;
    const center_x = Number(root.getAttribute("data-drawn-ball-screen-x"));
    const center_y = Number(root.getAttribute("data-drawn-ball-screen-y"));
    if (!Number.isFinite(center_x) || !Number.isFinite(center_y)) return undefined;
    const candidate = calls
      .filter(
        (call) =>
          Number.isFinite(call.x) &&
          Number.isFinite(call.y) &&
          Number.isFinite(call.radius_x) &&
          Number.isFinite(call.radius_y) &&
          Math.abs(call.x - center_x) <= 1 &&
          Math.abs(call.y - center_y) <= 1 &&
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
  if (rendered_ball === undefined)
    throw new Error("Mid-roll capture could not freeze a matching rendered ball ellipse.");
  if (rendered_ball.clipped === true)
    throw new Error(
      `Mid-roll rendered ball is clipped by the canvas: ${JSON.stringify(rendered_ball)}.`,
    );
  return {
    ...rendered_ball,
    evidence_method:
      "one page.evaluate matched the exposed ball center, copied that live canvas bitmap to an overlay, and recorded its ellipse bounds before the screenshot",
  };
}

export async function remove_frozen_mid_roll_canvas(page, frozen_canvas) {
  await page.evaluate(({ token, original_visibility }) => {
    const overlay = document.querySelector(`canvas[data-capture-token="${token}"]`);
    const canvas = document.querySelector("canvas.game_canvas");
    if (canvas instanceof HTMLCanvasElement) canvas.style.visibility = original_visibility;
    overlay?.remove();
  }, frozen_canvas);
}

export async function capture_live_screenshot(
  page,
  path,
  state,
  expected_pin_count,
  viewport,
  known_canvas_geometry = undefined,
) {
  if (typeof state !== "string" || state.length === 0)
    throw new Error("Live capture requires an explicit state.");
  if (!Number.isInteger(expected_pin_count) || expected_pin_count <= 0)
    throw new Error("Live capture requires a positive expected pin count.");
  const captured_at = new Date().toISOString();
  const game_canvas = known_canvas_geometry ?? (await live_canvas_geometry(page, viewport));
  await page.screenshot({ path });
  return {
    evidence_source: "live_browser",
    captured_at,
    state,
    expected_pin_count,
    game_canvas,
    ...(await png_metadata(path, viewport)),
  };
}

function complete_rack_framing_source(pin_count) {
  const rack = create_rack(pin_count);
  const rows = [...new Set(rack.slots.map((slot) => slot.row_index))]
    .sort((first, second) => first - second)
    .map((row_index) => {
      const slots = rack.slots.filter((slot) => slot.row_index === row_index);
      const first = slots[0];
      if (first === undefined) throw new Error(`Complete rack ${pin_count} has an empty row.`);
      return { row_index, y: first.y, pin_count: slots.length };
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

export function camera_projection_diagnostics(camera, game_canvas) {
  const { width, height } = game_canvas.backing_store_dimensions;
  const projection = create_camera_projection(camera, width, height);
  return {
    canvas_geometry: game_canvas,
    full_rack_framing_source: complete_rack_framing_source(camera.rack_bounds.pin_count),
    camera: {
      ...projection.camera,
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

export async function camera_source_provenance() {
  const pending_paths = [...closure_seeds],
    discovered_paths = new Set(),
    imported_by = new Map();
  const supported_extensions = [".ts", ".tsx", ".js", ".mjs"];
  while (pending_paths.length > 0) {
    const path = pending_paths.pop();
    if (path === undefined || discovered_paths.has(path)) continue;
    const contents = await readFile(path, "utf8");
    discovered_paths.add(path);
    for (const match of contents.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const specifier = match[1],
        base_path = normalize(join(dirname(path), specifier));
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
          /* Try remaining valid local spellings. */
        }
      }
      if (resolved_path === undefined)
        throw new Error(`Unresolved repository-local import ${specifier} from ${path}.`);
      if (!resolved_path.startsWith("src/"))
        throw new Error(
          `Local import ${specifier} from ${path} resolved outside src/: ${resolved_path}.`,
        );
      const parents = imported_by.get(resolved_path) ?? new Set();
      parents.add(path);
      imported_by.set(resolved_path, parents);
      pending_paths.push(resolved_path);
    }
  }
  const missing_required_paths = required_closure_paths.filter(
    (path) => !discovered_paths.has(path),
  );
  if (missing_required_paths.length > 0)
    throw new Error(
      `Generated live source closure missed required transitive paths: ${missing_required_paths.join(", ")}.`,
    );
  const generated_sources = [...discovered_paths].sort().map((path) => ({
    path,
    role: closure_seeds.includes(path)
      ? "recursive local-import closure seed"
      : "recursive repository-local import",
    imported_by: [...(imported_by.get(path) ?? [])].sort(),
  }));
  const provenance_scope_files = [...generated_sources, ...explicit_live_assets];
  const files = await Promise.all(
    provenance_scope_files.map(async ({ path, role, imported_by: parents }) => ({
      path,
      role,
      ...(parents === undefined ? {} : { imported_by: parents }),
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    })),
  );
  const manifest = JSON.stringify(files);
  return {
    provenance_scope:
      "Generated recursive closure of every resolvable repository-local import from the browser entry and production simulation worker seeds, plus explicit live styles and canvas assets. Any unresolved repository-local import fails capture before artifacts are produced.",
    closure_seeds,
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

export async function start_aiming_state(page, base_url, mode_label, start_label, pin_count) {
  console.log(`==> Opening ${pin_count}-pin aiming state`);
  await page.goto(base_url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: mode_label, exact: true }).click();
  await page.getByRole("button", { name: start_label, exact: true }).click();
  return wait_for_aiming(page, pin_count);
}

export async function wait_for_best_frame_earned(page) {
  await page.waitForFunction(() => {
    const play_shell = document.querySelector("main.play_shell"),
      toast = document.querySelector(".earned_moment_toast[role='status']");
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
