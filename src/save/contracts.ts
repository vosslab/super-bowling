import type { BallDesign } from "../designer/ball_design";
import type { PinCount } from "../config/pin_counts";

export type RecentPlayerSetup = {
  name: string;
  ball_design: BallDesign;
};

export type RecentMatchSetup = {
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

export type SaveFile = SaveFileV1;

export type SaveSettings = {
  mute_enabled: boolean;
  reduced_motion: boolean;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
