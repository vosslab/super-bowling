import type { SaveFileV1, StorageLike } from "./contracts";
import { create_default_save, normalize_save_file, save_storage_key } from "./save_file";

export function load_save(storage: StorageLike): SaveFileV1 {
  let stored_value: string | null;
  try {
    stored_value = storage.getItem(save_storage_key);
  } catch {
    return create_default_save();
  }
  if (typeof stored_value !== "string") return create_default_save();
  try {
    return normalize_save_file(JSON.parse(stored_value) as unknown);
  } catch {
    return create_default_save();
  }
}

export function store_save(storage: StorageLike, save: SaveFileV1): void {
  const normalized_save = normalize_save_file(save);
  try {
    storage.setItem(save_storage_key, JSON.stringify(normalized_save));
  } catch {
    // Storage quotas and privacy modes keep the current in-memory save usable.
  }
}
