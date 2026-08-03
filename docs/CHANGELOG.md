## 2026-08-02

### Additions and New Features

- Added V4 per-mode practice records: bounded recent completed scores, high game,
  best frame, best strike run, and a compatibility migration from V1, V2, and V3 saves.
- Added practice-record cards, earned-moment toasts, and an end-of-match summary
  that compares a completed game with the pre-match record when one exists.
- Added configurable bowls per frame for `B = 1` through `B = 5`, with Super
  frame ten-frame play set to exactly `B + 1` bowls and Classic `B = 2`
  retaining its conditional fill ball.
- Added maintained camera-bakeoff and milestone capture diagnostics, including
  3%, 6%, and 10% row-reveal artifacts and JSON measurements.

### Behavior or Interface Changes

- Reopened earned feedback after live play showed that an ordinary first match
  could finish without a milestone toast. A player's first positive or improved
  frame record now raises `BEST FRAME` once, completed spares read `Spare!`, and
  the final panel includes the match's best frame with record context. Shared
  finalized-frame derivation now supplies that record decision and summary.
- Completed matches now update their selected mode's record only after the score
  is final. Legacy saves retain compatible settings while the migration starts
  their new V4 match history empty.
- The setup and game surfaces show shared score labels and bowling terms, with
  `-` continuing to represent an unbowled value rather than a zero score.
- Reclaimed the 1600 x 1000 play surface with a 116 px top chrome, a 352 px
  side control panel, and a 1248 x 884 lane canvas instead of a bottom control
  deck. The compact score and player chrome leave the lane at least 75% of the
  viewport width.
- Selected the open 10%-showing (90%-overlap) pin-row composition after
  independent original-resolution visual review. The complete-rack camera now
  anchors the rear crown at 4%, the aiming-ball bottom at 95%, and occupies
  91% of the actual lane canvas for every rack and game state.
- Made the 990-pin mode deliberately superhuman with a 40 lb ball, expanded
  power and spin, and a bounded post-contact through-pin drive so the ball can
  reach the backstop without changing ordinary ten-pin play.
- Canonicalized fallen-pin art to crown-up orientation while preserving the raw
  physics capsule axis.
- Compacted the supported desktop setup so Start Match remains visible at
  1600 x 1000 for one through four players; shorter screens retain scrolling.

### Fixes and Maintenance

- Refreshed both managed README screenshots from the shipped 1600 x 1000 browser
  build. The 990-pin capture now deliberately shows the live `BEST FRAME` toast
  after two real worker rolls, while the four-player handoff preserves its
  keyboard-flow proof. Updated the managed alt text and maintained capture
  front door.
- Corrected the strike-matrix test's baseline path to
  `docs/archive/reports/cascade_baseline.md`.

### Decisions and Failures

- Prioritized `HIGH GAME`, then `BEST FRAME`, then named strike runs in the
  single non-blocking toast slot. Practice records reflect improvement and earn
  emphasis before streak theater, while later run rungs remain available. A
  lower-priority `BEST FRAME` sharing a `HIGH GAME` transition is not replayed
  on an unrelated later roll, but a genuine later frame improvement can earn it.
- Derived match statistics from completed summaries instead of tracking parallel
  mutable counters. Generalized earned terminology uses Double through Six-pack,
  then `N-bagger`, based on USBC and Bowl.com terminology references.
- Kept the Turkey toast's unpainted auto-fixture transition out of the permanent
  browser suite: the fixture skips render turns, while focused Node tests cover
  that transition directly. This is test-scope evidence, not a product failure.
- Rejected the earlier tiny centered lane-and-rack island and the later
  empty-space-heavy composition as visual evidence: both consumed the 16:10
  play area without making the deep rack more readable. The side panel and
  two-anchor complete-rack solve replace those attempts.
- Accepted the nine-state visual review across 10-, 105-, and 990-pin aiming,
  mid-roll, and partial or settled states. Capture generation and independent
  screenshot judgment remain separate checks.

### Developer Tests and Notes

- `./check_codebase.sh` passed with 181 Node tests. The full Playwright suite
  passed 33/33 (including the `run_web_server.sh` front door), focused
  practice-record coverage passed 2/2, and `pytest tests/` passed 667.
- One-time browser and capture review confirmed the live BEST FRAME toast and
  final-summary surfaces without imposing pixel-equivalence, snapshots, or
  timing gates. Independent rereview accepted F1, F2, and F4; visual review
  accepted the managed README capture.
- Capture provenance, capture-harness ESLint, Markdown links (35 passed), and
  `git diff --check` passed.
- Regenerated the managed documentation PNGs with
  `./devel/capture_screenshots.sh --documentation`; both are 1600 x 1000 and
  under the 1 MB documentation-image budget.

## 2026-08-01

### Additions and New Features

- Added the post-closeout playability recovery record: a single centered faux-3D shot,
  worker-acknowledged second-roll readiness, stale-preview fencing, and durable browser-capture
  gates for real production-path evidence.
- Added `npm run strike-matrix -- ...`, a permanent fixed-timestep diagnostic that runs one legal
  four-parameter launch through all six actual triangular racks, reports settlement and pin
  conservation, and can make all-rack strikes strict with `--require-all-strikes`.

### Behavior or Interface Changes

- Fallen capsules now receive angular damping only at their physical transition, preserving
  upright-pin response while preventing implausible repeated windmill rotations after impact.
- Fallen pins now replace their standing circular collider with a mass-preserving 1.25 ft outward
  capsule. Native Rapier pin-to-pin contacts carry cascades, and the first-contact diagnostic
  reports ball-to-pin or pin-to-pin provenance without adding synthetic fall logic.
- Fallen-pin snapshots now carry each capsule's physical center and long-axis pose, which the
  renderer uses to align the sprite with its collision footprint.
- The camera now holds one centered full-lane composition. Physical ball travel drives monotonic
  visible upward movement and a mild zoom; results hold the final view, second rolls reset before
  controls enable, and reduced motion keeps the same composition without zoom.

### Fixes and Maintenance

- Scoped the fixture-only second-roll rolling hold to the partial-knock journey, so zero-knock
  fixtures publish their normal settled second roll and four-player handoffs complete.
- Rebuilt the upright and fallen pin silhouettes from the curved profile in the public-domain
  [OpenClipart strike artwork](https://openclipart.org/download/295903/publicdomainq-strike.svg),
  replacing the
  early-swelling oval profile with a rounded crown, narrowing neck, late shoulder, full belly,
  and narrow foot. Both orientations now use the same profile, with both red bands on the neck.

### Decisions and Failures

- Reopened visual finding S10 after player review overruled the earlier independent acceptance:
  the first replacement still had the wrong curve and its generated crown ended in a point. The
  supplied public-domain source is now the shape reference instead of another freehand redraw.
- The deterministic centered power sweep at 8, 12, 16, 20, and 24 found no setting that strikes
  every rack: only 10 pins struck, and the best 990-pin result was 359 fallen at power 24. This is
  recorded as propagation-design evidence, not represented as success or made a release gate
  unless `--require-all-strikes` is explicitly requested.

### Developer Tests and Notes

- Rendered both standalone SVGs with `rsvg-convert`, validated them with `xmllint`, and refreshed
  the maintained documentation and milestone captures through
  `./devel/capture_screenshots.sh`. The live 10-, 105-, and 990-pin aiming captures and deadwood
  capture show the corrected upright and fallen profiles at game scale.
- Updated the four-player Playwright turn helper to wait for the real next-roll aiming readiness
  contract before bowling again, keeping the handoff journey race-free without a fixed delay.
- The fallen-capsule realism check now requires finite, visible native rotation below one
  accumulated turn on a representative roll. It avoids exact angular paths while a separate legal
  centered-shot test retains the possibility of a strike.

## 2026-07-30

### Additions and New Features

- Rebuilt Super Bowling around a foot-based regulation lane with fixed 60 ft ball travel,
  fixed 9.25 in gutters, rack-scaled lane width, and a pit that removes fallen pins between
  rolls on the same rack.
- Added four pre-roll bowling controls: start position, launch angle, power, and spin. The
  worker now provides the actual aim preview instead of a separate synthetic guide.
- Updated the ball, pin, and lane presentation so the equipment reads as bowling at every
  supported rack size, and retained the permanent 1600 x 1000 screenshot harness for docs and
  milestone probes.
- Added the young-adult design guidance and refreshed player-facing geometry, rules, and README
  documentation to describe technique, sweeping, the four controls, and the fixed-travel lane.

### Fixes and Maintenance

- Removed rolling-ball steering. Input now commits a bowling shot before the ball rolls, which
  keeps the live path consistent with its preview.
- Cleared incomparable persisted best scores through the V2 save migration, and widened the
  playable power range to support the regulation-lane travel model.
- Bumped release metadata to CalVer `26.07.1` in `VERSION`, `package.json`, and the root package
  metadata in `package-lock.json`.

### Decisions and Failures

- Replaced local lane patches with foot conversion, fixed gutter and travel dimensions, and
  rack-scaled width so every rack follows one physical model.
- Chose a real-engine worker preview rather than a parallel integrator. The safe centered shot is
  intentionally not a reliable strike; the measured pocket result is eight down, accepted as
  good enough rather than tuned toward a fragile exact target.
- Recorded that full Playwright attempts reached 23/24 before host suspension or browser-session
  closure. Each current spec passed in focused or component reruns, so this entry does not claim
  a single fully green final browser run.

### Developer Tests and Notes

- `./check_codebase.sh`, `./build_github_pages.sh`, and the 30-shot `npm run benchmark` gate
  passed. All 30 shots settled with zero false timeouts.
- The final 990 benchmark median was 431.27 ms per shot: 1.11x the M1 baseline and under the
  750 ms budget. The 990 rAF capture measured 22.7 ms median and 28.8 ms p95, under the
  50 ms and 60 ms perceptual guards.
- The shot harness observed A=6, B=6, C=0, D=0, E=8, and mirrored F=8/8 pins down. Independent
  visual review accepted S1 through S10 using maintained 1600 x 1000 captures.
- Tuning evidence, not permanent gates: skid/hook/roll use 26/17/2 ft/s with 0.7 gain, producing
  2.10 ft full-spin displacement at the head-pin plane; 1.9 pin linear damping gave A=6, B=6,
  and E=8 accepted as good enough; a 12 s + 0.35 * deck-depth settle limit with a 0.75 s quiet
  window produced zero false timeouts across 30 benchmark shots.

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
