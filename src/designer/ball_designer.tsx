import { For, createEffect, createUniqueId, onMount, type JSX } from "solid-js";

import {
  ball_patterns,
  normalize_ball_design,
  type BallDesign,
  type BallPattern,
} from "./ball_design";
import { draw_ball } from "../render/ball";
import { get_game_asset_urls } from "../render/game_assets";

export type BallDesignerProps = {
  design: BallDesign;
  player_name: string;
  on_change(design: BallDesign): void;
};

const pattern_labels: Record<BallPattern, string> = {
  solid: "Solid",
  single_band: "Single band",
  double_band: "Double band",
  chevron: "Chevron",
};

export function get_ball_pattern_label(pattern: BallPattern): string {
  return pattern_labels[pattern];
}

/** Draw one setup-preview frame with the production circular ball renderer. */
export function draw_static_ball_preview(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  design: BallDesign,
  asset: CanvasImageSource | undefined,
): void {
  context.clearRect(0, 0, width, height);
  draw_ball(
    context,
    {
      x: width / 2,
      y: height / 2,
      width: Math.min(width * 0.52, height * 0.82),
      height: Math.min(width * 0.52, height * 0.82),
      roll_angle: 0,
      design,
    },
    asset,
  );
}

export function BallDesigner(props: BallDesignerProps): JSX.Element {
  let preview_canvas!: HTMLCanvasElement;
  let ball_asset: HTMLImageElement | undefined;
  const pattern_input_name = createUniqueId();

  function draw_preview_for_design(design: BallDesign): void {
    const context = preview_canvas.getContext("2d");
    if (context === null) return;
    draw_static_ball_preview(
      context,
      preview_canvas.width,
      preview_canvas.height,
      design,
      ball_asset,
    );
  }

  function update_design(change: Partial<BallDesign>): void {
    const next_input = { ...props.design, ...change };
    const next_design = normalize_ball_design(next_input);
    props.on_change(next_design);
  }

  function update_pattern(pattern: BallPattern): void {
    update_design({ pattern });
  }

  onMount(() => {
    const image = new Image();
    image.addEventListener(
      "load",
      () => {
        ball_asset = image;
        draw_preview_for_design(props.design);
      },
      { once: true },
    );
    image.src = get_game_asset_urls().ball;
  });

  createEffect(() => {
    draw_preview_for_design(props.design);
  });

  return (
    <section class="ball_designer" aria-label={`${props.player_name}'s ball designer`}>
      <header class="ball_designer_heading">
        <p>Ball look</p>
        <strong>{get_ball_pattern_label(props.design.pattern)}</strong>
      </header>
      <canvas
        ref={(element) => {
          preview_canvas = element;
        }}
        class="ball_designer_preview"
        width="320"
        height="160"
        role="img"
        aria-label={`Preview for ${props.player_name}'s bowling ball`}
      />
      <div class="ball_designer_colors">
        <label>
          Base color
          <input
            aria-label={`Base color for ${props.player_name}`}
            type="color"
            value={props.design.base_color}
            onInput={(event) => update_design({ base_color: event.currentTarget.value })}
          />
        </label>
        <label>
          Accent color
          <input
            aria-label={`Accent color for ${props.player_name}`}
            type="color"
            value={props.design.accent_color}
            onInput={(event) => update_design({ accent_color: event.currentTarget.value })}
          />
        </label>
      </div>
      <fieldset class="ball_designer_patterns">
        <legend>Pattern</legend>
        <For each={ball_patterns}>
          {(pattern) => (
            <label>
              <input
                type="radio"
                name={pattern_input_name}
                checked={props.design.pattern === pattern}
                onChange={() => update_pattern(pattern)}
              />
              {get_ball_pattern_label(pattern)}
            </label>
          )}
        </For>
      </fieldset>
      <label class="ball_designer_monogram">
        Monogram (optional)
        <input
          aria-label={`Optional two-character monogram for ${props.player_name}`}
          maxlength="2"
          placeholder="AB"
          value={props.design.monogram ?? ""}
          onInput={(event) => update_design({ monogram: event.currentTarget.value })}
        />
      </label>
    </section>
  );
}
