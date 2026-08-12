import {
  For,
  Index,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";

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
  start_position_in_boards,
} from "../game/aim";
import {
  advance_camera_result,
  advance_camera_for_ball,
  create_camera_state,
  get_camera_zoom,
  latch_camera_impact,
  reset_camera_for_roll,
  with_reduced_motion,
} from "../render/camera";
import { camera_config } from "../config/camera";
import type { CameraState } from "../render/contracts";
import { format_frame_roll_slots } from "../game/score_display";
import { bowls_per_frame_rule_text } from "../game/bowls_per_frame";
import type { ModeRecord } from "../save/contracts";
import { create_game_renderer, type GameRenderer } from "../render/game_renderer";
import { frame_camera_result } from "../render/result_camera";
import {
  pin_snapshot_stride,
  read_snapshot_ball,
  type SimulationEvent,
} from "../simulation/protocol";
import { create_input_controller, type InputController } from "./input_controller";
import { earned_moment, earned_moment_state, type EarnedMoment } from "./earned_moments";
import { format_shot_plan } from "./aim_feedback";
import { create_centered_slider_scale, type CenteredSliderScale } from "./aim_slider";
import { GameControlDeck, GameDialogs } from "./game_controls";
import type { SimulationClient } from "./simulation_client";
import { roll_celebration, type RollCelebration } from "./roll_celebration";
import { map_impact_presentation, normalize_ball_roll_speed } from "./impact_presentation";

type SnapshotHolder = {
  previous: Float32Array | undefined;
  current: Float32Array | undefined;
  received_at: number;
};

export type GameProps = {
  client: SimulationClient;
  setup: MatchSetup;
  auto_run?: boolean;
  mute_enabled: () => boolean;
  reduced_motion: () => boolean;
  on_set_mute: (mute_enabled: boolean) => void;
  on_set_reduced_motion: (reduced_motion: boolean) => void;
  on_match_complete: (summaries: readonly PlayerMatchSummary[]) => void;
  on_exit: () => void;
  on_replay: () => void;
  previous_record: () => ModeRecord | undefined;
};

const result_minimum_hold_ms = 900;
const result_auto_advance_ms = 2200;
const celebration_confetti = [
  { x: 8, drift: -2.8, delay: 40, color: "#FFE76D", turn: -210 },
  { x: 15, drift: 2.2, delay: 0, color: "#F26A4B", turn: 160 },
  { x: 23, drift: -1.6, delay: 120, color: "#85D5E8", turn: -120 },
  { x: 31, drift: 3.1, delay: 55, color: "#FFF8E7", turn: 240 },
  { x: 39, drift: -2.4, delay: 145, color: "#F3B63F", turn: -180 },
  { x: 47, drift: 1.4, delay: 20, color: "#E65343", turn: 150 },
  { x: 55, drift: -1.2, delay: 95, color: "#A8E3D0", turn: -260 },
  { x: 63, drift: 2.7, delay: 10, color: "#FFE76D", turn: 210 },
  { x: 71, drift: -3.2, delay: 130, color: "#85D5E8", turn: -150 },
  { x: 79, drift: 1.9, delay: 65, color: "#F26A4B", turn: 190 },
  { x: 87, drift: -2.1, delay: 105, color: "#FFF8E7", turn: -230 },
  { x: 94, drift: 2.5, delay: 35, color: "#F3B63F", turn: 170 },
] as const;

function score_text(score: number | undefined): string {
  return score === undefined ? "-" : String(score);
}

function earned_moment_label(moment: EarnedMoment): string {
  if (moment.kind === "high_game") return scoreboard_labels.high_game;
  if (moment.kind === "best_frame") return scoreboard_labels.best_frame;
  return moment.term.toUpperCase();
}

function earned_moment_support_text(moment: EarnedMoment): string | undefined {
  if (moment.kind === "high_game") return `New high score: ${moment.score}`;
  if (moment.kind === "best_frame") return `New best frame: ${moment.score}`;
  return undefined;
}

function find_player(state: MatchState, player_id: number): PlayerSetup {
  const player = state.players.find((candidate) => candidate.player_id === player_id);
  if (player === undefined) throw new Error("Every match player must remain available.");
  return player;
}

function match_has_score_progress(state: MatchState): boolean {
  const cards = Object.values(state.score_cards);
  return cards.some((card) => card.frames.some((frame) => frame.rolls.length > 0));
}

function exit_needs_confirmation(state: MatchState): boolean {
  if (state.phase === "final") return false;
  if (match_has_score_progress(state)) return true;
  return state.phase !== "setup" && state.phase !== "rack_resetting" && state.phase !== "aiming";
}

export function Game(props: GameProps): JSX.Element {
  const [match_state, set_match_state] = createSignal(create_match_state(props.setup));
  const [asset_message, set_asset_message] = createSignal("Loading original lane art...");
  const [auto_running, set_auto_running] = createSignal(false);
  const [drawn_pin_count, set_drawn_pin_count] = createSignal(0);
  const [drawn_fallen_pin_count, set_drawn_fallen_pin_count] = createSignal(0);
  const [drawn_ball, set_drawn_ball] = createSignal(false);
  const [drawn_aim_guide, set_drawn_aim_guide] = createSignal(false);
  const [drawn_ball_screen_x, set_drawn_ball_screen_x] = createSignal<number | undefined>();
  const [drawn_ball_screen_y, set_drawn_ball_screen_y] = createSignal<number | undefined>();
  const [drawn_launch_platform_fraction, set_drawn_launch_platform_fraction] = createSignal(0);
  const [drawn_aim_guide_first_screen_x, set_drawn_aim_guide_first_screen_x] = createSignal<
    number | undefined
  >();
  const [camera_progress, set_camera_progress] = createSignal(0);
  const [camera_physical_progress, set_camera_physical_progress] = createSignal(0);
  const [camera_presentation_zoom, set_camera_presentation_zoom] = createSignal(1);
  const [impact_window_count, set_impact_window_count] = createSignal(0);
  const [first_impact_seen, set_first_impact_seen] = createSignal(false);
  const [last_impact_strength, set_last_impact_strength] = createSignal(0);
  const [ball_in_pit, set_ball_in_pit] = createSignal(false);
  const [preview_path, set_preview_path] = createSignal<Float32Array | undefined>();
  const [current_earned_moment, set_current_earned_moment] = createSignal<
    EarnedMoment | undefined
  >();
  const [final_record, set_final_record] = createSignal<MatchRecordValues | undefined>();
  const [exit_confirmation_open, set_exit_confirmation_open] = createSignal(false);
  const snapshot_holder: SnapshotHolder = {
    previous: undefined,
    current: undefined,
    received_at: 0,
  };
  let canvas: HTMLCanvasElement | undefined;
  let handoff_button: HTMLButtonElement | undefined;
  let exit_cancel_button: HTMLButtonElement | undefined;
  let replay_button: HTMLButtonElement | undefined;
  let renderer: GameRenderer | undefined;
  let audio: AudioController | undefined;
  let camera: CameraState | undefined;
  let camera_result_transition_started_at: number | undefined;
  let animation_frame = 0;
  let result_timer: number | undefined;
  let result_available_at = 0;
  let earned_moment_timer: number | undefined;
  let preview_timer: number | undefined;
  let preview_request_id = 0;
  let expected_preview_request_id: number | undefined;
  let input_controller: InputController | undefined;
  let unsubscribe: (() => void) | undefined;
  let high_game_already_fired = false;
  const best_frame_announced_players = new Set<number>();

  function apply_camera(next_camera: CameraState): void {
    camera = next_camera;
    const presentation_camera = with_reduced_motion(camera, props.reduced_motion());
    renderer?.set_camera(presentation_camera);
    const presentation_zoom = get_camera_zoom(presentation_camera);
    if (camera_presentation_zoom() !== presentation_zoom) {
      set_camera_presentation_zoom(presentation_zoom);
    }
    if (camera_physical_progress() !== camera.shot_progress) {
      set_camera_physical_progress(camera.shot_progress);
    }
    if (camera_progress() !== presentation_camera.shot_progress) {
      set_camera_progress(presentation_camera.shot_progress);
    }
  }

  function reset_impact_diagnostics(): void {
    set_impact_window_count(0);
    set_first_impact_seen(false);
    set_last_impact_strength(0);
  }

  function execute_effect(effect: MatchEffect): void {
    if (effect.type === "reset_rack") {
      if (camera !== undefined && renderer !== undefined) {
        camera_result_transition_started_at = undefined;
        apply_camera(reset_camera_for_roll(camera));
      }
      props.client.send({ type: "reset_rack", pin_count: effect.pin_count });
    }
    if (effect.type === "launch") {
      reset_impact_diagnostics();
      if (camera !== undefined && renderer !== undefined) {
        camera_result_transition_started_at = undefined;
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
      reset_impact_diagnostics();
      if (camera !== undefined && renderer !== undefined) {
        camera_result_transition_started_at = undefined;
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
    if (action.type === "start") {
      high_game_already_fired = false;
      best_frame_announced_players.clear();
    }
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
      best_frame_already_fired: best_frame_announced_players.has(player_id),
    });
    if (moment === undefined) return;

    if (moment.kind === "high_game") high_game_already_fired = true;
    if (moment.kind === "best_frame") best_frame_announced_players.add(player_id);
    show_earned_moment(moment);
  }

  function schedule_result_advance(state: MatchState): void {
    if (state.phase !== "result") return;
    if (result_timer !== undefined) window.clearTimeout(result_timer);
    result_available_at = auto_running() ? 0 : performance.now() + result_minimum_hold_ms;
    result_timer = window.setTimeout(
      () => {
        result_timer = undefined;
        dispatch({ type: "advance_after_result" });
      },
      auto_running() ? 0 : result_auto_advance_ms,
    );
  }

  function request_result_advance(): void {
    if (match_state().phase !== "result") return;
    if (result_timer !== undefined) window.clearTimeout(result_timer);
    const delay = Math.max(0, result_available_at - performance.now());
    result_timer = window.setTimeout(() => {
      result_timer = undefined;
      dispatch({ type: "advance_after_result" });
    }, delay);
  }

  function accept_snapshot(event: Extract<SimulationEvent, { type: "snapshot" }>): void {
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
      if (match_state().phase === "rolling" && event.pin_count === match_state().pin_count) {
        audio?.update_roll_speed(
          normalize_ball_roll_speed(Math.hypot(ball.velocity_x, ball.velocity_y)),
        );
      }
      // The worker may settle immediately after pit capture, before another
      // animation frame can interpolate the terminal snapshot. Latch that
      // physical endpoint so the result holds the roll's final framing.
      if (camera !== undefined && match_state().phase === "rolling" && ball.in_pit) {
        apply_camera(advance_camera_for_ball(camera, ball.y, ball.x));
      }
    }
    if (match_state().phase !== "rack_resetting") return;
    const ready_state = dispatch({ type: "rack_ready" });
    if (auto_running() && ready_state.phase === "aiming") dispatch({ type: "launch" });
  }

  function accept_event(event: SimulationEvent): void {
    if (event.type === "snapshot") return accept_snapshot(event);
    if (event.type === "impact") {
      const state = match_state();
      if (state.phase !== "rolling" || event.pin_count !== state.pin_count) return;
      const cues = map_impact_presentation(event);
      const timestamp = performance.now();
      if (cues.audio !== undefined)
        audio?.record_impact({
          ...cues.audio,
          source_simulation_time_ms: cues.source_simulation_time_ms,
          ...(cues.source_event_sequence === undefined
            ? {}
            : { source_event_sequence: cues.source_event_sequence }),
        });
      if (!props.reduced_motion() && cues.visual !== undefined) {
        renderer?.record_impact(cues.visual, timestamp);
      }
      if (camera !== undefined && event.first_ball_pin_impact && event.ball_pin !== undefined) {
        apply_camera(
          latch_camera_impact(camera, event.ball_pin.centroid_x, event.ball_pin.centroid_y),
        );
      }
      set_impact_window_count((count) => count + 1);
      if (event.first_ball_pin_impact) set_first_impact_seen(true);
      const audio_strength =
        cues.audio === undefined
          ? 0
          : Math.max(
              cues.audio.ball_pin.impulse,
              cues.audio.pin_pin.impulse,
              cues.audio.deck.impulse,
            );
      const strength = Math.max(cues.visual?.strength ?? 0, audio_strength);
      if (last_impact_strength() !== strength) set_last_impact_strength(strength);
      return;
    }
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
        audio?.stop_roll();
        dispatch({
          type: "fatal",
          message: "The roll took too long to settle. Start a new match to recover.",
        });
      } else {
        if (camera !== undefined) {
          if (canvas === undefined || snapshot_holder.current === undefined) {
            throw new Error("A settled roll requires its terminal rendered snapshot.");
          }
          camera_result_transition_started_at = performance.now();
          apply_camera(
            frame_camera_result(camera, snapshot_holder.current, canvas.width, canvas.height),
          );
        }
        const next = dispatch({ type: "settled", settled_roll: event });
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
      if (
        camera !== undefined &&
        camera.shot_phase === "result" &&
        camera_result_transition_started_at !== undefined &&
        !props.reduced_motion()
      ) {
        const elapsed_ms = timestamp - camera_result_transition_started_at;
        const transition_progress = elapsed_ms / camera_config.result_camera_transition_ms;
        apply_camera(advance_camera_result(camera, transition_progress));
        if (transition_progress >= 1) camera_result_transition_started_at = undefined;
      }
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
        const interpolated_x = previous_ball.x + (current_ball.x - previous_ball.x) * alpha;
        apply_camera(advance_camera_for_ball(camera, interpolated_y, interpolated_x));
      }
      const commands = renderer.draw(alpha, timestamp);
      const pin_count = commands.filter(
        (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
      ).length;
      const fallen_pin_count = commands.filter((command) => command.kind === "fallen_pin").length;
      const ball = commands.find((command) => command.kind === "ball");
      const aim_guide = commands.find((command) => command.kind === "aim_guide");
      const lane = commands.find((command) => command.kind === "lane");
      if (drawn_pin_count() !== pin_count) set_drawn_pin_count(pin_count);
      if (drawn_fallen_pin_count() !== fallen_pin_count)
        set_drawn_fallen_pin_count(fallen_pin_count);
      if (drawn_ball() !== (ball !== undefined)) set_drawn_ball(ball !== undefined);
      if (drawn_aim_guide() !== (aim_guide !== undefined))
        set_drawn_aim_guide(aim_guide !== undefined);
      const ball_screen_x = ball?.x;
      if (drawn_ball_screen_x() !== ball_screen_x) set_drawn_ball_screen_x(ball_screen_x);
      const ball_screen_y = ball?.y;
      if (drawn_ball_screen_y() !== ball_screen_y) set_drawn_ball_screen_y(ball_screen_y);
      if (lane !== undefined) {
        const launch_platform_fraction =
          (lane.geometry.lane_near[0].y - lane.geometry.foul_line[0].y) / lane.height;
        if (drawn_launch_platform_fraction() !== launch_platform_fraction)
          set_drawn_launch_platform_fraction(launch_platform_fraction);
      }
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
  function request_exit(): void {
    if (!exit_needs_confirmation(match_state())) {
      props.on_exit();
      return;
    }
    set_exit_confirmation_open(true);
  }
  function confirm_exit(): void {
    set_exit_confirmation_open(false);
    props.on_exit();
  }
  function replay_match(): void {
    set_exit_confirmation_open(false);
    props.on_replay();
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
    audio.preload();
    camera = create_camera_state(get_rack_pin_count(props.setup.pin_count));
    apply_camera(camera);
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
    function handle_game_keydown(event: KeyboardEvent): void {
      if (exit_confirmation_open()) {
        if (event.key === "Escape") {
          event.preventDefault();
          set_exit_confirmation_open(false);
        }
        return;
      }
      if (
        match_state().phase === "result" &&
        (event.key === "Enter" || event.key === " " || event.key === "Spacebar") &&
        !(event.target instanceof HTMLButtonElement) &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        request_result_advance();
      }
    }
    window.addEventListener("keydown", handle_game_keydown);
    animation_frame = requestAnimationFrame(draw_frame);
    if (props.auto_run) set_auto_running(true);
    props.client.send({ type: "initialize", pin_count: match_state().pin_count });
    onCleanup(() => {
      resize_observer.disconnect();
      window.removeEventListener("keydown", handle_game_keydown);
    });
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
      apply_camera(camera);
    }
    if (state.phase === "handoff") queueMicrotask(() => handoff_button?.focus());
    if (state.phase === "final") {
      set_exit_confirmation_open(false);
      queueMicrotask(() => replay_button?.focus());
    }
    if (exit_confirmation_open()) queueMicrotask(() => exit_cancel_button?.focus());
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
  const current_start_position_boards = (): number =>
    start_position_in_boards(match_state().pin_count, match_state().aim.start_position);
  const current_angle_degrees = (): number => angle_in_degrees(match_state().aim.angle);
  const current_maximum_spin_magnitude = (): number => {
    const limits = current_aim_limits();
    return Math.max(Math.abs(limits.minimum_spin), Math.abs(limits.maximum_spin));
  };
  const current_start_position_scale = (): CenteredSliderScale =>
    create_centered_slider_scale(current_board_limits().maximum, 0.1);
  const current_angle_scale = (): CenteredSliderScale =>
    create_centered_slider_scale(
      angle_in_degrees(current_aim_limits().maximum_angle),
      current_control_steps().angle_degrees,
    );
  const current_spin_scale = (): CenteredSliderScale =>
    create_centered_slider_scale(current_maximum_spin_magnitude(), current_control_steps().spin);
  const current_shot_plan = (): string => {
    const limits = current_aim_limits();
    return format_shot_plan({
      aim: match_state().aim,
      angle_degrees: current_angle_degrees(),
      maximum_power: limits.maximum_power,
      maximum_spin_magnitude: current_maximum_spin_magnitude(),
      minimum_power: limits.minimum_power,
      start_position_boards: current_start_position_boards(),
    });
  };
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
  const final_best_frame_text = (): string => {
    const completed_score = final_record()?.best_frame_score;
    if (completed_score === undefined) return "-";

    const previous_score = props.previous_record()?.best_frame_score;
    if (previous_score === undefined) return `${completed_score} - first record`;
    const delta = completed_score - previous_score;
    if (delta > 0) return `${completed_score} - new record (+${delta})`;
    return `${completed_score} - record ${previous_score}`;
  };
  const current_roll_celebration = (): RollCelebration | undefined =>
    roll_celebration(match_state());
  const current_camera_zoom = (): number => {
    return camera_presentation_zoom();
  };

  return (
    <main
      class="play_shell"
      aria-label="Super Bowling game"
      data-phase={match_state().phase}
      data-drawn-pin-count={drawn_pin_count()}
      data-drawn-fallen-pin-count={drawn_fallen_pin_count()}
      data-drawn-ball={drawn_ball() ? "true" : "false"}
      data-drawn-aim-guide={drawn_aim_guide() ? "true" : "false"}
      data-drawn-ball-screen-x={drawn_ball_screen_x()?.toFixed(2) ?? ""}
      data-drawn-ball-screen-y={drawn_ball_screen_y()?.toFixed(2) ?? ""}
      data-drawn-launch-platform-fraction={drawn_launch_platform_fraction().toFixed(4)}
      data-drawn-aim-guide-first-screen-x={drawn_aim_guide_first_screen_x()?.toFixed(2) ?? ""}
      data-camera-mode="centered-shot"
      data-camera-progress={camera_progress().toFixed(4)}
      data-camera-physical-progress={camera_physical_progress().toFixed(4)}
      data-camera-zoom={current_camera_zoom().toFixed(4)}
      data-impact-window-count={String(impact_window_count())}
      data-first-impact-seen={first_impact_seen() ? "true" : "false"}
      data-last-impact-strength={last_impact_strength().toFixed(4)}
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
      <header class="play_header">
        <Show
          when={match_state().phase !== "final"}
          fallback={<span class="match_complete_marker">Final</span>}
        >
          <button class="back_button" type="button" onClick={request_exit}>
            End match
          </button>
        </Show>
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
        data-score-digits={String(match_state().pin_count).length}
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
                  <Index
                    each={format_frame_roll_slots(
                      frame_index,
                      frame(),
                      match_state().pin_count,
                      match_state().bowls_per_frame,
                    )}
                  >
                    {(mark) => (
                      <span
                        class="frame_roll_box"
                        data-roll-box
                        data-roll-mark={
                          mark() === undefined
                            ? "empty"
                            : mark() === "X"
                              ? "strike"
                              : mark() === "/"
                                ? "spare"
                                : "roll"
                        }
                      >
                        {mark() ?? ""}
                      </span>
                    )}
                  </Index>
                </span>
                <strong class="frame_total">{score_text(frame()?.score)}</strong>
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
        <Show when={current_roll_celebration()}>
          {(celebration) => (
            <div
              class="roll_celebration"
              data-celebration={celebration().kind}
              data-celebration-presentation="dominant-lane-payoff"
              aria-hidden="true"
            >
              <div class="celebration_confetti">
                <Index each={celebration_confetti}>
                  {(piece) => (
                    <i
                      style={`--confetti-x: ${piece().x}%; --confetti-drift: ${piece().drift}rem; --confetti-delay: ${piece().delay}ms; --confetti-color: ${piece().color}; --confetti-turn: ${piece().turn}deg;`}
                    />
                  )}
                </Index>
              </div>
              <p class="celebration_label">{celebration().label}</p>
              <p class="celebration_support">{celebration().support_text}</p>
            </div>
          )}
        </Show>
        <Show when={asset_message()}>
          {(message) => (
            <p class="asset_notice" role="status">
              {message()}
            </p>
          )}
        </Show>
      </section>
      <GameControlDeck
        state={match_state}
        auto_run={props.auto_run}
        mute_enabled={() => props.mute_enabled()}
        reduced_motion={() => props.reduced_motion()}
        start_position_scale={current_start_position_scale}
        start_position_boards={current_start_position_boards}
        angle_scale={current_angle_scale}
        angle_degrees={current_angle_degrees}
        spin_scale={current_spin_scale}
        maximum_spin_magnitude={current_maximum_spin_magnitude}
        minimum_power={() => current_aim_limits().minimum_power}
        maximum_power={() => current_aim_limits().maximum_power}
        shot_plan={current_shot_plan}
        update_aim={update_aim}
        on_toggle_mute={() => {
          audio?.activate();
          props.on_set_mute(!props.mute_enabled());
        }}
        on_toggle_reduced_motion={() => props.on_set_reduced_motion(!props.reduced_motion())}
        on_launch={launch}
        on_request_result_advance={request_result_advance}
        on_run_deterministic_game={run_deterministic_game}
        on_exit={() => props.on_exit()}
        final_record={final_record}
        previous_record={() => props.previous_record()}
        final_delta_text={final_delta_text}
        final_best_frame_text={final_best_frame_text}
        final_best_run_label={final_best_run_label}
        on_replay={replay_match}
        replay_ref={(element) => {
          replay_button = element;
        }}
      />
      <GameDialogs
        handoff_players={handoff_players}
        handoff_frame_index={() => match_state().handoff?.frame_index}
        on_continue_turn={continue_turn}
        handoff_ref={(element) => {
          handoff_button = element;
        }}
        exit_confirmation_open={exit_confirmation_open}
        on_close_exit_confirmation={() => set_exit_confirmation_open(false)}
        on_confirm_exit={confirm_exit}
        exit_cancel_ref={(element) => {
          exit_cancel_button = element;
        }}
      />
    </main>
  );
}
