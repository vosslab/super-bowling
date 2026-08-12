import type {
  AudioBackendFactory,
  AudioBufferLike,
  AudioBufferSourceLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterLike,
  GainLike,
} from "./audio_backend";
import { create_collision_sound } from "./collision_audio";
import {
  create_cascade_director,
  type DirectedCollisionVoice,
  type TimedCollisionSound,
} from "./cascade_director";
import {
  collision_mix_levels,
  collision_render_instruction,
  maximum_concurrent_collision_cues,
  safe_collision_slice,
  type CollisionSampleBank,
} from "./collision_render_contract";

export type ResultSound = "strike" | "spare" | "open" | "complete";
export type AudioController = {
  /** Starts local sample downloads without constructing or resuming an audio context. */
  preload(): void;
  activate(): void;
  set_muted(muted: boolean): void;
  start_roll(): void;
  stop_roll(): void;
  /** Shapes the rolling texture from a normalized physical speed without taking a simulation dependency. */
  update_roll_speed(normalized_speed: number): void;
  /** Preferred semantic input from real physics impact windows. */
  record_impact(cue: TimedCollisionSound): void;
  play_result(result: ResultSound): void;
  dispose(): void;
};

/** A quiet loop of filtered noise, shaped by physical ball speed. */
type RollingVoice = {
  source: AudioBufferSourceLike;
  filter: BiquadFilterLike | undefined;
  gain: GainLike;
  gain_scale: number;
};
type ActiveCollisionCue = { end_time_s: number; stop(): void };
type AudioMix = {
  lane: GainLike;
  collision_attack: GainLike;
  collision_body: GainLike;
  result: GainLike;
};
type SampleName = "impact" | "clatter" | "roll" | "knock" | "thump" | "clack";
type AudioSampleBank = Partial<Record<SampleName, AudioBufferLike>> & CollisionSampleBank;
type AudioSampleBytes = Partial<Record<SampleName, ArrayBuffer>>;
type ResultHit = {
  at_s: number;
  noise_frequency: number;
  noise_gain: number;
  noise_duration_s: number;
  thump_frequency: number;
  thump_gain: number;
  thump_duration_s: number;
  chime_frequency?: number;
  chime_gain?: number;
};
/**
 * The recorded samples need enough room to reach their physical attack and
 * decay.  This is also the scheduler's ownership window, so dense racks
 * cannot accumulate unbounded long-lived sample voices.
 */
const recorded_roll_gain_scale = 25;
const sample_paths: Record<SampleName, string> = {
  impact: "./assets/audio/bowling_impact_1.ogg",
  clatter: "./assets/audio/bowling_pin_clatter_1.ogg",
  roll: "./assets/audio/bowling_roll_1.ogg",
  knock: "./assets/audio/pin_knock_1.ogg",
  thump: "./assets/audio/low_thump_1.ogg",
  clack: "./assets/audio/ceramic_clack_1.ogg",
};
const result_motifs: Record<ResultSound, readonly ResultHit[]> = {
  // A wide first crash followed by a bright, climbing pair marks the strongest standard result.
  strike: [
    {
      at_s: 0,
      noise_frequency: 1900,
      noise_gain: 0.21,
      noise_duration_s: 0.035,
      thump_frequency: 82,
      thump_gain: 0.15,
      thump_duration_s: 0.1,
    },
    {
      at_s: 0.09,
      noise_frequency: 2700,
      noise_gain: 0.12,
      noise_duration_s: 0.025,
      thump_frequency: 130,
      thump_gain: 0.075,
      thump_duration_s: 0.06,
      chime_frequency: 740,
      chime_gain: 0.065,
    },
    {
      at_s: 0.18,
      noise_frequency: 3400,
      noise_gain: 0.095,
      noise_duration_s: 0.02,
      thump_frequency: 175,
      thump_gain: 0.052,
      thump_duration_s: 0.045,
      chime_frequency: 990,
      chime_gain: 0.08,
    },
  ],
  // A compact double tap and cool high accent distinguish a spare from a strike.
  spare: [
    {
      at_s: 0,
      noise_frequency: 1450,
      noise_gain: 0.13,
      noise_duration_s: 0.028,
      thump_frequency: 105,
      thump_gain: 0.09,
      thump_duration_s: 0.075,
    },
    {
      at_s: 0.1,
      noise_frequency: 2400,
      noise_gain: 0.095,
      noise_duration_s: 0.022,
      thump_frequency: 155,
      thump_gain: 0.052,
      thump_duration_s: 0.05,
      chime_frequency: 830,
      chime_gain: 0.065,
    },
  ],
  // An ordinary frame receives a muted deck acknowledgement rather than celebration.
  open: [
    {
      at_s: 0,
      noise_frequency: 760,
      noise_gain: 0.075,
      noise_duration_s: 0.025,
      thump_frequency: 74,
      thump_gain: 0.065,
      thump_duration_s: 0.06,
    },
  ],
  // Completion uses the strike language at lower weight, then resolves upward.
  complete: [
    {
      at_s: 0,
      noise_frequency: 1500,
      noise_gain: 0.14,
      noise_duration_s: 0.03,
      thump_frequency: 90,
      thump_gain: 0.1,
      thump_duration_s: 0.08,
    },
    {
      at_s: 0.11,
      noise_frequency: 2500,
      noise_gain: 0.09,
      noise_duration_s: 0.024,
      thump_frequency: 145,
      thump_gain: 0.058,
      thump_duration_s: 0.055,
      chime_frequency: 700,
      chime_gain: 0.055,
    },
    {
      at_s: 0.22,
      noise_frequency: 3100,
      noise_gain: 0.08,
      noise_duration_s: 0.02,
      thump_frequency: 180,
      thump_gain: 0.046,
      thump_duration_s: 0.045,
      chime_frequency: 940,
      chime_gain: 0.07,
    },
  ],
};
function create_browser_audio_backend(): AudioContextLike {
  return new AudioContext();
}
function set_audio_value(parameter: AudioParamLike, value: number, time_s: number): void {
  if (parameter.setValueAtTime !== undefined) {
    parameter.setValueAtTime(value, time_s);
    return;
  }
  parameter.value = value;
}
function ramp_audio_value(parameter: AudioParamLike, value: number, time_s: number): void {
  if (parameter.linearRampToValueAtTime !== undefined) {
    parameter.linearRampToValueAtTime(value, time_s);
    return;
  }
  parameter.value = value;
}
function stop_rolling_voice(voice: RollingVoice | undefined, time_s: number): void {
  if (voice === undefined) return;
  ramp_audio_value(voice.gain.gain, 0, time_s + 0.025);
  stop_source(voice.source, time_s + 0.035);
  voice.gain.disconnect?.();
}

function clamp_normalized_speed(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function rolling_filter_frequency(speed: number): number {
  return 360 + speed * 900;
}

function rolling_gain(speed: number): number {
  return 0.012 + speed * 0.022;
}

/**
 * Keeps the lane bed deliberately subordinate while preserving headroom for
 * several physical contacts and a result motif.  The compressor is a final
 * safety boundary; individual cue scheduling still owns the musical balance.
 */
function create_audio_mix(context: AudioContextLike): AudioMix {
  const lane = context.createGain();
  const collision_attack = context.createGain();
  const collision_body = context.createGain();
  const result = context.createGain();
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const time_s = context.currentTime;
  set_audio_value(lane.gain, 0.72, time_s);
  set_audio_value(collision_attack.gain, collision_mix_levels.attack, time_s);
  set_audio_value(collision_body.gain, collision_mix_levels.body, time_s);
  set_audio_value(result.gain, 0.9, time_s);
  set_audio_value(master.gain, collision_mix_levels.master, time_s);
  set_audio_value(limiter.threshold, -10, time_s);
  set_audio_value(limiter.knee, 14, time_s);
  set_audio_value(limiter.ratio, 12, time_s);
  set_audio_value(limiter.attack, 0.003, time_s);
  set_audio_value(limiter.release, 0.14, time_s);
  lane.connect(master);
  collision_attack.connect(master);
  collision_body.connect(master);
  result.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
  return { lane, collision_attack, collision_body, result };
}

function update_rolling_voice(voice: RollingVoice, speed: number, time_s: number): void {
  if (voice.filter !== undefined)
    ramp_audio_value(voice.filter.frequency, rolling_filter_frequency(speed), time_s + 0.035);
  if (voice.source.playbackRate !== undefined)
    ramp_audio_value(voice.source.playbackRate, 0.82 + speed * 0.22, time_s + 0.035);
  ramp_audio_value(voice.gain.gain, rolling_gain(speed) * voice.gain_scale, time_s + 0.035);
}

/**
 * Fetching static, same-origin sample bytes is safe before a player gesture.
 * Decoding remains activation-owned because it requires an AudioContext.
 */
async function fetch_sample_bytes(): Promise<AudioSampleBytes> {
  if (typeof fetch === "undefined") return {};
  try {
    const entries = await Promise.all(
      (Object.entries(sample_paths) as Array<[SampleName, string]>).map(async ([name, path]) => {
        try {
          const response = await fetch(path);
          if (!response.ok) return undefined;
          return [name, await response.arrayBuffer()] as const;
        } catch {
          // The procedural voice remains the local/offline fallback for a missing sample.
          return undefined;
        }
      }),
    );
    return Object.fromEntries(
      entries.filter((entry): entry is readonly [SampleName, ArrayBuffer] => entry !== undefined),
    );
  } catch {
    return {};
  }
}

async function decode_sample_bank(
  context: AudioContextLike,
  sample_bytes: AudioSampleBytes,
): Promise<AudioSampleBank> {
  if (context.decodeAudioData === undefined) return {};
  try {
    const entries = await Promise.all(
      (Object.entries(sample_bytes) as Array<[SampleName, ArrayBuffer]>).map(
        async ([name, bytes]) => {
          try {
            return [name, await context.decodeAudioData!(bytes)] as const;
          } catch {
            // A bad decode is isolated to this layer; the other samples and fallback remain usable.
            return undefined;
          }
        },
      ),
    );
    return Object.fromEntries(
      entries.filter(
        (entry): entry is readonly [SampleName, AudioBufferLike] => entry !== undefined,
      ),
    );
  } catch {
    return {};
  }
}

function create_noise_buffer(context: AudioContextLike, duration_s: number): AudioBufferLike {
  const length = Math.max(1, Math.floor(context.sampleRate * duration_s));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    samples[index] = white * (1 - index / samples.length);
  }
  return buffer;
}

/** Web Audio sources may already have reached their scheduled endpoint. */
function stop_source(source: { stop(stop_time?: number): void }, time_s: number): void {
  try {
    source.stop(time_s);
  } catch {
    // Stopping a one-shot source is cleanup, never a reason to lose a later result cue.
  }
}

function clamp_pan(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
}

/** Connects one short voice through an equal-power stereo position when the backend supports it. */
function connect_spatial_output(
  context: AudioContextLike,
  output: AudioNodeLike,
  destination: AudioNodeLike,
  pan: number,
): () => void {
  const panner = context.createStereoPanner?.();
  if (panner === undefined) {
    output.connect(destination);
    return () => output.disconnect?.();
  }
  set_audio_value(panner.pan, clamp_pan(pan), context.currentTime);
  output.connect(panner);
  panner.connect(destination);
  return () => {
    output.disconnect?.();
    panner.disconnect?.();
  };
}

/** Creates a deliberately quiet, non-tonal rolling surface rather than a motor-like pitch. */
function create_lane_texture_buffer(context: AudioContextLike): AudioBufferLike {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.32));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x9e3779b9;
  let previous = 0;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    previous = previous * 0.82 + white * 0.18;
    samples[index] = previous * 0.7;
  }
  return buffer;
}

/**
 * Overlap-adds the short recorded roll into a periodic texture without replaying
 * its authored attack and long fade every half second.
 */
function create_seamless_rolling_sample(
  context: AudioContextLike,
  recorded_sample: AudioBufferLike,
): AudioBufferLike {
  const input = recorded_sample.getChannelData(0);
  if (input.length < 4) return recorded_sample;
  const hop_length = Math.floor(input.length / 2);
  const output_length = hop_length * 4;
  const output_buffer = context.createBuffer(1, output_length, context.sampleRate);
  const output = output_buffer.getChannelData(0);
  const weights = new Float32Array(output_length);
  for (let start = -input.length; start < output_length + input.length; start += hop_length) {
    for (let offset = 0; offset < input.length; offset += 1) {
      const destination = start + offset;
      if (destination < 0 || destination >= output_length) continue;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / (input.length - 1));
      output[destination] = output[destination]! + input[offset]! * window;
      weights[destination] = weights[destination]! + window;
    }
  }
  for (let index = 0; index < output.length; index += 1) {
    if (weights[index]! > 0) output[index] = output[index]! / weights[index]!;
  }
  return output_buffer;
}

function play_noise_transient(
  context: AudioContextLike,
  destination: AudioNodeLike,
  buffer: AudioBufferLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
  start_time_s = context.currentTime,
  pan = 0,
): () => void {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = start_time_s;
  source.buffer = buffer;
  filter.type = "bandpass";
  set_audio_value(filter.frequency, frequency, start);
  set_audio_value(gain.gain, peak_gain, start);
  ramp_audio_value(gain.gain, 0, start + duration_s);
  source.connect(filter);
  filter.connect(gain);
  const disconnect_output = connect_spatial_output(context, gain, destination, pan);
  source.start(start);
  source.stop(start + duration_s + 0.005);
  return () => {
    stop_source(source, context.currentTime);
    source.disconnect?.();
    filter.disconnect?.();
    disconnect_output();
  };
}
function play_resonant_thump(
  context: AudioContextLike,
  destination: AudioNodeLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
  start_time_s = context.currentTime,
  pan = 0,
): () => void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = start_time_s;
  oscillator.type = "triangle";
  set_audio_value(oscillator.frequency, frequency * 1.35, start);
  ramp_audio_value(oscillator.frequency, frequency, start + duration_s);
  set_audio_value(gain.gain, peak_gain, start);
  ramp_audio_value(gain.gain, 0, start + duration_s);
  oscillator.connect(gain);
  const disconnect_output = connect_spatial_output(context, gain, destination, pan);
  oscillator.start(start);
  oscillator.stop(start + duration_s + 0.005);
  return () => {
    stop_source(oscillator, context.currentTime);
    oscillator.disconnect?.();
    disconnect_output();
  };
}
function play_brief_chime(
  context: AudioContextLike,
  destination: AudioNodeLike,
  frequency: number,
  peak_gain: number,
  start_time_s: number,
): () => void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  set_audio_value(oscillator.frequency, frequency, start_time_s);
  set_audio_value(gain.gain, peak_gain, start_time_s);
  ramp_audio_value(gain.gain, 0, start_time_s + 0.09);
  oscillator.connect(gain);
  const disconnect_output = connect_spatial_output(context, gain, destination, 0);
  oscillator.start(start_time_s);
  oscillator.stop(start_time_s + 0.1);
  return () => {
    stop_source(oscillator, context.currentTime);
    oscillator.disconnect?.();
    disconnect_output();
  };
}

type RenderedVoice = { end_time_s: number; stop(): void };

type CollisionLifecycle = {
  source_simulation_time_ms: number;
  source_event_sequence?: number;
  path: DirectedCollisionVoice["source_path"];
  role: DirectedCollisionVoice["role"];
  scheduled_audio_time_s: number;
  offset_s: number;
  duration_s: number;
  actual_end_time_s: number;
  event: "scheduled" | "ended" | "stopped" | "disconnected";
};
function record_collision_lifecycle(entry: CollisionLifecycle): void {
  const receiver = (
    globalThis as typeof globalThis & {
      __super_bowling_collision_audio_lifecycle__?: (entry: CollisionLifecycle) => void;
    }
  ).__super_bowling_collision_audio_lifecycle__;
  receiver?.(Object.freeze({ ...entry }));
}
function record_collision_source(cue: TimedCollisionSound): void {
  const receiver = (
    globalThis as typeof globalThis & {
      __super_bowling_collision_audio_source__?: (entry: {
        source_simulation_time_ms: number;
        source_event_sequence?: number;
      }) => void;
    }
  ).__super_bowling_collision_audio_source__;
  receiver?.(
    Object.freeze({
      source_simulation_time_ms: cue.source_simulation_time_ms,
      ...(cue.source_event_sequence === undefined
        ? {}
        : { source_event_sequence: cue.source_event_sequence }),
    }),
  );
}

function play_sample(
  context: AudioContextLike,
  destination: AudioNodeLike,
  buffer: AudioBufferLike,
  peak_gain: number,
  playback_rate: number,
  duration_s: number,
  start_time_s = context.currentTime,
  pan = 0,
  offset_s = 0,
  lowpass_hz?: number,
  on_ended?: () => void,
): RenderedVoice | undefined {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = lowpass_hz === undefined ? undefined : context.createBiquadFilter();
  const start = start_time_s;
  source.buffer = buffer;
  source.loop = false;
  set_audio_value(source.playbackRate ?? { value: 1 }, playback_rate, start);
  set_audio_value(gain.gain, peak_gain, start);
  source.connect(gain);
  if (filter !== undefined) {
    filter.type = "lowpass";
    set_audio_value(filter.frequency, lowpass_hz!, start);
    gain.connect(filter);
  }
  const disconnect_output = connect_spatial_output(context, filter ?? gain, destination, pan);
  const slice = safe_collision_slice(buffer.duration, offset_s, duration_s);
  if (slice === undefined) {
    source.disconnect?.();
    filter?.disconnect?.();
    disconnect_output();
    return undefined;
  }
  const safe_rate = Math.max(0.05, Number.isFinite(playback_rate) ? playback_rate : 1);
  const rendered_duration_s = slice.duration_s / safe_rate;
  ramp_audio_value(gain.gain, 0, start + rendered_duration_s);
  source.start(start, slice.offset_s, slice.duration_s);
  const end_time_s = start + rendered_duration_s;
  source.onended = () => {
    source.disconnect?.();
    filter?.disconnect?.();
    disconnect_output();
    on_ended?.();
  };
  source.stop(end_time_s + 0.01);
  return {
    end_time_s,
    stop: () => {
      stop_source(source, context.currentTime);
      source.disconnect?.();
      filter?.disconnect?.();
      disconnect_output();
    },
  };
}

/** Renders the pure director's three roles without burst-clumping one window. */
function play_directed_collision(
  context: AudioContextLike,
  destination: AudioNodeLike,
  noise: AudioBufferLike,
  sample_bank: AudioSampleBank,
  voice: DirectedCollisionVoice,
  start_time_s: number,
): RenderedVoice {
  const instruction = collision_render_instruction(voice, sample_bank);
  const sample = instruction === undefined ? undefined : sample_bank[instruction.sample_name];
  if (sample !== undefined && instruction !== undefined) {
    const lifecycle_base = {
      source_simulation_time_ms: voice.source_simulation_time_ms,
      ...(voice.source_event_sequence === undefined
        ? {}
        : { source_event_sequence: voice.source_event_sequence }),
      path: voice.source_path,
      role: voice.role,
      scheduled_audio_time_s: start_time_s,
      offset_s: instruction.offset_s,
      duration_s: instruction.duration_s,
      actual_end_time_s: start_time_s + instruction.duration_s / instruction.playback_rate,
    } as const;
    const rendered = play_sample(
      context,
      destination,
      sample,
      instruction.gain,
      instruction.playback_rate,
      instruction.duration_s,
      start_time_s,
      instruction.pan,
      instruction.offset_s,
      instruction.lowpass_hz,
      () => {
        record_collision_lifecycle({ ...lifecycle_base, event: "ended" });
        record_collision_lifecycle({ ...lifecycle_base, event: "disconnected" });
      },
    );
    if (rendered !== undefined) {
      const lifecycle = { ...lifecycle_base, actual_end_time_s: rendered.end_time_s } as const;
      record_collision_lifecycle({ ...lifecycle, event: "scheduled" });
      return {
        end_time_s: rendered.end_time_s,
        stop: () => {
          rendered.stop();
          record_collision_lifecycle({ ...lifecycle, event: "stopped" });
          record_collision_lifecycle({ ...lifecycle, event: "disconnected" });
        },
      };
    }
  }
  if (voice.role === "body") {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "triangle";
    set_audio_value(oscillator.frequency, 86, start_time_s);
    set_audio_value(filter.frequency, 280, start_time_s);
    filter.type = "lowpass";
    set_audio_value(gain.gain, voice.gain * 0.65, start_time_s);
    ramp_audio_value(gain.gain, 0, start_time_s + voice.sample_duration_s);
    oscillator.connect(filter);
    filter.connect(gain);
    const disconnect_output = connect_spatial_output(context, gain, destination, voice.pan);
    oscillator.start(start_time_s);
    const end_time_s = start_time_s + voice.sample_duration_s;
    oscillator.stop(end_time_s + 0.005);
    return {
      end_time_s,
      stop: () => {
        stop_source(oscillator, context.currentTime);
        oscillator.disconnect?.();
        filter.disconnect?.();
        disconnect_output();
      },
    };
  }
  const duration_s = Math.min(0.075, voice.sample_duration_s);
  const stop = play_noise_transient(
    context,
    destination,
    noise,
    voice.role === "hero" ? 2100 : voice.source_path === "deck" ? 1250 : 940,
    voice.gain * 0.72,
    duration_s,
    start_time_s,
    voice.pan,
  );
  return { end_time_s: start_time_s + duration_s, stop };
}
function play_result_motif(
  context: AudioContextLike,
  destination: AudioNodeLike,
  noise: AudioBufferLike,
  result: ResultSound,
): Array<() => void> {
  const stop_layers: Array<() => void> = [];
  const start = context.currentTime;
  for (const hit of result_motifs[result]) {
    const hit_time = start + hit.at_s;
    stop_layers.push(
      play_noise_transient(
        context,
        destination,
        noise,
        hit.noise_frequency,
        hit.noise_gain,
        hit.noise_duration_s,
        hit_time,
      ),
      play_resonant_thump(
        context,
        destination,
        hit.thump_frequency,
        hit.thump_gain,
        hit.thump_duration_s,
        hit_time,
      ),
    );
    if (hit.chime_frequency !== undefined && hit.chime_gain !== undefined)
      stop_layers.push(
        play_brief_chime(context, destination, hit.chime_frequency, hit.chime_gain, hit_time),
      );
  }
  return stop_layers;
}
function create_rolling_voice(
  context: AudioContextLike,
  destination: AudioNodeLike,
  texture: AudioBufferLike,
  speed: number,
  gain_scale: number,
): RollingVoice {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = texture;
  source.loop = true;
  filter.type = "lowpass";
  set_audio_value(filter.frequency, rolling_filter_frequency(speed), start);
  set_audio_value(gain.gain, rolling_gain(speed) * gain_scale, start);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(start);
  return { source, filter, gain, gain_scale };
}

export function create_audio_controller(
  create_backend: AudioBackendFactory = create_browser_audio_backend,
): AudioController {
  let context: AudioContextLike | undefined;
  let mix: AudioMix | undefined;
  let noise_buffer: AudioBufferLike | undefined;
  let lane_texture_buffer: AudioBufferLike | undefined;
  let sample_bank: AudioSampleBank = {};
  let sample_bytes_load: Promise<AudioSampleBytes> | undefined;
  let sample_decode_load: Promise<AudioSampleBank> | undefined;
  let muted = false;
  let rolling_voice: RollingVoice | undefined;
  let roll_active = false;
  let impact_started = false;
  let disposed = false;
  let roll_speed = 0;
  let active_collision_cues: ActiveCollisionCue[] = [];
  let active_result_cues: ActiveCollisionCue[] = [];
  const cascade_director = create_cascade_director();
  let source_time_anchor_ms: number | undefined;
  let audio_time_anchor_s: number | undefined;
  function can_play(): boolean {
    return context !== undefined && !muted && !disposed;
  }
  function begin_sample_preload(): Promise<AudioSampleBytes> {
    if (sample_bytes_load === undefined) sample_bytes_load = fetch_sample_bytes().catch(() => ({}));
    return sample_bytes_load;
  }
  function install_sample_bank(loaded: AudioSampleBank): void {
    if (disposed || context === undefined) return;
    const recorded_roll = loaded.roll;
    sample_bank = {
      ...loaded,
      ...(recorded_roll === undefined
        ? {}
        : { roll: create_seamless_rolling_sample(context, recorded_roll) }),
    };
    if (!roll_active || impact_started || muted || rolling_voice === undefined) return;
    if (sample_bank.roll === undefined || mix === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = create_rolling_voice(
      context,
      mix.lane,
      sample_bank.roll,
      roll_speed,
      recorded_roll_gain_scale,
    );
  }
  function decode_preloaded_samples(): void {
    if (context === undefined || sample_decode_load !== undefined) return;
    const decoding_context = context;
    sample_decode_load = begin_sample_preload().then((sample_bytes) =>
      decode_sample_bank(decoding_context, sample_bytes),
    );
    void sample_decode_load.then((loaded) => {
      if (context !== decoding_context) return;
      install_sample_bank(loaded);
    });
  }
  function preload(): void {
    if (disposed) return;
    void begin_sample_preload();
  }
  function activate(): void {
    if (disposed) return;
    if (context === undefined) {
      context = create_backend();
      mix = create_audio_mix(context);
    }
    void context.resume().catch(() => undefined);
    decode_preloaded_samples();
  }
  function set_muted(next_muted: boolean): void {
    if (muted === next_muted) return;
    muted = next_muted;
    if (muted) {
      if (context === undefined) return;
      stop_rolling_voice(rolling_voice, context.currentTime);
      rolling_voice = undefined;
      active_collision_cues.forEach((cue) => cue.stop());
      active_collision_cues = [];
      active_result_cues.forEach((cue) => cue.stop());
      active_result_cues = [];
      return;
    }
    if (!roll_active || impact_started || context === undefined || disposed) return;
    if (rolling_voice === undefined) {
      if (lane_texture_buffer === undefined)
        lane_texture_buffer = create_lane_texture_buffer(context);
      if (mix === undefined) return;
      rolling_voice = create_rolling_voice(
        context,
        mix.lane,
        sample_bank.roll ?? lane_texture_buffer,
        roll_speed,
        sample_bank.roll === undefined ? 1 : recorded_roll_gain_scale,
      );
    }
  }
  function start_roll(): void {
    if (disposed) return;
    roll_active = true;
    impact_started = false;
    active_collision_cues.forEach((cue) => cue.stop());
    active_collision_cues = [];
    active_result_cues.forEach((cue) => cue.stop());
    active_result_cues = [];
    cascade_director.reset();
    source_time_anchor_ms = undefined;
    audio_time_anchor_s = undefined;
    if (!can_play() || rolling_voice !== undefined || context === undefined) return;
    if (lane_texture_buffer === undefined)
      lane_texture_buffer = create_lane_texture_buffer(context);
    if (mix === undefined) return;
    rolling_voice = create_rolling_voice(
      context,
      mix.lane,
      sample_bank.roll ?? lane_texture_buffer,
      roll_speed,
      sample_bank.roll === undefined ? 1 : recorded_roll_gain_scale,
    );
  }
  function stop_roll(): void {
    roll_active = false;
    if (context === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = undefined;
    active_collision_cues.forEach((cue) => cue.stop());
    active_collision_cues = [];
    active_result_cues.forEach((cue) => cue.stop());
    active_result_cues = [];
    cascade_director.reset();
    source_time_anchor_ms = undefined;
    audio_time_anchor_s = undefined;
  }
  function update_roll_speed(normalized_speed: number): void {
    roll_speed = clamp_normalized_speed(normalized_speed);
    if (!can_play() || context === undefined || rolling_voice === undefined) return;
    update_rolling_voice(rolling_voice, roll_speed, context.currentTime);
  }
  function prune_collision_cues(time_s: number): void {
    const live_cues: ActiveCollisionCue[] = [];
    for (const cue of active_collision_cues) {
      if (cue.end_time_s > time_s) live_cues.push(cue);
      else cue.stop();
    }
    active_collision_cues = live_cues;
  }
  function anchored_audio_time(source_time_ms: number, delay_ms: number): number | undefined {
    if (context === undefined || !Number.isFinite(source_time_ms)) return undefined;
    if (source_time_anchor_ms === undefined || audio_time_anchor_s === undefined) {
      source_time_anchor_ms = source_time_ms;
      audio_time_anchor_s = context.currentTime;
    }
    return Math.max(
      context.currentTime,
      audio_time_anchor_s + (source_time_ms - source_time_anchor_ms + delay_ms) / 1000,
    );
  }
  function emit_collision(timed: TimedCollisionSound): void {
    if (!can_play() || context === undefined) return;
    const sound = create_collision_sound(timed);
    if (sound === undefined) return;
    if (noise_buffer === undefined) noise_buffer = create_noise_buffer(context, 0.09);
    if (mix === undefined) return;
    const plan = cascade_director.direct({ ...timed, ...sound });
    if (plan.voices.length === 0) return;
    // Attacks own their onset. Only the low body branch ducks; lane and result
    // routes remain independent so a collision cannot erase game feedback.
    for (const voice of plan.voices) {
      if (voice.role === "body") continue;
      const attack_time_s = anchored_audio_time(voice.source_simulation_time_ms, voice.delay_ms);
      if (attack_time_s === undefined) continue;
      set_audio_value(
        mix.collision_body.gain,
        0.52,
        Math.max(context.currentTime, attack_time_s - 0.008),
      );
      ramp_audio_value(mix.collision_body.gain, 0.18, attack_time_s + 0.004);
      ramp_audio_value(mix.collision_body.gain, 0.52, attack_time_s + 0.12);
    }
    prune_collision_cues(context.currentTime);
    const available_voice_slots = maximum_concurrent_collision_cues - active_collision_cues.length;
    const scheduled_layers = plan.voices.slice(0, available_voice_slots).flatMap((voice) => {
      const start_time_s = anchored_audio_time(voice.source_simulation_time_ms, voice.delay_ms);
      if (start_time_s === undefined) return [];
      const rendered = play_directed_collision(
        context!,
        voice.role === "body" ? mix!.collision_body : mix!.collision_attack,
        noise_buffer!,
        sample_bank,
        voice,
        start_time_s,
      );
      return [{ stop: rendered.stop, end_time_s: rendered.end_time_s }];
    });
    if (scheduled_layers.length === 0) return;
    active_collision_cues.push(...scheduled_layers);
    if (sound.first_contact) {
      impact_started = true;
      stop_rolling_voice(rolling_voice, context.currentTime);
      rolling_voice = undefined;
    }
  }
  function record_impact(cue: TimedCollisionSound): void {
    if (!roll_active || !can_play()) return;
    record_collision_source(cue);
    emit_collision(cue);
  }
  function play_result(result: ResultSound): void {
    if (!can_play() || context === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = undefined;
    active_result_cues.forEach((cue) => cue.stop());
    active_result_cues = [];
    if (noise_buffer === undefined) noise_buffer = create_noise_buffer(context, 0.09);
    if (mix === undefined) return;
    const stop_layers = play_result_motif(context, mix.result, noise_buffer, result);
    active_result_cues.push({
      end_time_s: context.currentTime + 0.36,
      stop: () => stop_layers.forEach((stop_layer) => stop_layer()),
    });
  }
  function dispose(): void {
    if (disposed) return;
    stop_roll();
    disposed = true;
    if (context !== undefined) void context.close();
  }
  return {
    preload,
    activate,
    set_muted,
    start_roll,
    stop_roll,
    update_roll_speed,
    record_impact,
    play_result,
    dispose,
  };
}
