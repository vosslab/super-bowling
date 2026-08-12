import type { TimedCollisionSound } from "./cascade_director";

function cue(
  time: number,
  pan: number,
  impulse: number,
  contacts: number,
  first = false,
): TimedCollisionSound {
  return {
    source_simulation_time_ms: time,
    first_contact: first,
    ball_pin: { contact_count: first ? contacts : 0, impulse: first ? impulse : 0, pan },
    pin_pin: { contact_count: first ? 0 : contacts, impulse: first ? 0 : impulse, pan },
    deck: { contact_count: first ? 0 : 1, impulse: first ? 0 : impulse * 0.45, pan },
  };
}

export const cascade_trace_fixtures = {
  ten_pin_strike: [cue(100, -0.25, 0.75, 4, true), cue(220, 0.1, 0.62, 4), cue(390, 0.4, 0.45, 2)],
  large_990_opening: [
    cue(100, -0.6, 0.86, 8, true),
    cue(150, -0.55, 0.82, 9),
    cue(235, -0.15, 0.74, 8),
  ],
  large_990_propagation: [
    cue(900, -0.5, 0.65, 8),
    cue(1040, 0.05, 0.72, 9),
    cue(1180, 0.55, 0.66, 7),
  ],
  large_990_tail: [cue(4700, -0.35, 0.42, 3), cue(5050, 0.2, 0.38, 3), cue(5500, 0.6, 0.3, 2)],
  dense_single_sector: [cue(100, 0, 0.7, 6, true), cue(125, 0.02, 0.7, 6), cue(150, -0.02, 0.7, 6)],
  malformed_input: [
    cue(-1, 0, 0.5, 1),
    { ...cue(20, 0, 0.5, 1), source_simulation_time_ms: Number.NaN },
  ],
} as const;
