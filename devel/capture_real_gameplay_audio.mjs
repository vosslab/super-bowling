/* global AudioBufferSourceNode, AudioNode, document, HTMLCanvasElement, HTMLInputElement, MediaRecorder, MediaStream, window */
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
    const decoded_assets = [];
    const fetches = [];
    let started_buffer_sources = 0;
    let recorder;
    let chunks = [];
    let recording_started_at_ms;
    let recording_stopped_at_ms;
    let recorder_error;

    function create_tap(context_for_capture) {
      // A direct second connection to MediaStreamDestination proved browser-version
      // sensitive for an AudioWorklet-free graph.  Keeping a real post-master
      // monitor node between the production output edge and the stream gives us
      // one explicit, inspectable post-mix path while preserving the original
      // destination edge unchanged.
      const monitor = context_for_capture.createGain();
      const analyser = context_for_capture.createAnalyser();
      const stream_destination = context_for_capture.createMediaStreamDestination();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      monitor.connect(analyser);
      analyser.connect(stream_destination);
      return {
        analyser,
        destination_edges: [],
        monitor,
        stream_destination,
        trace: [],
      };
    }

    class CaptureAudioContext extends native_audio_context {
      constructor(...arguments_list) {
        super(...arguments_list);
        tap_by_context.set(this, create_tap(this));
        contexts.push(this);
      }

      decodeAudioData(audio_data, ...arguments_list) {
        const byte_length = audio_data.byteLength;
        return super.decodeAudioData(audio_data, ...arguments_list).then((buffer) => {
          decoded_assets.push({ byte_length, duration_s: buffer.duration });
          return buffer;
        });
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
      native_connect.call(source, tap.monitor);
      tapped_nodes.set(source, true);
      tap.destination_edges.push({
        node_name: source.constructor?.name ?? "unknown-node",
        observed_at_ms: performance.now(),
      });
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
    const native_fetch = window.fetch.bind(window);
    window.fetch = async function capture_audio_asset_fetch(input, init) {
      const response = await native_fetch(input, init);
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/assets/audio/"))
        fetches.push({ ok: response.ok, status: response.status, url });
      return response;
    };
    const native_buffer_source_start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function capture_buffer_source_start(
      ...arguments_list
    ) {
      started_buffer_sources += 1;
      return native_buffer_source_start.apply(this, arguments_list);
    };
    window.AudioContext = CaptureAudioContext;

    function sample_taps() {
      for (const context_for_capture of contexts) {
        const tap = tap_by_context.get(context_for_capture);
        if (tap === undefined) continue;
        const samples = new Float32Array(tap.analyser.fftSize);
        tap.analyser.getFloatTimeDomainData(samples);
        let sum_squares = 0;
        let peak = 0;
        for (const sample of samples) {
          sum_squares += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        tap.trace.push({
          context_time_s: context_for_capture.currentTime,
          page_time_ms: performance.now(),
          peak,
          rms: Math.sqrt(sum_squares / samples.length),
        });
      }
    }
    let trace_interval;

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
      if (trace_interval !== undefined) window.clearInterval(trace_interval);
      sample_taps();
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
        audio_diagnostics: {
          decoded_assets,
          destination_edges: contexts.flatMap((context_for_capture) => {
            const tap = tap_by_context.get(context_for_capture);
            return tap?.destination_edges ?? [];
          }),
          fetches,
          started_buffer_sources,
          trace: contexts.flatMap((context_for_capture) => {
            const tap = tap_by_context.get(context_for_capture);
            return tap?.trace ?? [];
          }),
        },
      };
    }

    function start_recording(context_for_capture) {
      if (recorder !== undefined) return;
      const tap = tap_by_context.get(context_for_capture);
      const canvas = document.querySelector("canvas.game_canvas");
      if (tap === undefined || !(canvas instanceof HTMLCanvasElement))
        throw new Error("Audio capture could not find the live game canvas or AudioContext tap.");
      const visual_stream = canvas.captureStream(30);
      const capture_stream = new MediaStream([
        ...visual_stream.getVideoTracks(),
        ...tap.stream_destination.stream.getAudioTracks(),
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
      trace_interval = window.setInterval(sample_taps, 50);
    }

    globalThis[capture_key] = {
      arm() {
        // The application creates its AudioContext synchronously inside the
        // user-gesture launch path.  Deferring recorder construction until that
        // constructor preserves the ordinary launch and the entire real roll.
        const original_push = contexts.push.bind(contexts);
        let armed = true;
        contexts.push = function capture_context_created(context_for_capture) {
          original_push(context_for_capture);
          if (!armed) return contexts.length;
          armed = false;
          start_recording(context_for_capture);
          return contexts.length;
        };
        if (contexts.length > 0) {
          armed = false;
          start_recording(contexts.at(-1));
        }
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
  return {
    probe,
    loudness: {
      is_non_silent: mean_volume_db > -80,
      is_non_clipping: max_volume_db < -0.1,
      max_volume_db,
      mean_volume_db,
    },
  };
}

async function inspect_audio_segment(video_path, name, start_s, duration_s) {
  const { stderr } = await run_process("ffmpeg", [
    "-hide_banner",
    "-ss",
    start_s.toFixed(3),
    "-t",
    duration_s.toFixed(3),
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
  const mean_match = stderr.match(/mean_volume:\s+(-?[\d.]+) dB/);
  const max_match = stderr.match(/max_volume:\s+(-?[\d.]+) dB/);
  const mean_volume_db = mean_match === null ? undefined : Number(mean_match[1]);
  const max_volume_db = max_match === null ? undefined : Number(max_match[1]);
  if (!Number.isFinite(mean_volume_db) || !Number.isFinite(max_volume_db))
    throw new Error(`ffmpeg did not report measurable levels for ${name}.`);
  return {
    duration_s,
    is_non_clipping: max_volume_db < -0.1,
    is_non_silent: mean_volume_db > -80,
    max_volume_db,
    mean_volume_db,
    name,
    start_s,
  };
}

function capture_time_for_state(state, recording) {
  return Math.max(0, (state.after_launch_ms - recording.started_after_launch_ms) / 1000);
}

async function inspect_audio_stages(video_path, states, recording) {
  const first_impact = states.find((state) => state.name === "first_physics_impact");
  const result = states.find((state) => state.name === "result");
  if (first_impact === undefined || result === undefined)
    throw new Error("Audio stages need both first-impact and result worker milestones.");
  const first_impact_s = capture_time_for_state(first_impact, recording);
  const result_s = capture_time_for_state(result, recording);
  const approach_duration_s = Math.max(0.35, first_impact_s - 0.1);
  const cascade_start_s = Math.max(first_impact_s, 0.05);
  const cascade_duration_s = Math.max(0.35, result_s - cascade_start_s - 0.1);
  const stages = await Promise.all([
    inspect_audio_segment(video_path, "approach", 0, approach_duration_s),
    inspect_audio_segment(video_path, "impact_and_cascade", cascade_start_s, cascade_duration_s),
    inspect_audio_segment(video_path, "result", result_s, 0.55),
  ]);
  const by_name = Object.fromEntries(stages.map((stage) => [stage.name, stage]));
  const approach = by_name.approach;
  const impact_and_cascade = by_name.impact_and_cascade;
  const result_stage = by_name.result;
  const materially_separate =
    impact_and_cascade.max_volume_db >= approach.max_volume_db + 3 &&
    result_stage.max_volume_db >= approach.max_volume_db + 3;
  return { materially_separate, stages };
}

function summarize_analyser_trace(trace, states, recording) {
  return states.map((state) => {
    const target_time_ms =
      recording.recording_started_at_ms + capture_time_for_state(state, recording) * 1000;
    const samples = trace.filter((sample) => Math.abs(sample.page_time_ms - target_time_ms) <= 250);
    const peak = samples.reduce((maximum, sample) => Math.max(maximum, sample.peak), 0);
    const rms = samples.reduce((maximum, sample) => Math.max(maximum, sample.rms), 0);
    return {
      milestone: state.name,
      peak,
      peak_dbfs: peak === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(peak),
      rms,
      rms_dbfs: rms === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms),
      samples: samples.length,
    };
  });
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
    const recording_summary = {
      mime_type: recording.mime_type,
      bytes: recording.bytes,
      contexts_created: recording.contexts_created,
      context_state: recording.context_state,
      sample_rate: recording.sample_rate,
      recording_started_at_ms: recording.recording_started_at_ms,
      started_after_launch_ms: recording.recording_started_at_ms - launched_at_ms,
      stopped_after_launch_ms: recording.recording_stopped_at_ms - launched_at_ms,
    };
    const analyser_milestones = summarize_analyser_trace(
      recording.audio_diagnostics.trace,
      states,
      recording_summary,
    );
    const analyser_has_production_signal = analyser_milestones.some(
      (sample) => sample.peak > 0.0001,
    );
    const stages = await inspect_audio_stages(output_path, states, recording_summary);
    console.log(`==> Validated ${scenario.id} audio and video streams`);
    const provenance = {
      evidence_kind: "one_time_real_worker_audio_video_capture",
      production_path:
        "The shipped page starts its ordinary match, launches through the normal player gesture, and receives live worker state. Runtime instrumentation preserves each production destination edge and adds a post-master monitor -> analyser -> MediaStreamDestination branch for recording only.",
      scenario: { id: scenario.id, pin_count: scenario.pin_count, input: scenario.input },
      base_url: options.base_url,
      viewport,
      output_path,
      launched_at_ms,
      states,
      recording: {
        ...recording_summary,
        audio_diagnostics: {
          analyser_milestones,
          decoded_assets: recording.audio_diagnostics.decoded_assets,
          destination_edges: recording.audio_diagnostics.destination_edges,
          fetched_assets: recording.audio_diagnostics.fetches,
          started_buffer_sources: recording.audio_diagnostics.started_buffer_sources,
          trace_sample_count: recording.audio_diagnostics.trace.length,
        },
      },
      container,
      stages,
      acceptance: {
        contains_audio_stream: true,
        contains_video_stream: true,
        non_silent: container.loudness.is_non_silent,
        peak_below_clipping_guard: container.loudness.is_non_clipping,
        analyser_has_production_signal,
        materially_separate_stages: stages.materially_separate,
        worker_provenance: states,
      },
    };
    await writeFile(provenance_path, `${JSON.stringify(provenance, null, 2)}\n`);
    if (!analyser_has_production_signal)
      throw new Error("Post-master analyser saw no production signal at worker milestones.");
    if (!container.loudness.is_non_silent)
      throw new Error(
        `Capture audio is effectively silent (${container.loudness.mean_volume_db} dB).`,
      );
    if (!container.loudness.is_non_clipping)
      throw new Error(`Capture audio may clip (${container.loudness.max_volume_db} dB peak).`);
    if (!stages.materially_separate)
      throw new Error("Capture stages do not separate from approach by at least 3 dB.");
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
