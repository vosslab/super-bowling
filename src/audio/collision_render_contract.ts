import type { AudioBufferLike } from "./audio_backend";
import type { DirectedCollisionVoice } from "./cascade_director";

/** The live controller and unattended renderer share these collision choices. */
export const maximum_concurrent_collision_cues = 4;
export const collision_mix_levels = Object.freeze({ attack: 0.94, body: 0.52, master: 0.88 });
export const collision_sample_paths = Object.freeze({
  impact: "./assets/audio/bowling_impact_1.ogg",
  clatter: "./assets/audio/bowling_pin_clatter_1.ogg",
  knock: "./assets/audio/pin_knock_1.ogg",
  clack: "./assets/audio/ceramic_clack_1.ogg",
});
export type CollisionSampleName = keyof typeof collision_sample_paths;
export type CollisionSampleBank = Partial<Record<CollisionSampleName, AudioBufferLike>>;
export type CollisionRenderInstruction = {
  sample_name: CollisionSampleName;
  offset_s: number;
  duration_s: number;
  lowpass_hz?: number;
  gain: number;
  playback_rate: number;
  pan: number;
};

export function safe_collision_slice(
  duration_s: number,
  requested_offset_s: number,
  requested_duration_s: number,
): { offset_s: number; duration_s: number } | undefined {
  if (!Number.isFinite(duration_s) || duration_s <= 0) return undefined;
  const offset_s = Math.min(Math.max(0, requested_offset_s), Math.max(0, duration_s - 0.001));
  const slice_duration_s = Math.min(Math.max(0, requested_duration_s), duration_s - offset_s);
  return slice_duration_s > 0 ? { offset_s, duration_s: slice_duration_s } : undefined;
}

function sample_name_for(voice: DirectedCollisionVoice): CollisionSampleName {
  if (voice.role === "hero") return "impact";
  if (voice.source_path === "ball_pin") return "knock";
  if (voice.source_path === "pin_pin") return "clatter";
  return "clack";
}

/**
 * Converts a directed physical voice into the exact sample/bus instruction.
 * Offline evidence serializes this result; it must not choose samples itself.
 */
export function collision_render_instruction(
  voice: DirectedCollisionVoice,
  bank: CollisionSampleBank,
): CollisionRenderInstruction | undefined {
  const sample_name = sample_name_for(voice);
  const sample = bank[sample_name];
  if (sample === undefined) return undefined;
  const slice = safe_collision_slice(
    sample.duration,
    voice.sample_offset_s,
    voice.sample_duration_s,
  );
  if (slice === undefined) return undefined;
  return {
    sample_name,
    ...slice,
    ...(voice.role === "body" ? { lowpass_hz: 300 } : {}),
    gain: voice.gain,
    playback_rate: Math.max(0.05, Number.isFinite(voice.playback_rate) ? voice.playback_rate : 1),
    pan: voice.pan,
  };
}
