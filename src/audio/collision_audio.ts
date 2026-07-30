export const collision_bucket_ms = 90;
export const collision_intensity_pin_cap = 12;
export const maximum_collision_voices_per_roll = 8;

export type CollisionSound = {
  intensity: number;
};

export type CollisionAggregator = {
  begin_roll(): void;
  record(fallen_pin_delta: number, timestamp_ms: number): CollisionSound | undefined;
  flush(timestamp_ms: number): CollisionSound | undefined;
  end_roll(): void;
};

type AggregatorState = {
  bucket_started_at_ms: number | undefined;
  fallen_pin_total: number;
  emitted_voice_count: number;
  roll_active: boolean;
};

function create_collision_sound(fallen_pin_total: number): CollisionSound {
  const capped_total = Math.min(fallen_pin_total, collision_intensity_pin_cap);
  const intensity = capped_total / collision_intensity_pin_cap;
  return { intensity };
}

function clear_bucket(state: AggregatorState): void {
  state.bucket_started_at_ms = undefined;
  state.fallen_pin_total = 0;
}

function can_emit(state: AggregatorState): boolean {
  const has_collision = state.fallen_pin_total > 0;
  const below_voice_limit = state.emitted_voice_count < maximum_collision_voices_per_roll;
  return has_collision && below_voice_limit;
}

function emit_bucket(state: AggregatorState): CollisionSound | undefined {
  if (!can_emit(state)) {
    clear_bucket(state);
    return undefined;
  }
  const sound = create_collision_sound(state.fallen_pin_total);
  state.emitted_voice_count += 1;
  clear_bucket(state);
  return sound;
}

export function create_collision_aggregator(): CollisionAggregator {
  const state: AggregatorState = {
    bucket_started_at_ms: undefined,
    fallen_pin_total: 0,
    emitted_voice_count: 0,
    roll_active: false,
  };

  function begin_roll(): void {
    state.emitted_voice_count = 0;
    state.roll_active = true;
    clear_bucket(state);
  }

  function record(fallen_pin_delta: number, timestamp_ms: number): CollisionSound | undefined {
    if (!state.roll_active || fallen_pin_delta <= 0) return undefined;

    const bucket_started_at_ms = state.bucket_started_at_ms;
    if (
      bucket_started_at_ms !== undefined &&
      timestamp_ms - bucket_started_at_ms >= collision_bucket_ms
    ) {
      const sound = emit_bucket(state);
      state.bucket_started_at_ms = timestamp_ms;
      state.fallen_pin_total = fallen_pin_delta;
      return sound;
    }

    if (bucket_started_at_ms === undefined) state.bucket_started_at_ms = timestamp_ms;
    state.fallen_pin_total += fallen_pin_delta;
    return undefined;
  }

  function flush(_timestamp_ms: number): CollisionSound | undefined {
    if (!state.roll_active) return undefined;
    return emit_bucket(state);
  }

  function end_roll(): void {
    state.roll_active = false;
    clear_bucket(state);
  }

  return { begin_roll, record, flush, end_roll };
}
