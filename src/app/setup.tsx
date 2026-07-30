import { For, Show, createMemo, createSignal, type JSX } from "solid-js";

import { create_player_id } from "../brands";
import { get_mode_label, supported_pin_counts, type PinCount } from "../config/pin_counts";
import { normalize_ball_design, type BallDesign } from "../designer/ball_design";
import { BallDesigner } from "../designer/ball_designer";
import type { MatchSetup } from "../game/contracts";
import type { RecentMatchSetup } from "../save/contracts";

type PlayerDraft = {
  name: string;
  ball_design: BallDesign;
};

export type SetupDraft = {
  pin_count: PinCount;
  players: readonly PlayerDraft[];
};

const starter_designs: readonly BallDesign[] = [
  normalize_ball_design({
    base_color: "#1479D4",
    accent_color: "#C9F3FF",
    pattern: "solid",
    monogram: "A",
  }),
  normalize_ball_design({
    base_color: "#D34B3E",
    accent_color: "#FFE76D",
    pattern: "single_band",
    monogram: "B",
  }),
  normalize_ball_design({
    base_color: "#3DAD72",
    accent_color: "#F3F6C9",
    pattern: "double_band",
    monogram: "C",
  }),
  normalize_ball_design({
    base_color: "#8054C7",
    accent_color: "#FFB75B",
    pattern: "chevron",
    monogram: "D",
  }),
];

function default_player_draft(index: number): PlayerDraft {
  const design = starter_designs[index];
  if (design === undefined) throw new Error("A starter design is required for every player.");
  return { name: `Player ${index + 1}`, ball_design: design };
}

export function create_match_setup(draft: SetupDraft): MatchSetup {
  const players = draft.players.map((player, index) => {
    const trimmed_name = player.name.trim();
    return {
      player_id: create_player_id(index),
      name: trimmed_name === "" ? `Player ${index + 1}` : trimmed_name,
      ball_design: normalize_ball_design(player.ball_design),
    };
  });
  if (players.length < 1 || players.length > 4) throw new Error("Choose one through four players.");
  return { pin_count: draft.pin_count, players };
}

export type SetupProps = {
  on_start(setup: MatchSetup): void;
  initial_setup(): RecentMatchSetup;
  mute_enabled(): boolean;
  reduced_motion(): boolean;
  best_score(pin_count: PinCount): number | undefined;
  on_set_mute(mute_enabled: boolean): void;
  on_set_reduced_motion(reduced_motion: boolean): void;
  fixture_mode?: "perfect_game" | "zero_knock" | "camera_deck";
};

export function Setup(props: SetupProps): JSX.Element {
  const [draft, set_draft] = createSignal<SetupDraft>({
    pin_count: props.initial_setup().pin_count,
    players: props.initial_setup().players.map((player) => ({
      name: player.name,
      ball_design: normalize_ball_design(player.ball_design),
    })),
  });
  const [selected_player_index, set_selected_player_index] = createSignal(0);
  const selected_player = createMemo(() => draft().players[selected_player_index()]);

  function update_player(index: number, update: Partial<PlayerDraft>): void {
    const next_players = draft().players.map((player, player_index) =>
      player_index === index ? { ...player, ...update } : player,
    );
    set_draft({ ...draft(), players: next_players });
  }

  function add_player(): void {
    const players = draft().players;
    if (players.length >= 4) return;
    set_draft({ ...draft(), players: [...players, default_player_draft(players.length)] });
    set_selected_player_index(players.length);
  }

  function remove_player(index: number): void {
    const players = draft().players;
    if (players.length <= 1) return;
    const next_players = players.filter((_, player_index) => player_index !== index);
    const current_selected_index = selected_player_index();
    const next_selected_index =
      index < current_selected_index
        ? current_selected_index - 1
        : Math.min(current_selected_index, next_players.length - 1);
    set_draft({ ...draft(), players: next_players });
    set_selected_player_index(next_selected_index);
  }

  function start_match(): void {
    props.on_start(create_match_setup(draft()));
  }

  const start_label = (): string => {
    const current = draft();
    const count = current.players.length;
    return `Start ${get_mode_label(current.pin_count)} for ${count} ${count === 1 ? "player" : "players"}`;
  };

  return (
    <main class="game_shell setup_shell" aria-label="Super Bowling setup">
      <header class="top_bar">
        <p class="brand">SUPER BOWLING</p>
        <p class="mode_label">Build a giant rack and pass the keyboard.</p>
      </header>
      <section class="setup_panel">
        <header class="setup_heading">
          <p class="eyebrow">16:10 local arcade night</p>
          <h1>Set up your super match</h1>
          <p>
            Choose a complete triangle, name your bowlers, then tune the selected player&apos;s
            sphere.
          </p>
        </header>
        <div class="setup_board">
          <section class="match_column" aria-label="Match setup">
            <fieldset class="pin_count_picker">
              <legend>Choose your giant rack</legend>
              <div class="pin_count_row" aria-label="Supported pin counts">
                <For each={supported_pin_counts}>
                  {(count) => (
                    <button
                      class="pin_count_button"
                      type="button"
                      aria-pressed={draft().pin_count === count}
                      onClick={() => set_draft({ ...draft(), pin_count: count })}
                    >
                      {get_mode_label(count)}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
            <p class="best_score" aria-live="polite">
              Best for {get_mode_label(draft().pin_count)}:{" "}
              {props.best_score(draft().pin_count) ?? "-"}
            </p>
            <section class="player_roster" aria-label="Players">
              <header class="roster_heading">
                <div>
                  <p class="eyebrow">Bowlers</p>
                  <h2>Pass the keyboard</h2>
                </div>
                <Show when={draft().players.length < 4}>
                  <button class="add_player_button" type="button" onClick={add_player}>
                    Add player
                  </button>
                </Show>
              </header>
              <For each={draft().players}>
                {(player, index) => (
                  <article
                    class="player_card"
                    classList={{ selected_player: selected_player_index() === index() }}
                  >
                    <button
                      class="player_select_button"
                      type="button"
                      aria-pressed={selected_player_index() === index()}
                      aria-label={`Customize Player ${index() + 1}: ${player.name || "unnamed"}`}
                      onClick={() => set_selected_player_index(index())}
                    >
                      <span
                        class="player_ball_swatch"
                        style={{ background: player.ball_design.base_color }}
                        aria-hidden="true"
                      />
                      <span>Player {index() + 1}</span>
                    </button>
                    <label class="player_setup">
                      <span class="sr_only">Player {index() + 1} name</span>
                      <input
                        aria-label={`Player ${index() + 1} name`}
                        maxlength="20"
                        value={player.name}
                        onInput={(event) =>
                          update_player(index(), { name: event.currentTarget.value })
                        }
                      />
                    </label>
                    <Show when={draft().players.length > 1}>
                      <button
                        type="button"
                        class="text_button"
                        onClick={() => remove_player(index())}
                      >
                        Remove player {index() + 1}
                      </button>
                    </Show>
                  </article>
                )}
              </For>
            </section>
            <button class="start_button setup_start_button" type="button" onClick={start_match}>
              {start_label()}
            </button>
          </section>
          <section class="ball_garage" aria-label="Ball garage">
            <header class="garage_heading">
              <p class="eyebrow">Ball garage</p>
              <h2>
                {selected_player()?.name.trim() || `Player ${selected_player_index() + 1}`}&apos;s
                ball
              </h2>
              <p>Give this bowling sphere its own colors, pattern, and optional monogram.</p>
            </header>
            <Show when={selected_player()}>
              {(player) => (
                <BallDesigner
                  player_name={player().name.trim() || `Player ${selected_player_index() + 1}`}
                  design={player().ball_design}
                  on_change={(ball_design) =>
                    update_player(selected_player_index(), { ball_design })
                  }
                />
              )}
            </Show>
          </section>
        </div>
        <section class="preference_controls" aria-label="Match preferences">
          <button
            class="preference_button"
            type="button"
            aria-pressed={props.mute_enabled()}
            onClick={() => props.on_set_mute(!props.mute_enabled())}
          >
            Mute {props.mute_enabled() ? "on" : "off"}
          </button>
          <button
            class="preference_button"
            type="button"
            aria-pressed={props.reduced_motion()}
            onClick={() => props.on_set_reduced_motion(!props.reduced_motion())}
          >
            Reduced motion {props.reduced_motion() ? "on" : "off"}
          </button>
        </section>
        <Show when={props.fixture_mode === "perfect_game"}>
          <aside class="fixture_tools" aria-label="Fixture controls">
            <button class="fixture_button" type="button" onClick={start_match}>
              Run deterministic perfect game
            </button>
          </aside>
        </Show>
      </section>
    </main>
  );
}
