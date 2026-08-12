import type { CollisionSound, ImpactPathCue } from "./collision_audio";

export type CollisionPathName = "ball_pin" | "pin_pin" | "deck";
export type DirectedCollisionRole = "hero" | "attack" | "body";

export type TimedCollisionSound = CollisionSound & {
  source_simulation_time_ms: number;
  /** The worker emits impact summaries in nondecreasing source-time order. */
  source_event_sequence?: number;
};

export type DirectedCollisionVoice = {
  role: DirectedCollisionRole;
  source_path: CollisionPathName;
  source_simulation_time_ms: number;
  source_event_sequence?: number;
  /** Beginning of the physical 50 ms bucket that supplied this voice. */
  source_frame_ms: number;
  /** Bounded count of physical summaries retained by the supporting body. */
  source_contribution_count: number;
  pan: number;
  delay_ms: number;
  gain: number;
  playback_rate: number;
  sample_offset_s: number;
  sample_duration_s: number;
};

export type DirectedCollisionPlan = { voices: DirectedCollisionVoice[] };

type Candidate = { path: CollisionPathName; cue: ImpactPathCue; energy: number };
type BodyReservoir = {
  energy: number;
  representative?: Candidate;
  contribution_count: number;
};
type CascadeDirectorState = {
  first_source_time_ms?: number;
  last_frame?: number;
  last_sector_attack_frame: number[];
  last_attack_frame?: number;
  last_body_frame?: number;
  body: BodyReservoir;
};

export const cascade_frame_ms = 50;
const sector_refractory_frames = 2;
const global_attack_refractory_frames = 4;
const body_decay_per_frame = 0.72;
const body_emit_threshold = 0.12;
const maximum_body_contributions = 24;
// The body is an energy bed, not a new broadband attack for every physics
// report. A 150 ms release window leaves space for the selected attacks.
const body_refractory_frames = 7;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

function candidates(sound: CollisionSound): Candidate[] {
  return (["ball_pin", "pin_pin", "deck"] as const)
    .map((path) => ({
      path,
      cue: sound[path],
      energy: sound[path].impulse + sound[path].contact_count / 24,
    }))
    .filter((candidate) => candidate.cue.contact_count > 0 || candidate.cue.impulse > 0)
    .sort((left, right) => right.energy - left.energy || left.path.localeCompare(right.path));
}

function sector(pan: number): number {
  return Math.min(2, Math.max(0, Math.floor((clamp(pan, -1, 1) + 1) * 1.5)));
}

function source_frame(time_ms: number): number {
  return Math.floor(time_ms / cascade_frame_ms);
}

function voice(
  role: DirectedCollisionRole,
  candidate: Candidate,
  timed: TimedCollisionSound,
  frame: number,
  delay_ms: number,
  contribution_count = 1,
  body_energy = 0,
): DirectedCollisionVoice {
  const ordinal = (timed.source_event_sequence ?? frame) % 5;
  const is_hero = role === "hero";
  const is_body = role === "body";
  return {
    role,
    source_path: candidate.path,
    source_simulation_time_ms: timed.source_simulation_time_ms,
    ...(timed.source_event_sequence === undefined
      ? {}
      : { source_event_sequence: timed.source_event_sequence }),
    source_frame_ms: frame * cascade_frame_ms,
    source_contribution_count: Math.min(maximum_body_contributions, contribution_count),
    pan: clamp(candidate.cue.pan + (is_body ? 0 : (ordinal - 2) * 0.045), -1, 1),
    delay_ms,
    gain: clamp(
      is_hero
        ? 0.68 + candidate.cue.impulse * 0.22
        : is_body
          ? 0.04 + Math.sqrt(body_energy) * 0.09
          : 0.26 + candidate.cue.impulse * 0.17,
      0.03,
      is_hero ? 0.9 : is_body ? 0.2 : 0.5,
    ),
    playback_rate: 0.9 + ordinal * 0.035 + (candidate.path === "deck" ? -0.035 : 0),
    sample_offset_s: is_hero ? 0.02 + ordinal * 0.035 : 0.045 + ordinal * 0.055,
    sample_duration_s: is_hero ? 0.32 : is_body ? 0.19 : 0.105 + candidate.cue.impulse * 0.07,
  };
}

/**
 * A finite source-time director. Inputs must retain the worker's nondecreasing
 * source-time order; old frames are ignored rather than rescheduled from
 * JavaScript arrival time. One 50 ms frame admits at most one attack. Energy
 * not admitted as an attack is retained in a decaying, bounded body reservoir.
 */
export function create_cascade_director(): {
  direct(timed: TimedCollisionSound): DirectedCollisionPlan;
  reset(): void;
} {
  const state: CascadeDirectorState = {
    last_sector_attack_frame: [-Infinity, -Infinity, -Infinity],
    body: { energy: 0, contribution_count: 0 },
  };
  function reset(): void {
    state.first_source_time_ms = undefined;
    state.last_frame = undefined;
    state.last_sector_attack_frame = [-Infinity, -Infinity, -Infinity];
    state.last_attack_frame = undefined;
    state.last_body_frame = undefined;
    state.body = { energy: 0, contribution_count: 0 };
  }
  function direct(timed: TimedCollisionSound): DirectedCollisionPlan {
    if (!Number.isFinite(timed.source_simulation_time_ms) || timed.source_simulation_time_ms < 0)
      return { voices: [] };
    const frame = source_frame(timed.source_simulation_time_ms);
    if (state.last_frame !== undefined && frame < state.last_frame) return { voices: [] };
    const available = candidates(timed);
    if (available.length === 0) return { voices: [] };
    const frame_gap = state.last_frame === undefined ? 0 : frame - state.last_frame;
    if (frame_gap > 0) {
      state.body.energy *= Math.pow(body_decay_per_frame, frame_gap);
      state.body.contribution_count = 0;
      state.body.representative = undefined;
    }
    state.last_frame = frame;
    const strongest = available[0]!;
    const first = state.first_source_time_ms === undefined;
    if (first) state.first_source_time_ms = timed.source_simulation_time_ms;
    const attack_sector = sector(strongest.cue.pan);
    const admitted =
      first ||
      (frame - state.last_sector_attack_frame[attack_sector]! >= sector_refractory_frames &&
        (state.last_attack_frame === undefined ||
          frame - state.last_attack_frame >= global_attack_refractory_frames) &&
        timed.first_contact === false);
    const voices: DirectedCollisionVoice[] = [];
    if (admitted) {
      voices.push(
        voice(first || timed.first_contact ? "hero" : "attack", strongest, timed, frame, 0),
      );
      state.last_sector_attack_frame[attack_sector] = frame;
      state.last_attack_frame = frame;
    }
    const body_candidates = admitted ? available.slice(1) : available;
    const retained_energy = body_candidates.reduce((sum, candidate) => sum + candidate.energy, 0);
    if (retained_energy > 0) {
      state.body.energy = Math.min(3, state.body.energy + retained_energy);
      state.body.contribution_count = Math.min(
        maximum_body_contributions,
        state.body.contribution_count + body_candidates.length,
      );
      state.body.representative ??= body_candidates[0];
    }
    // No idle/timer flush: after physical settlement this function cannot make sound.
    if (
      state.body.energy >= body_emit_threshold &&
      state.body.representative !== undefined &&
      (state.last_body_frame === undefined ||
        frame - state.last_body_frame >= body_refractory_frames)
    ) {
      voices.push(
        voice(
          "body",
          state.body.representative,
          timed,
          frame,
          admitted ? 32 : 16,
          state.body.contribution_count,
          state.body.energy,
        ),
      );
      state.last_body_frame = frame;
      state.body.energy *= 0.62;
    }
    return { voices };
  }
  return { direct, reset };
}
