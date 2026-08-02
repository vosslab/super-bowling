import type { RecentMatchSetup, SaveFileV2, SaveSettings, StorageLike } from "./contracts";
import { load_save, store_save } from "./load";
import { normalize_save_file, update_best_score } from "./save_file";
import type { PinCount } from "../config/pin_counts";

export type SaveSettingsController = {
  get_save(): SaveFileV2;
  get_settings(): SaveSettings;
  set_mute_enabled(mute_enabled: boolean): SaveFileV2;
  set_reduced_motion(reduced_motion: boolean): SaveFileV2;
  set_recent_setup(recent_setup: RecentMatchSetup): SaveFileV2;
  record_completed_score(pin_count: PinCount, score: number): SaveFileV2;
};

function write_save(storage: StorageLike, save: SaveFileV2): SaveFileV2 {
  const normalized_save = normalize_save_file(save);
  store_save(storage, normalized_save);
  return normalized_save;
}

export function create_save_settings(storage: StorageLike): SaveSettingsController {
  let current_save = load_save(storage);

  function commit(next_save: SaveFileV2): SaveFileV2 {
    current_save = write_save(storage, next_save);
    return current_save;
  }

  return {
    get_save: () => current_save,
    get_settings: () => ({
      mute_enabled: current_save.mute_enabled,
      reduced_motion: current_save.reduced_motion,
    }),
    set_mute_enabled: (mute_enabled) =>
      commit({ ...current_save, mute_enabled: mute_enabled === true }),
    set_reduced_motion: (reduced_motion) =>
      commit({ ...current_save, reduced_motion: reduced_motion === true }),
    set_recent_setup: (recent_setup) => commit({ ...current_save, recent_setup }),
    record_completed_score: (pin_count, score) =>
      commit(update_best_score(current_save, pin_count, score)),
  };
}
