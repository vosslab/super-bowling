import { For, createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";

import { BallDesigner, get_ball_pattern_label } from "./ball_designer";
import { normalize_ball_design, type BallPattern } from "./ball_design";

const fixture_patterns: readonly BallPattern[] = ["solid", "single_band", "double_band", "chevron"];

function FixtureCard(props: { pattern: BallPattern }): JSX.Element {
  const [design, set_design] = createSignal(
    normalize_ball_design({
      base_color: "#1479D4",
      accent_color: "#F7D74D",
      pattern: props.pattern,
      monogram: "SB",
    }),
  );
  const player_name = `${get_ball_pattern_label(props.pattern)} showcase`;

  return (
    <article class="designer_fixture_card" data-ball-pattern={props.pattern}>
      <h2>{get_ball_pattern_label(props.pattern)}</h2>
      <BallDesigner design={design()} player_name={player_name} on_change={set_design} />
    </article>
  );
}

export function DesignerFixture(): JSX.Element {
  return (
    <main class="designer_fixture_shell" aria-label="Super Bowling ball pattern gallery">
      <header>
        <p class="brand">SUPER BOWLING</p>
        <h1>Ball pattern gallery</h1>
        <p>One static production preview for every playable pattern.</p>
      </header>
      <section class="designer_fixture_grid" aria-label="All ball patterns">
        <For each={fixture_patterns}>{(pattern) => <FixtureCard pattern={pattern} />}</For>
      </section>
    </main>
  );
}

const app_root = document.getElementById("app");

if (app_root === null) {
  throw new Error("The ball designer fixture requires an #app root element.");
}

render(DesignerFixture, app_root);
