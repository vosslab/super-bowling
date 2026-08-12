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
export type StereoPannerLike = AudioNodeLike & { pan: AudioParamLike };
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
export type AudioBufferLike = { duration: number; getChannelData(channel: number): Float32Array };
export type AudioBufferSourceLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
  loop?: boolean;
  playbackRate?: AudioParamLike;
  start(start_time?: number, offset?: number, duration?: number): void;
  stop(stop_time?: number): void;
  onended?: ((event: Event) => unknown) | null;
};
export type AudioContextLike = {
  currentTime: number;
  sampleRate: number;
  destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createStereoPanner?(): StereoPannerLike;
  createBiquadFilter(): BiquadFilterLike;
  createDynamicsCompressor(): DynamicsCompressorLike;
  createBuffer(channel_count: number, length: number, sample_rate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceLike;
  decodeAudioData?(audio_data: ArrayBuffer): Promise<AudioBufferLike>;
};
export type AudioBackendFactory = () => AudioContextLike;
