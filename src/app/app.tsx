import { Show, createSignal, type JSX } from "solid-js";

import type { MatchSetup, PlayerMatchSummary } from "../game/contracts";
import { fold_match_summaries } from "../game/match_stats";
import { create_save_settings, type SaveSettingsController } from "../save/settings";
import { save_storage_key } from "../save/save_file";
import type { ModeRecord, SaveFileV4, StorageLike } from "../save/contracts";
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

type ActiveGame = {
  client: SimulationClient;
  previous_record: ModeRecord | undefined;
  setup: MatchSetup;
};

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
  const [saved, set_saved] = createSignal<SaveFileV4>(settings.get_save());
  const [active_game, set_active_game] = createSignal<ActiveGame>();

  function create_match_client(pin_count: MatchSetup["pin_count"]): SimulationClient {
    const next_client =
      fixture_mode === "perfect_game"
        ? create_perfect_game_fixture(pin_count)
        : fixture_mode === "zero_knock"
          ? create_zero_knock_fixture(pin_count)
          : fixture_mode === "partial_knock"
            ? create_partial_knock_fixture(pin_count)
            : fixture_mode === "preview_stale"
              ? create_preview_stale_fixture(pin_count)
              : fixture_mode === "camera_deck"
                ? create_camera_deck_fixture(pin_count)
                : create_simulation_client();
    return next_client;
  }

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
    set_active_game({
      client: create_match_client(next_setup.pin_count),
      previous_record: settings.get_mode_record(
        next_setup.pin_count,
        next_setup.bowls_per_frame ?? 2,
      ),
      setup: next_setup,
    });
  }

  function set_mute_enabled(mute_enabled: boolean): void {
    set_saved(settings.set_mute_enabled(mute_enabled));
  }

  function set_reduced_motion(reduced_motion: boolean): void {
    set_saved(settings.set_reduced_motion(reduced_motion));
  }

  function record_completed_match(summaries: readonly PlayerMatchSummary[]): void {
    const completed_game = active_game();
    if (completed_game === undefined) throw new Error("A completed match must retain its setup.");
    set_saved(
      settings.record_completed_match(
        completed_game.setup.pin_count,
        completed_game.setup.bowls_per_frame ?? 2,
        fold_match_summaries(summaries),
      ),
    );
  }

  function exit_game(): void {
    set_active_game(undefined);
  }

  function replay_game(): void {
    const completed_game = active_game();
    if (completed_game === undefined) throw new Error("A replay must retain its match setup.");
    const completed_setup = completed_game.setup;
    set_active_game({
      client: create_match_client(completed_setup.pin_count),
      previous_record: settings.get_mode_record(
        completed_setup.pin_count,
        completed_setup.bowls_per_frame ?? 2,
      ),
      setup: completed_setup,
    });
  }

  return (
    <Show
      when={active_game()}
      keyed
      fallback={
        <Setup
          on_start={on_start}
          fixture_mode={fixture_mode}
          initial_setup={() => saved().recent_setup}
          mute_enabled={() => saved().mute_enabled}
          reduced_motion={() => saved().reduced_motion}
          mode_record={(pin_count, bowls_per_frame) =>
            settings.get_mode_record(pin_count, bowls_per_frame)
          }
          on_set_mute={set_mute_enabled}
          on_set_reduced_motion={set_reduced_motion}
        />
      }
    >
      {(game) => (
        <Game
          client={game.client}
          setup={game.setup}
          auto_run={fixture_mode === "perfect_game"}
          mute_enabled={() => saved().mute_enabled}
          reduced_motion={() => saved().reduced_motion}
          on_set_mute={set_mute_enabled}
          on_set_reduced_motion={set_reduced_motion}
          on_match_complete={record_completed_match}
          on_exit={exit_game}
          on_replay={replay_game}
          previous_record={() => game.previous_record}
        />
      )}
    </Show>
  );
}
