import { Show, createSignal, type JSX } from "solid-js";

import type { PinCount } from "../config/pin_counts";
import type { MatchSetup } from "../game/contracts";
import { create_save_settings, type SaveSettingsController } from "../save/settings";
import { save_storage_key } from "../save/save_file";
import type { SaveFileV3, StorageLike } from "../save/contracts";
import { best_score_key } from "../save/save_file";
import { Game } from "./game";
import { create_simulation_client, type SimulationClient } from "./simulation_client";
import {
  create_camera_deck_fixture,
  create_partial_knock_fixture,
  create_perfect_game_fixture,
  create_preview_stale_fixture,
  create_zero_knock_fixture,
} from "./test_fixture";
import { Setup } from "./setup";

type FixtureMode =
  "perfect_game" | "zero_knock" | "partial_knock" | "camera_deck" | "preview_stale" | undefined;

const in_memory_storage = new Map<string, string>();

function get_browser_storage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: (key) => in_memory_storage.get(key) ?? null,
      setItem: (key, value) => in_memory_storage.set(key, value),
    };
  }
}

function has_stored_save(storage: StorageLike): boolean {
  try {
    return storage.getItem(save_storage_key) !== null;
  } catch {
    return false;
  }
}

function create_app_settings(storage: StorageLike): SaveSettingsController {
  const settings = create_save_settings(storage);
  if (!has_stored_save(storage) && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    settings.set_reduced_motion(true);
  }
  return settings;
}

function read_fixture_mode(): FixtureMode {
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  return fixture === "perfect_game" ||
    fixture === "zero_knock" ||
    fixture === "partial_knock" ||
    fixture === "camera_deck" ||
    fixture === "preview_stale"
    ? fixture
    : undefined;
}

export function App(): JSX.Element {
  const fixture_mode = read_fixture_mode();
  const settings = create_app_settings(get_browser_storage());
  const [saved, set_saved] = createSignal<SaveFileV3>(settings.get_save());
  const [setup, set_setup] = createSignal<MatchSetup>();
  const [client, set_client] = createSignal<SimulationClient>();

  function on_start(next_setup: MatchSetup): void {
    set_saved(
      settings.set_recent_setup({
        bowls_per_frame: next_setup.bowls_per_frame ?? 2,
        pin_count: next_setup.pin_count,
        players: next_setup.players.map((player) => ({
          name: player.name,
          ball_design: player.ball_design,
        })),
      }),
    );
    const next_client =
      fixture_mode === "perfect_game"
        ? create_perfect_game_fixture(next_setup.pin_count)
        : fixture_mode === "zero_knock"
          ? create_zero_knock_fixture(next_setup.pin_count)
          : fixture_mode === "partial_knock"
            ? create_partial_knock_fixture(next_setup.pin_count)
            : fixture_mode === "preview_stale"
              ? create_preview_stale_fixture(next_setup.pin_count)
              : fixture_mode === "camera_deck"
                ? create_camera_deck_fixture(next_setup.pin_count)
                : create_simulation_client();
    set_client(next_client);
    set_setup(next_setup);
  }

  function set_mute_enabled(mute_enabled: boolean): void {
    set_saved(settings.set_mute_enabled(mute_enabled));
  }

  function set_reduced_motion(reduced_motion: boolean): void {
    set_saved(settings.set_reduced_motion(reduced_motion));
  }

  function record_completed_scores(
    pin_count: PinCount,
    bowls_per_frame: number,
    scores: Readonly<Record<number, number>>,
  ): void {
    const best_score = Math.max(...Object.values(scores));
    set_saved(settings.record_completed_score(pin_count, bowls_per_frame, best_score));
  }

  function exit_game(): void {
    set_setup(undefined);
    set_client(undefined);
  }

  return (
    <Show
      when={setup() !== undefined && client() !== undefined}
      fallback={
        <Setup
          on_start={on_start}
          fixture_mode={fixture_mode}
          initial_setup={() => saved().recent_setup}
          mute_enabled={() => saved().mute_enabled}
          reduced_motion={() => saved().reduced_motion}
          best_score={(pin_count, bowls_per_frame) =>
            saved().best_scores[best_score_key(pin_count, bowls_per_frame)]
          }
          on_set_mute={set_mute_enabled}
          on_set_reduced_motion={set_reduced_motion}
        />
      }
    >
      <Game
        client={client()!}
        setup={setup()!}
        auto_run={fixture_mode === "perfect_game"}
        mute_enabled={() => saved().mute_enabled}
        reduced_motion={() => saved().reduced_motion}
        on_set_mute={set_mute_enabled}
        on_set_reduced_motion={set_reduced_motion}
        on_match_complete={record_completed_scores}
        on_exit={exit_game}
      />
    </Show>
  );
}
