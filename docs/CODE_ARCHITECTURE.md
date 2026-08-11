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
  communication, aim feedback, celebrations, and hot-seat handoff. `game.tsx` retains state,
  timing, worker, camera, and audio ownership; `game_controls.tsx` is the view-only control deck.
- [../src/game/](../src/game/) contains framework-independent bowling rules, scoring, match
  transitions, player-facing terms, and match-record calculations.
- [../src/simulation/](../src/simulation/) owns the authoritative physical world. It uses
  `@dimforge/rapier2d-compat`, creates racks and colliders, applies ball force and spin,
  tracks pin state, produces aim previews, publishes compact snapshots, and aggregates bounded
  physical impact windows from real ball-pin and pin-pin contacts plus pin fall transitions.
- [../src/simulation/worker.ts](../src/simulation/worker.ts) runs fixed simulation ticks off the
  main thread and transfers snapshots, settle results, previews, and fatal errors over the typed
  protocol in [../src/simulation/protocol.ts](../src/simulation/protocol.ts).
- [../src/render/](../src/render/) projects physical snapshots into a faux-3D Canvas lane. It
  owns camera framing, interpolation, ball surface rotation and lighting, pin presentation,
  localized impact accents, and asset loading without duplicating game or physics state. Committed
  SVG artwork remains the source of truth, then is rasterized once into reusable Canvas assets so
  dense racks do not repeat SVG rasterization inside the frame loop.
- [../src/audio/](../src/audio/) owns browser-audio playback. It prefetches local sample bytes at
  game mount, then creates, resumes, and decodes an `AudioContext` only after a launch gesture.
  Asset-first rolling, impact, clatter, and deck cues route through bounded lane, collision, and
  result buses plus a compressor. Procedural voices remain an offline or decode-failure fallback.
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
   and pin collisions. Its focused `impact_window.ts`, `world_factories.ts`, `world_snapshot.ts`,
   and `world_contracts.ts` modules respectively accumulate physical windows, create Rapier bodies,
   serialize snapshots, and define the simulation boundary.
5. The worker transfers typed-array snapshots and an `ImpactEvent` for each nonempty bounded window.
   That event preserves ball-pin and pin-pin impulse summaries, fall-transition speed summaries,
   and the first ball-pin contact flag; it is not a UI-derived fallen-count aggregate.
6. Game interpolates the latest snapshots, advances camera progress and normal-motion focus from
   the physical ball position, maps each `ImpactEvent` through `impact_presentation.ts`, then
   sends the resulting cues to audio and Canvas. The JSX layer presents score, controls, result
   calls, celebration overlays, and accessible status alongside Canvas.
7. A settled event returns to the reducer. It records pinfall and either sweeps deadwood for an
   eligible same-rack roll, moves to the next player, or completes the match. Completed results
   update local mode records through [../src/save/settings.ts](../src/save/settings.ts).

The preview path follows the same lane limits and ball-force model as a live launch. Requests use
monotonically increasing identifiers so a late worker response cannot replace a newer aiming
state. [SOLID_MODEL.md](SOLID_MODEL.md) records the Solid ownership and lifecycle boundaries.

## Presentation boundaries

- [../src/render/camera.ts](../src/render/camera.ts) derives normal-motion zoom and focus from
  physical ball progress and lateral position. Its shared projection bounds retain the active ball
  corridor and nearest edge pin for hooks and gutter shots. The first real ball-pin centroid
  latches the collision corridor through the cascade, then result presentation eases focus and zoom
  back to neutral. Lower motion returns a neutral projection; neither path changes physics, impact
  events, scoring, or results.
- [../src/app/impact_presentation.ts](../src/app/impact_presentation.ts) maps worker-owned physical
  summaries into normalized sound and accent cues. It contains the perceptual curve; audio and
  render modules do not reinterpret raw physics independently.
- [../src/audio/audio.ts](../src/audio/audio.ts) stops the lane voice at the first physical
  ball-pin contact, schedules short bounded contact layers from those cues, and plays result motifs
  only after authoritative settlement. [../src/assets/audio/LICENSES.md](../src/assets/audio/LICENSES.md)
  records the source, author, license, derivative history, and SHA-256 values for each committed
  CC0 audio derivative.
- Result overlays use the reducer's result message through
  [../src/app/roll_celebration.ts](../src/app/roll_celebration.ts); strikes and spares receive the
  stronger visual treatment while ordinary rolls remain restrained.
- [../src/render/ball.ts](../src/render/ball.ts) draws a rotating, lit ball with visible finger
  holes and a player-selected surface. [../src/render/pins.ts](../src/render/pins.ts) uses the
  physical fallen-pin axis and velocity-derived presentation cues without changing collision
  truth.
- [../src/style_setup.css](../src/style_setup.css) supplies the cascade-order setup layer and
  [../src/style.css](../src/style.css) supplies responsive layout and normal result effects.
  [ACCESSIBILITY.md](ACCESSIBILITY.md) defines the lower-motion presentation contract, while
  [COLOR_CONTRAST_ACCESSIBILITY.md](COLOR_CONTRAST_ACCESSIBILITY.md) records color-readability
  guidance.

## Build and delivery

[../pipeline/build.mjs](../pipeline/build.mjs) runs the production type check, bundles the main
Solid entry, worker, benchmark entry, and designer fixture with esbuild, copies static HTML, both
CSS layers, and the complete [../src/assets/](../src/assets/) tree, and writes `dist/.nojekyll`.
That recursive asset copy places committed audio derivatives at `dist/assets/audio/` beside the
Canvas artwork. The canonical front door
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
- [../devel/capture_screenshots.mjs](../devel/capture_screenshots.mjs) is the visual-evidence front
  door. Its documentation mode calls `capture_documentation_showcase.mjs` to reproduce committed
  screenshots and the short 105-pin cascade GIF from the built browser game.
- [../devel/capture_real_gameplay_audio.mjs](../devel/capture_real_gameplay_audio.mjs) is a
  one-time post-master A/V evidence probe, not a permanent test. It records the live Canvas and a
  mirrored production Web Audio output for real-worker 990-pin and ten-pin rolls, then writes
  ignored media, timing, and analyser evidence under `_temp/`.
- [../src/simulation/benchmark.ts](../src/simulation/benchmark.ts) and
  [../devel/run_simulation_benchmark.mjs](../devel/run_simulation_benchmark.mjs) measure fixed-step
  and emitted-frame behavior for the supported rack fixtures.
- Repository hygiene and Markdown-link checks are Python tests under [../tests/](../tests/).
  [PYTEST_STYLE.md](PYTEST_STYLE.md) documents the required Python invocation and fast-lane rules.

## Extension points

- Add a supported scale by extending [../src/config/pin_counts.ts](../src/config/pin_counts.ts),
  then keep rack geometry, physics tuning, labels, scoring, setup, and fixtures consistent.
- Add simulation behavior in [../src/simulation/](../src/simulation/) and extend the worker
  protocol deliberately. Keep snapshots and typed physical events as the only browser-to-render
  physics boundaries; do not rebuild collision meaning from UI state.
- Add player-visible rules in [../src/game/](../src/game/) first, then map reducer effects in
  [../src/app/game.tsx](../src/app/game.tsx).
- Add Canvas effects in [../src/render/](../src/render/) and CSS/JSX effects in [../src/app/](../src/app/)
  plus [../src/style.css](../src/style.css). Author and validate the energetic normal presentation
  first, then adapt it through the [ACCESSIBILITY.md](ACCESSIBILITY.md) contract.
- Add a committed audio asset under [../src/assets/audio/](../src/assets/audio/) only with an entry
  in [../src/assets/audio/LICENSES.md](../src/assets/audio/LICENSES.md) that identifies its source,
  author, license, derivative steps, and hashes. Keep physical cue mapping in
  [../src/app/impact_presentation.ts](../src/app/impact_presentation.ts) and playback lifecycle in
  [../src/audio/](../src/audio/).
- Add durable browser state through [../src/save/contracts.ts](../src/save/contracts.ts) and
  [../src/save/save_file.ts](../src/save/save_file.ts), including explicit migration coverage.
- Add browser journeys under [../tests/playwright/](../tests/playwright/) and deterministic model
  coverage in [../tests/](../tests/).

## Known gaps

- Listen to complete real-time 990-pin and ten-pin rolls after the integrated build. Confirm that
  rolling, first impact, secondary contacts, the large cascade, and the result have recognizable
  bowling character and the intended relative intensity. Maintained captures and analyser evidence
  support review, but do not replace human listening or integrated A/V review of camera, collision,
  celebration, and pacing.
- Confirm the measured 990-pin browser frame budget on representative real hardware. Automated
  Chromium evidence does not cover every GPU, browser audio implementation, or speaker system.
- Verify the local GitHub Pages workflow after its root
  [../deploy-pages.yml](../deploy-pages.yml) is copied to `.github/workflows/` in the publishing
  repository.
