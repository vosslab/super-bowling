import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { get_rack_pin_count } from "../config/pin_counts";
import type {
  FrameScore,
  MatchEffect,
  MatchSetup,
  MatchState,
  PlayerSetup,
} from "../game/contracts";
import { create_audio_controller, type AudioController, type ResultSound } from "../audio/audio";
import { create_match_state, reduce_match, type MatchAction } from "../game/match";
import { create_camera_state, reset_camera_for_roll, with_camera_mode } from "../render/camera";
import type { CameraState } from "../render/contracts";
import { format_frame_roll_marks } from "../game/score_display";
import {
  create_game_renderer,
  get_aim_guide_end_y,
  type GameRenderer,
} from "../render/game_renderer";
import {
  pin_snapshot_stride,
  snapshot_y_offset,
  type SimulationEvent,
} from "../simulation/protocol";
import { create_input_controller, type InputController } from "./input_controller";
import type { SimulationClient } from "./simulation_client";

type SnapshotHolder = {
  previous: Float32Array | undefined;
  current: Float32Array | undefined;
  received_at: number;
};

export type GameProps = {
  client: SimulationClient;
  setup: MatchSetup;
  auto_run?: boolean;
  mute_enabled(): boolean;
  reduced_motion(): boolean;
  on_set_mute(mute_enabled: boolean): void;
  on_set_reduced_motion(reduced_motion: boolean): void;
  on_match_complete(
    pin_count: MatchSetup["pin_count"],
    scores: Readonly<Record<number, number>>,
  ): void;
  on_exit(): void;
};

function phase_label(phase: MatchState["phase"]): string {
  const labels: Record<MatchState["phase"], string> = {
    setup: "Preparing match",
    rack_resetting: "Setting a fresh rack",
    aiming: "Aim your ball",
    rolling: "Ball rolling",
    result: "Roll complete",
    handoff: "Pass the keyboard",
    final: "Match complete",
    fatal: "Lane needs attention",
  };
  return labels[phase];
}

function score_text(score: number | undefined): string {
  return score === undefined ? "-" : String(score);
}

function power_percent(power: number): number {
  const minimum_power = 8;
  const maximum_power = 24;
  const percent = ((power - minimum_power) / (maximum_power - minimum_power)) * 100;
  return Math.round(Math.min(100, Math.max(0, percent)));
}

function find_player(state: MatchState, player_id: number): PlayerSetup {
  const player = state.players.find((candidate) => candidate.player_id === player_id);
  if (player === undefined) throw new Error("Every match player must remain available.");
  return player;
}

export function Game(props: GameProps): JSX.Element {
  const [match_state, set_match_state] = createSignal(create_match_state(props.setup));
  const [asset_message, set_asset_message] = createSignal("Loading original lane art...");
  const [auto_running, set_auto_running] = createSignal(false);
  const [drawn_pin_count, set_drawn_pin_count] = createSignal(0);
  const [draw_command_count, set_draw_command_count] = createSignal(0);
  const [camera_mode, set_camera_mode] = createSignal<"lane" | "deck">("lane");
  const snapshot_holder: SnapshotHolder = {
    previous: undefined,
    current: undefined,
    received_at: 0,
  };
  let canvas: HTMLCanvasElement | undefined;
  let handoff_button: HTMLButtonElement | undefined;
  let renderer: GameRenderer | undefined;
  let audio: AudioController | undefined;
  let camera: CameraState | undefined;
  let previous_fallen_pin_count = 0;
  let animation_frame = 0;
  let result_timer: number | undefined;
  let input_controller: InputController | undefined;
  let unsubscribe: (() => void) | undefined;

  function execute_effect(effect: MatchEffect): void {
    if (effect.type === "reset_rack") {
      previous_fallen_pin_count = 0;
      props.client.send({ type: "reset_rack", pin_count: effect.pin_count });
    }
    if (effect.type === "launch") {
      if (camera !== undefined && renderer !== undefined) {
        camera = reset_camera_for_roll(camera);
        renderer.set_camera(camera);
        set_camera_mode(camera.mode);
      }
      props.client.send({
        type: "launch",
        power: effect.power,
        lateral_offset: effect.lateral_offset,
      });
    }
    if (effect.type === "launch") audio?.start_roll();
    if (effect.type === "steer") props.client.send({ type: "steer", direction: effect.direction });
    if (effect.type === "match_complete")
      props.on_match_complete(props.setup.pin_count, effect.best_scores);
  }

  function dispatch(action: MatchAction): MatchState {
    const transition = reduce_match(match_state(), action);
    set_match_state(transition.state);
    for (const effect of transition.effects) execute_effect(effect);
    return transition.state;
  }

  function schedule_result_advance(state: MatchState): void {
    if (state.phase !== "result") return;
    if (result_timer !== undefined) window.clearTimeout(result_timer);
    result_timer = window.setTimeout(
      () => {
        result_timer = undefined;
        dispatch({ type: "advance_after_result" });
      },
      auto_running() ? 0 : 1200,
    );
  }

  function accept_snapshot(event: Extract<SimulationEvent, { type: "snapshot" }>): void {
    const fallen_pin_delta = Math.max(0, event.fallen_pin_count - previous_fallen_pin_count);
    previous_fallen_pin_count = event.fallen_pin_count;
    audio?.record_collision(fallen_pin_delta, performance.now());
    snapshot_holder.previous = snapshot_holder.current ?? event.snapshot_data;
    snapshot_holder.current = event.snapshot_data;
    snapshot_holder.received_at = performance.now();
    if (
      renderer !== undefined &&
      snapshot_holder.previous !== undefined &&
      snapshot_holder.current !== undefined
    ) {
      renderer.set_snapshot_pair({
        previous_snapshot: snapshot_holder.previous,
        current_snapshot: snapshot_holder.current,
        pin_count: event.pin_count,
      });
      const ball_offset = event.pin_count * pin_snapshot_stride;
      const ball_y =
        event.snapshot_data[ball_offset + snapshot_y_offset] ?? Number.NEGATIVE_INFINITY;
      if (camera !== undefined) {
        camera = with_camera_mode(camera, ball_y, props.reduced_motion());
        renderer.set_camera(camera);
        set_camera_mode(camera.mode);
      }
    }
    if (match_state().phase !== "rack_resetting") return;
    const ready_state = dispatch({ type: "rack_ready" });
    if (auto_running() && ready_state.phase === "aiming") dispatch({ type: "launch" });
  }

  function accept_event(event: SimulationEvent): void {
    if (event.type === "snapshot") return accept_snapshot(event);
    if (event.type === "ready") {
      // Worker events carry the complete triangle total, while setup retains the scale label.
      if (event.pin_count === match_state().pin_count) dispatch({ type: "start" });
      return;
    }
    if (event.type === "settled") {
      const before = match_state();
      if (before.phase !== "rolling") return;
      if (event.timed_out) {
        audio?.flush_collisions(performance.now());
        audio?.stop_roll();
        dispatch({
          type: "fatal",
          message: "The roll took too long to settle. Start a new match to recover.",
        });
      } else {
        const next = dispatch({ type: "settled", settled_roll: event });
        audio?.flush_collisions(performance.now());
        audio?.stop_roll();
        const result = select_result_sound(before, next, event);
        audio?.play_result(result);
        schedule_result_advance(next);
      }
      return;
    }
    if (event.type === "fatal") {
      audio?.stop_roll();
      dispatch({ type: "fatal", message: event.message });
    }
  }

  function select_result_sound(
    before: MatchState,
    next: MatchState,
    settled_roll: Extract<SimulationEvent, { type: "settled" }>,
  ): ResultSound {
    if (next.phase === "final") return "complete";
    const knocked_pin_count =
      (before.standing_pin_count_at_launch ?? 0) - settled_roll.standing_pin_count;
    if (
      before.standing_pin_count_at_launch === before.pin_count &&
      knocked_pin_count === before.pin_count
    ) {
      return "strike";
    }
    const completed_frame =
      next.score_cards[before.active_player_id]?.frames[before.current_frame_index];
    if (
      completed_frame !== undefined &&
      completed_frame.rolls.length >= 2 &&
      completed_frame.rolls[0] !== before.pin_count &&
      completed_frame.rolls[0]! + completed_frame.rolls[1]! === before.pin_count
    ) {
      return "spare";
    }
    return "open";
  }

  function resize_canvas(): void {
    if (canvas === undefined) return;
    const bounds = canvas.getBoundingClientRect();
    const device_scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * device_scale));
    canvas.height = Math.max(1, Math.round(bounds.height * device_scale));
  }

  function draw_frame(timestamp: number): void {
    if (renderer !== undefined && snapshot_holder.current !== undefined) {
      const alpha = Math.min(1, (timestamp - snapshot_holder.received_at) / (1000 / 60));
      const commands = renderer.draw(alpha);
      const pin_count = commands.filter(
        (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
      ).length;
      if (drawn_pin_count() !== pin_count) set_drawn_pin_count(pin_count);
      if (draw_command_count() !== commands.length) set_draw_command_count(commands.length);
      const asset_state = renderer.get_asset_state();
      if (asset_state.status === "ready" && asset_message() !== "") set_asset_message("");
      if (asset_state.status === "failed" && asset_message() !== asset_state.message)
        set_asset_message(asset_state.message);
    }
    animation_frame = requestAnimationFrame(draw_frame);
  }

  function update_aim(lateral_offset: number, power: number): void {
    dispatch({ type: "set_aim", lateral_offset, power });
  }
  function launch(): void {
    audio?.activate();
    dispatch({ type: "launch" });
  }
  function steer(direction: -1 | 0 | 1): void {
    dispatch({ type: "steer", direction });
  }
  function continue_turn(): void {
    dispatch({ type: "continue_turn" });
  }
  function run_deterministic_game(): void {
    set_auto_running(true);
    if (match_state().phase === "aiming") dispatch({ type: "launch" });
  }

  onMount(() => {
    if (canvas === undefined) throw new Error("The game lane canvas is required.");
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas rendering is unavailable in this browser.");
    resize_canvas();
    renderer = create_game_renderer(context);
    audio = create_audio_controller();
    audio.set_muted(props.mute_enabled());
    camera = create_camera_state(
      get_rack_pin_count(props.setup.pin_count),
      Number.NEGATIVE_INFINITY,
      props.reduced_motion(),
    );
    renderer.set_camera(camera);
    const resize_observer = new ResizeObserver(resize_canvas);
    resize_observer.observe(canvas);
    unsubscribe = props.client.subscribe(accept_event);
    input_controller = create_input_controller(window, {
      get_phase: () => {
        const phase = match_state().phase;
        return phase === "aiming" || phase === "rolling" ? phase : "other";
      },
      get_aim: () => match_state().aim,
      set_aim: update_aim,
      launch,
      steer,
    });
    animation_frame = requestAnimationFrame(draw_frame);
    if (props.auto_run) set_auto_running(true);
    props.client.send({ type: "initialize", pin_count: match_state().pin_count });
    onCleanup(() => resize_observer.disconnect());
  });

  createEffect(() => {
    const state = match_state();
    renderer?.set_ball_design(find_player(state, state.active_player_id).ball_design);
    renderer?.set_aim_guide(
      state.phase === "aiming"
        ? { lateral_offset: state.aim.lateral_offset, power: state.aim.power }
        : undefined,
    );
    audio?.set_muted(props.mute_enabled());
    if (camera !== undefined && renderer !== undefined) {
      const ball_y =
        snapshot_holder.current?.[
          match_state().pin_count * pin_snapshot_stride + snapshot_y_offset
        ];
      camera = with_camera_mode(camera, ball_y ?? Number.NEGATIVE_INFINITY, props.reduced_motion());
      renderer.set_camera(camera);
      set_camera_mode(camera.mode);
    }
    if (state.phase === "handoff") queueMicrotask(() => handoff_button?.focus());
  });

  onCleanup(() => {
    if (result_timer !== undefined) window.clearTimeout(result_timer);
    cancelAnimationFrame(animation_frame);
    input_controller?.dispose();
    unsubscribe?.();
    audio?.stop_roll();
    audio?.dispose();
    props.client.dispose();
  });

  const active_player = (): PlayerSetup =>
    find_player(match_state(), match_state().active_player_id);
  const handoff_players = (): { completed: PlayerSetup; next: PlayerSetup } | undefined => {
    const handoff = match_state().handoff;
    return handoff === undefined
      ? undefined
      : {
          completed: find_player(match_state(), handoff.completed_player_id),
          next: find_player(match_state(), handoff.next_player_id),
        };
  };

  return (
    <main
      class="play_shell"
      aria-label="Super Bowling game"
      data-phase={match_state().phase}
      data-drawn-pin-count={drawn_pin_count()}
      data-draw-command-count={draw_command_count()}
      data-camera-mode={camera_mode()}
      data-reduced-motion={props.reduced_motion() ? "true" : "false"}
      data-aim-guide={match_state().phase === "aiming" ? "visible" : "hidden"}
      data-aim-guide-offset={match_state().aim.lateral_offset.toFixed(1)}
      data-aim-guide-end-y={
        match_state().phase === "aiming" ? get_aim_guide_end_y(match_state().aim.power) : undefined
      }
    >
      <header class="play_header">
        <button class="back_button" type="button" onClick={() => props.on_exit()}>
          New match
        </button>
        <div>
          <p class="eyebrow">
            {props.setup.pin_count.toLocaleString()} mode -{" "}
            {match_state().pin_count.toLocaleString()} pins
          </p>
          <h1>Super Bowling</h1>
        </div>
        <p class="player_name">{active_player().name}</p>
      </header>
      <section class="match_roster" aria-label="Player roster">
        <For each={match_state().players}>
          {(player) => (
            <p classList={{ active_player: player.player_id === match_state().active_player_id }}>
              <span class="roster_ball" style={{ background: player.ball_design.base_color }} />
              {player.name}{" "}
              <strong>
                {score_text(match_state().score_cards[player.player_id]?.frames[9]?.score)}
              </strong>
            </p>
          )}
        </For>
      </section>
      <section
        class="score_strip"
        aria-label={`Ten-frame ${match_state().pin_count.toLocaleString()}-pin score card for ${active_player().name}`}
      >
        <For each={Array.from({ length: 10 }, (_, frame_index) => frame_index)}>
          {(frame_index): JSX.Element => {
            const frame = (): FrameScore | undefined =>
              match_state().score_cards[match_state().active_player_id]?.frames[frame_index];
            return (
              <div
                class="frame_cell"
                data-frame-cell
                data-active={frame_index === match_state().current_frame_index ? "true" : "false"}
              >
                <span class="frame_number">{frame_index + 1}</span>
                <span class="frame_rolls">
                  <For
                    each={
                      frame() === undefined
                        ? []
                        : format_frame_roll_marks(frame()!, match_state().pin_count)
                    }
                  >
                    {(mark) => (
                      <span
                        data-roll-mark={mark === "X" ? "strike" : mark === "/" ? "spare" : "roll"}
                      >
                        {mark}
                      </span>
                    )}
                  </For>
                </span>
                <strong>{score_text(frame()?.score)}</strong>
              </div>
            );
          }}
        </For>
      </section>
      <section
        class="lane_panel"
        aria-label={`Front-facing faux-3D ${props.setup.pin_count.toLocaleString()} mode with ${match_state().pin_count.toLocaleString()} pins`}
      >
        <canvas
          ref={(element) => {
            canvas = element;
          }}
          class="game_canvas"
          role="img"
          aria-label={`Bowling lane with ${props.setup.pin_count.toLocaleString()} mode and ${match_state().pin_count.toLocaleString()} pins for ${active_player().name}`}
        />
        <Show when={asset_message()}>
          {(message) => (
            <p class="asset_notice" role="status">
              {message()}
            </p>
          )}
        </Show>
      </section>
      <section class="control_deck" aria-label="Bowling controls and match status">
        <div class="status_block" aria-live="polite">
          <p class="status_label">{phase_label(match_state().phase)}</p>
          <Show when={match_state().phase === "result" && match_state().result_message}>
            {(message) => (
              <p class="roll_result" role="status">
                {message()}
              </p>
            )}
          </Show>
          <p data-standing-count>
            {match_state().standing_pin_count} of {match_state().pin_count.toLocaleString()} pins
            standing
          </p>
          <p>
            Frame {match_state().current_frame_index + 1}, roll{" "}
            {match_state().current_roll_index + 1}
          </p>
        </div>
        <div class="aim_block">
          <label>
            Aim <output>{match_state().aim.lateral_offset.toFixed(1)}</output>
          </label>
          <div class="power_control">
            <label for="power_meter">
              Power <output>{match_state().aim.power.toFixed(0)}</output>
            </label>
            <meter
              id="power_meter"
              data-power-meter
              min="8"
              max="24"
              low="12"
              high="20"
              optimum="20"
              value={match_state().aim.power}
              aria-label={`Power ${match_state().aim.power.toFixed(0)} of 24`}
            >
              {power_percent(match_state().aim.power)}%
            </meter>
          </div>
          <p>Arrow keys aim and power. Space bowls. Left and right steer a rolling ball.</p>
          <p class="aim_guide_readout" data-aim-guide-readout aria-live="polite">
            Projected path: {match_state().aim.lateral_offset.toFixed(1)} lane offset, power{" "}
            {match_state().aim.power.toFixed(0)}.
          </p>
        </div>
        <div class="play_preference_controls" aria-label="Game preferences">
          <button
            class="preference_button"
            type="button"
            aria-pressed={props.mute_enabled()}
            onClick={() => {
              audio?.activate();
              props.on_set_mute(!props.mute_enabled());
            }}
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
        </div>
        <Show when={match_state().phase === "aiming"}>
          <button class="bowl_button" type="button" onClick={launch}>
            Bowl now
          </button>
        </Show>
        <Show when={props.auto_run && match_state().phase !== "final"}>
          <button class="fixture_button" type="button" onClick={run_deterministic_game}>
            Run deterministic perfect game
          </button>
        </Show>
        <Show when={match_state().phase === "final"}>
          <div class="final_result" role="status">
            <p>Final score</p>
            <strong>
              {score_text(
                match_state().score_cards[match_state().active_player_id]?.frames[9]?.score,
              )}
            </strong>
          </div>
        </Show>
        <Show when={match_state().phase === "fatal"}>
          <div class="fatal_result" role="alert">
            <p>{match_state().fatal_message}</p>
            <button type="button" onClick={() => props.on_exit()}>
              Return to setup
            </button>
          </div>
        </Show>
      </section>
      <Show when={handoff_players()}>
        {(players) => (
          <section
            class="handoff_panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="handoff_heading"
          >
            <div>
              <p class="eyebrow">Frame {match_state().handoff!.frame_index + 1} complete</p>
              <h2 id="handoff_heading">Pass the keyboard</h2>
              <p>
                {players().completed.name} is done. {players().next.name}, your fresh rack is ready
                next.
              </p>
              <button
                ref={(element) => {
                  handoff_button = element;
                }}
                class="start_button"
                type="button"
                onClick={continue_turn}
              >
                {players().next.name}, start your turn
              </button>
            </div>
          </section>
        )}
      </Show>
    </main>
  );
}
