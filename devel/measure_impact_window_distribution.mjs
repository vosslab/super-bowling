/*
 * M10 production-worker evidence for deciding whether impact strength alone
 * can identify the local collision cascade worth keeping in the live camera.
 *
 * The probe deliberately talks only to the built worker's public protocol. It
 * does not construct a Rapier world or replay collision callbacks itself.
 * Raw traces are intentionally ignored under artifacts/m10; the companion
 * Markdown report is the durable, self-contained record.
 */
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { chromium } from "playwright";

import { aim_limits, normalize_aim, start_position_from_boards } from "../src/game/aim.ts";

const root = resolve(new URL("..", import.meta.url).pathname);
const output_directory = join(root, "artifacts/m10");
const output_path = join(output_directory, "impact_window_distribution.json");
const port = 8621;
const base_url = `http://127.0.0.1:${port}`;
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function create_shots(pin_count) {
  const limits = aim_limits(pin_count);
  const hook_boards = pin_count === 990 ? -20 : -4;
  const off_center_boards = pin_count === 990 ? 25 : 8;
  const requested = [
    { id: "center", power: limits.maximum_power, start_position: 0, angle: 0, spin: 0 },
    {
      id: "strong_hook",
      power: limits.maximum_power,
      start_position: start_position_from_boards(pin_count, hook_boards),
      angle: 0,
      spin: limits.maximum_spin,
    },
    {
      id: "off_center",
      power: limits.maximum_power,
      start_position: start_position_from_boards(pin_count, off_center_boards),
      angle: 0,
      spin: 0,
    },
  ];
  return requested.map((aim) => ({ id: aim.id, normalized: normalize_aim(pin_count, aim) }));
}

function start_server() {
  const dist = join(root, "dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, base_url).pathname;
      const requested = resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!requested.startsWith(dist)) throw new Error("outside dist");
      const content = await readFile(requested);
      response.writeHead(200, {
        "content-type": mime[extname(requested)] ?? "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  server.listen(port, "127.0.0.1");
  return once(server, "listening").then(() => server);
}

async function run_worker_shot(page, pin_count, shot) {
  return page.evaluate(
    async ({ evaluated_pin_count, evaluated_shot }) =>
      new Promise((resolve_result, reject_result) => {
        const worker = new Worker("./simulation_worker.js", { type: "module" });
        const impacts = [];
        const snapshots = [];
        let launched = false;
        const timeout = window.setTimeout(() => {
          worker.terminate();
          reject_result(new Error(`${evaluated_pin_count}-pin ${evaluated_shot.id} timed out.`));
        }, 75_000);
        worker.addEventListener("message", (event) => {
          const message = event.data;
          if (message.type === "fatal") {
            window.clearTimeout(timeout);
            worker.terminate();
            reject_result(new Error(message.message));
          } else if (message.type === "ready") {
            launched = true;
            worker.postMessage({ type: "launch", ...evaluated_shot.normalized });
          } else if (message.type === "snapshot" && launched) {
            const ball_offset = message.pin_count * 8;
            snapshots.push({
              simulation_time_ms: message.simulation_time_ms,
              ball_in_pit: message.snapshot_data[ball_offset + 5] !== 0,
            });
          } else if (message.type === "impact" && launched) {
            impacts.push({
              simulation_time_ms: message.simulation_time_ms,
              first_ball_pin_impact: message.first_ball_pin_impact,
              ball_pin: message.ball_pin,
              pin_pin: message.pin_pin,
              fallen: message.fallen,
            });
          } else if (message.type === "settled" && launched) {
            window.clearTimeout(timeout);
            worker.terminate();
            resolve_result({ impacts, snapshots, settled: message });
          }
        });
        worker.postMessage({ type: "initialize", pin_count: evaluated_pin_count });
      }),
    { evaluated_pin_count: pin_count, evaluated_shot: shot },
  );
}

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function quantile(values, fraction) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function summarize(values) {
  if (values.length === 0) return { count: 0 };
  return {
    count: values.length,
    minimum: round(Math.min(...values)),
    median: round(quantile(values, 0.5)),
    p90: round(quantile(values, 0.9)),
    maximum: round(Math.max(...values)),
  };
}

function summarize_shot(pin_count, shot, trace) {
  let running_peak = 0;
  const collision_windows = trace.impacts.flatMap((impact) => {
    const paths = ["ball_pin", "pin_pin"]
      .map((path) => ({ path, summary: impact[path] }))
      .filter(({ summary }) => summary !== undefined);
    if (paths.length === 0) return [];
    const window_maximum_impulse = Math.max(...paths.map(({ summary }) => summary.maximum_impulse));
    const window_total_impulse = paths.reduce(
      (total, { summary }) => total + summary.total_impulse,
      0,
    );
    running_peak = Math.max(running_peak, window_maximum_impulse);
    return paths.map(({ path, summary }) => ({
      path,
      simulation_time_ms: impact.simulation_time_ms,
      first_ball_pin_impact: impact.first_ball_pin_impact,
      contact_count: summary.contact_count,
      total_impulse: summary.total_impulse,
      maximum_impulse: summary.maximum_impulse,
      centroid_x: summary.centroid_x,
      centroid_y: summary.centroid_y,
      window_maximum_impulse,
      window_total_impulse,
      running_peak_impulse: running_peak,
      maximum_to_running_peak_ratio: summary.maximum_impulse / running_peak,
      window_to_running_peak_ratio: window_maximum_impulse / running_peak,
    }));
  });
  const first_ball_pin = collision_windows.find((window) => window.path === "ball_pin");
  const first_in_pit = trace.snapshots.find((snapshot) => snapshot.ball_in_pit);
  const last_snapshot = trace.snapshots.at(-1);
  const after_first_contact =
    first_ball_pin === undefined
      ? []
      : collision_windows.filter(
          (window) => window.simulation_time_ms >= first_ball_pin.simulation_time_ms,
        );
  const gaps = after_first_contact
    .slice(1)
    .map(
      (window, index) => window.simulation_time_ms - after_first_contact[index].simulation_time_ms,
    );
  return {
    pin_count,
    shot: shot.id,
    normalized_aim: shot.normalized,
    settled: trace.settled,
    first_ball_pin_time_ms: first_ball_pin?.simulation_time_ms,
    first_ball_pin_centroid: first_ball_pin && {
      x: first_ball_pin.centroid_x,
      y: first_ball_pin.centroid_y,
    },
    first_ball_in_pit_snapshot_ms: first_in_pit?.simulation_time_ms,
    final_snapshot_time_ms: last_snapshot?.simulation_time_ms,
    collision_window_count: collision_windows.length,
    ball_pin_window_count: collision_windows.filter((window) => window.path === "ball_pin").length,
    pin_pin_window_count: collision_windows.filter((window) => window.path === "pin_pin").length,
    impulse_distribution: {
      maximum_impulse: summarize(collision_windows.map((window) => window.maximum_impulse)),
      total_impulse: summarize(collision_windows.map((window) => window.total_impulse)),
      maximum_to_running_peak_ratio: summarize(
        collision_windows.map((window) => window.maximum_to_running_peak_ratio),
      ),
      contact_count: summarize(collision_windows.map((window) => window.contact_count)),
      post_first_contact_gap_ms: summarize(gaps),
    },
    collision_windows,
  };
}

function concise_summary(shots) {
  return shots.map((shot) => {
    const post_contact = shot.collision_windows.filter(
      (window) => window.simulation_time_ms >= shot.first_ball_pin_time_ms,
    );
    const first_second = post_contact.filter(
      (window) => window.simulation_time_ms <= shot.first_ball_pin_time_ms + 1_000,
    );
    const later = post_contact.filter(
      (window) => window.simulation_time_ms > shot.first_ball_pin_time_ms + 1_000,
    );
    return {
      rack: shot.pin_count,
      shot: shot.shot,
      first_contact_ms: shot.first_ball_pin_time_ms,
      collision_windows: shot.collision_window_count,
      first_second_windows: first_second.length,
      later_windows: later.length,
      first_second_ratio: summarize(
        first_second.map((window) => window.maximum_to_running_peak_ratio),
      ),
      later_ratio: summarize(later.map((window) => window.maximum_to_running_peak_ratio)),
      pit_ms: shot.first_ball_in_pit_snapshot_ms,
      settle_snapshot_ms: shot.final_snapshot_time_ms,
    };
  });
}

async function main() {
  try {
    await readFile(join(root, "dist", "simulation_worker.js"));
  } catch {
    throw new Error("Missing dist/simulation_worker.js. Run npm run build before this probe.");
  }
  await mkdir(output_directory, { recursive: true });
  const server = await start_server();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base_url, { waitUntil: "domcontentloaded" });
    const measurements = [];
    for (const pin_count of [10, 105, 496, 990]) {
      for (const shot of create_shots(pin_count)) {
        process.stdout.write(`Measuring ${pin_count}-pin ${shot.id}.\n`);
        measurements.push(
          summarize_shot(pin_count, shot, await run_worker_shot(page, pin_count, shot)),
        );
      }
    }
    const output = {
      purpose:
        "M10 production-worker impact-window distribution. Observations support or reject a held-view selection rule; they are not permanent timing or numerical gates.",
      protocol: ["initialize", "launch", "snapshot", "impact", "settled"],
      provenance:
        "Built dist/simulation_worker.js served over loopback and created in Chromium. The probe receives, but does not recreate, authoritative worker impact summaries and snapshots.",
      interpretation:
        "Each collision_windows record is one path within a worker tick. Its ratio is that path's maximum impulse divided by the largest maximum impulse seen in any collision path up through that tick. The 1,000 ms split in concise_summary is descriptive only, to expose temporal overlap; it is not a proposed camera threshold.",
      measurements,
      concise_summary: concise_summary(measurements),
    };
    await writeFile(output_path, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify(output.concise_summary, null, 2)}\nWrote ${output_path}.\n`,
    );
  } finally {
    await browser.close();
    await new Promise((resolve_close) => server.close(resolve_close));
  }
}

await main();
