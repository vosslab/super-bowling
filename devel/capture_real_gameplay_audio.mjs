/* global AudioNode, document, HTMLCanvasElement, HTMLInputElement, MediaRecorder, MediaStream, window */
// capture_real_gameplay_audio.mjs - one-time real-worker Web Audio evidence.
//
// This is intentionally a maintainer probe rather than a permanent browser
// test. It mirrors (rather than replaces) production Web Audio output edges
// into a MediaStream, then records that stream beside the live canvas. The
// app, its worker, and its audio controller remain unmodified.

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { chromium } from "playwright";

import { start_aiming_state } from "./capture_live_support.mjs";

const run_process = promisify(execFile);
const viewport = { width: 960, height: 600 };
const default_output_directory = "_temp/20260811_audio_completion";
const default_timeout_ms = 45_000;

function usage() {
  console.log(
    "Usage: node devel/capture_real_gameplay_audio.mjs --base-url URL [--output-directory PATH] [--timeout-seconds SECONDS]",
  );
}

function parse_arguments(argument_list) {
  const options = {
    base_url: undefined,
    output_directory: default_output_directory,
    timeout_ms: default_timeout_ms,
  };
  for (let index = 0; index < argument_list.length; index += 1) {
    const argument = argument_list[index];
    if (argument === "--base-url") {
      options.base_url = argument_list[index + 1];
      index += 1;
    } else if (argument === "--output-directory") {
      options.output_directory = argument_list[index + 1];
      index += 1;
    } else if (argument === "--timeout-seconds") {
      options.timeout_ms = Number(argument_list[index + 1]) * 1000;
      index += 1;
    } else if (argument === "-h" || argument === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (typeof options.base_url !== "string" || options.base_url.length === 0)
    throw new Error("--base-url is required.");
  if (typeof options.output_directory !== "string" || options.output_directory.length === 0)
    throw new Error("--output-directory must not be empty.");
  if (!Number.isFinite(options.timeout_ms) || options.timeout_ms <= 0)
    throw new Error("--timeout-seconds must be a positive number.");
  return options;
}

function install_audio_tap(context) {
  return context.addInitScript(() => {
    const capture_key = "__super_bowling_real_audio_capture";
    if (globalThis[capture_key] !== undefined) return;

    const native_connect = AudioNode.prototype.connect;
    const native_audio_context = window.AudioContext;
    const contexts = [];
    const tap_by_context = new WeakMap();
    const tapped_nodes = new WeakMap();
    let recorder;
    let chunks = [];
    let recording_started_at_ms;
    let recording_stopped_at_ms;
    let recorder_error;

    class CaptureAudioContext extends native_audio_context {
      constructor(...arguments_list) {
        super(...arguments_list);
        tap_by_context.set(this, this.createMediaStreamDestination());
        contexts.push(this);
      }
    }

    function tap_destination_output(source, destination) {
      const context_for_node = source.context;
      const tap = tap_by_context.get(context_for_node);
      if (
        tap === undefined ||
        destination !== context_for_node.destination ||
        tapped_nodes.get(source) === true
      )
        return;
      native_connect.call(source, tap);
      tapped_nodes.set(source, true);
    }

    AudioNode.prototype.connect = function capture_connect(destination, output, input) {
      const result =
        arguments.length === 1
          ? native_connect.call(this, destination)
          : arguments.length === 2
            ? native_connect.call(this, destination, output)
            : native_connect.call(this, destination, output, input);
      tap_destination_output(this, destination);
      return result;
    };
    window.AudioContext = CaptureAudioContext;

    async function stop_recorder() {
      if (recorder === undefined) throw new Error("Audio capture did not start a MediaRecorder.");
      if (recorder.state !== "inactive") {
        await new Promise((resolve) => {
          recorder.addEventListener("stop", resolve, { once: true });
          recorder.stop();
        });
      }
      recording_stopped_at_ms = performance.now();
      if (recorder_error !== undefined) throw new Error(recorder_error);
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return {
        mime_type: recorder.mimeType,
        bytes_base64: btoa(binary),
        bytes: bytes.length,
        contexts_created: contexts.length,
        recording_started_at_ms,
        recording_stopped_at_ms,
        context_state: contexts.at(-1)?.state,
        sample_rate: contexts.at(-1)?.sampleRate,
      };
    }

    globalThis[capture_key] = {
      arm() {
        // The application creates its AudioContext synchronously inside the
        // user-gesture launch path. Deferring MediaRecorder creation until that
        // constructor would lose the start transient, so this arm call records
        // the desired canvas and activates immediately when construction occurs.
        const original_push = contexts.push.bind(contexts);
        let armed = true;
        contexts.push = function capture_context_created(context_for_capture) {
          original_push(context_for_capture);
          if (!armed) return contexts.length;
          armed = false;
          const tap = tap_by_context.get(context_for_capture);
          const canvas = document.querySelector("canvas.game_canvas");
          if (tap === undefined || !(canvas instanceof HTMLCanvasElement))
            throw new Error(
              "Audio capture could not find the live game canvas or AudioContext tap.",
            );
          const visual_stream = canvas.captureStream(30);
          const capture_stream = new MediaStream([
            ...visual_stream.getVideoTracks(),
            ...tap.stream.getAudioTracks(),
          ]);
          const preferred_mime = "video/webm;codecs=vp8,opus";
          const mime_type = MediaRecorder.isTypeSupported(preferred_mime)
            ? preferred_mime
            : "video/webm";
          recorder = new MediaRecorder(capture_stream, {
            mimeType: mime_type,
            videoBitsPerSecond: 1_500_000,
            audioBitsPerSecond: 128_000,
          });
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          });
          recorder.addEventListener("error", (event) => {
            recorder_error = event.error?.message ?? "MediaRecorder emitted an unspecified error.";
          });
          recorder.start(250);
          recording_started_at_ms = performance.now();
          return contexts.length;
        };
      },
      stop: stop_recorder,
      status() {
        return {
          contexts_created: contexts.length,
          recorder_state: recorder?.state ?? "not-created",
          recording_started_at_ms,
          recorder_error,
        };
      },
    };
  });
}

async function record_state(page, name, launched_at_ms) {
  return page.evaluate(
    ({ record_name, launch_time }) => {
      const shell = document.querySelector("main.play_shell");
      if (shell === null)
        throw new Error("Worker-state capture could not find the live play shell.");
      return {
        name: record_name,
        page_time_ms: performance.now(),
        after_launch_ms: performance.now() - launch_time,
        phase: shell.getAttribute("data-phase"),
        pin_count: shell.getAttribute("data-drawn-pin-count"),
        camera_progress: shell.getAttribute("data-camera-progress"),
        camera_zoom: shell.getAttribute("data-camera-zoom"),
        fallen_pins: shell.getAttribute("data-drawn-fallen-pin-count"),
        impact_windows: shell.getAttribute("data-impact-window-count"),
        first_impact_seen: shell.getAttribute("data-first-impact-seen"),
      };
    },
    { record_name: name, launch_time: launched_at_ms },
  );
}

async function wait_for_attribute(page, attribute, minimum) {
  await page.waitForFunction(
    ({ expected_attribute, minimum_value }) => {
      const shell = document.querySelector("main.play_shell");
      return Number(shell?.getAttribute(expected_attribute)) >= minimum_value;
    },
    { expected_attribute: attribute, minimum_value: minimum },
  );
}

async function inspect_container(video_path) {
  const { stdout: probe_stdout } = await run_process("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=index,codec_type,codec_name,sample_rate,channels",
    "-of",
    "json",
    video_path,
  ]);
  const probe = JSON.parse(probe_stdout);
  const audio_stream = probe.streams.find((stream) => stream.codec_type === "audio");
  const video_stream = probe.streams.find((stream) => stream.codec_type === "video");
  if (audio_stream === undefined || video_stream === undefined)
    throw new Error("Capture container must include both video and audio streams.");
  const { stderr: loudness_stderr } = await run_process("ffmpeg", [
    "-hide_banner",
    "-i",
    video_path,
    "-map",
    "0:a:0",
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const mean_match = loudness_stderr.match(/mean_volume:\s+(-?[\d.]+) dB/);
  const max_match = loudness_stderr.match(/max_volume:\s+(-?[\d.]+) dB/);
  const mean_volume_db = mean_match === null ? undefined : Number(mean_match[1]);
  const max_volume_db = max_match === null ? undefined : Number(max_match[1]);
  if (!Number.isFinite(mean_volume_db) || !Number.isFinite(max_volume_db))
    throw new Error("ffmpeg did not report measurable audio levels.");
  if (mean_volume_db <= -80)
    throw new Error(`Capture audio is effectively silent (${mean_volume_db} dB).`);
  if (max_volume_db >= -0.1) throw new Error(`Capture audio may clip (${max_volume_db} dB peak).`);
  return {
    probe,
    loudness: { mean_volume_db, max_volume_db },
  };
}

async function set_ten_pin_pocket_shot(page) {
  const start_position = page.locator('[data-control="start-position"]');
  const power = page.locator('[data-control="power"]');
  await start_position.evaluate((element) => {
    if (!(element instanceof HTMLInputElement))
      throw new Error("Expected start-position range input.");
    element.value = "-20";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await power.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Expected power range input.");
    element.value = "18";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const scenarios = [
  {
    id: "real_worker_990_complete_roll",
    pin_count: 990,
    mode_label: "1,000 mode - 990 pins",
    start_label: "Start 1,000 mode - 990 pins for 1 player",
    launch: async (page) => page.keyboard.press("Space"),
    cascade_milestones: [100, 300],
    input: {
      launch: "Space",
      power: "default",
      start_position: "default",
      angle: "default",
      spin: "default",
    },
  },
  {
    id: "real_worker_ten_pin_pocket_hit",
    pin_count: 10,
    mode_label: "10 mode - 10 pins",
    start_label: "Start 10 mode - 10 pins for 1 player",
    prepare: set_ten_pin_pocket_shot,
    launch: async (page) => page.getByRole("button", { name: "Bowl now" }).click(),
    cascade_milestones: [5],
    input: { launch: "Bowl now", power: "18", start_position: "-20", angle: "0", spin: "0" },
  },
];

async function capture_scenario(browser, options, scenario) {
  console.log(`==> Capturing ${scenario.id}`);
  const context = await browser.newContext({ viewport });
  await install_audio_tap(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeout_ms);
  page.on("pageerror", (error) => console.error(`PAGE ERROR (${scenario.id}): ${error.message}`));
  const output_path = join(options.output_directory, `${scenario.id}.webm`);
  const provenance_path = join(options.output_directory, `${scenario.id}.json`);
  try {
    await start_aiming_state(
      page,
      options.base_url,
      scenario.mode_label,
      scenario.start_label,
      scenario.pin_count,
    );
    if (scenario.prepare !== undefined) await scenario.prepare(page);
    console.log(`==> Arming production Web Audio for ${scenario.id}`);
    await page.evaluate(() => globalThis.__super_bowling_real_audio_capture.arm());
    const launched_at_ms = await page.evaluate(() => performance.now());
    await scenario.launch(page);
    console.log(`==> Launching real-worker ${scenario.id}`);
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "rolling",
    );
    console.log(`==> Recording ${scenario.id} through first worker impact`);
    const states = [await record_state(page, "rolling", launched_at_ms)];
    await page.waitForFunction(
      () =>
        document.querySelector("main.play_shell")?.getAttribute("data-first-impact-seen") ===
        "true",
    );
    console.log(`==> Recording ${scenario.id} result cue`);
    states.push(await record_state(page, "first_physics_impact", launched_at_ms));
    for (const fallen_pin_count of scenario.cascade_milestones) {
      await wait_for_attribute(page, "data-drawn-fallen-pin-count", fallen_pin_count);
      states.push(await record_state(page, `cascade_${fallen_pin_count}_fallen`, launched_at_ms));
    }
    await page.waitForFunction(
      () => document.querySelector("main.play_shell")?.getAttribute("data-phase") === "result",
    );
    states.push(await record_state(page, "result", launched_at_ms));
    await page.waitForTimeout(700);
    const recording = await page.evaluate(() =>
      globalThis.__super_bowling_real_audio_capture.stop(),
    );
    const video_bytes = Buffer.from(recording.bytes_base64, "base64");
    if (video_bytes.length === 0) throw new Error("MediaRecorder returned an empty container.");
    await writeFile(output_path, video_bytes);
    const container = await inspect_container(output_path);
    console.log(`==> Validated ${scenario.id} audio and video streams`);
    const provenance = {
      evidence_kind: "one_time_real_worker_audio_video_capture",
      production_path:
        "The shipped page starts its ordinary match, launches through the normal player gesture, and receives live worker state. Runtime instrumentation only mirrors AudioNode outputs already connected to the production AudioContext destination into MediaRecorder.",
      scenario: { id: scenario.id, pin_count: scenario.pin_count, input: scenario.input },
      base_url: options.base_url,
      viewport,
      output_path,
      launched_at_ms,
      states,
      recording: {
        mime_type: recording.mime_type,
        bytes: recording.bytes,
        contexts_created: recording.contexts_created,
        context_state: recording.context_state,
        sample_rate: recording.sample_rate,
        started_after_launch_ms: recording.recording_started_at_ms - launched_at_ms,
        stopped_after_launch_ms: recording.recording_stopped_at_ms - launched_at_ms,
      },
      container,
      acceptance: {
        contains_audio_stream: true,
        contains_video_stream: true,
        non_silent: container.loudness.mean_volume_db > -80,
        peak_below_clipping_guard: container.loudness.max_volume_db < -0.1,
        worker_provenance: states,
      },
    };
    await writeFile(provenance_path, `${JSON.stringify(provenance, null, 2)}\n`);
    return provenance;
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parse_arguments(process.argv.slice(2));
  await mkdir(options.output_directory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const captures = [];
    for (const scenario of scenarios)
      captures.push(await capture_scenario(browser, options, scenario));
    console.log(JSON.stringify({ captures }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
