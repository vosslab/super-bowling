import { Show, type Accessor, type JSX } from "solid-js";

import type { MatchState } from "../game/contracts";
import { scoreboard_labels } from "../game/bowling_terms";
import { start_position_from_boards } from "../game/aim";
import type { ModeRecord } from "../save/contracts";
import type { MatchRecordValues } from "../game/match_stats";
import {
  centered_slider_tick,
  centered_slider_value,
  type CenteredSliderScale,
} from "./aim_slider";
import { describe_power, describe_spin, format_angle, format_start_position } from "./aim_feedback";
import type { PlayerSetup } from "../game/contracts";

type AimControls = {
  state: Accessor<MatchState>;
  start_position_scale: Accessor<CenteredSliderScale>;
  start_position_boards: Accessor<number>;
  angle_scale: Accessor<CenteredSliderScale>;
  angle_degrees: Accessor<number>;
  spin_scale: Accessor<CenteredSliderScale>;
  maximum_spin_magnitude: Accessor<number>;
  minimum_power: Accessor<number>;
  maximum_power: Accessor<number>;
  shot_plan: Accessor<string>;
  update_aim: (aim: MatchState["aim"]) => void;
};

export type GameControlDeckProps = AimControls & {
  auto_run: boolean | undefined;
  mute_enabled: Accessor<boolean>;
  reduced_motion: Accessor<boolean>;
  on_toggle_mute: () => void;
  on_toggle_reduced_motion: () => void;
  on_launch: () => void;
  on_request_result_advance: () => void;
  on_run_deterministic_game: () => void;
  on_exit: () => void;
  final_record: Accessor<MatchRecordValues | undefined>;
  previous_record: Accessor<ModeRecord | undefined>;
  final_delta_text: Accessor<string>;
  final_best_frame_text: Accessor<string>;
  final_best_run_label: Accessor<string>;
  on_replay: () => void;
  replay_ref: (element: HTMLButtonElement) => void;
};

function score_text(score: number | undefined): string {
  return score === undefined ? "-" : String(score);
}

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

/** View-only control deck; Game retains all simulation and timing ownership. */
export function GameControlDeck(props: GameControlDeckProps): JSX.Element {
  return (
    <section
      class="control_deck"
      classList={{ final_control_deck: props.state().phase === "final" }}
      aria-label="Bowling controls and match status"
    >
      <Show
        when={props.state().phase === "final"}
        fallback={
          <>
            <div class="status_block" aria-live="polite">
              <p class="status_label">{phase_label(props.state().phase)}</p>
              <Show when={props.state().phase === "result" && props.state().result_message}>
                {(message) => (
                  <p class="roll_result" role="status">
                    {message()}
                  </p>
                )}
              </Show>
              <p data-standing-count>
                {props.state().standing_pin_count} of {props.state().pin_count.toLocaleString()}{" "}
                pins standing
              </p>
              <p>
                Frame {props.state().current_frame_index + 1}, roll{" "}
                {props.state().current_roll_index + 1}
              </p>
            </div>
            <div class="aim_block">
              <div class="aim_control">
                <label for="start_position_control">
                  Start position{" "}
                  <output aria-live="polite">
                    {format_start_position(props.start_position_boards())}
                  </output>
                </label>
                <input
                  id="start_position_control"
                  data-control="start-position"
                  type="range"
                  min={-props.start_position_scale().maximum_tick}
                  max={props.start_position_scale().maximum_tick}
                  step="1"
                  value={centered_slider_tick(
                    props.start_position_scale(),
                    props.start_position_boards(),
                  )}
                  aria-valuetext={format_start_position(props.start_position_boards())}
                  disabled={props.state().phase !== "aiming"}
                  onInput={(event) =>
                    props.update_aim({
                      ...props.state().aim,
                      start_position: start_position_from_boards(
                        props.state().pin_count,
                        centered_slider_value(
                          props.start_position_scale(),
                          Number(event.currentTarget.value),
                        ),
                      ),
                    })
                  }
                />
                <span class="range_legend" aria-hidden="true">
                  <span>Left</span>
                  <span>Center</span>
                  <span>Right</span>
                </span>
              </div>
              <div class="aim_control">
                <label for="power_control">
                  Power{" "}
                  <output aria-live="polite">
                    {props.state().aim.power.toFixed(0)} -{" "}
                    {describe_power(
                      props.state().aim.power,
                      props.minimum_power(),
                      props.maximum_power(),
                    )}
                  </output>
                </label>
                <input
                  id="power_control"
                  data-control="power"
                  type="range"
                  min={props.minimum_power()}
                  max={props.maximum_power()}
                  step="1"
                  value={props.state().aim.power}
                  disabled={props.state().phase !== "aiming"}
                  onInput={(event) =>
                    props.update_aim({
                      ...props.state().aim,
                      power: Number(event.currentTarget.value),
                    })
                  }
                />
                <span class="range_legend" aria-hidden="true">
                  <span>Soft</span>
                  <span>Hard</span>
                </span>
              </div>
              <div class="aim_control">
                <label for="angle_control">
                  Angle <output aria-live="polite">{format_angle(props.angle_degrees())}</output>
                </label>
                <input
                  id="angle_control"
                  data-control="angle"
                  type="range"
                  min={-props.angle_scale().maximum_tick}
                  max={props.angle_scale().maximum_tick}
                  step="1"
                  value={centered_slider_tick(props.angle_scale(), props.angle_degrees())}
                  aria-valuetext={format_angle(props.angle_degrees())}
                  disabled={props.state().phase !== "aiming"}
                  onInput={(event) =>
                    props.update_aim({
                      ...props.state().aim,
                      angle:
                        (centered_slider_value(
                          props.angle_scale(),
                          Number(event.currentTarget.value),
                        ) *
                          Math.PI) /
                        180,
                    })
                  }
                />
                <span class="range_legend" aria-hidden="true">
                  <span>Left</span>
                  <span>Straight</span>
                  <span>Right</span>
                </span>
              </div>
              <div class="aim_control">
                <label for="spin_control">
                  Spin{" "}
                  <output aria-live="polite">
                    {props.state().aim.spin.toFixed(2)} -{" "}
                    {describe_spin(props.state().aim.spin, props.maximum_spin_magnitude())}
                  </output>
                </label>
                <input
                  id="spin_control"
                  data-control="spin"
                  type="range"
                  min={-props.spin_scale().maximum_tick}
                  max={props.spin_scale().maximum_tick}
                  step="1"
                  value={centered_slider_tick(props.spin_scale(), props.state().aim.spin)}
                  aria-valuetext={`${props.state().aim.spin.toFixed(2)} - ${describe_spin(props.state().aim.spin, props.maximum_spin_magnitude())}`}
                  disabled={props.state().phase !== "aiming"}
                  onInput={(event) =>
                    props.update_aim({
                      ...props.state().aim,
                      spin: centered_slider_value(
                        props.spin_scale(),
                        Number(event.currentTarget.value),
                      ),
                    })
                  }
                />
                <span class="range_legend" aria-hidden="true">
                  <span>Left hook</span>
                  <span>Straight</span>
                  <span>Right hook</span>
                </span>
              </div>
              <p>Arrows set position and power. A/D aims. Q/E hooks. Space bowls.</p>
              <p class="aim_guide_readout" data-aim-guide-readout aria-live="polite">
                {props.shot_plan()}
              </p>
            </div>
            <div class="play_preference_controls" aria-label="Game preferences">
              <button
                class="preference_button"
                type="button"
                aria-pressed={props.mute_enabled()}
                onClick={props.on_toggle_mute}
              >
                Mute {props.mute_enabled() ? "on" : "off"}
              </button>
              <button
                class="preference_button"
                type="button"
                aria-pressed={props.reduced_motion()}
                onClick={props.on_toggle_reduced_motion}
              >
                Reduced motion {props.reduced_motion() ? "on" : "off"}
              </button>
            </div>
            <Show when={props.state().phase === "aiming"}>
              <button class="bowl_button" type="button" onClick={props.on_launch}>
                Bowl now
              </button>
            </Show>
            <Show when={props.state().phase === "result"}>
              <button
                class="continue_button"
                type="button"
                aria-label="Continue to the next roll"
                onClick={props.on_request_result_advance}
              >
                Continue <span>Space or Enter</span>
              </button>
            </Show>
            <Show when={props.auto_run}>
              <button
                class="fixture_button"
                type="button"
                onClick={props.on_run_deterministic_game}
              >
                Run deterministic perfect game
              </button>
            </Show>
            <Show when={props.state().phase === "fatal"}>
              <div class="fatal_result" role="alert">
                <p>{props.state().fatal_message}</p>
                <button type="button" onClick={props.on_exit}>
                  Return to setup
                </button>
              </div>
            </Show>
          </>
        }
      >
        <section class="final_result match_summary" aria-labelledby="final_score_heading">
          <div class="final_score_hero" role="status">
            <p class="eyebrow">Match complete</p>
            <h2 id="final_score_heading">Final score</h2>
            <strong>{score_text(props.final_record()?.top_score)}</strong>
          </div>
          <dl class="match_summary_details">
            <div>
              <dt>Previous high game</dt>
              <dd>{props.previous_record()?.best_score ?? "First result"}</dd>
            </div>
            <div>
              <dt>Record change</dt>
              <dd>{props.final_delta_text()}</dd>
            </div>
            <div>
              <dt>{scoreboard_labels.best_frame}</dt>
              <dd>{props.final_best_frame_text()}</dd>
            </div>
            <div>
              <dt>Best run</dt>
              <dd>{props.final_best_run_label()}</dd>
            </div>
          </dl>
          <div class="final_actions">
            <button
              ref={props.replay_ref}
              class="replay_button"
              type="button"
              onClick={props.on_replay}
            >
              Play again
            </button>
            <button class="change_setup_button" type="button" onClick={props.on_exit}>
              Change setup
            </button>
          </div>
        </section>
      </Show>
    </section>
  );
}

export type GameDialogsProps = {
  handoff_players: Accessor<{ completed: PlayerSetup; next: PlayerSetup } | undefined>;
  handoff_frame_index: Accessor<number | undefined>;
  on_continue_turn: () => void;
  handoff_ref: (element: HTMLButtonElement) => void;
  exit_confirmation_open: Accessor<boolean>;
  on_close_exit_confirmation: () => void;
  on_confirm_exit: () => void;
  exit_cancel_ref: (element: HTMLButtonElement) => void;
};

/** Modal views only; focus and state transitions remain owned by Game. */
export function GameDialogs(props: GameDialogsProps): JSX.Element {
  return (
    <>
      <Show when={props.handoff_players()}>
        {(players) => (
          <section
            class="handoff_panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="handoff_heading"
          >
            <div>
              <p class="eyebrow">Frame {(props.handoff_frame_index() ?? 0) + 1} complete</p>
              <h2 id="handoff_heading">Pass the keyboard</h2>
              <p>
                {players().completed.name} is done. {players().next.name}, your fresh rack is ready
                next.
              </p>
              <button
                ref={props.handoff_ref}
                class="start_button"
                type="button"
                onClick={props.on_continue_turn}
              >
                {players().next.name}, start your turn
              </button>
            </div>
          </section>
        )}
      </Show>
      <Show when={props.exit_confirmation_open()}>
        <section
          class="exit_confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit_confirmation_heading"
          aria-describedby="exit_confirmation_description"
          onKeyDown={(event) => {
            if (event.key === "Escape") props.on_close_exit_confirmation();
          }}
        >
          <div>
            <p class="eyebrow">Unfinished match</p>
            <h2 id="exit_confirmation_heading">End this match?</h2>
            <p id="exit_confirmation_description">
              Your unfinished score will not be added to the practice record.
            </p>
            <div class="exit_confirmation_actions">
              <button
                ref={props.exit_cancel_ref}
                class="keep_bowling_button"
                type="button"
                onClick={props.on_close_exit_confirmation}
              >
                Keep bowling
              </button>
              <button class="confirm_exit_button" type="button" onClick={props.on_confirm_exit}>
                End match
              </button>
            </div>
          </div>
        </section>
      </Show>
    </>
  );
}
