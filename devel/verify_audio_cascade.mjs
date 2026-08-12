/*
 * A terminal, unattended production-evidence gate for collision audio.
 * It builds the published artifact, serves only that artifact, runs Chromium
 * OfflineAudioContext diagnostics, then drives two ordinary worker rolls.
 */
import { createServer } from "node:http";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";

import { create_cascade_director } from "../src/audio/cascade_director.ts";
import { cascade_trace_fixtures } from "../src/audio/cascade_traces.ts";
import {
  collision_mix_levels,
  collision_render_instruction,
} from "../src/audio/collision_render_contract.ts";
import {
  audio_cascade_evidence_contract as contract,
  finished_report,
  metric,
} from "./audio_cascade_evidence_contract.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const output_directory = join(root, "artifacts/audio-cascade/latest");
const port = 8619;
const base_url = `http://127.0.0.1:${port}`;
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".ogg": "audio/ogg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function command(command_name, arguments_list) {
  return new Promise((resolve_command, reject_command) => {
    const child = spawn(command_name, arguments_list, { cwd: root, stdio: "inherit" });
    child.once("error", reject_command);
    child.once("exit", (code) =>
      code === 0
        ? resolve_command()
        : reject_command(new Error(`${command_name} ${arguments_list.join(" ")} exited ${code}`)),
    );
  });
}

function scenario_trace(name) {
  if (name === "ten") return [...cascade_trace_fixtures.ten_pin_strike];
  const propagation = [];
  for (let time = 1_350, index = 0; time <= 4_350; time += 190, index += 1) {
    const pan = -0.72 + (index % 7) * 0.24;
    propagation.push({
      source_simulation_time_ms: time,
      source_event_sequence: 100 + index,
      first_contact: false,
      ball_pin: { contact_count: 0, impulse: 0, pan },
      pin_pin: { contact_count: 2 + (index % 3), impulse: 0.24 + (index % 4) * 0.06, pan },
      deck: { contact_count: 1, impulse: 0.12, pan },
    });
  }
  return [
    ...cascade_trace_fixtures.large_990_opening,
    ...cascade_trace_fixtures.large_990_propagation,
    ...propagation,
    ...cascade_trace_fixtures.large_990_tail,
  ].sort((left, right) => left.source_simulation_time_ms - right.source_simulation_time_ms);
}

function direct_trace(trace) {
  const director = create_cascade_director();
  return trace.flatMap(
    (event, index) =>
      director.direct({ ...event, source_event_sequence: event.source_event_sequence ?? index + 1 })
        .voices,
  );
}

function planned_metrics(voices) {
  const attacks = voices.filter((voice) => voice.role !== "body");
  let finite = voices.every(
    (voice) =>
      Number.isFinite(voice.source_simulation_time_ms) &&
      voice.source_simulation_time_ms >= 0 &&
      Number.isFinite(voice.pan) &&
      voice.pan >= -1 &&
      voice.pan <= 1 &&
      typeof voice.source_path === "string",
  );
  const same_sector = new Map();
  for (const attack of attacks) {
    const sector = attack.pan < -0.33 ? "left" : attack.pan > 0.33 ? "right" : "center";
    const previous = same_sector.get(sector);
    if (
      previous !== undefined &&
      attack.source_simulation_time_ms - previous < contract.opening_protection_ms
    )
      finite &&= false;
    same_sector.set(sector, attack.source_simulation_time_ms);
  }
  return { attacks, finite };
}

async function offline_report(browser) {
  const voices = {
    ten: direct_trace(scenario_trace("ten")),
    large: direct_trace(scenario_trace("large")),
  };
  const page = await browser.newPage();
  try {
    // Give the otherwise headless diagnostic page the published artifact's
    // origin so its sample fetches exercise the same asset URLs as the game.
    await page.goto(base_url, { waitUntil: "domcontentloaded" });
    const sample_durations = await page.evaluate(async () => {
      const context = new AudioContext();
      const paths = {
        impact: "/assets/audio/bowling_impact_1.ogg",
        clatter: "/assets/audio/bowling_pin_clatter_1.ogg",
        knock: "/assets/audio/pin_knock_1.ogg",
        clack: "/assets/audio/ceramic_clack_1.ogg",
      };
      const entries = await Promise.all(
        Object.entries(paths).map(async ([name, path]) => [
          name,
          (await context.decodeAudioData(await (await fetch(path)).arrayBuffer())).duration,
        ]),
      );
      await context.close();
      return Object.fromEntries(entries);
    });
    // The production-owned adapter chooses every role/path sample and clamps
    // every slice using the decoded asset durations. The browser only renders
    // this serializable production instruction; it owns no alternate mixer.
    const bank = Object.fromEntries(
      Object.entries(sample_durations).map(([name, duration]) => [
        name,
        { duration, getChannelData: () => new Float32Array() },
      ]),
    );
    const plans = Object.fromEntries(
      Object.entries(voices).map(([name, entries]) => [
        name,
        entries.flatMap((voice) => {
          const instruction = collision_render_instruction(voice, bank);
          return instruction === undefined
            ? []
            : [
                {
                  ...instruction,
                  role: voice.role,
                  start_s: (voice.source_simulation_time_ms + voice.delay_ms) / 1000,
                },
              ];
        }),
      ]),
    );
    const rendered = await page.evaluate(
      async ({ plans, contract: browser_contract, mix_levels }) => {
        if (typeof OfflineAudioContext !== "function")
          throw new Error("Chromium OfflineAudioContext is unavailable.");
        const asset_urls = {
          impact: "/assets/audio/bowling_impact_1.ogg",
          clatter: "/assets/audio/bowling_pin_clatter_1.ogg",
          knock: "/assets/audio/pin_knock_1.ogg",
          clack: "/assets/audio/ceramic_clack_1.ogg",
        };
        const decode_context = new AudioContext();
        const buffers = Object.fromEntries(
          await Promise.all(
            Object.entries(asset_urls).map(async ([name, url]) => [
              name,
              await decode_context.decodeAudioData(await (await fetch(url)).arrayBuffer()),
            ]),
          ),
        );
        await decode_context.close();
        const render_one = async (voices) => {
          const duration_s = 8;
          const context = new OfflineAudioContext(2, 48_000 * duration_s, 48_000);
          const master = context.createGain();
          const attack_bus = context.createGain();
          const body_bus = context.createGain();
          attack_bus.gain.value = mix_levels.attack;
          body_bus.gain.value = mix_levels.body;
          attack_bus.connect(master);
          body_bus.connect(master);
          master.gain.value = mix_levels.master;
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.value = -10;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.14;
          master.connect(compressor);
          compressor.connect(context.destination);
          for (const voice of voices) {
            const source = context.createBufferSource();
            source.buffer = buffers[voice.sample_name];
            const gain = context.createGain();
            const pan = context.createStereoPanner();
            const scheduled_start = voice.start_s;
            const duration = voice.duration_s;
            source.playbackRate.value = voice.playback_rate;
            gain.gain.setValueAtTime(voice.gain, scheduled_start);
            gain.gain.linearRampToValueAtTime(0, scheduled_start + Math.max(0.03, duration));
            pan.pan.value = voice.pan;
            source.connect(gain);
            if (voice.lowpass_hz !== undefined) {
              const filter = context.createBiquadFilter();
              filter.type = "lowpass";
              filter.frequency.value = voice.lowpass_hz;
              gain.connect(filter);
              filter.connect(pan);
            } else gain.connect(pan);
            pan.connect(voice.role === "body" ? body_bus : attack_bus);
            if (voice.role !== "body") {
              body_bus.gain.setValueAtTime(mix_levels.body, Math.max(0, scheduled_start - 0.008));
              body_bus.gain.linearRampToValueAtTime(0.18, scheduled_start + 0.004);
              body_bus.gain.linearRampToValueAtTime(mix_levels.body, scheduled_start + 0.12);
            }
            source.start(scheduled_start, voice.offset_s, duration);
          }
          const result = await context.startRendering();
          const left = result.getChannelData(0),
            right = result.getChannelData(1),
            frame = Math.round((result.sampleRate * browser_contract.frame_ms) / 1000);
          const rows = [];
          let peak = 0,
            exposure = 0,
            left_energy = 0,
            center_energy = 0,
            right_energy = 0;
          for (let offset = 0; offset < left.length; offset += frame) {
            let square = 0,
              high = 0,
              local_peak = 0,
              l = 0,
              r = 0;
            const end = Math.min(left.length, offset + frame);
            for (let sample = offset; sample < end; sample += 1) {
              const mono = (left[sample] + right[sample]) / 2;
              square += mono * mono;
              local_peak = Math.max(local_peak, Math.abs(mono));
              if (sample > offset)
                high += Math.abs(mono - (left[sample - 1] + right[sample - 1]) / 2);
              l += left[sample] * left[sample];
              r += right[sample] * right[sample];
              peak = Math.max(peak, Math.abs(left[sample]), Math.abs(right[sample]));
              exposure += mono * mono;
            }
            const rms = Math.sqrt(square / (end - offset));
            const ild = 10 * Math.log10((l + 1e-12) / (r + 1e-12));
            if (ild < -1.5) left_energy += square;
            else if (ild > 1.5) right_energy += square;
            else center_energy += square;
            // First-difference energy is a stable inexpensive high-pass proxy.
            // Normalize its 800 Hz response at 48 kHz so it is comparable with
            // total RMS rather than an arbitrary per-sample slope unit.
            rows.push({
              start_ms: (offset / result.sampleRate) * 1000,
              rms,
              peak: local_peak,
              broadband:
                high /
                Math.max(1, end - offset) /
                (2 * Math.sin((Math.PI * 800) / result.sampleRate)),
              ild,
            });
          }
          const active = rows.map((row) => row.rms >= browser_contract.activity_rms_floor);
          const groups = [];
          for (let index = 0; index < active.length; index += 1)
            if (active[index] && !active[index - 1]) groups.push(rows[index].start_ms);
          const onset_groups = rows
            .filter(
              (row, index) =>
                row.rms >= browser_contract.activity_rms_floor &&
                row.peak / Math.max(row.rms, 1e-8) >= browser_contract.onset_ratio &&
                (!rows[index - 1] || rows[index - 1].rms < row.rms / 1.08),
            )
            .map((row) => row.start_ms);
          const non_silent = rows.filter((row) => row.rms >= browser_contract.activity_rms_floor);
          const first_active = non_silent.at(0)?.start_ms,
            last_active = non_silent.at(-1)?.start_ms;
          const early = rows.filter(
            (row) =>
              row.start_ms >= browser_contract.early_window_ms[0] &&
              row.start_ms < browser_contract.early_window_ms[1],
          );
          const early_duty =
            early.filter((row) => row.rms >= browser_contract.activity_rms_floor).length /
            Math.max(1, early.length);
          const broad =
            early.reduce(
              (sum, row) =>
                sum + (row.rms >= browser_contract.activity_rms_floor ? row.broadband : 0),
              0,
            ) /
            Math.max(
              1e-8,
              early.reduce((sum, row) => sum + row.rms, 0),
            );
          const first = rows.filter(
            (row) => row.start_ms < 1200 && row.rms >= browser_contract.activity_rms_floor,
          );
          const crest =
            first.length === 0
              ? 0
              : Math.max(
                  ...first.map((row) => 20 * Math.log10(row.peak / Math.max(row.rms, 1e-8))),
                );
          const wav = new ArrayBuffer(44 + left.length * 4);
          const view = new DataView(wav);
          const write = (offset, text) =>
            [...text].forEach((character, index) =>
              view.setUint8(offset + index, character.charCodeAt(0)),
            );
          write(0, "RIFF");
          view.setUint32(4, 36 + left.length * 4, true);
          write(8, "WAVEfmt ");
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 2, true);
          view.setUint32(24, result.sampleRate, true);
          view.setUint32(28, result.sampleRate * 4, true);
          view.setUint16(32, 4, true);
          view.setUint16(34, 16, true);
          write(36, "data");
          view.setUint32(40, left.length * 4, true);
          for (let index = 0; index < left.length; index += 1) {
            view.setInt16(44 + index * 4, Math.max(-1, Math.min(1, left[index])) * 32767, true);
            view.setInt16(46 + index * 4, Math.max(-1, Math.min(1, right[index])) * 32767, true);
          }
          const bytes = new Uint8Array(wav);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return {
            peak,
            exposure,
            duration_ms:
              first_active === undefined
                ? 0
                : last_active - first_active + browser_contract.frame_ms,
            onset_groups,
            active_groups: groups,
            early_duty,
            broadband_fraction: broad,
            crest_db: crest,
            stereo_energy: { left: left_energy, center: center_energy, right: right_energy },
            rows,
            wav_base64: btoa(binary),
          };
        };
        return {
          ten: await render_one(plans.ten),
          large: await render_one(plans.large),
          source_assets: asset_urls,
        };
      },
      { plans, contract, mix_levels: collision_mix_levels },
    );
    for (const name of ["ten", "large"]) {
      const fixture = rendered[name];
      const wav = Buffer.from(fixture.wav_base64, "base64");
      await writeFile(join(output_directory, `offline-${name}.wav`), wav);
      delete fixture.wav_base64;
    }
    const ten = rendered.ten,
      large = rendered.large;
    const large_plan = planned_metrics(voices.large),
      ten_plan = planned_metrics(voices.ten);
    const stereo_total = Object.values(large.stereo_energy).reduce((sum, value) => sum + value, 0);
    const stereo_bins = Object.values(large.stereo_energy).filter(
      (value) => value / Math.max(stereo_total, 1e-10) >= contract.stereo_bin_energy_fraction,
    ).length;
    const metrics = [
      metric(
        "source_provenance",
        { voices: voices.large.length },
        large_plan.finite && ten_plan.finite,
        "All directed voices retain finite worker source time, path, and pan.",
      ),
      metric(
        "opening_protection_ms",
        contract.opening_protection_ms,
        large_plan.finite,
        "Selected same-sector attacks obey director spacing.",
      ),
      metric(
        "early_duty_fraction",
        large.early_duty,
        large.early_duty >= contract.early_duty_fraction[0] &&
          large.early_duty <= contract.early_duty_fraction[1],
        "Rejects sparse openings and continuous walls.",
      ),
      metric(
        "early_broadband_fraction",
        large.broadband_fraction,
        large.broadband_fraction >= contract.early_broadband_fraction[0] &&
          large.broadband_fraction <= contract.early_broadband_fraction[1],
        "Requires a bounded attack/body balance.",
      ),
      metric(
        "large_vs_ten_scale",
        {
          duration_ratio: large.duration_ms / Math.max(ten.duration_ms, 1),
          exposure_ratio: large.exposure / Math.max(ten.exposure, 1e-10),
          onset_ratio: large.onset_groups.length / Math.max(ten.onset_groups.length, 1),
        },
        large.duration_ms / Math.max(ten.duration_ms, 1) >= contract.large_vs_ten_duration_ratio &&
          large.exposure / Math.max(ten.exposure, 1e-10) >= contract.large_vs_ten_exposure_ratio &&
          large.onset_groups.length / Math.max(ten.onset_groups.length, 1) >=
            contract.large_vs_ten_onset_ratio,
        "Large trace must develop beyond ten pins.",
      ),
      metric(
        "transient_preservation",
        {
          large_crest_db: large.crest_db,
          ten_crest_db: ten.crest_db,
          large_onsets: large.onset_groups.length,
        },
        large.crest_db >= ten.crest_db * contract.transient_ratio && large.onset_groups.length >= 2,
        "Opening retains detectable attacks.",
      ),
      metric(
        "stereo_regions",
        { bins: stereo_bins, energy: large.stereo_energy },
        stereo_bins >= 2 &&
          voices.large.some((voice) => voice.pan < 0) &&
          voices.large.some((voice) => voice.pan > 0),
        "At least two stereo regions carry the cascade.",
      ),
      metric(
        "master_safety",
        { large_peak: large.peak, ten_peak: ten.peak },
        [large, ten].every(
          (item) =>
            Number.isFinite(item.peak) &&
            item.peak > contract.activity_rms_floor &&
            item.peak < contract.pcm_peak_guard,
        ),
        "Offline post-master PCM is finite, audible, and below clipping.",
      ),
    ];
    return finished_report("offline_audio_cascade", contract, metrics, {
      renderer: "Chromium OfflineAudioContext",
      fixture_plans: voices,
      production_render_instructions: plans,
      rendered,
      provenance: contract.provenance,
    });
  } finally {
    await page.close();
  }
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

async function real_worker_report() {
  await command("./node_modules/.bin/tsx", [
    "devel/capture_real_gameplay_audio.mjs",
    "--base-url",
    base_url,
    "--output-directory",
    output_directory,
    "--timeout-seconds",
    "55",
    "--quiet",
  ]);
  const [large, ten] = await Promise.all([
    readFile(join(output_directory, "real_worker_990_complete_roll.json"), "utf8").then(JSON.parse),
    readFile(join(output_directory, "real_worker_ten_pin_strike.json"), "utf8").then(JSON.parse),
  ]);
  const state = (capture, name) => capture.states.find((entry) => entry.name === name);
  const summarize_collision = (capture) => {
    const diagnostics = capture.recording.audio_diagnostics;
    const scheduled = (diagnostics.collision_lifecycle ?? []).filter(
      (entry) => entry.event === "scheduled",
    );
    const attacks = scheduled.filter((entry) => entry.role !== "body");
    const sources = diagnostics.collision_sources ?? [];
    const delays = scheduled.flatMap((entry) => {
      const source = sources.find(
        (candidate) =>
          candidate.source_simulation_time_ms === entry.source_simulation_time_ms &&
          candidate.source_event_sequence === entry.source_event_sequence,
      );
      return source === undefined ? [] : [entry.observed_at_ms - source.observed_at_ms];
    });
    const intervals = scheduled
      .map((entry) => [entry.scheduled_audio_time_s, entry.actual_end_time_s])
      .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start);
    const edges = intervals
      .flatMap(([start, end]) => [
        [start, 1],
        [end, -1],
      ])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0;
    let peak_concurrency = 0;
    for (const [, delta] of edges) {
      active += delta;
      peak_concurrency = Math.max(peak_concurrency, active);
    }
    const attack_times = attacks
      .map((entry) => entry.scheduled_audio_time_s * 1000)
      .sort((a, b) => a - b);
    const onset_groups = attack_times.filter(
      (time, index) =>
        index === 0 || time - attack_times[index - 1] >= contract.onset_refractory_ms,
    );
    const first =
      intervals.length === 0 ? undefined : Math.min(...intervals.map(([start]) => start));
    const last = intervals.length === 0 ? undefined : Math.max(...intervals.map(([, end]) => end));
    const trace = diagnostics.trace ?? [];
    const trace_window = trace.filter(
      (sample) =>
        first !== undefined &&
        last !== undefined &&
        sample.context_time_s >= first &&
        sample.context_time_s <= last,
    );
    const exposure = trace_window.reduce((sum, sample) => sum + sample.rms * sample.rms, 0);
    const early = trace_window.filter((sample) => sample.context_time_s < (first ?? 0) + 1.2);
    const early_duty =
      early.filter((sample) => sample.rms >= contract.post_master_activity_rms_floor).length /
      Math.max(1, early.length);
    const stopped = new Set(
      (diagnostics.collision_lifecycle ?? [])
        .filter((entry) => entry.event === "stopped")
        .map((entry) => `${entry.scheduled_audio_time_s}:${entry.role}`),
    );
    const ended = new Set(
      (diagnostics.collision_lifecycle ?? [])
        .filter((entry) => entry.event === "ended")
        .map((entry) => `${entry.scheduled_audio_time_s}:${entry.role}`),
    );
    const disconnected = new Set(
      (diagnostics.collision_lifecycle ?? [])
        .filter((entry) => entry.event === "disconnected")
        .map((entry) => `${entry.scheduled_audio_time_s}:${entry.role}`),
    );
    return {
      scheduled,
      attacks,
      delays,
      peak_concurrency,
      onset_groups,
      duration_ms: first === undefined || last === undefined ? 0 : (last - first) * 1000,
      exposure,
      early_duty,
      lifecycle_clean: scheduled.every(
        (entry) =>
          (stopped.has(`${entry.scheduled_audio_time_s}:${entry.role}`) ||
            ended.has(`${entry.scheduled_audio_time_s}:${entry.role}`)) &&
          disconnected.has(`${entry.scheduled_audio_time_s}:${entry.role}`),
      ),
    };
  };
  const large_result = state(large, "result"),
    ten_result = state(ten, "result");
  const large_summary = summarize_collision(large),
    ten_summary = summarize_collision(ten);
  const final_edges = large.recording.audio_diagnostics.destination_edges ?? [];
  const post_settlement_collision = large_summary.scheduled.filter(
    (entry) => entry.observed_at_ms > large_result.page_time_ms + contract.post_settlement_grace_ms,
  );
  const metrics = [
    metric(
      "worker_results",
      { fallen_pins: Number(large_result?.fallen_pins), ten_result: ten_result?.result_message },
      Number(large_result?.fallen_pins) >= contract.minimum_fallen_pins &&
        ten_result?.result_message === "Strike!",
      "Both outcomes come from normal worker-driven controls.",
    ),
    metric(
      "source_to_audio_ms",
      {
        delays: large_summary.delays,
        labelled_attacks: large_summary.attacks.length,
      },
      large_summary.delays.length > 0 &&
        large_summary.delays.every(
          (delay) =>
            delay >= contract.source_audio_delay_ms[0] &&
            delay <= contract.source_audio_delay_ms[1],
        ),
      "Each reported scheduling delay joins a directed physical source to its own attack voice.",
    ),
    metric(
      "real_scale_and_articulation",
      { large: large_summary, ten: ten_summary },
      large_summary.duration_ms >= ten_summary.duration_ms * contract.large_vs_ten_duration_ratio &&
        large_summary.exposure >= ten_summary.exposure * contract.large_vs_ten_exposure_ratio &&
        large_summary.onset_groups.length >=
          ten_summary.onset_groups.length * contract.large_vs_ten_onset_ratio &&
        large_summary.early_duty >= contract.early_duty_fraction[0] &&
        large_summary.early_duty <= contract.early_duty_fraction[1],
      "Labelled production collisions establish larger duration, energy, onsets, and non-wall opening duty.",
    ),
    metric(
      "master_safety",
      {
        large: large.acceptance,
        ten: ten.acceptance,
        provenance: large.recording.audio_diagnostics.tap_provenance,
      },
      large.acceptance.non_silent &&
        large.acceptance.peak_below_clipping_guard &&
        ten.acceptance.non_silent &&
        ten.acceptance.peak_below_clipping_guard &&
        large.recording.audio_diagnostics.tap_provenance === contract.provenance &&
        final_edges.some((edge) => edge.node_name === "DynamicsCompressorNode"),
      "Captured graph observes the production compressor's final destination edge and remains safe.",
    ),
    metric(
      "bounded_cost",
      {
        peak_concurrency: large_summary.peak_concurrency,
        cap: contract.declared_controller_cap,
        lifecycle_clean: large_summary.lifecycle_clean,
        post_settlement_collision: post_settlement_collision.length,
      },
      large_summary.peak_concurrency <= contract.declared_controller_cap &&
        large_summary.lifecycle_clean &&
        post_settlement_collision.length === 0,
      "Every directed collision voice remains within the exported live cap and cleans itself without a forced mute.",
    ),
  ];
  return finished_report("real_worker_audio_cascade", contract, metrics, {
    captures: { large, ten },
  });
}

async function publish_listenable_diagnostics(real) {
  const media = [
    ["offline-large.wav", "offline-large-spectrogram.png"],
    ["offline-ten.wav", "offline-ten-spectrogram.png"],
    ["real_worker_990_complete_roll.webm", "real-worker-990-spectrogram.png"],
    ["real_worker_ten_pin_strike.webm", "real-worker-ten-spectrogram.png"],
  ];
  for (const [input, image] of media)
    await command("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      join(output_directory, input),
      "-lavfi",
      "showspectrumpic=s=1200x600:legend=disabled",
      join(output_directory, image),
    ]);
  const wave_files = [];
  for (const [id, capture] of Object.entries(real.captures)) {
    const name = `post-master-${id}.wav`;
    await command("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      capture.output_path,
      "-map",
      "0:a:0",
      join(output_directory, name),
    ]);
    wave_files.push(name);
  }
  return {
    lossless_audio: ["offline-large.wav", "offline-ten.wav", ...wave_files],
    spectrograms: media.map(([, image]) => image),
    note: "Inspectable diagnostics; JSON metrics remain the unattended gate.",
  };
}

async function main() {
  await rm(output_directory, { recursive: true, force: true });
  await mkdir(output_directory, { recursive: true });
  let server;
  let browser;
  try {
    await command("npm", ["run", "build"]);
    server = await start_server();
    browser = await chromium.launch({ headless: true });
    const offline = await offline_report(browser);
    await writeFile(
      join(output_directory, "offline-report.json"),
      `${JSON.stringify(offline, null, 2)}\n`,
    );
    if (!offline.passed)
      throw new Error(`Offline evidence failed: ${offline.failed_metric_names.join(", ")}`);
    const real = await real_worker_report();
    const diagnostics = await publish_listenable_diagnostics(real);
    await writeFile(
      join(output_directory, "real-worker-report.json"),
      `${JSON.stringify(real, null, 2)}\n`,
    );
    if (!real.passed)
      throw new Error(`Real-worker evidence failed: ${real.failed_metric_names.join(", ")}`);
    await command("npm", ["run", "benchmark"]);
    const summary = finished_report(
      "audio_cascade_terminal_summary",
      contract,
      [
        metric("offline", offline.passed, offline.passed, "Offline report"),
        metric("real_worker", real.passed, real.passed, "Real worker report"),
        metric("benchmark", true, true, "npm run benchmark"),
      ],
      {
        reports: ["offline-report.json", "real-worker-report.json"],
        diagnostics,
        output_directory,
      },
    );
    await writeFile(
      join(output_directory, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    if (!summary.passed) throw new Error("Terminal evidence summary failed.");
  } finally {
    if (browser !== undefined) await browser.close();
    if (server !== undefined) await new Promise((resolve_close) => server.close(resolve_close));
  }
}
main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exitCode = 1;
});
