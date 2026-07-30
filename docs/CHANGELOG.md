## 2026-07-29

### Additions and New Features

- Refreshed the README 1,000-mode 1600 x 1000 aiming capture from the maintained headless fixture.
  The proof shows the complete 990-pin triangle, circular ball, dotted power path, lane diamonds,
  full game composition, and keyboard controls in a 524 KB PNG.
- Refreshed the README 1,000-mode deck-camera proof from the maintained headless fixture to show
  the finalized complete 990-pin triangle, alongside the focused four-player keyboard handoff.
- Added playable one-to-four-player hot-seat setup with exact rack selection, immutable normalized
  ball designs, active-player roster and scorecard presentation, and focused keyboard handoff cards.
- Added deterministic four-player zero-knock fixture evidence for Ari, Bea, Chen, Dia, and Ari,
  including 1600 x 1000 setup and pass-the-keyboard screenshots.
- Added a two-state rack-bound camera core with lane/deck framing, a centralized deck trigger,
  reduced-motion lane locking, and 16:10 containment evidence for 10-, 100-, and 1,000-pin racks.
- Added the M5 custom-ball designer with normalized colors, four shared patterns, optional
  two-character monograms, and one static production-renderer preview per player.
- Added a built 16:10 ball-pattern gallery and headless screenshot proof covering all four designs.
- Added a versioned `super_bowling.save` boundary with normalized recent local setup,
  preferences, bounded per-mode best scores, and in-memory recovery from browser storage failures.
- Added the M6 synthesized audio core with explicit AudioContext activation, bounded collision
  aggregation, immediate mute behavior, rolling and result voices, and fake-backend Node tests.
- Added a dispatch-ready M5 hot-seat and custom-ball work package with explicit player setup,
  reducer-owned keyboard handoff, shared static/gameplay ball rendering, and headless evidence.
- Added the SolidJS, strict TypeScript, Canvas, and simulation-worker foundation for Super Bowling.
- Added feature-owned contracts for pins, players, ball designs, rendering, saves, and snapshots.
- Added an original 16:10 front-facing faux-3D lane shell and static GitHub Pages build pipeline.
- Added the active seven-milestone implementation plan and Solid reactivity contract.
- Added a headless Playwright smoke test for the built game shell and browser diagnostics.
- Added a copy-ready GitHub Pages workflow seed that sets up dependencies, checks the codebase, builds dist, and deploys the uploaded Pages artifact.
- Added a newcomer README with an honest M1 status, verified local front doors, Pages setup,
  planned controls, and a managed screenshot handoff.
- Added the retained Rapier 2D production benchmark with exact six-count racks, local spatial
  activation, fixed deterministic stepping, transferable snapshots, and front-facing Canvas commands.
- Added thirty-shot JSON benchmark evidence through `devel/run_simulation_benchmark.mjs`.
- Added a retained browser benchmark page and headless 1,000-pin worker/Canvas proof.
- Added authoritative generalized bowling rules, table-driven score examples, and an immutable
  one-to-four-player-ready match reducer for the ten-pin playable slice.
- Added the M3 playable one-player ten-pin match with keyboard input, a real simulation-worker
  client, interpolated Canvas rendering, score strip, and result feedback.
- Added a deterministic perfect-game browser fixture that drives the same match reducer,
  renderer, and worker-client contract through all twelve strike rolls.
- Added a dispatch-ready M4 work package for selectable 10-, 20-, 50-, 100-, 500-, and 1,000-pin
  matches, fixed initial-rack framing, generalized scoring evidence, and retained benchmark proof.
- Added a dispatch-ready M6 work package for bounded synthesized audio, versioned local persistence,
  rack-bound camera states, reduced motion, and 16:10 accessibility evidence.
- Added selectable 10-, 20-, 50-, 100-, 500-, and 1,000-pin one-player matches that carry the
  exact rack count through setup, worker physics, scoring, accessibility labels, and Canvas drawing.
- Added six-mode score and match-reducer fixtures plus headless selection coverage for the complete
  selected-rack path.
- Added the `npm run benchmark` front door for the retained TypeScript simulation benchmark report.

### Fixes and Maintenance

- Made `npm run benchmark` the authoritative thirty-shot release gate. It now writes its JSON
  evidence on every run and exits nonzero unless every expected sample settles before timeout,
  preserves standing-plus-fallen pin conservation, and records finite timing measurements. Kept
  the Node lane focused on deterministic validation logic and made the browser benchmark require
  an explicit settled outcome before it passes.

- Made the 16:10 super-lane projection shallower, scaled pin art from each
  projected physical neighbor spacing, and added symmetric diamond aiming marks.
  The camera and renderer fixtures now use complete 10-, 105-, and 990-pin
  triangle totals rather than scale-label values as raw rack sizes.
- Added the M8 playability and geometry revision to the active plan and refreshed
  the README to describe the circular rolling ball, projected path, compact racks,
  shallow lane perspective, and current retained validation front doors.
- Revalidated the final revision through 76 Node tests, the static Pages build,
  the 30-shot benchmark release gate, and all 22 headless Playwright journeys.
- Kept deterministic auto-run fixtures fast while preserving the full visible result dwell for
  player-controlled rolls, and updated browser expectations for the aiming guide draw command.
- Extended the projected aiming guide from the ball into the playable lane, scaling from a
  near-lane weak-power preview to the head-pin plane at full power.
- Kept every scored roll on its fallen-pin deck for a short visible result dwell before the
  reducer advances to a fresh rack, keyboard handoff, or final score. The game now presents an
  accessible strike or pinfall result while the scored snapshot remains on the lane.
- Rebuilt the 16:10 setup surface as a compact two-column Match and Ball garage board: all six
  complete-triangle modes, editable one-to-four-player roster with ball swatches, selected-player
  customization, and the dominant Start control stay visible at desktop size. Added headless
  evidence that player ball edits remain isolated and that four-player match start stays reachable.
- Calibrated the shared launch curve against weak, default, and full centered rolls on 10-,
  105-, and 990-pin triangles. The retained damping keeps minimum power in contact with the head
  pin while default and full power arrive progressively sooner; ten pins saturate at a strike, so
  impact time remains the stable comparison between those two strong launches.
- Strengthened the real-worker browser journey to prove that an untouched default Space launch
  knocks down pins before the strike rack resets for the next roll.
- Replaced the puck-like lane ball with a circular spherical rendering, keeping its moving shared
  pattern as the rolling cue in both gameplay and the setup preview. Added an aiming-only projected
  path arrow that follows the launch offset, grows with the same launch power, and has visible
  native-meter and screen-reader feedback at the 1600 x 1000 desktop target.
- Calibrated the shared ball travel damping so every selectable power reaches the head-pin plane,
  with deterministic coverage for centered minimum, default, and maximum power knockdowns.
- Connected the rack-aware super-lane geometry to both Canvas artwork and point projection so
  compact 10-pin, broad 105-pin, and full 990-pin triangles paint visibly different lane, deck,
  and rail widths while the foreground circular ball keeps one recognizable screen size.
- Added deterministic emitted-lane geometry checks and refreshed the maintained 16:10
  Playwright lane captures for 10-, 100-, and 1,000-mode presentation review.
- Bounded `run_web_server.sh` preview sessions with a 600-second default watchdog and a
  validated `WEB_SERVER_MAX_LIFETIME_SECONDS` override. The tracked child-only lifecycle now
  releases its port after a parent transport interruption while preserving immediate cleanup for
  normal exit and signal paths.
- Restored complete-triangle modes to their playable worker-ready state by comparing actual rack
  totals through the game boundary, corrected the reactive ball snapshot offset, and made the
  headless mode, persistence, camera, smoke, real-worker, and hot-seat controls use exact
  accessible names with source-anchored selector contracts. Aligned the six-mode start selector
  with Setup's explicit one-player suffix.
- Shared labeled benchmark fixtures across the Node and browser entry points, including their
  steering windows; simplified dead production helpers, clarified the Solid ball-preview data
  flow, and documented worker, physics-unit, asset-URL, and rack-ready protocol intent.
- Derived patterned ball-surface motion from forward travel while keeping the simulation-body
  rotation constrained; refreshed browser setup selectors and strengthened benchmark settlement and
  lifecycle evidence with snapshot-frequency-derived quiet intervals.
- Updated the release-facing README, active plan, and Solid ownership guide to describe the
  delivered M1 through M7 product and complete release validation.
- Refined rack documentation to use complete centered triangles: the 10, 20, 50, 100, 500, and
  1,000 scale labels map to actual totals 10, 21, 45, 105, 496, and 990 for the interface and scoring.
- Wired the typed scale-label-to-complete-rack mapping through persistence, worker snapshots,
  conservation, generalized scoring, perfect-game limits, HUD labels, accessibility text, and
  benchmark grouping.
- Documented the variable super-lane width: the lane and deck expand with the selected rack while
  ball and pin art remains recognizable.
- Kept the repo-local `tmp/` workspace ignored for reports and diagnostics, and removed retired
  setup-lane CSS that has no runtime call sites.
- Latched deck framing after the fixed camera trigger, reset the immutable rack-bound camera at
  every launch, and resumed bounded rolling and collision audio when an active roll is unmuted.
- Wired M6 audio, save, and camera cores into the playable app: persisted recent setups and
  per-rack best scores, immediate mute and reduced-motion controls, bounded snapshot collision
  audio, and deterministic lane/deck camera fixtures now share the production Game lifecycle.
- Corrected the production lane projection so the opening ball reads in the foreground and the
  complete rack remains distant in a stable rack-bound view through each cascade.
- Added real-worker Playwright evidence for a Space launch, settlement, and first-roll score update.
- Rendered classic spare marks in the score strip while retaining generalized numeric scoring data.
- Corrected tenth-frame strike bonus rack validation and reducer reset effects.
- Added a repo-local `tmp/` policy file for local reports, screenshots, benchmark scratch, and diagnostics.
- Compiled Solid JSX through the production esbuild pipeline so the game shell mounts in browsers.
- Unified the npm build alias with the canonical GitHub Pages build front door.
- Served the local preview and Playwright fixture through the repository Python environment.
- Made README root-level script commands copy-pasteable from the repository root.
- Changed pins to sleeping dynamic Rapier bodies so direct contact transfers momentum on its
  initial solver step, with spatial activation as the cascade wake path.
- Added generation-gated worker tick chains, per-roll settlement clocks, explicit benchmark CPU
  measurement fields, spatial-boundary fixtures, repeated-roll coverage, and worker lifecycle proof.
- Used the shipped ball SVG in the production Canvas draw path and resolved all three
  game asset URLs relative to the built GitHub Pages site.
- Added focused app-boundary tests for keyboard steering and worker-client subscriptions, plus
  headless Playwright proof for real-worker readiness and the full deterministic 300 game.
- Kept the fixed lane projection bound to the immutable selected rack so complete 10-, 100-, and
  1,000-pin opening decks stay framed while their cascades move independently.

### Decisions and Failures

- Recorded the independent M6 review as needs revision: deck framing needs a
  one-way post-trigger state, and clearing mute during an active roll needs to
  resume its bounded rolling and collision audio.
- Recorded the independent M5 acceptance review: four-player hot-seat rotation, focused handoff,
  active-player ball rendering, setup normalization, and the task-focused 16:10 editor scroll are
  accepted with no P0, P1, or P2 findings.
- Recorded the independent M3 closure review: rack-bound projection, real-worker
  keyboard-to-settlement journey, and conventional spare feedback are accepted;
  a Chromium MachPort launch denial is documented as host evidence rather than
  a product regression.

### Developer Tests and Notes

- Release validation completed: `./check_codebase.sh` passed 70 Node tests and
  `./build_github_pages.sh` passed.
- `npm run benchmark` generated a local ignored 30-sample report with zero timeouts and zero
  unsettled rolls for mappings 10->10, 20->21, 50->45, 100->105, 500->496, and 1000->990.
  Its largest rack used 991 bodies including the ball, with maximum fixed-step p95 0.102ms,
  emitted-frame p95 0.877ms, and settlement 6625ms.
- `env PW_PORT=4175 ./run_playwright_tests.sh --build` passed 20/20 in 27.7 seconds, and the
  current README screenshots were visually inspected at 1600 x 1000.
- Defined all six supported pin counts and kept PlayerId and PinId as the only branded primitives.
- Defined transferable snapshot messages and a lifecycle-capable worker entry for later physics work.
- Adopted snake_case for runtime identifiers, protocol fields, configuration keys, CSS classes, and files.
- Kept one shared physics model across all rack counts; only snapshot frequency and activation radius
  vary by selected pin count.
- Recorded the independent M3 acceptance review, including the corrected foreground-ball and
  distant-pin composition requirement plus real-worker score-update evidence.
