/* global Worker, window */
/*
 * M4 production-worker evidence for collision-zone prediction.
 *
 * This intentionally drives the built simulation worker through its public
 * message protocol.  It does not recreate a world or infer a ball curve in
 * this harness: the free path, snapshots, and first ball-pin centroid all
 * arrive from the production worker.
 */
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

import { aim_limits, normalize_aim, start_position_from_boards } from "../src/game/aim.ts";
import { camera_config } from "../src/config/camera.ts";
import { board_width, foul_to_head_pin } from "../src/config/lane.ts";
import { physics_config } from "../src/config/physics.ts";
import { create_rack_bounds } from "../src/render/camera.ts";
import { create_collision_zone } from "../src/render/collision_zone.ts";

const root = resolve(new URL("..", import.meta.url).pathname);
const output_directory = join(root, "artifacts/m4");
const output_path = join(output_directory, "zone_prediction_measurements.json");
const port = 8620;
const base_url = `http://127.0.0.1:${port}`;
const free_path_sample_ms = physics_config.fixed_step_seconds * 6 * 1000;
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function create_shots(pin_count) {
  const limits = aim_limits(pin_count);
  const maximum_power = limits.maximum_power;
  const hook_spin = limits.maximum_spin;
  const hook_boards = pin_count === 990 ? -20 : -4;
  const off_center_boards = pin_count === 990 ? 25 : 8;
  const gutter_start = limits.maximum_start_position;
  const requested = [
    { id: "center", power: maximum_power, start_position: 0, angle: 0, spin: 0 },
    {
      id: "strong_hook",
      power: maximum_power,
      start_position: start_position_from_boards(pin_count, hook_boards),
      angle: 0,
      spin: hook_spin,
    },
    {
      id: "off_center",
      power: maximum_power,
      start_position: start_position_from_boards(pin_count, off_center_boards),
      angle: 0,
      spin: 0,
    },
    {
      id: "gutter",
      power: maximum_power,
      start_position: gutter_start,
      angle: 0,
      spin: hook_spin,
    },
  ];
  return requested.map((aim) => ({
    id: aim.id,
    requested: aim,
    normalized: normalize_aim(pin_count, aim),
  }));
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

function interpolate_free_path(points, simulation_time_ms) {
  const position = simulation_time_ms / free_path_sample_ms;
  const lower_index = Math.max(0, Math.min(Math.floor(position), points.length - 1));
  const upper_index = Math.min(lower_index + 1, points.length - 1);
  const fraction = Math.min(1, Math.max(0, position - lower_index));
  const lower = points[lower_index];
  const upper = points[upper_index];
  return {
    x: lower.x + (upper.x - lower.x) * fraction,
    y: lower.y + (upper.y - lower.y) * fraction,
  };
}

function select_commit_snapshot(rows, rack_front_y) {
  const commit_y = rack_front_y * camera_config.shot_focus_start_progress;
  return rows.find((row) => row.ball.y >= commit_y) ?? rows.at(-1);
}

function find_snapshot_at_or_before(snapshots, simulation_time_ms) {
  return snapshots.reduce(
    (selected, sample) => (sample.simulation_time_ms <= simulation_time_ms ? sample : selected),
    snapshots[0],
  );
}

function summarize_shot(pin_count, shot, worker_result) {
  const bounds = create_rack_bounds(pin_count);
  const contact = worker_result.first_ball_pin_impact;
  const snapshots = worker_result.snapshots.filter((sample) => sample.ball.y >= 0);
  const board = board_width(pin_count);
  const first_contact_snapshot =
    contact === undefined
      ? undefined
      : find_snapshot_at_or_before(snapshots, contact.simulation_time_ms);
  const snapshot_rows = snapshots.map((sample) => {
    const zone = create_collision_zone({
      rack_bounds: bounds,
      committed_path: Float32Array.from(
        worker_result.free_path.flatMap((point) => [point.x, point.y]),
      ),
      ball: sample.ball,
    });
    const free_ball = interpolate_free_path(worker_result.free_path, sample.simulation_time_ms);
    const error_x =
      contact === undefined ? undefined : contact.centroid_x - (zone.left + zone.right) / 2;
    const error_y =
      contact === undefined ? undefined : contact.centroid_y - (zone.front + zone.back) / 2;
    const contains_contact =
      contact === undefined
        ? undefined
        : contact.centroid_x >= zone.left &&
          contact.centroid_x <= zone.right &&
          contact.centroid_y >= zone.front &&
          contact.centroid_y <= zone.back;
    return {
      simulation_time_ms: sample.simulation_time_ms,
      ball: sample.ball,
      free_ball,
      free_live_divergence_feet: Math.hypot(
        sample.ball.x - free_ball.x,
        sample.ball.y - free_ball.y,
      ),
      remaining_travel_to_rack_front_feet: Math.max(0, bounds.front - sample.ball.y),
      zone,
      contact_error_boards: error_x === undefined ? undefined : error_x / board,
      contact_error_rows: error_y === undefined ? undefined : (error_y / Math.sqrt(3)) * 2,
      contains_eventual_first_contact: contains_contact,
    };
  });
  const contact_row =
    first_contact_snapshot === undefined
      ? undefined
      : snapshot_rows.find(
          (row) => row.simulation_time_ms === first_contact_snapshot.simulation_time_ms,
        );
  const pre_contact =
    contact === undefined
      ? snapshot_rows
      : snapshot_rows.filter((row) => row.simulation_time_ms <= contact.simulation_time_ms);
  const post_contact =
    contact === undefined
      ? []
      : snapshot_rows.filter((row) => row.simulation_time_ms >= contact.simulation_time_ms);
  const maximum_pre_contact_divergence = Math.max(
    0,
    ...pre_contact.map((row) => row.free_live_divergence_feet),
  );
  const maximum_post_contact_divergence = Math.max(
    0,
    ...post_contact.map((row) => row.free_live_divergence_feet),
  );
  const commit_snapshot = select_commit_snapshot(snapshot_rows, bounds.front);
  const contained_pre_contact = pre_contact.filter((row) => row.contains_eventual_first_contact);
  const uncontained_pre_contact = pre_contact.filter(
    (row) => row.contains_eventual_first_contact === false,
  );
  return {
    id: shot.id,
    requested_aim: shot.requested,
    source_valid_normalized_aim: shot.normalized,
    source_valid:
      JSON.stringify({
        power: shot.requested.power,
        start_position: shot.requested.start_position,
        angle: shot.requested.angle,
        spin: shot.requested.spin,
      }) === JSON.stringify(shot.normalized),
    free_path_point_count: worker_result.free_path.length,
    first_ball_pin_impact: contact,
    evidence_commit_snapshot: commit_snapshot,
    first_contact_snapshot: contact_row,
    containment_trend:
      contact === undefined
        ? { status: "no_ball_pin_contact" }
        : {
            pre_contact_snapshot_count: pre_contact.length,
            contained_pre_contact_snapshot_count: contained_pre_contact.length,
            all_pre_contact_snapshots_contained: uncontained_pre_contact.length === 0,
            first_uncontained_pre_contact_snapshot: uncontained_pre_contact[0] ?? null,
            last_contained_pre_contact_snapshot: contained_pre_contact.at(-1) ?? null,
          },
    pre_contact_maximum_free_live_divergence_feet: maximum_pre_contact_divergence,
    post_contact_maximum_free_live_divergence_feet: maximum_post_contact_divergence,
    settled: worker_result.settled,
    snapshots: snapshot_rows,
  };
}

async function run_worker_shot(page, pin_count, aim) {
  return page.evaluate(
    async ({ pin_count: evaluated_pin_count, aim: evaluated_aim }) =>
      new Promise((resolve_result, reject_result) => {
        const worker = new Worker("./simulation_worker.js", { type: "module" });
        const snapshots = [];
        let free_path;
        let first_ball_pin_impact;
        let launched = false;
        let settled;
        const timeout = window.setTimeout(() => {
          worker.terminate();
          reject_result(
            new Error(`${evaluated_pin_count}-pin ${evaluated_aim.id} worker roll timed out.`),
          );
        }, 75_000);
        worker.addEventListener("message", (event) => {
          const message = event.data;
          if (message.type === "fatal") {
            window.clearTimeout(timeout);
            worker.terminate();
            reject_result(new Error(message.message));
          } else if (message.type === "ready") {
            worker.postMessage({
              type: "preview_path",
              request_id: 1,
              pin_count: evaluated_pin_count,
              ...evaluated_aim.normalized,
            });
          } else if (message.type === "preview_path") {
            free_path = Array.from(message.points).reduce((points, value, index) => {
              if (index % 2 === 0) points.push({ x: value, y: message.points[index + 1] });
              return points;
            }, []);
            launched = true;
            worker.postMessage({ type: "launch", ...evaluated_aim.normalized });
          } else if (message.type === "snapshot" && launched) {
            const offset = message.pin_count * 8;
            snapshots.push({
              simulation_time_ms: message.simulation_time_ms,
              ball: {
                x: message.snapshot_data[offset],
                y: message.snapshot_data[offset + 1],
                velocity_x: message.snapshot_data[offset + 2],
                velocity_y: message.snapshot_data[offset + 3],
                in_pit: message.snapshot_data[offset + 5] !== 0,
              },
            });
          } else if (message.type === "impact" && message.first_ball_pin_impact) {
            first_ball_pin_impact = {
              simulation_time_ms: message.simulation_time_ms,
              ...message.ball_pin,
            };
          } else if (message.type === "settled") {
            window.clearTimeout(timeout);
            worker.terminate();
            settled = message;
            resolve_result({ free_path, first_ball_pin_impact, settled, snapshots });
          }
        });
        worker.postMessage({ type: "initialize", pin_count: evaluated_pin_count });
      }),
    { pin_count, aim },
  );
}

function compact_report(measurements) {
  const rows = measurements.flatMap((mode) =>
    mode.shots.map((shot) => {
      const contact = shot.first_contact_snapshot;
      return {
        rack: mode.pin_count,
        shot: shot.id,
        contact: shot.first_ball_pin_impact === undefined ? "none" : "yes",
        containment_at_existing_focus_ramp_start:
          shot.evidence_commit_snapshot.contains_eventual_first_contact === undefined
            ? "n/a"
            : String(shot.evidence_commit_snapshot.contains_eventual_first_contact),
        containment_at_last_snapshot_before_contact:
          contact?.contains_eventual_first_contact === undefined
            ? "n/a"
            : String(contact.contains_eventual_first_contact),
        contact_error_boards: contact?.contact_error_boards ?? null,
        contact_error_rows: contact?.contact_error_rows ?? null,
        approach_divergence_ft: shot.pre_contact_maximum_free_live_divergence_feet,
        post_contact_divergence_ft: shot.post_contact_maximum_free_live_divergence_feet,
      };
    }),
  );
  return rows;
}

function summarize_commit_evidence(measurements) {
  const contact_shots = measurements.flatMap((mode) =>
    mode.shots.filter((shot) => shot.first_ball_pin_impact !== undefined),
  );
  const contained_shots = contact_shots.filter(
    (shot) => shot.evidence_commit_snapshot.contains_eventual_first_contact,
  );
  return {
    candidate: {
      name: "existing_focus_ramp_start",
      progress_fraction_of_rack_front: camera_config.shot_focus_start_progress,
      reason:
        "The current source config names this as the start of close lateral camera movement; M4 measures it but does not turn it into a permanent timing gate.",
    },
    contact_shot_count: contact_shots.length,
    contained_contact_shot_count: contained_shots.length,
    all_contact_shots_contained: contained_shots.length === contact_shots.length,
    failures: contact_shots
      .filter((shot) => !shot.evidence_commit_snapshot.contains_eventual_first_contact)
      .map((shot) => ({
        rack: shot.settled.pin_count,
        shot: shot.id,
        snapshot_time_ms: shot.evidence_commit_snapshot.simulation_time_ms,
        remaining_travel_to_rack_front_feet:
          shot.evidence_commit_snapshot.remaining_travel_to_rack_front_feet,
        zone: shot.evidence_commit_snapshot.zone,
        first_contact: shot.first_ball_pin_impact,
      })),
  };
}

async function main() {
  await mkdir(output_directory, { recursive: true });
  try {
    await readFile(join(root, "dist", "simulation_worker.js"));
  } catch {
    throw new Error(
      "Missing dist/simulation_worker.js. Run npm run build before this production-worker probe.",
    );
  }
  const server = await start_server();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base_url, { waitUntil: "domcontentloaded" });
    const measurements = [];
    for (const pin_count of [105, 496, 990]) {
      const shots = [];
      for (const shot of create_shots(pin_count)) {
        process.stdout.write(`Measuring ${pin_count}-pin ${shot.id}.\n`);
        shots.push(summarize_shot(pin_count, shot, await run_worker_shot(page, pin_count, shot)));
      }
      measurements.push({ pin_count, rack_front_y_feet: foul_to_head_pin, shots });
    }
    const output = {
      purpose:
        "M4 production-worker collision-zone measurement; observations are maintainer evidence, not pixel or elapsed-time gates.",
      worker_protocol: ["initialize", "preview_path", "launch", "snapshot", "impact", "settled"],
      physics_provenance:
        "The built production worker supplies both its pins-free Rapier path and live snapshots/ImpactPathSummary. This probe does not create a simulation world.",
      deck_assist_limitation:
        "apply_ball_force requires has_hit_pin before deck assist can act. A pins-free path cannot reach that state, and the public preview_path request has no deck_assist option; free-path/live comparison is therefore meaningful through first contact and explicitly measures divergence afterwards.",
      free_path_sample_ms,
      free_path_coordinate_interpretation:
        "free_ball is a time-indexed linear interpolation between the worker preview_path's 50 ms samples and is reported only for free-versus-live divergence. create_collision_zone independently uses its own nearest-path-point selection from the authoritative live ball to determine remaining-approach expansion.",
      measurements,
      compact_summary: compact_report(measurements),
      commit_evidence: summarize_commit_evidence(measurements),
    };
    await writeFile(output_path, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify(output.compact_summary, null, 2)}\nWrote ${output_path}.\n`,
    );
  } finally {
    await browser.close();
    await new Promise((resolve_close) => server.close(resolve_close));
  }
}

await main();
