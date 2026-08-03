import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { get_rack_pin_count } from "../config/pin_counts";
import type {
  FrameScore,
  MatchEffect,
  MatchSetup,
  MatchState,
  PlayerMatchSummary,
  PlayerSetup,
} from "../game/contracts";
import { create_audio_controller, type AudioController, type ResultSound } from "../audio/audio";
import { create_match_state, reduce_match, type MatchAction } from "../game/match";
import { fold_match_summaries, type MatchRecordValues } from "../game/match_stats";
import { is_perfect_game, scoreboard_labels, strike_run_term } from "../game/bowling_terms";
import {
  aim_limits,
  aim_control_steps,
  angle_in_degrees,
  board_position_limits,
  start_position_from_boards,
  start_position_in_boards,
} from "../game/aim";
import {
  advance_camera_for_ball,
  create_camera_state,
  reset_camera_for_roll,
  with_reduced_motion,
} from "../render/camera";
import type { CameraState } from "../render/contracts";
import { format_frame_roll_marks } from "../game/score_display";
import { bowls_per_frame_rule_text } from "../game/bowls_per_frame";
import type { ModeRecord } from "../save/contracts";
import { create_game_renderer, type GameRenderer } from "../render/game_renderer";
import {
  pin_snapshot_stride,
  read_snapshot_ball,
  type SimulationEvent,
} from "../simulation/protocol";
import { create_input_controller, type InputController } from "./input_controller";
import { earned_moment, earned_moment_state, type EarnedMoment } from "./earned_moments";
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
  on_match_complete(summaries: readonly PlayerMatchSummary[]): void;
  on_exit(): void;
  previous_record(): ModeRecord | undefined;
};

function phase_label(phase: MatchState["phase"]): string {
  const labels: Record<MatchState["phase"], string> = {
    setup: "Preparing match",
    rack_resetting: "Setting a fresh rack",
    aiming: "Aim your ball",
    rolling: "Ball rolling",
    result: "Roll complete",
    sweeping: "Clearing fallen pins",
    handoff: "Pass the keyboard",
    final: "Match complete",
    fatal: "Lane needs attention",
  };
  return labels[phase];
}

function score_text(score: number | undefined): string {
  return score === undefined ? "-" : String(score);
}

function earned_moment_label(moment: EarnedMoment): string {
  return moment.kind === "high_game" ? scoreboard_labels.high_game : moment.term.toUpperCase();
}

function earned_moment_support_text(moment: EarnedMoment): string | undefined {
  return moment.kind === "high_game" ? `New high score: ${moment.score}` : undefined;
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
  const [drawn_fallen_pin_count, set_drawn_fallen_pin_count] = createSignal(0);
  const [draw_command_count, set_draw_command_count] = createSignal(0);
  const [drawn_ball, set_drawn_ball] = createSignal(false);
  const [drawn_aim_guide, set_drawn_aim_guide] = createSignal(false);
  const [drawn_ball_screen_x, set_drawn_ball_screen_x] = createSignal<number | undefined>();
  const [drawn_ball_screen_y, set_drawn_ball_screen_y] = createSignal<number | undefined>();
  const [drawn_aim_guide_first_screen_x, set_drawn_aim_guide_first_screen_x] = createSignal<
    number | undefined
  >();
  const [camera_progress, set_camera_progress] = createSignal(0);
  const [ball_in_pit, set_ball_in_pit] = createSignal(false);
  const [preview_path, set_preview_path] = createSignal<Float32Array | undefined>();
  const [current_earned_moment, set_current_earned_moment] = createSignal<
    EarnedMoment | undefined
  >();
  const [final_record, set_final_record] = createSignal<MatchRecordValues | undefined>();
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
  let earned_moment_timer: number | undefined;
  let preview_timer: number | undefined;
  let preview_request_id = 0;
  let expected_preview_request_id: number | undefined;
  let input_controller: InputController | undefined;
  let unsubscribe: (() => void) | undefined;
  let high_game_already_fired = false;

  function apply_camera(next_camera: CameraState): void {
    camera = next_camera;
    renderer?.set_camera(camera);
    if (camera_progress() !== camera.shot_progress) set_camera_progress(camera.shot_progress);
  }

  function execute_effect(effect: MatchEffect): void {
    if (effect.type === "reset_rack") {
      previous_fallen_pin_count = 0;
      if (camera !== undefined && renderer !== undefined) {
        apply_camera(reset_camera_for_roll(camera));
      }
      props.client.send({ type: "reset_rack", pin_count: effect.pin_count });
    }
    if (effect.type === "launch") {
      if (camera !== undefined && renderer !== undefined) {
        apply_camera(reset_camera_for_roll(camera));
      }
      props.client.send({
        type: "launch",
        power: effect.power,
        start_position: effect.start_position,
        angle: effect.angle,
        spin: effect.spin,
      });
    }
    if (effect.type === "sweep_deadwood") props.client.send({ type: "sweep_deadwood" });
    if (effect.type === "prepare_next_roll") {
      if (camera !== undefined && renderer !== undefined) {
        apply_camera(reset_camera_for_roll(camera));
      }
      props.client.send({ type: "prepare_next_roll" });
    }
    if (effect.type === "launch") audio?.start_roll();
    if (effect.type === "match_complete") {
      set_final_record(fold_match_summaries(effect.summaries));
      props.on_match_complete(effect.summaries);
    }
  }

  function dispatch(action: MatchAction): MatchState {
    if (action.type === "start") high_game_already_fired = false;
    const transition = reduce_match(match_state(), action);
    set_match_state(transition.state);
    for (const effect of transition.effects) execute_effect(effect);
    return transition.state;
  }

  function show_earned_moment(moment: EarnedMoment): void {
    set_current_earned_moment(moment);
    if (earned_moment_timer !== undefined) window.clearTimeout(earned_moment_timer);
    earned_moment_timer = window.setTimeout(() => {
      earned_moment_timer = undefined;
      set_current_earned_moment(undefined);
    }, 1800);
  }

  function evaluate_earned_moment(before: MatchState, next: MatchState): void {
    const player_id = before.active_player_id;
    const previous_card = before.score_cards[player_id];
    const current_card = next.score_cards[player_id];
    if (previous_card === undefined || current_card === undefined) return;

    const moment = earned_moment({
      previous_record: props.previous_record(),
      previous_state: earned_moment_state(
        previous_card.frames,
        before.pin_count,
        before.bowls_per_frame,
      ),
      current_state: earned_moment_state(current_card.frames, next.pin_count, next.bowls_per_frame),
      high_game_already_fired,
    });
    if (moment === undefined) return;

    if (moment.kind === "high_game") high_game_already_fired = true;
    show_earned_moment(moment);
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
    if (match_state().phase === "rolling") {
      audio?.record_collision(fallen_pin_delta, performance.now());
    }
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
      const ball = read_snapshot_ball(event.snapshot_data, event.pin_count * pin_snapshot_stride);
      set_ball_in_pit(ball.in_pit);
      // The worker may settle immediately after pit capture, before another
      // animation frame can interpolate the terminal snapshot. Latch that
      // physical endpoint so the result holds the roll's final framing.
      if (camera !== undefined && match_state().phase === "rolling" && ball.in_pit) {
        apply_camera(advance_camera_for_ball(camera, ball.y, props.reduced_motion()));
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
    if (event.type === "preview_path") {
      if (
        match_state().phase === "aiming" &&
        event.pin_count === match_state().pin_count &&
        event.request_id === expected_preview_request_id
      ) {
        set_preview_path(event.points);
      }
      return;
    }
    if (event.type === "sweep_complete") {
      if (event.pin_count === match_state().pin_count) dispatch({ type: "sweep_complete" });
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
        evaluate_earned_moment(before, next);
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
      if (
        camera !== undefined &&
        snapshot_holder.previous !== undefined &&
        match_state().phase === "rolling"
      ) {
        const ball_offset = match_state().pin_count * pin_snapshot_stride;
        const previous_ball = read_snapshot_ball(snapshot_holder.previous, ball_offset);
        const current_ball = read_snapshot_ball(snapshot_holder.current, ball_offset);
        const interpolated_y = previous_ball.y + (current_ball.y - previous_ball.y) * alpha;
        apply_camera(advance_camera_for_ball(camera, interpolated_y, props.reduced_motion()));
      }
      const commands = renderer.draw(alpha);
      const pin_count = commands.filter(
        (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
      ).length;
      const fallen_pin_count = commands.filter((command) => command.kind === "fallen_pin").length;
      const ball = commands.find((command) => command.kind === "ball");
      const aim_guide = commands.find((command) => command.kind === "aim_guide");
      if (drawn_pin_count() !== pin_count) set_drawn_pin_count(pin_count);
      if (drawn_fallen_pin_count() !== fallen_pin_count)
        set_drawn_fallen_pin_count(fallen_pin_count);
      if (draw_command_count() !== commands.length) set_draw_command_count(commands.length);
      if (drawn_ball() !== (ball !== undefined)) set_drawn_ball(ball !== undefined);
      if (drawn_aim_guide() !== (aim_guide !== undefined))
        set_drawn_aim_guide(aim_guide !== undefined);
      const ball_screen_x = ball?.x;
      if (drawn_ball_screen_x() !== ball_screen_x) set_drawn_ball_screen_x(ball_screen_x);
      const ball_screen_y = ball?.y;
      if (drawn_ball_screen_y() !== ball_screen_y) set_drawn_ball_screen_y(ball_screen_y);
      const aim_guide_first_screen_x = aim_guide?.points[0]?.x;
      if (drawn_aim_guide_first_screen_x() !== aim_guide_first_screen_x) {
        set_drawn_aim_guide_first_screen_x(aim_guide_first_screen_x);
      }
      const asset_state = renderer.get_asset_state();
      if (asset_state.status === "ready" && asset_message() !== "") set_asset_message("");
      if (asset_state.status === "failed" && asset_message() !== asset_state.message)
        set_asset_message(asset_state.message);
    }
    animation_frame = requestAnimationFrame(draw_frame);
  }

  function update_aim(aim: MatchState["aim"]): void {
    dispatch({ type: "set_aim", aim });
  }

  function request_preview(state: MatchState): void {
    if (preview_timer !== undefined) window.clearTimeout(preview_timer);
    const request_id = preview_request_id + 1;
    preview_request_id = request_id;
    expected_preview_request_id = undefined;
    set_preview_path(undefined);
    if (state.phase !== "aiming") return;
    const { pin_count, aim } = state;
    preview_timer = window.setTimeout(() => {
      preview_timer = undefined;
      expected_preview_request_id = request_id;
      props.client.send({ type: "preview_path", request_id, pin_count, ...aim });
    }, 80);
  }
  function launch(): void {
    audio?.activate();
    dispatch({ type: "launch" });
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
    camera = create_camera_state(get_rack_pin_count(props.setup.pin_count), props.reduced_motion());
    renderer.set_camera(camera);
    const resize_observer = new ResizeObserver(resize_canvas);
    resize_observer.observe(canvas);
    unsubscribe = props.client.subscribe(accept_event);
    input_controller = create_input_controller(window, {
      get_phase: () => {
        const phase = match_state().phase;
        return phase === "aiming" ? phase : "other";
      },
      get_pin_count: () => match_state().pin_count,
      get_aim: () => match_state().aim,
      set_aim: update_aim,
      launch,
    });
    animation_frame = requestAnimationFrame(draw_frame);
    if (props.auto_run) set_auto_running(true);
    props.client.send({ type: "initialize", pin_count: match_state().pin_count });
    onCleanup(() => resize_observer.disconnect());
  });

  createEffect(() => {
    const state = match_state();
    renderer?.set_ball_design(find_player(state, state.active_player_id).ball_design);
    renderer?.set_aim_presentation(state.phase === "aiming" ? state.aim.start_position : undefined);
    renderer?.set_ball_visible(state.phase !== "sweeping");
    renderer?.set_aim_guide(
      state.phase === "aiming" && preview_path() !== undefined
        ? { lateral_offset: state.aim.start_position, preview_path: preview_path()! }
        : undefined,
    );
    audio?.set_muted(props.mute_enabled());
    if (camera !== undefined && renderer !== undefined) {
      apply_camera(with_reduced_motion(camera, props.reduced_motion()));
    }
    if (state.phase === "handoff") queueMicrotask(() => handoff_button?.focus());
  });

  createEffect(() => {
    request_preview(match_state());
  });

  onCleanup(() => {
    if (result_timer !== undefined) window.clearTimeout(result_timer);
    if (earned_moment_timer !== undefined) window.clearTimeout(earned_moment_timer);
    if (preview_timer !== undefined) window.clearTimeout(preview_timer);
    cancelAnimationFrame(animation_frame);
    input_controller?.dispose();
    unsubscribe?.();
    audio?.stop_roll();
    audio?.dispose();
    props.client.dispose();
  });

  const active_player = (): PlayerSetup =>
    find_player(match_state(), match_state().active_player_id);
  const current_aim_limits = (): ReturnType<typeof aim_limits> =>
    aim_limits(match_state().pin_count);
  const current_board_limits = (): ReturnType<typeof board_position_limits> =>
    board_position_limits(match_state().pin_count);
  const current_control_steps = (): ReturnType<typeof aim_control_steps> =>
    aim_control_steps(match_state().pin_count);
  const handoff_players = (): { completed: PlayerSetup; next: PlayerSetup } | undefined => {
    const handoff = match_state().handoff;
    return handoff === undefined
      ? undefined
      : {
          completed: find_player(match_state(), handoff.completed_player_id),
          next: find_player(match_state(), handoff.next_player_id),
        };
  };
  const final_best_run_label = (): string => {
    const state = match_state();
    const has_perfect_game = Object.values(state.score_cards).some((card) =>
      is_perfect_game(card.frames, state.pin_count, state.bowls_per_frame),
    );
    if (has_perfect_game) return "Perfect game";

    const best_run = final_record()?.longest_strike_streak;
    return best_run === undefined ? "No named run" : (strike_run_term(best_run) ?? "No named run");
  };
  const final_delta_text = (): string => {
    const previous_record = props.previous_record();
    const completed_record = final_record();
    if (previous_record === undefined || completed_record === undefined) {
      return "First result - your record starts here.";
    }

    const delta = completed_record.top_score - previous_record.best_score;
    const signed_delta = delta >= 0 ? `+${delta}` : String(delta);
    return `High game delta: ${signed_delta}`;
  };

  return (
    <main
      class="play_shell"
      aria-label="Super Bowling game"
      data-phase={match_state().phase}
      data-drawn-pin-count={drawn_pin_count()}
      data-drawn-fallen-pin-count={drawn_fallen_pin_count()}
      data-draw-command-count={draw_command_count()}
      data-drawn-ball={drawn_ball() ? "true" : "false"}
      data-drawn-aim-guide={drawn_aim_guide() ? "true" : "false"}
      data-drawn-ball-screen-x={drawn_ball_screen_x()?.toFixed(2) ?? ""}
      data-drawn-ball-screen-y={drawn_ball_screen_y()?.toFixed(2) ?? ""}
      data-drawn-aim-guide-first-screen-x={drawn_aim_guide_first_screen_x()?.toFixed(2) ?? ""}
      data-camera-mode="centered-shot"
      data-camera-progress={camera_progress().toFixed(4)}
      data-camera-zoom="0.0000"
      data-ball-in-pit={ball_in_pit() ? "true" : "false"}
      data-earned-moment={current_earned_moment()?.kind ?? ""}
      data-reduced-motion={props.reduced_motion() ? "true" : "false"}
      data-aim-guide={
        match_state().phase === "aiming" && preview_path() !== undefined ? "visible" : "hidden"
      }
      data-aim-guide-offset={match_state().aim.start_position.toFixed(1)}
      data-preview-status={
        match_state().phase === "aiming"
          ? preview_path() === undefined
            ? "pending"
            : "ready"
          : "idle"
      }
    >
      <Show when={current_earned_moment()}>
        {(moment) => (
          <section class="earned_moment_toast" role="status">
            <strong>{earned_moment_label(moment())}</strong>
            <Show when={earned_moment_support_text(moment())}>
              {(support_text) => <p>{support_text()}</p>}
            </Show>
          </section>
        )}
      </Show>
      <header class="play_header">
        <button class="back_button" type="button" onClick={() => props.on_exit()}>
          New match
        </button>
        <div class="play_title">
          <p class="eyebrow">
            {props.setup.pin_count.toLocaleString()} mode -{" "}
            {match_state().pin_count.toLocaleString()} pins
          </p>
          <h1>Super Bowling</h1>
          <p class="live_rule" data-bowls-per-frame={match_state().bowls_per_frame}>
            {bowls_per_frame_rule_text(match_state().bowls_per_frame)}
          </p>
        </div>
        <section class="match_roster" aria-label="Player roster">
          <For each={match_state().players}>
            {(player) => (
              <p classList={{ active_player: player.player_id === match_state().active_player_id }}>
                <span class="roster_ball" style={{ background: player.ball_design.base_color }} />
                <span class="roster_name">{player.name}</span>
                <strong>
                  {score_text(match_state().score_cards[player.player_id]?.frames[9]?.score)}
                </strong>
              </p>
            )}
          </For>
        </section>
      </header>
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
                        : format_frame_roll_marks(
                            frame()!,
                            match_state().pin_count,
                            match_state().bowls_per_frame,
                          )
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
          <div class="aim_control">
            <label for="start_position_control">
              Start position{" "}
              <output aria-live="polite">
                {start_position_in_boards(
                  match_state().pin_count,
                  match_state().aim.start_position,
                ).toFixed(1)}{" "}
                boards
              </output>
            </label>
            <input
              id="start_position_control"
              data-control="start-position"
              type="range"
              min={current_board_limits().minimum}
              max={current_board_limits().maximum}
              step="0.1"
              value={start_position_in_boards(
                match_state().pin_count,
                match_state().aim.start_position,
              )}
              disabled={match_state().phase !== "aiming"}
              onInput={(event) =>
                update_aim({
                  ...match_state().aim,
                  start_position: start_position_from_boards(
                    match_state().pin_count,
                    Number(event.currentTarget.value),
                  ),
                })
              }
            />
          </div>
          <div class="aim_control">
            <label for="power_control">
              Power <output aria-live="polite">{match_state().aim.power.toFixed(0)}</output>
            </label>
            <input
              id="power_control"
              data-control="power"
              type="range"
              min={current_aim_limits().minimum_power}
              max={current_aim_limits().maximum_power}
              step="1"
              value={match_state().aim.power}
              disabled={match_state().phase !== "aiming"}
              onInput={(event) =>
                update_aim({ ...match_state().aim, power: Number(event.currentTarget.value) })
              }
            />
          </div>
          <div class="aim_control">
            <label for="angle_control">
              Angle{" "}
              <output aria-live="polite">
                {angle_in_degrees(match_state().aim.angle).toFixed(1)} deg
              </output>
            </label>
            <input
              id="angle_control"
              data-control="angle"
              type="range"
              min={angle_in_degrees(current_aim_limits().minimum_angle)}
              max={angle_in_degrees(current_aim_limits().maximum_angle)}
              step={current_control_steps().angle_degrees}
              value={angle_in_degrees(match_state().aim.angle)}
              disabled={match_state().phase !== "aiming"}
              onInput={(event) =>
                update_aim({
                  ...match_state().aim,
                  angle: (Number(event.currentTarget.value) * Math.PI) / 180,
                })
              }
            />
          </div>
          <div class="aim_control">
            <label for="spin_control">
              Spin <output aria-live="polite">{match_state().aim.spin.toFixed(2)}</output>
            </label>
            <input
              id="spin_control"
              data-control="spin"
              type="range"
              min={current_aim_limits().minimum_spin}
              max={current_aim_limits().maximum_spin}
              step={current_control_steps().spin}
              value={match_state().aim.spin}
              disabled={match_state().phase !== "aiming"}
              onInput={(event) =>
                update_aim({ ...match_state().aim, spin: Number(event.currentTarget.value) })
              }
            />
          </div>
          <p>Up/Down power, Left/Right position, A/D angle, Q/E spin. Space bowls.</p>
          <p class="aim_guide_readout" data-aim-guide-readout aria-live="polite">
            Projected path:{" "}
            {start_position_in_boards(
              match_state().pin_count,
              match_state().aim.start_position,
            ).toFixed(1)}{" "}
            boards, {angle_in_degrees(match_state().aim.angle).toFixed(1)} deg, spin{" "}
            {match_state().aim.spin.toFixed(2)}, power {match_state().aim.power.toFixed(0)}.
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
          <div class="final_result match_summary" role="status">
            <p>Final score</p>
            <strong>{score_text(final_record()?.top_score)}</strong>
            <dl class="match_summary_details">
              <div>
                <dt>Previous high game</dt>
                <dd>{props.previous_record()?.best_score ?? "First result"}</dd>
              </div>
              <div>
                <dt>Record change</dt>
                <dd>{final_delta_text()}</dd>
              </div>
              <div>
                <dt>Best run</dt>
                <dd>{final_best_run_label()}</dd>
              </div>
            </dl>
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
