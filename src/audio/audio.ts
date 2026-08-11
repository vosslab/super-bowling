import { create_collision_sound, type CollisionSound } from "./collision_audio";

export type ResultSound = "strike" | "spare" | "open" | "complete";

export type AudioParamLike = {
  value: number;
  setValueAtTime?(value: number, start_time: number): void;
  linearRampToValueAtTime?(value: number, end_time: number): void;
};

export type AudioNodeLike = { connect(destination: AudioNodeLike): void; disconnect?(): void };
export type OscillatorLike = AudioNodeLike & {
  frequency: AudioParamLike;
  type: OscillatorType;
  start(start_time?: number): void;
  stop(stop_time?: number): void;
};
export type GainLike = AudioNodeLike & { gain: AudioParamLike };
export type BiquadFilterLike = AudioNodeLike & {
  frequency: AudioParamLike;
  type: BiquadFilterType;
};
export type DynamicsCompressorLike = AudioNodeLike & {
  threshold: AudioParamLike;
  knee: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
};
export type AudioBufferLike = { getChannelData(channel: number): Float32Array };
export type AudioBufferSourceLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
  loop?: boolean;
  playbackRate?: AudioParamLike;
  start(start_time?: number): void;
  stop(stop_time?: number): void;
};
export type AudioContextLike = {
  currentTime: number;
  sampleRate: number;
  destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): BiquadFilterLike;
  createDynamicsCompressor(): DynamicsCompressorLike;
  createBuffer(channel_count: number, length: number, sample_rate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceLike;
  decodeAudioData?(audio_data: ArrayBuffer): Promise<AudioBufferLike>;
};
export type AudioBackendFactory = () => AudioContextLike;
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
  record_impact(cue: CollisionSound): void;
  play_result(result: ResultSound): void;
  dispose(): void;
};

/** A quiet loop of filtered noise, shaped by physical ball speed. */
type RollingVoice = {
  source: AudioBufferSourceLike;
  filter: BiquadFilterLike | undefined;
  gain: GainLike;
  sample_backed: boolean;
};
type ActiveCollisionCue = { end_time_s: number; stop(): void };
type AudioMix = { lane: GainLike; collision: GainLike; result: GainLike };
type SampleName = "impact" | "clatter" | "roll" | "knock" | "thump" | "clack";
type AudioSampleBank = Partial<Record<SampleName, AudioBufferLike>>;
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
const maximum_concurrent_collision_cues = 4;
const maximum_secondary_collision_cues = maximum_concurrent_collision_cues - 1;
/**
 * The recorded samples need enough room to reach their physical attack and
 * decay.  This is also the scheduler's ownership window, so dense racks
 * cannot accumulate unbounded long-lived sample voices.
 */
const collision_cue_duration_s = 0.38;
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
  return 420 + speed * 1250;
}

function rolling_gain(speed: number): number {
  return 0.004 + speed * 0.012;
}

/**
 * Keeps the lane bed deliberately subordinate while preserving headroom for
 * several physical contacts and a result motif.  The compressor is a final
 * safety boundary; individual cue scheduling still owns the musical balance.
 */
function create_audio_mix(context: AudioContextLike): AudioMix {
  const lane = context.createGain();
  const collision = context.createGain();
  const result = context.createGain();
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const time_s = context.currentTime;
  set_audio_value(lane.gain, 0.72, time_s);
  set_audio_value(collision.gain, 0.94, time_s);
  set_audio_value(result.gain, 0.9, time_s);
  set_audio_value(master.gain, 0.88, time_s);
  set_audio_value(limiter.threshold, -10, time_s);
  set_audio_value(limiter.knee, 14, time_s);
  set_audio_value(limiter.ratio, 12, time_s);
  set_audio_value(limiter.attack, 0.003, time_s);
  set_audio_value(limiter.release, 0.14, time_s);
  lane.connect(master);
  collision.connect(master);
  result.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
  return { lane, collision, result };
}

function update_rolling_voice(voice: RollingVoice, speed: number, time_s: number): void {
  if (voice.filter !== undefined)
    ramp_audio_value(voice.filter.frequency, rolling_filter_frequency(speed), time_s + 0.035);
  if (voice.source.playbackRate !== undefined)
    ramp_audio_value(voice.source.playbackRate, 0.82 + speed * 0.22, time_s + 0.035);
  ramp_audio_value(
    voice.gain.gain,
    rolling_gain(speed) * (voice.sample_backed ? 2.8 : 1),
    time_s + 0.035,
  );
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

function play_noise_transient(
  context: AudioContextLike,
  destination: AudioNodeLike,
  buffer: AudioBufferLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
  start_time_s = context.currentTime,
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
  gain.connect(destination);
  source.start(start);
  source.stop(start + duration_s + 0.005);
  return () => stop_source(source, context.currentTime);
}
function play_resonant_thump(
  context: AudioContextLike,
  destination: AudioNodeLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
  start_time_s = context.currentTime,
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
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration_s + 0.005);
  return () => stop_source(oscillator, context.currentTime);
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
  gain.connect(destination);
  oscillator.start(start_time_s);
  oscillator.stop(start_time_s + 0.1);
  return () => stop_source(oscillator, context.currentTime);
}

function play_sample(
  context: AudioContextLike,
  destination: AudioNodeLike,
  buffer: AudioBufferLike,
  peak_gain: number,
  playback_rate: number,
  loop = false,
): () => void {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = buffer;
  source.loop = loop;
  set_audio_value(source.playbackRate ?? { value: 1 }, playback_rate, start);
  set_audio_value(gain.gain, peak_gain, start);
  if (!loop) ramp_audio_value(gain.gain, 0, start + collision_cue_duration_s);
  source.connect(gain);
  gain.connect(destination);
  source.start(start);
  if (!loop) source.stop(start + collision_cue_duration_s + 0.01);
  return () => stop_source(source, context.currentTime);
}
function play_collision_sound(
  context: AudioContextLike,
  destination: AudioNodeLike,
  noise: AudioBufferLike,
  sound: CollisionSound,
  sample_bank: AudioSampleBank,
  variation: number,
): Array<() => void> {
  const stop_layers: Array<() => void> = [];
  const ball_intensity = sound.ball_pin.impulse;
  const pin_intensity = sound.pin_pin.impulse;
  if (sound.first_contact) {
    const sample = sample_bank.impact;
    if (sample !== undefined)
      stop_layers.push(
        play_sample(context, destination, sample, 0.42 + ball_intensity * 0.3, variation),
      );
    else
      stop_layers.push(
        play_noise_transient(
          context,
          destination,
          noise,
          2200,
          0.24 + ball_intensity * 0.16,
          0.025,
        ),
        play_resonant_thump(context, destination, 104, 0.14 + ball_intensity * 0.1, 0.085),
        play_resonant_thump(context, destination, 310, 0.05 + ball_intensity * 0.06, 0.035),
      );
  }
  if (sound.ball_pin.contact_count > 0 || sound.pin_pin.contact_count > 0) {
    const contact_mix = Math.min(
      1,
      (sound.ball_pin.contact_count + sound.pin_pin.contact_count) / 12,
    );
    const sample =
      sound.deck_impulse > pin_intensity
        ? sample_bank.clack
        : sound.ball_pin.contact_count > 0
          ? sample_bank.knock
          : sample_bank.clatter;
    if (sample !== undefined)
      stop_layers.push(
        play_sample(
          context,
          destination,
          sample,
          0.16 + contact_mix * 0.2 + (ball_intensity + pin_intensity) * 0.12,
          variation,
        ),
      );
    else
      stop_layers.push(
        play_noise_transient(
          context,
          destination,
          noise,
          720 + pin_intensity * 750,
          0.075 + (ball_intensity + pin_intensity) * 0.09,
          0.04 + contact_mix * 0.035,
        ),
      );
  }
  if (sound.deck_impulse > 0) {
    const sample = sample_bank.thump;
    if (sample !== undefined)
      stop_layers.push(
        play_sample(context, destination, sample, 0.12 + sound.deck_impulse * 0.18, variation),
      );
    else
      stop_layers.push(
        play_resonant_thump(context, destination, 68, 0.055 + sound.deck_impulse * 0.085, 0.105),
      );
  }
  return stop_layers;
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
): RollingVoice {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = texture;
  source.loop = true;
  filter.type = "bandpass";
  set_audio_value(filter.frequency, rolling_filter_frequency(speed), start);
  set_audio_value(gain.gain, rolling_gain(speed), start);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(start);
  return { source, filter, gain, sample_backed: false };
}

function create_sample_rolling_voice(
  context: AudioContextLike,
  destination: AudioNodeLike,
  sample: AudioBufferLike,
  speed: number,
): RollingVoice {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = sample;
  source.loop = true;
  set_audio_value(source.playbackRate ?? { value: 1 }, 0.82 + speed * 0.22, start);
  set_audio_value(gain.gain, rolling_gain(speed) * 2.8, start);
  source.connect(gain);
  gain.connect(destination);
  source.start(start);
  return { source, filter: undefined, gain, sample_backed: true };
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
  let sample_variation = 0;
  let muted = false;
  let rolling_voice: RollingVoice | undefined;
  let roll_active = false;
  let impact_started = false;
  let disposed = false;
  let roll_speed = 0;
  let active_collision_cues: ActiveCollisionCue[] = [];
  let active_result_cues: ActiveCollisionCue[] = [];
  function can_play(): boolean {
    return context !== undefined && !muted && !disposed;
  }
  function begin_sample_preload(): Promise<AudioSampleBytes> {
    if (sample_bytes_load === undefined) sample_bytes_load = fetch_sample_bytes().catch(() => ({}));
    return sample_bytes_load;
  }
  function install_sample_bank(loaded: AudioSampleBank): void {
    if (disposed || context === undefined) return;
    sample_bank = loaded;
    if (!roll_active || impact_started || muted || rolling_voice?.sample_backed === true) return;
    if (loaded.roll === undefined || mix === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = create_sample_rolling_voice(context, mix.lane, loaded.roll, roll_speed);
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
      rolling_voice =
        sample_bank.roll === undefined
          ? create_rolling_voice(context, mix.lane, lane_texture_buffer, roll_speed)
          : create_sample_rolling_voice(context, mix.lane, sample_bank.roll, roll_speed);
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
    if (!can_play() || rolling_voice !== undefined || context === undefined) return;
    if (lane_texture_buffer === undefined)
      lane_texture_buffer = create_lane_texture_buffer(context);
    if (mix === undefined) return;
    rolling_voice =
      sample_bank.roll === undefined
        ? create_rolling_voice(context, mix.lane, lane_texture_buffer, roll_speed)
        : create_sample_rolling_voice(context, mix.lane, sample_bank.roll, roll_speed);
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
  }
  function update_roll_speed(normalized_speed: number): void {
    roll_speed = clamp_normalized_speed(normalized_speed);
    if (!can_play() || context === undefined || rolling_voice === undefined) return;
    update_rolling_voice(rolling_voice, roll_speed, context.currentTime);
  }
  function prune_collision_cues(time_s: number): void {
    active_collision_cues = active_collision_cues.filter((cue) => cue.end_time_s > time_s);
  }
  function can_schedule_collision(sound: CollisionSound, time_s: number): boolean {
    prune_collision_cues(time_s);
    if (sound.first_contact)
      return active_collision_cues.length < maximum_concurrent_collision_cues;
    return active_collision_cues.length < maximum_secondary_collision_cues;
  }
  function emit_collision(sound: CollisionSound | undefined): void {
    if (sound === undefined || !can_play() || context === undefined) return;
    if (!can_schedule_collision(sound, context.currentTime)) return;
    if (noise_buffer === undefined) noise_buffer = create_noise_buffer(context, 0.09);
    if (mix === undefined) return;
    sample_variation = (sample_variation + 1) % 5;
    const variation = 0.94 + sample_variation * 0.03;
    const stop_layers = play_collision_sound(
      context,
      mix.collision,
      noise_buffer,
      sound,
      sample_bank,
      variation,
    );
    active_collision_cues.push({
      end_time_s: context.currentTime + collision_cue_duration_s,
      stop: () => stop_layers.forEach((stop_layer) => stop_layer()),
    });
    if (sound.first_contact) {
      impact_started = true;
      stop_rolling_voice(rolling_voice, context.currentTime);
      rolling_voice = undefined;
    }
  }
  function record_impact(cue: CollisionSound): void {
    if (!roll_active || !can_play()) return;
    emit_collision(create_collision_sound(cue));
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
