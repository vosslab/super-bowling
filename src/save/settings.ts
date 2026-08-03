import type {
  MatchRecordValues,
  ModeRecord,
  RecentMatchSetup,
  SaveFileV4,
  SaveSettings,
  StorageLike,
} from "./contracts";
import { load_save, store_save } from "./load";
import { best_score_key, normalize_save_file, record_completed_match } from "./save_file";
import type { PinCount } from "../config/pin_counts";

export type SaveSettingsController = {
  get_save(): SaveFileV4;
  get_settings(): SaveSettings;
  set_mute_enabled(mute_enabled: boolean): SaveFileV4;
  set_reduced_motion(reduced_motion: boolean): SaveFileV4;
  set_recent_setup(recent_setup: RecentMatchSetup): SaveFileV4;
  record_completed_match(
    pin_count: PinCount,
    bowls_per_frame: number,
    record_values: MatchRecordValues,
  ): SaveFileV4;
  get_mode_record(pin_count: PinCount, bowls_per_frame: number): ModeRecord | undefined;
};

function write_save(storage: StorageLike, save: SaveFileV4): SaveFileV4 {
  const normalized_save = normalize_save_file(save);
  store_save(storage, normalized_save);
  return normalized_save;
}

export function create_save_settings(storage: StorageLike): SaveSettingsController {
  let current_save = load_save(storage);

  function commit(next_save: SaveFileV4): SaveFileV4 {
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
    record_completed_match: (pin_count, bowls_per_frame, record_values) =>
      commit(record_completed_match(current_save, pin_count, bowls_per_frame, record_values)),
    get_mode_record: (pin_count, bowls_per_frame) =>
      current_save.mode_records[best_score_key(pin_count, bowls_per_frame)],
  };
}
