import type { PlayerId } from "../brands";
import type { PinCount, RackPinCount } from "../config/pin_counts";
import type { BallDesign } from "../designer/ball_design";
import type { AimValues } from "./aim";

export type FrameScore = {
  frame_index: number;
  rolls: readonly number[];
  score?: number;
};

export type PlayerSetup = {
  player_id: PlayerId;
  name: string;
  ball_design: BallDesign;
};

export type MatchSetup = {
  /** Omitted only by legacy callers; the match state always records the resolved value. */
  bowls_per_frame?: number;
  pin_count: PinCount;
  players: readonly PlayerSetup[];
};

export type HandoffState = {
  completed_player_id: PlayerId;
  next_player_id: PlayerId;
  frame_index: number;
};

export type MatchPhase =
  | "setup"
  | "rack_resetting"
  | "aiming"
  | "rolling"
  | "result"
  | "sweeping"
  | "handoff"
  | "final"
  | "fatal";

export type AimState = AimValues;

export type PlayerScoreCard = {
  player_id: PlayerId;
  frames: readonly FrameScore[];
};

export type MatchState = {
  active_player_id: PlayerId;
  aim: AimState;
  bowls_per_frame: number;
  current_frame_index: number;
  current_roll_index: number;
  phase: MatchPhase;
  pin_count: RackPinCount;
  players: readonly PlayerSetup[];
  score_cards: Readonly<Record<number, PlayerScoreCard>>;
  standing_pin_count: number;
  standing_pin_count_at_launch?: number;
  result_message?: string;
  handoff?: HandoffState;
  fatal_message?: string;
};

export type MatchEffect =
  | { type: "reset_rack"; pin_count: RackPinCount }
  | { type: "sweep_deadwood" }
  | { type: "prepare_next_roll" }
  | { type: "launch"; power: number; start_position: number; angle: number; spin: number }
  | { type: "match_complete"; best_scores: Readonly<Record<number, number>> };

export type MatchTransition = {
  state: MatchState;
  effects: readonly MatchEffect[];
};

export type SettledRoll = {
  pin_count: RackPinCount;
  standing_pin_count: number;
  fallen_pin_count: number;
  timed_out: boolean;
};
