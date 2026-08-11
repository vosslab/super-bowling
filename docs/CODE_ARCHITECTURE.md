# Code architecture

## Overview

Super Bowling is a static TypeScript browser game. SolidJS owns the interactive interface,
Canvas draws the lane, and a dedicated worker runs the Rapier-based bowling simulation. The
browser keeps match preferences and practice records in local storage; the application has no
server API or network-owned game state.

The build produces a static `dist/` artifact for GitHub Pages. The deployment
workflow in [../deploy-pages.yml](../deploy-pages.yml) verifies the repository, builds that
artifact, and publishes it.

## Major components

- [../src/main.ts](../src/main.ts) mounts the Solid application into the page root.
- [../src/app/](../src/app/) owns setup, active-match orchestration, keyboard input, worker-client
  communication, aim feedback, celebrations, and hot-seat handoff.
- [../src/game/](../src/game/) contains framework-independent bowling rules, scoring, match
  transitions, player-facing terms, and match-record calculations.
- [../src/simulation/](../src/simulation/) owns the authoritative physical world. It uses
  `@dimforge/rapier2d-compat`, creates racks and colliders, applies ball force and spin,
  tracks pin state, produces aim previews, and publishes compact snapshots.
- [../src/simulation/worker.ts](../src/simulation/worker.ts) runs fixed simulation ticks off the
  main thread and transfers snapshots, settle results, previews, and fatal errors over the typed
  protocol in [../src/simulation/protocol.ts](../src/simulation/protocol.ts).
- [../src/render/](../src/render/) projects physical snapshots into a faux-3D Canvas lane. It
  owns camera framing, interpolation, ball surface rotation and lighting, pin presentation, and
  asset loading without duplicating game or physics state.
- [../src/audio/](../src/audio/) owns browser-audio playback and aggregates collision changes into
  short, bounded impact cues.
- [../src/designer/](../src/designer/) defines player ball designs and the standalone ball-design
  fixture.
- [../src/save/](../src/save/) validates versioned local-save data, migrates supported historical
  formats, and stores recent setup, preferences, and per-mode practice records.
- [../src/config/](../src/config/) contains the shared rack, lane, camera, benchmark, and physics
  constants. [../src/brands.ts](../src/brands.ts) provides branded TypeScript identifiers.

## Roll data flow

1. [../src/app/setup.tsx](../src/app/setup.tsx) collects a local hot-seat match setup, player
   ball designs, rack scale, bowls per frame, and presentation preferences.
2. [../src/app/app.tsx](../src/app/app.tsx) starts a [../src/app/game.tsx](../src/app/game.tsx)
   session with a `SimulationClient`; the client creates the module worker and initializes its
   selected physical rack.
3. Game actions go through the reducer in [../src/game/match.ts](../src/game/match.ts). Reducer
   effects send initialize, launch, sweep, next-roll, pause, and preview requests to the worker.
4. [../src/simulation/world.ts](../src/simulation/world.ts) remains the source of truth for ball
   and pin collisions. It emits typed-array snapshots that the worker transfers to the main
   thread, avoiding a second mutable physics model in the UI.
5. Game interpolates the latest snapshots, advances camera progress from the physical ball
   position, and asks [../src/render/game_renderer.ts](../src/render/game_renderer.ts) to draw the
   frame. The JSX layer presents score, controls, result calls, celebration overlays, and
   accessible status alongside Canvas.
6. A settled event returns to the reducer. It records pinfall and either sweeps deadwood for an
   eligible same-rack roll, moves to the next player, or completes the match. Completed results
   update local mode records through [../src/save/settings.ts](../src/save/settings.ts).

The preview path follows the same lane limits and ball-force model as a live launch. Requests use
monotonically increasing identifiers so a late worker response cannot replace a newer aiming
state. [SOLID_MODEL.md](SOLID_MODEL.md) records the Solid ownership and lifecycle boundaries.

## Presentation boundaries

- Camera zoom derives from physical ball travel in [../src/render/camera.ts](../src/render/camera.ts);
  the reduced-motion setting keeps a stable full-lane view.
- Result overlays use the reducer's result message through
  [../src/app/roll_celebration.ts](../src/app/roll_celebration.ts); strikes and spares receive the
  stronger visual treatment while ordinary rolls remain restrained.
- [../src/render/ball.ts](../src/render/ball.ts) draws a rotating, lit ball with visible finger
  holes and a player-selected surface. [../src/render/pins.ts](../src/render/pins.ts) uses the
  physical fallen-pin axis and velocity-derived presentation cues without changing collision
  truth.
- [../src/style.css](../src/style.css) supplies the responsive layout, result effects, and
  reduced-motion CSS. [COLOR_CONTRAST_ACCESSIBILITY.md](COLOR_CONTRAST_ACCESSIBILITY.md) records
  color-readability guidance.

## Build and delivery

[../pipeline/build.mjs](../pipeline/build.mjs) runs the production type check, bundles the main
Solid entry, worker, benchmark entry, and designer fixture with esbuild, copies the static HTML,
CSS, and SVG assets, and writes `dist/.nojekyll`. The canonical front door
is [../build_github_pages.sh](../build_github_pages.sh); [../run_web_server.sh](../run_web_server.sh)
builds then serves the same artifact for local review.

## Testing and verification

- [../check_codebase.sh](../check_codebase.sh) runs TypeScript checks, ESLint, Prettier, and the
  framework-independent Node tests in [../tests/](../tests/).
- [../tests/](../tests/) contains deterministic Node checks for scoring, reducer transitions, save
  migration, camera, rendering commands, simulation behavior, audio aggregation, and worker-client
  contracts.
- [../tests/playwright/](../tests/playwright/) contains browser smoke and end-to-end journeys;
  [../run_playwright_tests.sh](../run_playwright_tests.sh) owns their build and runner boundary.
- [../src/simulation/benchmark.ts](../src/simulation/benchmark.ts) and
  [../devel/run_simulation_benchmark.mjs](../devel/run_simulation_benchmark.mjs) measure fixed-step
  and emitted-frame behavior for the supported rack fixtures.
- Repository hygiene and Markdown-link checks are Python tests under [../tests/](../tests/).
  [PYTEST_STYLE.md](PYTEST_STYLE.md) documents the required Python invocation and fast-lane rules.

## Extension points

- Add a supported scale by extending [../src/config/pin_counts.ts](../src/config/pin_counts.ts),
  then keep rack geometry, physics tuning, labels, scoring, setup, and fixtures consistent.
- Add simulation behavior in [../src/simulation/](../src/simulation/) and extend the worker
  protocol deliberately. Keep the worker snapshot as the only browser-to-render physics boundary.
- Add player-visible rules in [../src/game/](../src/game/) first, then map reducer effects in
  [../src/app/game.tsx](../src/app/game.tsx).
- Add Canvas effects in [../src/render/](../src/render/) and CSS/JSX effects in [../src/app/](../src/app/)
  plus [../src/style.css](../src/style.css). Preserve the reduced-motion path.
- Add durable browser state through [../src/save/contracts.ts](../src/save/contracts.ts) and
  [../src/save/save_file.ts](../src/save/save_file.ts), including explicit migration coverage.
- Add browser journeys under [../tests/playwright/](../tests/playwright/) and deterministic model
  coverage in [../tests/](../tests/).

## Known gaps

- Verify a real-device performance budget for the dramatic camera, Canvas, and audio presentation
  at every supported rack scale; benchmark fixtures measure simulation behavior, not every GPU or
  audio implementation.
- Verify the local GitHub Pages workflow after its root
  [../deploy-pages.yml](../deploy-pages.yml) is copied to `.github/workflows/` in the publishing
  repository.
