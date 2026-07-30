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
import type { RecentMatchSetup, RecentPlayerSetup, SaveFileV1 } from "./contracts";

export const save_storage_key = "super_bowling.save";

const max_player_name_length = 20;

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
  return { pin_count, players: normalize_players(value.players) };
}

function normalize_best_scores(value: unknown): Partial<Record<PinCount, number>> {
  if (!is_record(value)) return {};
  const best_scores: Partial<Record<PinCount, number>> = {};
  for (const pin_count of supported_pin_counts) {
    const score = value[String(pin_count)];
    if (
      typeof score === "number" &&
      Number.isFinite(score) &&
      Number.isInteger(score) &&
      score >= 0 &&
      score <= 30 * get_rack_pin_count(pin_count)
    ) {
      best_scores[pin_count] = score;
    }
  }
  return best_scores;
}

export function create_default_save(): SaveFileV1 {
  return {
    version: 1,
    mute_enabled: false,
    reduced_motion: false,
    recent_setup: create_default_recent_setup(),
    best_scores: {},
  };
}

export function normalize_save_file(value: unknown): SaveFileV1 {
  if (!is_record(value) || value.version !== 1) return create_default_save();
  return {
    version: 1,
    mute_enabled: value.mute_enabled === true,
    reduced_motion: value.reduced_motion === true,
    recent_setup: normalize_recent_setup(value.recent_setup),
    best_scores: normalize_best_scores(value.best_scores),
  };
}

function is_valid_score(score: number, pin_count: PinCount): boolean {
  return (
    Number.isFinite(score) &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 30 * get_rack_pin_count(pin_count)
  );
}

export function update_best_score(
  save: SaveFileV1,
  pin_count: PinCount,
  score: number,
): SaveFileV1 {
  const normalized_save = normalize_save_file(save);
  if (!is_valid_score(score, pin_count)) return normalized_save;
  const current_score = normalized_save.best_scores[pin_count];
  if (current_score !== undefined && current_score >= score) return normalized_save;
  return {
    ...normalized_save,
    best_scores: { ...normalized_save.best_scores, [pin_count]: score },
  };
}
