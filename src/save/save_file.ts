import {
  get_rack_pin_count,
  is_supported_pin_count,
  supported_pin_counts,
  type PinCount,
} from "../config/pin_counts";
import {
  ball_patterns,
  normalize_ball_design,
  type BallDesign,
  type BallPattern,
} from "../designer/ball_design";
import {
  default_bowls_per_frame,
  maximum_bowls_per_frame,
  minimum_bowls_per_frame,
  normalize_bowls_per_frame,
} from "../game/bowls_per_frame";
import type {
  BestScoreKey,
  MatchRecordValues,
  ModeRecord,
  RecentMatchSetup,
  RecentPlayerSetup,
  SaveFileV4,
} from "./contracts";

export const save_storage_key = "super_bowling.save";

const max_player_name_length = 20;
export { normalize_bowls_per_frame } from "../game/bowls_per_frame";

export function best_score_key(pin_count: PinCount, bowls_per_frame: number): BestScoreKey {
  return `${pin_count}:${normalize_bowls_per_frame(bowls_per_frame)}`;
}

function maximum_score(pin_count: PinCount, bowls_per_frame: number): number {
  const rack_pin_count = get_rack_pin_count(pin_count);
  return (bowls_per_frame === 2 ? 30 : 10 + bowls_per_frame) * rack_pin_count;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize_player_name(value: unknown, player_index: number): string {
  if (typeof value !== "string") return `Player ${player_index + 1}`;
  const name = value.trim().slice(0, max_player_name_length);
  return name.length > 0 ? name : `Player ${player_index + 1}`;
}

function is_ball_pattern(value: unknown): value is BallPattern {
  return typeof value === "string" && ball_patterns.some((pattern) => pattern === value);
}

function read_design(value: unknown): BallDesign {
  if (!is_record(value)) return normalize_ball_design({});
  return normalize_ball_design({
    base_color: typeof value.base_color === "string" ? value.base_color : undefined,
    accent_color: typeof value.accent_color === "string" ? value.accent_color : undefined,
    pattern: is_ball_pattern(value.pattern) ? value.pattern : undefined,
    monogram: typeof value.monogram === "string" ? value.monogram : undefined,
  });
}

function create_default_recent_setup(): RecentMatchSetup {
  return {
    bowls_per_frame: default_bowls_per_frame,
    pin_count: 10,
    players: [{ name: "Player 1", ball_design: normalize_ball_design({}) }],
  };
}

function normalize_players(value: unknown): RecentPlayerSetup[] {
  if (!Array.isArray(value)) return create_default_recent_setup().players;
  const players: RecentPlayerSetup[] = [];
  for (const player of value) {
    if (players.length === 4) break;
    if (!is_record(player)) continue;
    players.push({
      name: normalize_player_name(player.name, players.length),
      ball_design: read_design(player.ball_design),
    });
  }
  return players.length > 0 ? players : create_default_recent_setup().players;
}

function normalize_recent_setup(value: unknown): RecentMatchSetup {
  const defaults = create_default_recent_setup();
  if (!is_record(value)) return defaults;
  const pin_count =
    typeof value.pin_count === "number" && is_supported_pin_count(value.pin_count)
      ? value.pin_count
      : defaults.pin_count;
  return {
    bowls_per_frame: normalize_bowls_per_frame(value.bowls_per_frame),
    pin_count,
    players: normalize_players(value.players),
  };
}

function create_mode_record(best_score: number): ModeRecord {
  return {
    best_score,
    recent_scores: [],
    best_frame_score: 0,
    best_strike_streak: 0,
    matches_played: 1,
  };
}

function normalize_mode_records(value: unknown): Partial<Record<BestScoreKey, ModeRecord>> {
  if (!is_record(value)) return {};
  const mode_records: Partial<Record<BestScoreKey, ModeRecord>> = {};
  for (const pin_count of supported_pin_counts) {
    for (
      let bowls_per_frame = minimum_bowls_per_frame;
      bowls_per_frame <= maximum_bowls_per_frame;
      bowls_per_frame += 1
    ) {
      const key = best_score_key(pin_count, bowls_per_frame);
      const mode_record = normalize_mode_record(value[key], pin_count, bowls_per_frame);
      if (mode_record !== undefined) mode_records[key] = mode_record;
    }
  }
  return mode_records;
}

function normalize_mode_record(
  value: unknown,
  pin_count: PinCount,
  bowls_per_frame: number,
): ModeRecord | undefined {
  if (!is_record(value)) return undefined;
  if (!is_valid_score(value.best_score, pin_count, bowls_per_frame)) return undefined;
  if (!is_valid_score(value.best_frame_score, pin_count, bowls_per_frame)) return undefined;
  if (!is_non_negative_integer(value.best_strike_streak)) return undefined;
  if (!is_non_negative_integer(value.matches_played)) return undefined;
  const recent_scores = normalize_recent_scores(value.recent_scores, pin_count, bowls_per_frame);
  const mode_record: ModeRecord = {
    best_score: value.best_score,
    recent_scores,
    best_frame_score: value.best_frame_score,
    best_strike_streak: value.best_strike_streak,
    matches_played: value.matches_played,
  };
  return mode_record;
}

function normalize_recent_scores(
  value: unknown,
  pin_count: PinCount,
  bowls_per_frame: number,
): number[] {
  if (!Array.isArray(value)) return [];
  const recent_scores: number[] = [];
  for (const score of value) {
    if (recent_scores.length === 5) break;
    if (is_valid_score(score, pin_count, bowls_per_frame)) recent_scores.push(score);
  }
  return recent_scores;
}

function migrate_v2_mode_records(value: unknown): Partial<Record<BestScoreKey, ModeRecord>> {
  if (!is_record(value)) return {};
  const mode_records: Partial<Record<BestScoreKey, ModeRecord>> = {};
  for (const pin_count of supported_pin_counts) {
    const score = value[String(pin_count)];
    if (is_valid_score(score, pin_count, 2)) {
      mode_records[best_score_key(pin_count, 2)] = create_mode_record(score);
    }
  }
  return mode_records;
}

function migrate_v3_mode_records(value: unknown): Partial<Record<BestScoreKey, ModeRecord>> {
  if (!is_record(value)) return {};
  const mode_records: Partial<Record<BestScoreKey, ModeRecord>> = {};
  for (const pin_count of supported_pin_counts) {
    for (
      let bowls_per_frame = minimum_bowls_per_frame;
      bowls_per_frame <= maximum_bowls_per_frame;
      bowls_per_frame += 1
    ) {
      const key = best_score_key(pin_count, bowls_per_frame);
      const score = value[key];
      if (is_valid_score(score, pin_count, bowls_per_frame))
        mode_records[key] = create_mode_record(score);
    }
  }
  return mode_records;
}

export function create_default_save(): SaveFileV4 {
  return {
    version: 4,
    mute_enabled: false,
    reduced_motion: false,
    recent_setup: create_default_recent_setup(),
    mode_records: {},
  };
}

export function normalize_save_file(value: unknown): SaveFileV4 {
  if (!is_record(value)) return create_default_save();
  if (value.version === 1) {
    return {
      version: 4,
      mute_enabled: value.mute_enabled === true,
      reduced_motion: value.reduced_motion === true,
      recent_setup: { ...normalize_recent_setup(value.recent_setup), bowls_per_frame: 2 },
      mode_records: {},
    };
  }
  if (value.version === 2) {
    return {
      version: 4,
      mute_enabled: value.mute_enabled === true,
      reduced_motion: value.reduced_motion === true,
      recent_setup: { ...normalize_recent_setup(value.recent_setup), bowls_per_frame: 2 },
      mode_records: migrate_v2_mode_records(value.best_scores),
    };
  }
  if (value.version === 3) {
    return {
      version: 4,
      mute_enabled: value.mute_enabled === true,
      reduced_motion: value.reduced_motion === true,
      recent_setup: normalize_recent_setup(value.recent_setup),
      mode_records: migrate_v3_mode_records(value.best_scores),
    };
  }
  if (value.version !== 4) return create_default_save();
  return {
    version: 4,
    mute_enabled: value.mute_enabled === true,
    reduced_motion: value.reduced_motion === true,
    recent_setup: normalize_recent_setup(value.recent_setup),
    mode_records: normalize_mode_records(value.mode_records),
  };
}

function is_valid_score(
  score: unknown,
  pin_count: PinCount,
  bowls_per_frame: number,
): score is number {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= maximum_score(pin_count, bowls_per_frame)
  );
}

function is_non_negative_integer(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

export function record_completed_match(
  save: SaveFileV4,
  pin_count: PinCount,
  bowls_per_frame: number,
  record_values: MatchRecordValues,
): SaveFileV4 {
  const normalized_save = normalize_save_file(save);
  const normalized_bowls_per_frame = normalize_bowls_per_frame(bowls_per_frame);
  if (!is_valid_score(record_values.top_score, pin_count, normalized_bowls_per_frame))
    return normalized_save;
  if (!is_valid_score(record_values.best_frame_score, pin_count, normalized_bowls_per_frame)) {
    return normalized_save;
  }
  if (!is_non_negative_integer(record_values.longest_strike_streak)) return normalized_save;
  const key = best_score_key(pin_count, normalized_bowls_per_frame);
  const previous_record = normalized_save.mode_records[key];
  const current_record = previous_record ?? {
    best_score: 0,
    recent_scores: [],
    best_frame_score: 0,
    best_strike_streak: 0,
    matches_played: 0,
  };
  const mode_record: ModeRecord = {
    best_score: Math.max(current_record.best_score, record_values.top_score),
    recent_scores: [record_values.top_score, ...current_record.recent_scores].slice(0, 5),
    best_frame_score: Math.max(current_record.best_frame_score, record_values.best_frame_score),
    best_strike_streak: Math.max(
      current_record.best_strike_streak,
      record_values.longest_strike_streak,
    ),
    matches_played: current_record.matches_played + 1,
  };
  return {
    ...normalized_save,
    mode_records: { ...normalized_save.mode_records, [key]: mode_record },
  };
}
