# Super Bowling v1 plan

## Product outcome

Super Bowling is an original, front-facing faux-3D browser bowling game for a
16:10 landscape viewport. Players choose the 10, 20, 50, 100, 500, or 1,000
scale label,
aim with arrow keys, and bowl with Space. The physical ball is circular; its
Canvas surface art moves with forward travel to show rolling. One to four
people share the keyboard in local hot-seat play.

## Settled v1 decisions

| Area               | Decision                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physics            | Spatial activation keeps every pin visible and countable while activating contacted or nearby cascade pins.                                                                                                                                                           |
| Rack geometry      | Every selected label maps to a complete centered triangular deck with a head pin and rows 1, 2, 3, and onward: 10->10, 20->21, 50->45, 100->105, 500->496, and 1,000->990. The 50 label preserves its row-0-through-9 convention; its nonzero triangle rows total 45. |
| Lane geometry      | The super lane and deck widen with the selected triangular rack. A shallow front-facing projection, compact pin spacing, and two symmetric five-diamond rows retain recognizable play-scale proportions.                                                              |
| Physics tuning     | One shared model serves every rack. Snapshot frequency and activation radius are the count-dependent values.                                                                                                                                                          |
| Falling pins       | One displacement-or-impulse threshold emits one fall event. Fallen pins remain circular bodies and use a velocity-oriented fallen sprite.                                                                                                                             |
| Snapshot transport | Transfer a fresh typed-array snapshot at 60 Hz through 100 pins and 30 Hz for 500 and 1,000 pins. Canvas interpolates snapshots.                                                                                                                                      |
| Scoring            | Generalized classic bowling uses the displayed actual rack total N. A perfect game scores 30 times N.                                                                                                                                                                 |
| Players            | Setup collects one to four names and ball designs. Recent setup persists for the next match.                                                                                                                                                                          |
| Ball designer      | Base and accent color, solid, single-band, double-band, or chevron pattern, and an optional two-character monogram define each ball.                                                                                                                                  |
| Ball preview       | Setup uses one static frame from the gameplay `draw_ball()` renderer.                                                                                                                                                                                                 |
| Camera             | A lane view changes at one fixed trigger to a rack-bound deck view. Reduced motion keeps the camera fixed.                                                                                                                                                            |
| Audio              | Rolling, aggregated collision, and result effects use synthesized audio after interaction.                                                                                                                                                                            |
| Persistence        | Store mute, reduced motion, recent names and designs, and best score per pin count in one versioned schema.                                                                                                                                                           |
| Naming             | Files, runtime identifiers, configuration keys, protocol fields, and CSS classes use snake_case. PascalCase identifies types and components.                                                                                                                          |

## V1 scope boundary

| Area         | V1 product shape                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ball setup   | One current design per player and the most recent setup make balls recognizable at play time.                                                |
| Presentation | Original lane art, a circular rolling ball, an aim-and-power path, clear score feedback, pin motion, and synthesized sound convey each shot. |
| Camera       | The two stable camera states frame all supported racks without per-pin tracking.                                                             |
| Persistence  | The compact schema preserves current preferences and replay value between local sessions.                                                    |

## Delivery status

| Milestone                             | Status    | Current evidence                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1: Build and contracts               | Delivered | Strict Solid shell, worker entry, static build, and headless browser shell proof are present.                                                                                                                                                                                                    |
| M2: Physics and benchmark             | Delivered | `npm run benchmark` generates a local 30-shot JSON report for all six complete-triangle racks.                                                                                                                                                                                                   |
| M3: Ten-pin match                     | Delivered | Worker-backed ten-frame scoring, keyboard launch, and real-worker first-roll evidence are present.                                                                                                                                                                                               |
| M4: Generalized modes                 | Delivered | The setup, worker, scoring model, labels, and renderer carry all six supported pin counts.                                                                                                                                                                                                       |
| M5: Hot-seat and balls                | Delivered | One-to-four-player setup, focused handoff, shared ball renderer, and four-player browser fixture are present.                                                                                                                                                                                    |
| M6: Presentation and saves            | Delivered | Bounded audio, normalized local save, rack-bound camera, and reduced-motion browser fixtures are present.                                                                                                                                                                                        |
| M7: Release validation                | Delivered | The maintained check passes 76 Node tests, the Pages build passes, the explicit 30-shot benchmark release gate passes, and the complete headless Playwright suite passes 22/22.                                                                                                                  |
| M8: Playability and geometry revision | Delivered | Default-power rolls reach the rack, settled results dwell visibly, the circular ball has an aim-and-power path, setup and play fit 16:10, and the flatter super-lane uses compact complete triangles with ten aiming diamonds. The 1,000-mode README proof passed 1600 x 1000 visual inspection. |

The retained validation front doors are `./check_codebase.sh`,
`./build_github_pages.sh`, `./run_playwright_tests.sh --build`, and
`npm run benchmark`. The local ignored benchmark artifact is
`artifacts/benchmark/simulation_benchmark.json`.

## M1: Build and contracts

- Owner: foundation implementer.
- Files: `package.json`, `pipeline/build.mjs`, `src/main.ts`, `src/app/app.tsx`,
  `src/simulation/protocol.ts`, `src/simulation/worker.ts`, feature contract files,
  [SOLID_MODEL.md](../../SOLID_MODEL.md), and this plan.
- Behavior: build a strict Solid shell, worker entry, feature-owned contracts,
  static GitHub Pages artifact, and a 16:10 original lane preview.
- Validation: strict TypeScript compilation, `./check_codebase.sh`, and static build.
- Success evidence: `dist/main.js`, `dist/simulation_worker.js`, and `dist/index.html` exist.

## M2: Production physics and render benchmark

- Owner: simulation implementer.
- Files: `src/simulation/benchmark.ts`, `src/simulation/rack.ts`,
  `src/simulation/world.ts`, `src/simulation/activation.ts`,
  `src/simulation/pin_state.ts`, `src/config/physics.ts`,
  `src/render/benchmark_renderer.ts`, `src/benchmark.html`, `src/benchmark_main.ts`,
  `devel/run_simulation_benchmark.mjs`, `tests/test_simulation_benchmark.mjs`, and
  `tests/playwright/simulation_benchmark.spec.ts`.
- Behavior: construct the six complete-triangle racks, run representative rolls through
  spatial activation, and render every pin through transferable snapshots. Pins begin as
  sleeping dynamic bodies so first contact transfers physical momentum. Worker reset uses a
  generation token, and one launch owns one bounded tick chain.
- Validation: save a benchmark JSON report with fixture CPU time, fixed-step mean and p95 CPU
  time, emitted-frame mean and p95 CPU time, settlement time, total and maximum awake body counts,
  and final standing/fallen counts for each representative shot and pin mode. Exercise the built
  worker, Canvas renderer, and 1,000-pin head-on roll through headless Playwright.
- Success evidence: every rack contains the actual total for its selected label, representative rolls
  settle, contacts activate their targets, standing plus fallen equals the
  displayed actual total, and the 1,000-label mode remains interactive.

## M3: Ten-pin playable match

- Owner: integrator.
- Files: `src/app/game.tsx`, `src/game/scoring.ts`, `src/game/match.ts`,
  `src/render/`, `src/simulation/`, `docs/GAME_RULES.md`, and game tests.
- Behavior: play one ten-pin, ten-frame, single-player match from setup through
  final score with keyboard input, worker physics, Canvas, and a minimal HUD.
- Validation: table-driven scoring tests and one Playwright happy-path match.
- Success evidence: strikes, spares, open frames, tenth-frame bonus rolls, and
  incomplete scores follow the authoritative rules document.

## M4: Generalized pin modes

- Owner: simulation and game-domain implementers.
- Files: `src/config/physics.ts`, `src/simulation/`, `src/game/scoring.ts`,
  `src/app/`, `docs/GAME_RULES.md`, and focused tests.
- Behavior: expose all six scale labels and their actual complete-triangle totals through the
  ten-frame match model.
- Validation: five representative shots pass with shared physics in every mode;
  scoring tests use worked 10-, 100-, and 1,000-pin examples.
- Success evidence: each perfect game scores 30 times its displayed actual total and every
  selected rack remains playable.

## M5: Hot-seat and custom balls

- Owner: UI and designer implementers.
- Files: `src/app/setup.tsx`, `src/designer/ball_designer.tsx`,
  `src/designer/ball_design.ts`, `src/render/ball.ts`, `src/game/match.ts`, and tests.
- Behavior: collect one to four player names and recognizable ball designs,
  rotate turns in frame order, and show a clear pass-the-keyboard screen.
- Validation: design normalization tests, one visual fixture for all patterns,
  match rotation tests, and a four-player Playwright fixture.
- Success evidence: setup preview and gameplay render the same design.

## M6: Audio, persistence, camera, and accessibility

- Owner: presentation and persistence implementers.
- Files: `src/audio/audio.ts`, `src/audio/collision_audio.ts`,
  `src/save/save_file.ts`, `src/save/load.ts`, `src/save/settings.ts`,
  `src/render/camera.ts`, `src/config/camera.ts`, and validation tests.
- Behavior: add three bounded synthesized effects, compact persistence, two
  camera states, responsive 16:10 presentation, and reduced-motion support.
- Validation: save boundary tests, audio aggregation tests, mute persistence
  Playwright coverage, and 10-, 100-, and 1,000-pin camera screenshots.
- Success evidence: invalid saves produce clean defaults, a large cascade keeps
  audio work bounded, and every camera fixture frames its complete rack.

## M7: Validation, review, docs, and release

- Owner: verification and documentation implementers.
- Files: `tests/`, `tests/playwright/`, `README.md`, `docs/`, and release files.
- Behavior: validate production behavior, document play and deployment, and
  prepare the static artifact for GitHub Pages.
- Validation: complete check gate, build, Playwright suite, benchmark report,
  visual review, and independent code review.
- Success evidence: reproducible build evidence and newcomer documentation show
  how to play the shipped game.
- Final evidence: `./check_codebase.sh` passes 76 Node tests;
  `./build_github_pages.sh` passes; `npm run benchmark` passes its 30-shot
  settlement, timeout, conservation, completeness, and finite-measurement gate;
  `env PW_PORT=4175 ./run_playwright_tests.sh --build` passes 22/22; and the
  README screenshots are visually inspected at 1600 x 1000.

## M8: Playability and geometry revision

- Owner: gameplay, rendering, and verification implementers.
- Files: `src/app/game.tsx`, `src/app/setup.tsx`, `src/render/ball.ts`,
  `src/render/game_renderer.ts`, `src/style.css`, `docs/GEOMETRY_MODEL.md`,
  `tests/test_game_renderer.mjs`, and focused Playwright journeys.
- Behavior: make every selected power reach the rack; keep the settled deck
  visible long enough to read the result; draw a circular ball, power meter,
  and projected path from the same launch state; fit setup, score, lane, and
  controls into the 16:10 viewport; and present complete triangular racks as
  compact pin walls on a shallow-perspective super-lane with ten diamonds.
- Validation: deterministic contact tests cover legal powers and representative
  rack totals. Renderer tests cover path movement, density, containment, and
  symmetric diamonds. Headless browser journeys cover default-power scoring,
  aim feedback, setup composition, generalized rack framing, and result dwell.
- Success evidence: a centered default Space roll reaches and knocks down pins;
  the aiming view explains direction and power before launch; 10, 105, and 990
  pins remain contained and countable; and the complete interface fits a
  1600 x 1000 viewport.
