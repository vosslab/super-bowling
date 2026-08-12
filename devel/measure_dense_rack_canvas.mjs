/*
 * M11 production-Canvas dense-deck baseline.  This intentionally uses a
 * disposable browser harness bundled from create_game_renderer, not the
 * synthetic benchmark renderer.  Run after `npm run build`:
 *
 *   node devel/measure_dense_rack_canvas.mjs
 *
 * Frames and machine-readable traces are written under ignored artifacts/m11.
 * The companion tracked report contains only durable summaries and methods.
 */
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { chromium } from "playwright";

const exec_file = promisify(execFile);
const artifact_directory = resolve("artifacts/m11");
const candidate_artifact_directory = resolve("artifacts/m12");
const dist_directory = resolve("dist");
const harness_source = "devel/m11_dense_rack_harness.ts";
const harness_output = join(artifact_directory, "m11_dense_rack_harness.js");
const counts = [105, 496, 990];
const repetitions = 8;
const smoothing_qualities = ["low", "medium", "high"];
const sampled_width = 200;
const sampled_height = 125;

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return values.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, fraction) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * fraction)];
}

function distribution(values) {
  return {
    count: values.length,
    median: median(values),
    iqr: (quantile(values, 0.75) ?? 0) - (quantile(values, 0.25) ?? 0),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

function mean_absolute_delta(first, second) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1)
    total += Math.abs(first[index] - second[index]);
  return total / first.length;
}

function sample_luma(luma, x, y) {
  const clamped_x = Math.max(0, Math.min(sampled_width - 1, Math.round(x)));
  const clamped_y = Math.max(0, Math.min(sampled_height - 1, Math.round(y)));
  return luma[clamped_y * sampled_width + clamped_x] ?? 0;
}

function registration_error(source, target, scale, translate_x, translate_y, stride = 4) {
  const center_x = (sampled_width - 1) / 2;
  const center_y = (sampled_height - 1) / 2;
  let total = 0;
  let count = 0;
  // This deck-inclusive region excludes the flat top sky but intentionally
  // retains vertical pins, so the residual is reported as a conservative
  // proxy rather than a claim that all camera motion is removed.
  for (let y = 20; y < 116; y += stride) {
    for (let x = 12; x < 188; x += stride) {
      const source_x = (x - center_x - translate_x) / scale + center_x;
      const source_y = (y - center_y - translate_y) / scale + center_y;
      total += Math.abs(
        sample_luma(source, source_x, source_y) - (target[y * sampled_width + x] ?? 0),
      );
      count += 1;
    }
  }
  return total / count;
}

function register_similarity(source, target) {
  let best = { error: Number.POSITIVE_INFINITY, scale: 1, translate_x: 0, translate_y: 0 };
  const consider = (scale, translate_x, translate_y, stride) => {
    const error = registration_error(source, target, scale, translate_x, translate_y, stride);
    if (error < best.error) best = { error, scale, translate_x, translate_y };
  };
  for (const scale of [0.9, 0.95, 1, 1.05, 1.1])
    for (let translate_y = -12; translate_y <= 12; translate_y += 4)
      for (let translate_x = -12; translate_x <= 12; translate_x += 4)
        consider(scale, translate_x, translate_y, 4);
  const coarse_best = { ...best };
  for (let scale = coarse_best.scale - 0.02; scale <= coarse_best.scale + 0.0201; scale += 0.01)
    for (
      let translate_y = coarse_best.translate_y - 3;
      translate_y <= coarse_best.translate_y + 3;
      translate_y += 1
    )
      for (
        let translate_x = coarse_best.translate_x - 3;
        translate_x <= coarse_best.translate_x + 3;
        translate_x += 1
      )
        consider(scale, translate_x, translate_y, 2);
  return best;
}

function dominant_horizontal_frequency(first, second) {
  let strongest = { cycles_per_sample: 0, power: Number.NEGATIVE_INFINITY };
  // A bounded row spectrum of the luma difference: diagnostic texture
  // evidence only, not an image-quality score or a pass/fail threshold.
  for (let frequency = 1; frequency <= 50; frequency += 1) {
    let power = 0;
    for (let y = 30; y < 116; y += 3) {
      let real = 0;
      let imaginary = 0;
      for (let x = 12; x < 188; x += 1) {
        const delta = (first[y * sampled_width + x] ?? 0) - (second[y * sampled_width + x] ?? 0);
        const angle = (2 * Math.PI * frequency * x) / sampled_width;
        real += delta * Math.cos(angle);
        imaginary += delta * Math.sin(angle);
      }
      power += real ** 2 + imaginary ** 2;
    }
    if (power > strongest.power)
      strongest = { cycles_per_sample: frequency / sampled_width, power };
  }
  return strongest.cycles_per_sample;
}

function motion_summary(run) {
  const pairs = run.frames.slice(1).map((frame, index) => {
    const previous = run.frames[index];
    const raw_luma_delta = mean_absolute_delta(previous.luma, frame.luma);
    const registration = register_similarity(previous.luma, frame.luma);
    return {
      from_trace_index: previous.trace_index,
      to_trace_index: frame.trace_index,
      raw_luma_delta,
      registered_luma_residual: registration.error,
      dominant_horizontal_delta_frequency_cycles_per_sample: dominant_horizontal_frequency(
        previous.luma,
        frame.luma,
      ),
      similarity_registration: {
        scale: registration.scale,
        translate_x_sample_px: registration.translate_x,
        translate_y_sample_px: registration.translate_y,
      },
    };
  });
  const noise_luma_delta = mean_absolute_delta(
    run.identical_camera_noise_luma[0],
    run.identical_camera_noise_luma[1],
  );
  return {
    trace: run.trace,
    consecutive_motion_pairs: pairs,
    raw_luma_delta: distribution(pairs.map((pair) => pair.raw_luma_delta)),
    registered_luma_residual: distribution(pairs.map((pair) => pair.registered_luma_residual)),
    dominant_horizontal_delta_frequency_cycles_per_sample: pairs.map(
      (pair) => pair.dominant_horizontal_delta_frequency_cycles_per_sample,
    ),
    repeated_identical_camera_luma_delta: noise_luma_delta,
    spatial_frequency_energy: run.frames.map((frame) => ({
      trace_index: frame.trace_index,
      energy: frame.high_frequency_energy,
    })),
  };
}

function timing_summary(readings) {
  const draw = readings.map((reading) => reading.draw_ms);
  const combined = readings.map((reading) => reading.draw_and_readback_ms);
  const blank = readings.map((reading) => reading.blank_readback_ms);
  const capture_inclusive = readings.map(
    (reading) => reading.draw_and_readback_ms - reading.blank_readback_ms,
  );
  const paired = [];
  for (const trace_index of [...new Set(readings.map((reading) => reading.trace_index))]) {
    const first_block = readings.filter(
      (reading) => reading.block === "a" && reading.trace_index === trace_index,
    );
    const second_block = readings.filter(
      (reading) => reading.block === "b" && reading.trace_index === trace_index,
    );
    for (let index = 0; index < Math.min(first_block.length, second_block.length); index += 1) {
      const first = first_block[index];
      const second = second_block[index];
      if (first === undefined || second === undefined) continue;
      paired.push({
        draw_ratio: second.draw_ms / Math.max(first.draw_ms, 0.001),
        combined_ratio: second.draw_and_readback_ms / Math.max(first.draw_and_readback_ms, 0.001),
      });
    }
  }
  return {
    renderer_draw_submission_ms: distribution(draw),
    renderer_draw_plus_get_image_data_ms: distribution(combined),
    blank_get_image_data_ms: distribution(blank),
    draw_plus_readback_minus_same_run_blank_readback_ms: distribution(capture_inclusive),
    paired_identical_block_ratio: {
      draw: distribution(paired.map((pair) => pair.draw_ratio)),
      draw_plus_readback: distribution(paired.map((pair) => pair.combined_ratio)),
    },
  };
}

function smoothing_profile_summary(profile) {
  const readings = profile.readings;
  return {
    // Full wrapper values retain production create_game_renderer's normal
    // command construction and dispatch. The direct path stays available only
    // for phase attribution and must not be substituted for wrapper cost.
    full_renderer_wrapper: {
      draw_submission_ms: distribution(readings.map((reading) => reading.default_renderer_draw_ms)),
      draw_plus_readback_minus_same_run_blank_readback_ms: distribution(
        readings.map(
          (reading) =>
            reading.default_renderer_draw_and_readback_ms -
            reading.default_renderer_blank_readback_ms,
        ),
      ),
    },
    direct_phase_diagnostic: {
      command_build_ms: distribution(readings.map((reading) => reading.command_build_ms)),
      pin_bodies_and_overlays_ms: distribution(
        readings.map((reading) => reading.pin_bodies_and_overlays_ms),
      ),
      draw_plus_readback_minus_same_run_blank_readback_ms: distribution(
        readings.map((reading) => reading.draw_and_readback_ms - reading.blank_readback_ms),
      ),
    },
  };
}

function content_type(path) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    }[extname(path)] ?? "application/octet-stream"
  );
}

async function create_server() {
  const server = createServer(async (request, response) => {
    const request_path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request_path === "/m11.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end('<!doctype html><meta charset="utf-8"><title>M11 Canvas harness</title>');
      return;
    }
    const target =
      request_path === "/m11_dense_rack_harness.js"
        ? harness_output
        : join(dist_directory, request_path === "/" ? "index.html" : request_path);
    const normalized = normalize(target);
    if (!normalized.startsWith(dist_directory) && normalized !== harness_output) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": content_type(normalized) });
      response.end(await readFile(normalized));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Could not bind M11 server.");
  return { server, base_url: `http://127.0.0.1:${address.port}` };
}

async function main() {
  await stat(join(dist_directory, "index.html"));
  await mkdir(artifact_directory, { recursive: true });
  await mkdir(candidate_artifact_directory, { recursive: true });
  await exec_file("./node_modules/.bin/esbuild", [
    harness_source,
    "--bundle",
    "--format=iife",
    "--global-name=m11DenseHarness",
    `--outfile=${harness_output}`,
  ]);
  const { server, base_url } = await create_server();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(`${base_url}/m11.html`);
    await page.addScriptTag({ url: `${base_url}/m11_dense_rack_harness.js` });
    await page.evaluate(async () => {
      globalThis.__m11_harness = globalThis.m11DenseHarness.create_m11_harness();
      await globalThis.__m11_harness.ready();
    });
    const runs = [];
    for (const pin_count of counts) {
      console.log(`==> M11 ${pin_count} pin production-Canvas baseline`);
      const run = await page.evaluate(
        async ({ requested_pin_count, requested_repetitions }) =>
          globalThis.__m11_harness.run(requested_pin_count, requested_repetitions),
        { requested_pin_count: pin_count, requested_repetitions: repetitions },
      );
      const canvas = page.locator("canvas");
      for (const state of run.trace) {
        await page.evaluate(
          ({ requested_pin_count, trace_index }) =>
            globalThis.__m11_harness.render_trace_frame(requested_pin_count, trace_index),
          { requested_pin_count: pin_count, trace_index: state.index },
        );
        await canvas.screenshot({
          path: join(artifact_directory, `rack_${pin_count}_trace_${state.index}.png`),
        });
      }
      const profiles = Object.fromEntries(
        smoothing_qualities.map((smoothing_quality) => [
          smoothing_quality,
          { readings: [], pin_body_dimensions: [], frames: undefined, asset_bytes: 0 },
        ]),
      );
      // Rotate the candidate first position across warmed, identical trace
      // cycles. This is a relative browser-process comparison, not a FPS test.
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        for (let offset = 0; offset < smoothing_qualities.length; offset += 1) {
          const smoothing_quality =
            smoothing_qualities[(repetition + offset) % smoothing_qualities.length];
          const profile = await page.evaluate(
            ({ requested_pin_count, requested_quality }) =>
              globalThis.__m11_harness.profile(requested_pin_count, 1, requested_quality),
            { requested_pin_count: pin_count, requested_quality: smoothing_quality },
          );
          const aggregate = profiles[smoothing_quality];
          const first_candidate_frame = aggregate.frames === undefined;
          aggregate.readings.push(...profile.readings);
          if (aggregate.frames === undefined) aggregate.frames = profile.frames;
          if (aggregate.pin_body_dimensions.length === 0)
            aggregate.pin_body_dimensions.push(...profile.pin_body_dimensions);
          aggregate.asset_bytes = profile.asset_bytes;
          if (first_candidate_frame)
            await page.locator("canvas").screenshot({
              path: join(
                candidate_artifact_directory,
                `rack_${pin_count}_${smoothing_quality}.png`,
              ),
            });
        }
      }
      runs.push({
        pin_count,
        canvas: run.canvas,
        motion: motion_summary(run),
        timing: timing_summary(run.readings),
        smoothing_profiles: profiles,
        smoothing_profile_summaries: Object.fromEntries(
          Object.entries(profiles).map(([quality, profile]) => [
            quality,
            smoothing_profile_summary(profile),
          ]),
        ),
      });
    }
    const output = {
      evidence_kind: "production_canvas_static_dense_rack_baseline",
      captured_at: new Date().toISOString(),
      methodology: {
        renderer:
          "M11 run uses create_game_renderer; optional direct command/draw phase timings are separately labelled diagnostics",
        snapshot: "complete immutable rack snapshots with zero pin velocity and ball hidden",
        camera_trace: "real monotonic CameraState advance over an accepted local collision zone",
        timing:
          "warmed renderer.draw submission and draw-plus-getImageData; interleaved identical A/B blocks",
        raster_motion:
          "successive low-resolution luma frames; global similarity registration is a conservative normalizer",
      },
      runs,
    };
    await writeFile(
      join(artifact_directory, "dense_rack_baseline.json"),
      `${JSON.stringify(output, null, 2)}\n`,
    );
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await main();
