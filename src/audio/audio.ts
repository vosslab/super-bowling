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
export type AudioBufferLike = { getChannelData(channel: number): Float32Array };
export type AudioBufferSourceLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
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
  createBuffer(channel_count: number, length: number, sample_rate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceLike;
};
export type AudioBackendFactory = () => AudioContextLike;
export type AudioController = {
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

type RollingVoice = { oscillator: OscillatorLike; filter: BiquadFilterLike; gain: GainLike };
type ActiveCollisionCue = { end_time_s: number; stop(): void };
type ResultTone = { frequency: number; duration_s: number; gain: number; wave: OscillatorType };
const maximum_concurrent_collision_cues = 4;
const maximum_secondary_collision_cues = maximum_concurrent_collision_cues - 1;
const collision_cue_duration_s = 0.1;
const result_tones: Record<ResultSound, ResultTone> = {
  strike: { frequency: 660, duration_s: 0.22, gain: 0.12, wave: "triangle" },
  spare: { frequency: 520, duration_s: 0.18, gain: 0.1, wave: "sine" },
  open: { frequency: 280, duration_s: 0.14, gain: 0.07, wave: "sine" },
  complete: { frequency: 780, duration_s: 0.35, gain: 0.14, wave: "triangle" },
};
function create_browser_audio_backend(): AudioContextLike {
  return new AudioContext();
}
function set_audio_value(parameter: AudioParamLike, value: number, time_s: number): void {
  parameter.value = value;
  parameter.setValueAtTime?.(value, time_s);
}
function ramp_audio_value(parameter: AudioParamLike, value: number, time_s: number): void {
  parameter.linearRampToValueAtTime?.(value, time_s);
  parameter.value = value;
}
function stop_rolling_voice(voice: RollingVoice | undefined, time_s: number): void {
  if (voice === undefined) return;
  ramp_audio_value(voice.gain.gain, 0, time_s + 0.025);
  voice.oscillator.stop(time_s + 0.035);
  voice.gain.disconnect?.();
}

function clamp_normalized_speed(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function rolling_frequency(speed: number): number {
  return 62 + speed * 52;
}

function rolling_filter_frequency(speed: number): number {
  return 210 + speed * 360;
}

function rolling_gain(speed: number): number {
  return 0.009 + speed * 0.014;
}

function update_rolling_voice(voice: RollingVoice, speed: number, time_s: number): void {
  ramp_audio_value(voice.oscillator.frequency, rolling_frequency(speed), time_s + 0.035);
  ramp_audio_value(voice.filter.frequency, rolling_filter_frequency(speed), time_s + 0.035);
  ramp_audio_value(voice.gain.gain, rolling_gain(speed), time_s + 0.035);
}

function create_noise_buffer(context: AudioContextLike): AudioBufferLike {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.09));
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

function play_noise_transient(
  context: AudioContextLike,
  buffer: AudioBufferLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
): () => void {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = buffer;
  filter.type = "bandpass";
  set_audio_value(filter.frequency, frequency, start);
  set_audio_value(gain.gain, peak_gain, start);
  ramp_audio_value(gain.gain, 0, start + duration_s);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration_s + 0.005);
  return () => source.stop(context.currentTime);
}
function play_resonant_thump(
  context: AudioContextLike,
  frequency: number,
  peak_gain: number,
  duration_s: number,
): () => void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = "triangle";
  set_audio_value(oscillator.frequency, frequency * 1.35, start);
  ramp_audio_value(oscillator.frequency, frequency, start + duration_s);
  set_audio_value(gain.gain, peak_gain, start);
  ramp_audio_value(gain.gain, 0, start + duration_s);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration_s + 0.005);
  return () => oscillator.stop(context.currentTime);
}
function play_collision_sound(
  context: AudioContextLike,
  noise: AudioBufferLike,
  sound: CollisionSound,
): Array<() => void> {
  const stop_layers: Array<() => void> = [];
  const ball_intensity = sound.ball_pin.impulse;
  const pin_intensity = sound.pin_pin.impulse;
  if (sound.first_contact) {
    stop_layers.push(
      play_noise_transient(context, noise, 2200, 0.09 + ball_intensity * 0.1, 0.018),
      play_resonant_thump(context, 110, 0.035 + ball_intensity * 0.04, 0.07),
    );
  }
  if (sound.ball_pin.contact_count > 0 || sound.pin_pin.contact_count > 0) {
    const contact_mix = Math.min(
      1,
      (sound.ball_pin.contact_count + sound.pin_pin.contact_count) / 12,
    );
    stop_layers.push(
      play_noise_transient(
        context,
        noise,
        720 + pin_intensity * 750,
        0.018 + (ball_intensity + pin_intensity) * 0.035,
        0.035 + contact_mix * 0.025,
      ),
    );
  }
  if (sound.deck_impulse > 0)
    stop_layers.push(play_resonant_thump(context, 68, 0.018 + sound.deck_impulse * 0.04, 0.09));
  return stop_layers;
}
function play_result_tone(context: AudioContextLike, result: ResultSound): void {
  const tone = result_tones[result];
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = tone.wave;
  set_audio_value(oscillator.frequency, tone.frequency, start);
  set_audio_value(gain.gain, tone.gain, start);
  ramp_audio_value(gain.gain, 0, start + tone.duration_s);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + tone.duration_s + 0.01);
}
function create_rolling_voice(context: AudioContextLike, speed: number): RollingVoice {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = "triangle";
  filter.type = "lowpass";
  set_audio_value(oscillator.frequency, rolling_frequency(speed), start);
  set_audio_value(filter.frequency, rolling_filter_frequency(speed), start);
  set_audio_value(gain.gain, rolling_gain(speed), start);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  return { oscillator, filter, gain };
}

export function create_audio_controller(
  create_backend: AudioBackendFactory = create_browser_audio_backend,
): AudioController {
  let context: AudioContextLike | undefined;
  let noise_buffer: AudioBufferLike | undefined;
  let muted = false;
  let rolling_voice: RollingVoice | undefined;
  let roll_active = false;
  let disposed = false;
  let roll_speed = 0;
  let active_collision_cues: ActiveCollisionCue[] = [];
  function can_play(): boolean {
    return context !== undefined && !muted && !disposed;
  }
  function activate(): void {
    if (disposed) return;
    if (context === undefined) context = create_backend();
    void context.resume();
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
      return;
    }
    if (!roll_active || context === undefined || disposed) return;
    if (rolling_voice === undefined) rolling_voice = create_rolling_voice(context, roll_speed);
  }
  function start_roll(): void {
    if (disposed) return;
    roll_active = true;
    active_collision_cues.forEach((cue) => cue.stop());
    active_collision_cues = [];
    if (!can_play() || rolling_voice !== undefined || context === undefined) return;
    rolling_voice = create_rolling_voice(context, roll_speed);
  }
  function stop_roll(): void {
    roll_active = false;
    if (context === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = undefined;
    active_collision_cues.forEach((cue) => cue.stop());
    active_collision_cues = [];
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
    if (noise_buffer === undefined) noise_buffer = create_noise_buffer(context);
    const stop_layers = play_collision_sound(context, noise_buffer, sound);
    active_collision_cues.push({
      end_time_s: context.currentTime + collision_cue_duration_s,
      stop: () => stop_layers.forEach((stop_layer) => stop_layer()),
    });
    if (sound.first_contact && rolling_voice !== undefined) {
      ramp_audio_value(rolling_voice.gain.gain, 0.002, context.currentTime + 0.012);
      ramp_audio_value(
        rolling_voice.gain.gain,
        rolling_gain(roll_speed),
        context.currentTime + 0.13,
      );
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
    play_result_tone(context, result);
  }
  function dispose(): void {
    if (disposed) return;
    stop_roll();
    disposed = true;
    if (context !== undefined) void context.close();
  }
  return {
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
