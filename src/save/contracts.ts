import type { BallDesign } from "../designer/ball_design";
import type { PinCount } from "../config/pin_counts";

export type RecentPlayerSetup = {
  name: string;
  ball_design: BallDesign;
};

export type RecentMatchSetup = {
  bowls_per_frame: number;
  pin_count: PinCount;
  players: RecentPlayerSetup[];
};

export type SaveFileV1 = {
  version: 1;
  mute_enabled: boolean;
  reduced_motion: boolean;
  recent_setup: RecentMatchSetup;
  best_scores: Partial<Record<PinCount, number>>;
};

export type SaveFileV2 = {
  version: 2;
  mute_enabled: boolean;
  reduced_motion: boolean;
  recent_setup: RecentMatchSetup;
  best_scores: Partial<Record<PinCount, number>>;
};

export type BestScoreKey = `${PinCount}:${number}`;

export type SaveFileV3 = {
  version: 3;
  mute_enabled: boolean;
  reduced_motion: boolean;
  recent_setup: RecentMatchSetup;
  /** Scores are deliberately partitioned by rack mode and bowls-per-frame rule. */
  best_scores: Partial<Record<BestScoreKey, number>>;
};

export type SaveFile = SaveFileV3;

export type SaveSettings = {
  mute_enabled: boolean;
  reduced_motion: boolean;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
