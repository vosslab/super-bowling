import {
  create_collision_aggregator,
  type CollisionAggregator,
  type CollisionSound,
} from "./collision_audio";

export type ResultSound = "strike" | "spare" | "open" | "complete";

export type AudioParamLike = {
  value: number;
  setValueAtTime?(value: number, start_time: number): void;
  linearRampToValueAtTime?(value: number, end_time: number): void;
};

export type AudioNodeLike = {
  connect(destination: AudioNodeLike): void;
  disconnect?(): void;
};

export type OscillatorLike = AudioNodeLike & {
  frequency: AudioParamLike;
  type: OscillatorType;
  start(start_time?: number): void;
  stop(stop_time?: number): void;
};

export type GainLike = AudioNodeLike & {
  gain: AudioParamLike;
};

export type BiquadFilterLike = AudioNodeLike & {
  frequency: AudioParamLike;
  type: BiquadFilterType;
};

export type AudioContextLike = {
  currentTime: number;
  destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): BiquadFilterLike;
};

export type AudioBackendFactory = () => AudioContextLike;

export type AudioController = {
  activate(): void;
  set_muted(muted: boolean): void;
  start_roll(): void;
  stop_roll(): void;
  record_collision(fallen_pin_delta: number, timestamp_ms: number): void;
  flush_collisions(timestamp_ms: number): void;
  play_result(result: ResultSound): void;
  dispose(): void;
};

type RollingVoice = {
  oscillator: OscillatorLike;
  gain: GainLike;
};

type ResultTone = {
  frequency: number;
  duration_s: number;
  gain: number;
  wave: OscillatorType;
};

const result_tones: Record<ResultSound, ResultTone> = {
  strike: { frequency: 660, duration_s: 0.22, gain: 0.12, wave: "triangle" },
  spare: { frequency: 520, duration_s: 0.18, gain: 0.1, wave: "sine" },
  open: { frequency: 280, duration_s: 0.14, gain: 0.07, wave: "sine" },
  complete: { frequency: 780, duration_s: 0.35, gain: 0.14, wave: "triangle" },
};

function create_browser_audio_backend(): AudioContextLike {
  const context = new AudioContext();
  return context;
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
  ramp_audio_value(voice.gain.gain, 0, time_s + 0.03);
  voice.oscillator.stop(time_s + 0.04);
  voice.gain.disconnect?.();
}

function play_collision_sound(context: AudioContextLike, sound: CollisionSound): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start_time = context.currentTime;
  const frequency = 130 + sound.intensity * 280;
  const peak_gain = 0.025 + sound.intensity * 0.1;

  oscillator.type = "square";
  set_audio_value(oscillator.frequency, frequency, start_time);
  set_audio_value(gain.gain, peak_gain, start_time);
  ramp_audio_value(gain.gain, 0, start_time + 0.075);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start_time);
  oscillator.stop(start_time + 0.08);
}

function play_result_tone(context: AudioContextLike, result: ResultSound): void {
  const tone = result_tones[result];
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start_time = context.currentTime;

  oscillator.type = tone.wave;
  set_audio_value(oscillator.frequency, tone.frequency, start_time);
  set_audio_value(gain.gain, tone.gain, start_time);
  ramp_audio_value(gain.gain, 0, start_time + tone.duration_s);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start_time);
  oscillator.stop(start_time + tone.duration_s + 0.01);
}

function create_rolling_voice(context: AudioContextLike): RollingVoice {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start_time = context.currentTime;

  oscillator.type = "sawtooth";
  filter.type = "lowpass";
  set_audio_value(oscillator.frequency, 54, start_time);
  set_audio_value(filter.frequency, 170, start_time);
  set_audio_value(gain.gain, 0.035, start_time);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start_time);
  return { oscillator, gain };
}

export function create_audio_controller(
  create_backend: AudioBackendFactory = create_browser_audio_backend,
  collision_aggregator: CollisionAggregator = create_collision_aggregator(),
): AudioController {
  let context: AudioContextLike | undefined;
  let muted = false;
  let rolling_voice: RollingVoice | undefined;
  let roll_active = false;
  let disposed = false;

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
      collision_aggregator.end_roll();
      return;
    }
    if (!roll_active || context === undefined || disposed) return;
    collision_aggregator.begin_roll();
    if (rolling_voice === undefined) rolling_voice = create_rolling_voice(context);
  }

  function start_roll(): void {
    if (disposed) return;
    roll_active = true;
    collision_aggregator.begin_roll();
    if (!can_play() || rolling_voice !== undefined || context === undefined) return;
    rolling_voice = create_rolling_voice(context);
  }

  function stop_roll(): void {
    roll_active = false;
    collision_aggregator.end_roll();
    if (context === undefined) return;
    stop_rolling_voice(rolling_voice, context.currentTime);
    rolling_voice = undefined;
  }

  function emit_collision(sound: CollisionSound | undefined): void {
    if (sound === undefined || !can_play() || context === undefined) return;
    play_collision_sound(context, sound);
  }

  function record_collision(fallen_pin_delta: number, timestamp_ms: number): void {
    if (!roll_active || !can_play()) return;
    const sound = collision_aggregator.record(fallen_pin_delta, timestamp_ms);
    emit_collision(sound);
  }

  function flush_collisions(timestamp_ms: number): void {
    if (!roll_active || !can_play()) return;
    const sound = collision_aggregator.flush(timestamp_ms);
    emit_collision(sound);
  }

  function play_result(result: ResultSound): void {
    if (!can_play() || context === undefined) return;
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
    record_collision,
    flush_collisions,
    play_result,
    dispose,
  };
}
