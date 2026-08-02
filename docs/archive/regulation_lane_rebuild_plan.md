# Plan: Regulation lane rebuild for Super Bowling

## Context

Super Bowling reached "M8 delivered" on paper, but a 1,000-mode screenshot shows the
playable product is broken in ways the current tests do not catch. Reading the source
confirms every reported complaint has a concrete root cause, and most trace to one
absence: the world has no lane. It has a rack and a ball on an infinite empty plane.

Each reported failure gets an ID. The visual acceptance gate in
`## Acceptance criteria and gates` checks these IDs one by one, because the previous
milestone was marked delivered while the screenshot showed otherwise.

| ID  | Symptom                                     | Root cause                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Ball sticks in front of the pins            | `physics_config.ball_linear_damping = 0.45` caps total ball travel at `v0 / 0.45`. At minimum power (8) that is 17.8 world units, less than the 16-unit run to the head pin plus any deck depth.                                                                                         |
| S2  | Deadwood not cleared between rolls          | `reduce_match` emits `reset_rack` only between frames. Between roll 1 and roll 2 there is no effect at all, so `src/simulation/world.ts` keeps every fallen body where it stopped. Fallen pins also keep full-radius colliders, so deadwood forms the wall the stalled ball cannot pass. |
| S3  | Pins end up on the wall                     | No side walls, no kickbacks, no gutters exist. `project_point` clamps normalized x to `+/-1.1`, so an escaped pin renders 10 percent outside the lane silhouette.                                                                                                                        |
| S4  | Lane too short                              | Ball spawns at `y = -9`, head pin at `rack_start_y = 7`. That is 23 pin-spacings. A regulation lane is 60.                                                                                                                                                                               |
| S5  | Lane width not proportional to the back row | `camera_config.lane_min_half_width = 4` floors `x_extent`, but a ten-pin rack is only 1.34 units half-wide. The ten-pin lane is roughly three times too wide for its rack.                                                                                                               |
| S6  | Aiming diamonds wrong                       | `create_lane_diamonds` paints two symmetric rows of five diamonds at screen depths 0.57 and 0.70. A real lane has seven targeting arrows in a chevron 12 to 16 feet past the foul line.                                                                                                  |
| S7  | Only two controls                           | `input_controller.ts` exposes lateral offset and power at aim time, plus arcade steering of a rolling ball. There is no angle and no spin.                                                                                                                                               |
| S8  | Ball art weird                              | `ball_sphere.svg` is a blue orb with a specular ellipse and a `M27 93c27 17 79 17 106 0` arc that reads as a smile. No finger holes.                                                                                                                                                     |
| S9  | Yellow triangle drawn on the ball           | The aim-guide arrowhead. `get_aim_guide_end_y` returns `1 + power*6/16`, so at low power the arrowhead lands on the ball.                                                                                                                                                                |
| S10 | Pins look like milk bottles                 | `pin_upright.svg` has no waist inflection and a base nearly as wide as the belly, and the stripe sits on the shoulder instead of the neck. The renderer also draws it at aspect 2.15 when a real pin is about 3.15 tall per belly width.                                                 |

This plan rebuilds the world around a real lane in real units, then fixes art, controls,
and presentation on top of that foundation. It also adds the young-adult design doc the
repo is missing: `docs/FUN_VIBES_DESIGN_STYLE.md` already exists but is explicitly
kid-arcade and framed around a 12-year-old player.

## Objectives

- Make one world unit equal one foot, so every physical constant is checkable against a
  published regulation number instead of a tuned guess.
- Give the world a lane: gutters, kickbacks, a pin deck, and a pit, so nothing leaves the
  playing surface and the ball always terminates in the pit.
- Guarantee by simulated proof, not algebra alone, that the ball reaches the pit at
  minimum power for every rack, so it is always recycled and never parks mid-lane.
- Sweep deadwood between rolls of a frame so the second roll faces standing pins on a
  clear deck.
- Derive lane width from the back-row pin count, so a 10-pin lane looks like a 10-pin lane
  and a 990-pin lane looks proportionally the same.
- Give the player four pre-roll controls -- power, start position, angle, and spin -- with
  a three-phase skid/hook/roll model that rewards technique over a safe default shot.
- Keep one physics implementation. The aim preview runs the same engine and the same force
  code as the live roll, rather than a parallel model that must be kept in sync.
- Replace pin and ball art with correct silhouettes, and convey rolling by scrolling a
  seamless ball-surface SVG rather than wobbling a band.
- Paint seven regulation targeting arrows plus a foul line, lane guide dots, and a deck
  boundary in place of the current ten diamonds.
- Prove 990-pin presentation and cost against evidence captured before the rebuild starts,
  not against an assumed budget.
- Publish `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md` as the design doc this repo follows.

## Design philosophy

**Fix the design, not the symptom.** Every symptom above has a tempting local patch: nudge
damping up, hide deadwood in the renderer, clamp pin x harder, shrink `lane_min_half_width`.
Each patch would leave the underlying absence -- there is no lane -- in place, and the next
rack size would surface the same class of bug again. The plan instead introduces one
authoritative lane geometry module in real units and rebuilds simulation, rendering, and
controls as consumers of it.

**Long-term over short-term.** Converting world units from arbitrary to feet is a wide
change: it invalidates the tuned physics constants, the benchmark fixtures, the camera
padding values, the aim ranges, and the saved best scores. That cost is paid once, and in
exchange every future constant is verifiable against a real measurement and every future
rack size follows from one formula.

**Use the scientific method.** Hook strength, pin damping, settle-timeout scaling, the 990
cost budget, and the 990 frame-rate threshold cannot be settled from a published number.
Each is measured, with the baseline captured before any physics change so the comparison is
real rather than remembered. Where a plan cannot yet state a number honestly, it states the
rule for choosing it and the milestone that will record it.

**Perfect is the enemy of good, applied to tests.** A permanent test that asserts a tuned
number, an exact outcome, or floating-point identity will fail on a harmless engine change
and teach the team to ignore red. Durable invariants are broad and behavioral; precise
numbers live in the M3 tuning report and the evidence package. The split is made explicit
in `## Test and verification strategy` and is checked against the permanent-test checklist
in `docs/PYTEST_STYLE.md` before anything joins the suite.

Rejected alternative: keeping the current compressed 23-spacing lane and fixing only width
proportion, gutters, deadwood, and controls. That is a smaller diff and was offered, but it
leaves the lane visibly short, keeps physics constants unanchored to anything checkable,
and leaves the minimum-power reach guarantee as a tuning accident rather than an invariant.

## Scope

- Add `src/config/lane.ts` as the single authoritative lane geometry module in feet.
- Settle every cross-workstream **interface** in M1: the four-parameter launch message, the
  `sweep_deadwood` message, the snapshot removed flag and stride, the `preview_path`
  request and response, and the hook function signature.
- Convert `src/config/physics.ts`, `src/simulation/rack.ts`, and `src/config/camera.ts` to
  feet, with an equilateral 12-inch rack triangle.
- Add gutters, kickbacks, a pin-deck boundary, and a pit as static bodies in
  `src/simulation/world.ts`, with explicit pit capture and ball recycling.
- Retune ball damping so a simulated minimum-power roll reaches the pit for every rack.
- Sweep deadwood between rolls that continue on the same rack.
- Add `src/simulation/hook.ts` with a pure three-phase skid/hook/roll lateral-force
  function, and factor the ball force step into one function shared by the live world and
  the preview world.
- Serve the aim preview from a pins-free scratch Rapier world inside the existing worker,
  so the preview and the roll share one physics implementation.
- Rewrite `input_controller.ts` for four controls plus on-screen pointer controls in
  `src/app/game.tsx`.
- Derive renderer lane width and targeting-arrow placement from `src/config/lane.ts`.
- Replace `src/assets/pin_upright.svg` and `src/assets/pin_fallen.svg` with correct pin
  silhouettes and fix the drawn pin aspect ratio.
- Replace `src/assets/ball_sphere.svg` with a seamless `src/assets/ball_surface.svg` strip
  and scroll it under the circular clip to convey rolling.
- Fix the aim guide so it never draws on the ball and previews the actual curved path.
- Bump the save schema version and clear now-incomparable best scores while preserving
  names, ball designs, and preferences.
- Extend the benchmark to report 990-pin cost against the M1 baseline.
- Add `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md` and cross-link it with the existing
  kid-arcade doc.
- Update `docs/GEOMETRY_MODEL.md`, `docs/GAME_RULES.md`, `README.md`, and
  `docs/CHANGELOG.md`; update the active plan's delivery status.

## Non-goals

- Do not model the 15-foot approach area behind the foul line. The ball spawns at the foul
  line and there is no release-timing mechanic, so approach markings would imply a control
  that does not exist. The foul line itself and the lane-level guide dots just past it are
  in scope; the approach is not.
- Do not maintain a second physics implementation for the aim preview.
- Do not add a third camera state or per-pin camera tracking; the existing lane and deck
  states stay.
- Do not change the generalized scoring model or the six supported mode labels.
- Do not add oil patterns, lane conditions, or ball surface friction models.
- Do not transfer spin into pin contact as a tangential impulse. The hook path is the
  expressive element; contact spin multiplies the tuning surface for little visible gain.
- Do not move to a 3D renderer; the front-facing faux-3D projection stays.
- Do not rewrite the ball designer feature; it stays and gains the corrected surface art.
- Do not add pixel-diff or exact draw-coordinate assertions. Visual acceptance is a
  reviewer checklist against S1 through S10.
- Do not add online play, leaderboards, or accounts.
- Do not rewrite `docs/FUN_VIBES_DESIGN_STYLE.md`; it stays intact as the sibling
  kid-arcade genre doc.

## Current state summary

The repo is a strict-TypeScript SolidJS browser game with a Rapier2D simulation worker,
a Canvas renderer, and a transferable-snapshot protocol between them. `./check_codebase.sh`,
`./build_github_pages.sh`, `./run_playwright_tests.sh --build`, and `npm run benchmark` are
the four validation front doors, and all currently pass. The active plan
`docs/active_plans/active/super_bowling_v1.md` marks M1 through M8 delivered.

The architecture is sound and worth keeping. The boundaries are clean: simulation owns
world coordinates, render owns framing, `src/game/match.ts` is a pure reducer, and
contracts are feature-owned. Nothing here requires re-architecting those boundaries. What
is missing is a lane, and what is wrong is a set of constants and assets that were never
anchored to a real measurement.

Existing tests will break by design. `tests/test_simulation_benchmark.mjs`, the aim
fixtures, and several `tests/playwright/e2e/*.spec.ts` specs assert against the old world
scale, the old power range, and the old ten-diamond lane. Updating them is in scope and
owned by the workstream that changes the behavior underneath them.

## Architecture boundaries and ownership

M1 freezes **interfaces**, not values. This is the distinction that keeps three
workstreams parallel without making early guesses expensive to correct.

| Frozen through M2                                                        | Adjustable through M3                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Exported names, signatures, parameter order, units                       | Tuning constants: ball damping, pin damping, hook gain and thresholds, settle scaling  |
| Protocol message field names and types; snapshot field layout and stride | Geometry values no consumer hardcodes: gutter width, pit depth, deck tail, edge margin |
| The fact that `lane_width` is a function of `rack_row_count`             | The margin constants inside that function                                              |
| The hook function's four behavioral properties                           | The gain that scales them                                                              |

The rule that decides any mid-M2 change: **a value may change if no other workstream must
edit code to absorb it.** Consumers read `lane.ts` at runtime and assert properties rather
than constants, so a retuned number propagates for free. A renamed export or a changed
message shape does not, and is therefore frozen.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream       | Component                                                                               | Review boundary                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| M1 / interface contract      | `src/config/lane.ts`, `src/simulation/{protocol,hook,ball_force,preview}.ts`            | Blocking; reviewed and frozen before M2 dispatch             |
| M2 / WS-A physics            | `src/config/physics.ts`, `src/simulation/{rack,world,pin_state}.ts`                     | Simulation only; no render or app edits                      |
| M2 / WS-B controls           | `src/app/{input_controller.ts,game.tsx}`, `src/game/{match,contracts}.ts`, `src/save/*` | Input, reducer, save only; no simulation or render internals |
| M2 / WS-C art and lane paint | `src/render/*`, `src/assets/*`, `src/config/camera.ts`                                  | Render and assets only; no simulation edits                  |
| M3 / integration             | Cross-cutting wiring, fixtures, tuning, evidence capture                                | Owns conflicts between M2 patches                            |
| M4 / docs                    | `docs/*`, `README.md`                                                                   | Documentation only                                           |

## Milestone plan

| M   | Title                                    | Summary                                                                                                               | Goal                                                                                                        |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M1  | Interface contract and baseline evidence | `lane.ts`, protocol, hook, shared ball-force, preview world; capture the 990 baseline, budget, and deck-camera render | Every cross-workstream interface frozen and every large-rack assumption tested, before parallel work starts |
| M2  | Parallel rebuild                         | WS-A physics, WS-B controls, WS-C art run concurrently against frozen M1 interfaces                                   | Each layer correct in isolation with its own durable tests                                                  |
| M3  | Integration, tuning, evidence            | Wire the layers, run the tuning loops, capture the evidence package                                                   | A playable lane that passes all four front doors and the S1-S10 visual gate                                 |
| M4  | Documentation and close-out              | Young-adult design doc, geometry and rules docs, README, changelog                                                    | The repo describes what it now actually does                                                                |

### Milestone: M1 interface contract and baseline evidence

- Depends on: none.
- Deliverables: WP-M1a through WP-M1e. No stubs -- M2 dispatch depends on all of it.
- Workstreams: single owner (contract owner). Deliberately not parallel.
- Entry criteria: this plan approved.
- Exit criteria: `./check_codebase.sh` passes; M1 durable tests pass; the 990 baseline,
  cost budget, frame-rate threshold, and deck-camera render are recorded in this plan; the
  interface surface is reviewed and frozen.
- Parallel-plan ready: no. M1 is one blocking contract by design.

#### WP-M1a lane geometry module

Constants, in feet, each traceable to a published regulation number:

| Name               | Value  | Source                                     |
| ------------------ | ------ | ------------------------------------------ |
| `pin_spacing`      | 1.0    | 12 in center-to-center                     |
| `row_spacing`      | 0.8660 | equilateral triangle, `sqrt(3)/2`          |
| `pin_radius`       | 0.1986 | 4.766 in belly diameter                    |
| `ball_radius`      | 0.3542 | 8.5 in diameter                            |
| `foul_to_head_pin` | 60.0   | regulation, fixed for every rack           |
| `lane_edge_margin` | 0.2292 | (41.5 in - 36 in) / 2, each side           |
| `gutter_width`     | 0.7708 | 9.25 in, fixed for every rack              |
| `deck_tail`        | 1.25   | 15 in behind the back row                  |
| `pit_depth`        | 3.0    | chosen; the ball must fully clear the deck |
| `board_count`      | 39     | regulation, fixed for every rack           |

Derived functions, all pure:

```ts
rack_row_count(pin_count); // 10->4, 21->6, 45->9, 105->14, 496->31, 990->44
lane_width(pin_count); // (rack_row_count - 1) * pin_spacing + 2 * lane_edge_margin
board_width(pin_count); // lane_width / board_count
deck_depth(pin_count); // (rack_row_count - 1) * row_spacing + deck_tail
pit_back_y(pin_count); // foul_to_head_pin + deck_depth + pit_depth
```

Durable anchor test: `rack_row_count(10) === 4`, and `lane_width(10)` equals 41.5 inches
within floating tolerance. This is a regulation fact, not a tuned value, so it is safe as a
permanent assertion.

Scaling policy, settled here rather than deferred:

- **Width scales** with the back-row pin count. The user's explicit requirement.
- **Travel is fixed** at 60 ft for every rack. Scaling travel with width would put the
  990-pin head pin over 200 ft away even under a sub-linear rule, which is unplayable. The
  consequence -- a roughly 43 ft wide lane over a 60 ft run at 990 pins -- is inherent to
  the Super Bowling premise and is accepted openly, not hidden.
- **Gutters are fixed** at regulation 9.25 in for every rack. A gutter swallows one ball,
  so its width follows ball diameter, not lane width. A proportional gutter at 990 pins
  would be nearly 10 ft wide and read as a second lane.
- **Board count is fixed** at 39; board width scales instead. Bowlers describe position in
  boards, and stable vocabulary across modes beats constant physical board width.

#### WP-M1b protocol contract

Extend `src/simulation/protocol.ts`:

- Launch message carries `power`, `start_position`, `angle`, and `spin`.
- New `sweep_deadwood` message.
- New `preview_path` request and response carrying a sampled polyline.
- Snapshot gains a removed flag and an in-pit flag; the pin stride grows accordingly.
- The `steer` message is removed.

Durable test: a snapshot buffer round-trips at the new stride for every rack size without
index drift. This asserts a structural property, not a magic number, so it belongs in the
permanent suite.

#### WP-M1c hook function and shared ball force

`src/simulation/hook.ts` exports a complete, tested
`hook_lateral_acceleration(spin, speed, ...)`. Not a stub. It returns zero at zero spin for
every speed; near zero above the skid threshold; a signed peak matching the spin sign
inside the hook band; and a decaying value below the roll threshold. Those four properties
are frozen; the gain that scales them is tuned in M3.

`src/simulation/ball_force.ts` exports the single per-step ball update -- damping, hook,
spin decay, gutter capture -- called by both the live world and the preview world. There is
one force code path, so there is nothing to keep in sync.

#### WP-M1d preview world

The aim preview does **not** reimplement physics. `src/simulation/preview.ts` builds a
scratch Rapier world containing the lane bodies and no pins, steps it forward with the same
fixed timestep through the same `ball_force` function, and returns a sampled polyline. It
runs inside the existing worker and answers `preview_path` requests.

This replaces the parallel integrator carried in the earlier draft. Damping, spin decay,
gutter capture, and any future physics change apply to the preview automatically, because
the preview _is_ the physics. The remaining difference is only the absence of pins, which
is correct: a preview of the free path before first contact is exactly what an aim guide
should show.

Cost is small -- one pins-free world, a few static bodies, a few hundred steps -- and the
request is debounced on aim change.

#### WP-M1e baseline, budget, and large-rack render evidence

Three measurements taken before any physics change, so M3 comparisons are real and no
budget is invented:

1. **Baseline and profile.** Run `npm run benchmark` on current committed code. Record the
   990-pin median wall-clock per shot, median worker step time, awake-body counts, and
   where time is actually spent. Then **set** the M3 cost budget from that evidence and
   record it here. The budget is chosen absolute-first -- what wall-clock per shot is
   acceptable to play -- with the baseline-relative figure as the secondary check. The
   earlier draft's flat 1.5x multiplier was a guess and is replaced by this rule.
2. **Frame-rate threshold, defined reproducibly.** Headless Chromium at 1600 x 1000, 990
   rack, fixed launch parameters, measuring the 3 seconds following ball contact with the
   head pin, reporting median and 5th-percentile frame interval. Record the current numbers
   and set the M3 threshold from them.
3. **Deck-camera render at 990.** Render the lane silhouette _and_ a full deck-camera frame
   with pins at the new geometry, at 10, 105, and 990 pins. Confirm the fixed-gutter policy
   is visible rather than merely thin, and confirm the existing two-state projection can
   represent a 43-ft-wide deck legibly. Pulling this into M1 means a projection problem
   surfaces before WS-C builds most of the presentation on top of it, rather than at M3.

If the render shows the existing projection cannot represent the new geometry, that is an
M1 finding: the contract owner reports it and the plan gains a camera work package before
M2 dispatch, instead of WS-C discovering it late.

#### M1 evidence record (2026-07-30)

- Baseline command: `npm run benchmark` from committed `da9a280`, copied to the isolated
  `/private/tmp/super-bowling-m1-baseline.H8xLNa` checkout before M1 physics wiring.
  Its report is `/private/tmp/super-bowling-m1-baseline.H8xLNa/artifacts/benchmark/simulation_benchmark.json`.
- 990 baseline: five fixtures; median wall-clock per shot 390.22 ms, median mean fixed-step
  cost 0.325 ms, and median peak awake-body count 206. The slowest wall-clock sample was
  412.68 ms. The head-on and pocket samples account for the high awake-body work; the
  gutter-recovery sample is 255.32 ms with 40 peak awake bodies. This is a real pre-rebuild
  profile, not a projected multiplier.
- M3 cost budget: 750 ms median wall-clock per 990 shot. This is absolute-first: under one
  second remains responsive for a single roll while leaving room for the lane bodies, hook,
  and richer paint. The secondary comparison is no more than 1.92x the 390.22 ms baseline.
- Maintained capture commands: `./capture_screenshots.sh --documentation` refreshes the two
  managed 1600 x 1000 README PNGs, and `./capture_screenshots.sh --milestone` writes ignored
  evidence to `artifacts/milestone/`. The root script builds the shipped artifact, owns bounded
  server readiness and browser lifetime, and cleans up its own processes. The fixture uses fresh
  browser storage contexts, so a preceding 1,000-mode view cannot change the four-player
  handoff's 10-mode start control.
- Deck-camera geometry evidence: `artifacts/milestone/projection_probe_{10,105,990}.png` is
  produced from the production projection and foot-based rack snapshot commands, with visible
  fixed gutters derived from the authoritative 0.7708-ft gutter width. At 990 pins, the
  projection records a 608-pixel top half-width and a 20.97-pixel gutter at the deck. The 10 and
  105 probes record 135.98 and 52.06 pixels respectively. Each rack fits its projection, so no
  camera work package blocks M2; WS-C owns the final painted capture after lane-paint work.
- Frame interval evidence: `artifacts/milestone/frame_window_990.json` records the first visible
  `[data-standing-count]` decrease after a real default Space launch, then three seconds of rAF
  intervals at 1600 x 1000. This M1 run captured 80 samples: median 38.4 ms, p5 36.7 ms, and p95
  39.7 ms. The M3 perceptual guard is median <= 50 ms and p95 <= 60 ms on this recorded harness;
  it is a responsiveness check, not a pixel or floating-point identity gate.

### Milestone: M2 parallel rebuild

- Depends on: M1, interfaces frozen.
- Deliverables: WP-A1 through WP-A5, WP-B1 through WP-B3, WP-C1 through WP-C4.
- Workstreams: WS-A physics, WS-B controls, WS-C art and lane paint.
- Entry criteria: the M1 interface surface is reviewed and frozen; M1 render evidence shows
  no blocking projection problem.
- Exit criteria: every work package meets its acceptance criteria; each workstream's
  durable tests pass in isolation; `./check_codebase.sh` passes on each branch.
- Parallel-plan ready: yes. Three workstreams, disjoint file ownership, every interface
  frozen in M1, values free to move without cross-workstream code edits.

### Milestone: M3 integration, tuning, evidence

- Depends on: M2.
- Deliverables: merged branches; the tuning loops run to their success metrics; the tuning
  report; updated benchmark fixtures and Playwright specs; the evidence package in
  `## Rollout and release checklist`.
- Workstreams: integration owner, with WS-A on call for physics tuning.
- Entry criteria: all M2 work packages accepted.
- Exit criteria: all four front doors pass; every gate in
  `## Acceptance criteria and gates` is met, including the S1-through-S10 visual gate.
- Parallel-plan ready: no. Integration and tuning are one owner's serial work.

#### M3 evidence record (2026-07-30)

- The temporary, ignored `artifacts/m3/tuning_report.json` records the tuning observations.
  Full spin reaches the ten-pin head-pin plane 2.10 ft from the zero-spin path. One keyboard
  increment of start position, angle, and spin moves the entry point about one board at both
  10 and 990 pins. At the one-foot pre-contact approach plane, the shared-preview path and the
  real `create_simulation_world` path differ by 0.18 board; collision outcomes are deliberately
  excluded from that calibration. All 30 benchmark samples settled with zero false timeouts.
- The shot harness records A=6, B=6, C=0, D=0, E=8, and mirrored F=8/8 pins down. The centered
  shot is deliberately not a strike. The pocket observation reaches eight rather than the
  aspirational nine-to-ten target; eight is accepted as the measured good-enough result after
  bounded tuning instead of adding a fragile pass for one more pin or silently widening the target.
- `artifacts/milestone/capture_report.json` records exact 1600 x 1000 live captures for 10, 105,
  and 990 pins, minimum-power pit arrival, deadwood before and after the production-boundary
  sweep, zero and full spin, and the four-control panel. The 990 rAF window measured 22.7 ms
  median and 28.8 ms p95, inside the 50/60 ms perceptual guard.
- The final 990 benchmark median was 431.27 ms per shot, 1.11x the 390.22 ms M1 baseline and
  inside both the 750 ms absolute budget and 1.92x relative guard.

### Milestone: M4 documentation and close-out

- Depends on: M3.
- Deliverables: WP-D1 through WP-D3.
- Workstreams: WS-D documentation.
- Entry criteria: M3 evidence captured, so the docs describe measured behavior.
- Exit criteria: markdown-link and ASCII hygiene tests pass; the changelog entry is
  complete; the active plan's delivery status reflects the rebuild.
- Parallel-plan ready: yes. WP-D1 through WP-D3 touch different files.

#### M4 close-out record (2026-07-30)

- Added the young-adult design guide and cross-link, refreshed the player-facing README, and
  updated the geometry and bowling-rules documentation to describe the delivered foot-based lane,
  real worker preview, four pre-roll controls, sweep, and save migration.
- Independent visual review initially accepted S1 through S10 using the maintained 1600 x 1000
  captures. Player review later overruled S10 because the pin curve was still wrong. The pin
  profile was rebuilt from supplied public-domain OpenClipart artwork and the maintained captures
  were refreshed; S1 through S9 remain accepted and S10 awaits player confirmation.
- The permanent front doors passed where they are deterministic: `./check_codebase.sh`,
  `./build_github_pages.sh`, and `npm run benchmark`. Every current Playwright spec passed in
  focused or component reruns. Two full-suite attempts reached 23/24 before host suspension or
  browser-session closure; this record does not represent either interrupted run as a fully green
  suite.
- Bumped the release metadata to CalVer `26.07.1` in `VERSION`, `package.json`, and the root
  package metadata in `package-lock.json`.

## Post-closeout playability recovery (2026-08-01)

This section records a follow-on correction to the delivered rebuild. It does
not rewrite the historical M1-M4 evidence: references below to a deck camera,
an eight-pin centered result, and the former two-state camera describe the
state of that close-out, not the current recovery target.

### Recovery scope

- Retain the 2D Rapier worker and 2D Canvas renderer. The presentation is
  faux-3D projection, not a move to a 3D engine.
- Replace a physically fallen pin's standing circular collider with a
  mass-preserving 1.25 ft outward capsule. Rapier pin-to-pin contacts remain
  the only authority for a cascade; first-contact provenance reports whether a
  fallen pin was contacted by the ball or another pin. Snapshots carry the
  capsule's actual center and long-axis pose so Canvas artwork agrees with its
  physical collision shape.
- Apply angular damping of `3` only when a pin becomes a fallen capsule. This
  preserves native contact-driven motion and upright-pin response while
  suppressing implausible repeated windmill rotations. The permanent test
  requires finite, visible rotation below one accumulated turn for a
  representative roll; it deliberately does not require an exact trajectory.
- Treat nearby-body activation as one-shot sleeping-set bookkeeping. It may
  wake plausible contact partners but must never add an impulse, synthesize a
  fall, or enlarge a scoring radius.
- Use one centered full-lane camera. Ball travel is derived from physical world
  `y`: it moves monotonically upward on screen through at least 30 percent of
  canvas height, with fixed horizon and lateral framing plus mild forward zoom.
  Results hold this view, with no deck cut.
- Reset the identical aiming composition before a second roll. The game keeps
  controls disabled until `prepare_next_roll` receives the worker's sweep
  acknowledgement. Preview request IDs fence stale paths.
- Reduced motion disables zoom and retains the same fixed full-lane view.

### Recovery gates

- A fixed legal centered-shot probe can produce a ten-pin strike through native
  pin-to-pin contacts. This is a possibility check, not an exact-power,
  exact-pinfall, pixel, or byte-equivalence assertion.
- `npm run strike-matrix -- ...` is the permanent deterministic diagnostic for
  one complete legal launch across all six actual racks. It uses the production
  fixed timestep with no stochastic source or seeded variability, and reports
  settlement plus pin conservation for every sample. `--require-all-strikes`
  makes all-rack success an explicit strict request; the ordinary diagnostic
  remains informative when a setting does not strike every rack.
- Current bounded negative evidence: the centered `power` sweep at 8, 12, 16,
  20, and 24 found no all-rack strike. Only the 10-pin rack struck; the best
  990-pin result was 359 of 990 fallen at power 24. This is a propagation-design
  finding for future work, not a fake success, nor an automatic release gate.
- The permanent physics suite proves collider replacement, retained mass,
  pin-to-pin provenance, sweep behavior, and conservation. It does not turn a
  tuning table into a release gate.
- The existing 990-shot performance budget remains the acceptance limit:
  median wall-clock at or below 750 ms and no more than 1.92x the M1 baseline.
- Browser coverage proves the ball's monotonic visible travel, result hold,
  second-roll readiness, and stale-preview rejection. The maintained capture
  script records these production-path states for visual review rather than
  comparing screenshots byte-for-byte.
- Final visual review checks the centered composition, readable ball travel,
  capsule-driven pin cascade, and second-roll reset at 10, 105, and 990 pins.
  It remains a reviewer judgment, not a pixel diff.

## Workstream breakdown

### Workstream: WS-A physics

- Goal: a lane-shaped world in feet where the ball always reaches the pit and nothing
  escapes the playing surface.
- Owner: simulation implementer.
- Work packages: WP-A1 through WP-A5.
- Needs: the frozen M1 interfaces.
- Provides: a world that honors the M1 protocol.
- Review boundary: `src/config/physics.ts` and `src/simulation/{rack,world,pin_state}.ts`.

### Workstream: WS-B controls

- Goal: four pre-roll controls that read as bowling technique, with keyboard and pointer
  parity, and match transitions that sweep at exactly the right moments.
- Owner: interaction implementer.
- Work packages: WP-B1 through WP-B3.
- Needs: the frozen M1 interfaces.
- Provides: the aim state shape WS-C previews.
- Review boundary: `src/app/**`, `src/game/**`, `src/save/**`.

### Workstream: WS-C art and lane paint

- Goal: a lane and pieces that look like bowling at every rack size.
- Owner: presentation implementer.
- Work packages: WP-C1 through WP-C4.
- Needs: the frozen M1 interfaces and the M1 deck-camera render evidence.
- Provides: draw-command shapes the deterministic renderer tests assert on.
- Review boundary: `src/render/**`, `src/assets/**`, `src/config/camera.ts`.

### Workstream: WS-D documentation

- Goal: docs that describe the rebuilt game and give this repo an audience-correct design
  guide.
- Owner: documentation implementer.
- Work packages: WP-D1 through WP-D3.
- Needs: M3 evidence.
- Review boundary: `docs/**` and `README.md`.

## Work packages

### Work package: WP-A1 lane bodies

- Owner: WS-A.
- Touch points: `src/simulation/world.ts`.
- Depends on: M1.
- Acceptance criteria: static colliders exist for both gutters, both kickbacks along the
  pin deck, and the pit backstop, all sized from `lane.ts`. A ball launched outside the
  lane edge is captured by the gutter, travels to the pit, and knocks zero pins. No pin
  ends a roll outside the lane-plus-gutter envelope, for any rack.
- Durable evidence: a test that launches at the lane edge for each of the six racks and
  asserts zero pins knocked and pit arrival. Both are behavioral, not numeric.
- Obvious follow-ons: delete the `ball.translation().y > rack.bounds.max_y + 3` sleep hack
  that the pit body replaces.

### Work package: WP-A2 pit capture and ball recycling

- Owner: WS-A.
- Touch points: `src/simulation/{world,protocol}.ts`.
- Depends on: WP-A1.
- Acceptance criteria: the pit is a sensor spanning the full lane-plus-gutter width,
  beginning strictly behind the deck's back edge plus a margin, so both gutters terminate
  into it. On entry the ball is removed from dynamic simulation and flagged `in_pit`; pins
  entering the pit are likewise removed. A roll settles when the ball is in the pit and
  every active pin is quiet, rather than waiting on a slowly-creeping ball. A settled roll
  where the ball is **not** in the pit raises a fatal condition rather than being silently
  accepted, so the reach guarantee fails loudly if violated.
- Ownership of the recycle sequence, stated once so no component guesses: WS-A owns pit
  capture and removal; WS-B owns re-spawning the ball at the foul line on entering the
  aiming phase; WS-C owns showing the ball at the foul line and any ball-return cue. The
  player sees the ball roll off the deck into the pit, the deck resolve, and a fresh ball
  waiting at the foul line.
- Durable evidence: four cases, covering entry paths rather than only an ordinary center
  shot -- valid deck exit, gutter exit, high-energy pin entry, and a negative case
  asserting the ball cannot register `in_pit` before crossing the head-pin plane. Plus a
  test that a settled roll always has the ball in the pit, and that the not-in-pit case
  raises.
- Obvious follow-ons: WS-C stops drawing removed pins and the in-pit ball on the lane.

### Work package: WP-A3 units and reach

- Owner: WS-A.
- Touch points: `src/config/physics.ts`, `src/simulation/rack.ts`.
- Depends on: M1.
- Acceptance criteria: `rack.ts` uses `pin_spacing` and equilateral `row_spacing` from
  `lane.ts`, and the head pin sits at `y = foul_to_head_pin`. Ball damping is set so a
  **simulated** minimum-power roll reaches the pit for every rack. The damping algebra is
  retained as supporting evidence only; the gate is the simulated roll, because collisions,
  sleeping, and hook forces all change real travel.
- Durable evidence: a test that runs an actual minimum-power roll to settlement for each of
  the six racks and asserts pit arrival -- at zero spin, at full spin both directions, and
  down the center and both lane edges, so the guarantee covers the worst case. The
  assertion is "reached the pit", a behavioral outcome that survives retuning.
- Obvious follow-ons: scale `settle_max_seconds` with `deck_depth` so a 990-pin cascade is
  not falsely reported as timed out.

### Work package: WP-A4 deadwood sweep

- Owner: WS-A.
- Touch points: `src/simulation/{world,pin_state}.ts`.
- Depends on: WP-A1, WP-M1b.
- Acceptance criteria: `sweep_deadwood` removes every fallen pin body from the world and
  marks it removed in the snapshot. Standing pin count is unchanged, and **each standing
  pin remains within a small documented positional and angular tolerance across the sweep,
  demonstrating that deadwood removal does not materially disturb standing pins.** The
  tolerance is set from what a player could perceive -- on the order of a tenth of a pin
  radius and a few degrees -- not from floating-point identity, because Rapier body removal
  can perturb solver islands harmlessly. Fallen colliders remain active **during** a roll,
  so deadwood still deflects the ball and other pins within that roll; only the
  between-roll sweep removes them.
- Durable evidence: a test that rolls, sweeps, and asserts fallen body count is zero,
  standing count is unchanged, and every standing pin is inside the documented tolerance.
- Obvious follow-ons: none.

### Work package: WP-A5 hook application and tuning harness

- Owner: WS-A.
- Touch points: `src/simulation/world.ts`, `devel/run_simulation_benchmark.mjs`.
- Depends on: WP-M1c.
- Acceptance criteria: the world applies the shared `ball_force` step, so hook, damping,
  spin decay, and gutter capture all run through one code path. The shot harness in
  `## Test and verification strategy` runs as a **reportable tuning instrument**, producing
  numbers for the M3 report rather than permanent pass/fail gates.
- Evidence: the M3 tuning report.
- Obvious follow-ons: if the ten-pin and 990-pin hook measurements diverge, scale hook gain
  with lane width rather than leaving one constant to serve both.

### Work package: WP-B1 four controls

- Owner: WS-B.
- Touch points: `src/app/input_controller.ts`, `src/game/{match,contracts}.ts`.
- Depends on: M1.
- Acceptance criteria: aim state carries power, start position, angle, and spin. Ranges
  derive from `lane.ts`: start position spans the lane minus ball radius, reported in
  boards; angle is shown in degrees but bounded by a lateral displacement of at most 0.35
  of the lane half width at the head-pin plane; spin runs -1 to +1. Arcade steering of a
  rolling ball is removed. All four values reach the worker in the launch message.
- Durable evidence: pure reducer tests for clamping at both ends of each range, and a test
  that a launch effect carries all four values. No physics involved, so these are fast,
  deterministic, and stable.
- Obvious follow-ons: remove the now-dead `steer` action and effect.

### Work package: WP-B2 sweep transitions

- Owner: WS-B.
- Touch points: `src/game/match.ts`.
- Depends on: WP-B1, WP-M1b.
- Acceptance criteria: the reducer emits `sweep_deadwood` exactly when the next roll
  continues on the same rack, and `reset_rack` otherwise:

| Situation                           | Effect                                                   |
| ----------------------------------- | -------------------------------------------------------- |
| Roll 1, pins still standing         | `sweep_deadwood`, then aiming                            |
| Strike (frame complete)             | `reset_rack`                                             |
| Roll 2 completes the frame          | `reset_rack`                                             |
| Gutter ball, zero pins down         | `sweep_deadwood` (a no-op sweep), then aiming            |
| 10th frame, strike on roll 1        | `reset_rack` (existing `tenth_roll_requires_fresh_rack`) |
| 10th frame, spare after roll 2      | `reset_rack`                                             |
| 10th frame, strike on rolls 1 and 2 | `reset_rack`                                             |
| 10th frame, open after roll 2       | match or handoff advance, no sweep                       |
| Handoff to next player              | `reset_rack`                                             |
| Settle timeout                      | fatal, unchanged                                         |

The rule reduces to one insertion point: sweep exactly when `transition_after_roll`
returns the aiming phase without a `reset_rack` effect.

- Durable evidence: a pure reducer test per row, asserting the emitted effect. No worker,
  no physics, no timing.
- Obvious follow-ons: none.

### Work package: WP-B3 control deck UI and save migration

- Owner: WS-B.
- Touch points: `src/app/game.tsx`, `src/style.css`, `src/save/*`.
- Depends on: WP-B1.
- Acceptance criteria: each control has a labeled on-screen readout and a pointer-operable
  input, with keyboard parity. Recommended keys: Up and Down for power, Left and Right for
  start position, A and D for angle, Q and E for spin, Space to bowl. Every control has an
  accessible name and a live readout. The panel fits 16:10 at 1600 x 1000 without
  scrolling. The save schema version is bumped: names, ball designs, mute, and reduced
  motion migrate forward; best scores are cleared; a previous-version file loads without
  throwing.
- Durable evidence: a browser spec driving each control by keyboard and by pointer and
  asserting the readout changes; a save-migration test loading a literal previous-version
  payload written inline in the test.
- Obvious follow-ons: update the on-canvas help text, which currently says "Left and right
  steer a rolling ball".

### Work package: WP-C1 pin art

- Owner: WS-C.
- Touch points: `src/assets/pin_upright.svg`, `src/assets/pin_fallen.svg`,
  `src/render/game_renderer.ts`.
- Depends on: M1.
- Acceptance criteria: the upright SVG has a correct pin profile -- crown, neck, flared
  shoulder, waist inflection, narrow base -- with the two red stripes on the neck rather
  than the shoulder, at a height-to-belly-width ratio near 3.15. The renderer's drawn
  aspect matches that ratio instead of 2.15. The fallen SVG is the same pin lying down.
  Both files are ASCII-only.
- Evidence: 1600 x 1000 screenshots at 10, 105, and 990 pins, reviewed against S10. This is
  reviewer evidence, not a pixel assertion.
- Obvious follow-ons: recheck the sprite width clamp against the new aspect so distant pins
  stay legible.

#### WP-C1 correction record (2026-08-01)

- Player review reopened S10 because the first close-out silhouette still used the wrong curve,
  and the first attempted redraw introduced a pointed crown.
- Rebuilt one symmetric profile from the supplied public-domain OpenClipart strike artwork, then
  reused that exact profile for upright and fallen assets. Refreshed `deck_aiming_10.png`,
  `deck_aiming_105.png`, `deck_aiming_990.png`, and the deadwood milestone evidence. S10 remains
  open until player review confirms the corrected curve.

### Work package: WP-C2 ball art and rolling

- Owner: WS-C.
- Touch points: `src/assets/ball_surface.svg` (new), `src/assets/ball_sphere.svg`
  (removed), `src/render/{ball,game_assets}.ts`.
- Depends on: M1.
- Acceptance criteria: the ball is drawn by scrolling a seamless surface strip under the
  circular clip. Forward travel scrolls it along the roll axis and spin scrolls it
  laterally, so a hooking ball visibly spins sideways as it curves. The specular highlight
  is drawn in screen space and does not scroll, because a reflection does not travel with
  the surface. The smile arc is gone and three finger holes are present. The ball
  designer's base color, accent color, pattern, and monogram continue to render on both the
  setup preview and the lane.
- Durable evidence: a test asserting the surface offset advances with travel while the
  highlight offset does not -- a relationship, not a coordinate.
- Obvious follow-ons: refresh the designer preview fixture in
  `src/designer/designer_fixture.tsx`.

### Work package: WP-C3 lane paint and arrows

- Owner: WS-C.
- Touch points: `src/render/game_renderer.ts`, `src/config/camera.ts`.
- Depends on: M1.
- Acceptance criteria: the lane silhouette half-width derives from `lane_width` and the
  fixed `gutter_width`, so the ten-pin lane is proportionally identical to the 990-pin lane
  and `lane_min_half_width` no longer floors it. Gutters paint as distinct recessed
  channels. Seven targeting arrows replace the ten diamonds, arranged as a chevron with the
  center arrow deepest, placed on boards 5 through 35 in fives and drawn as triangles
  pointing down-lane. A foul line, lane guide dots just past it, and a pin-deck boundary
  line are painted. Removed pins and the in-pit ball are not drawn.
- Durable evidence: a deterministic renderer test asserting seven arrow commands exist, and
  asserting every pin of every rack projects strictly inside the lane silhouette at its
  depth. The containment assertion is a property that survives any art change and retires
  the load-bearing `+/-1.1` overflow clamp.
- Obvious follow-ons: re-derive the camera padding constants, still in the old unit scale.

### Work package: WP-C4 aim guide

- Owner: WS-C.
- Touch points: `src/render/game_renderer.ts`.
- Depends on: WP-M1d, WP-B1.
- Acceptance criteria: the guide is drawn from the worker's `preview_path` response, so it
  previews the real curved path for the player's current power, position, angle, and spin.
  It starts ahead of the ball, so no part of it is ever drawn on the ball at any power.
- Durable evidence: two behavioral tests -- no guide geometry overlaps the ball at any
  power, and the guide curves in the direction of the applied spin. Both survive retuning.
- M3 evidence, not a permanent gate: the numeric comparison of the guide endpoint against
  where the ball actually crosses that depth. Its tolerance is derived from **visible
  accuracy** -- one board width at the head-pin plane, since a player cannot perceive finer
  than a board -- rather than from whatever the first implementation happened to produce.
  If the first measurement exceeds one board, the guide is wrong and is fixed; the
  tolerance is not widened to fit it.
- Obvious follow-ons: replace the `get_aim_guide_end_y` power-only formula and its
  `data-aim-guide-end-y` consumers in the browser specs.

### Work package: WP-D1 young-adult design doc

- Owner: WS-D.
- Touch points: `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md` (new),
  `docs/FUN_VIBES_DESIGN_STYLE.md` (cross-link only), `AGENTS.md`.
- Depends on: M3.
- Acceptance criteria: the new doc states its audience as young-adult players, keeps the
  portable Layer 1 interaction and engineering rules, and replaces the kid-arcade Layer 2
  with young-adult guidance: mastery and technique over coin rewards, restraint in color
  and motion, respect for player time, difficulty that reads as skill expression, and
  confidence that the interface is self-explanatory without mascot hand-holding. It names
  Super Bowling's four controls, and the deliberate choice that a safe centered shot does
  not reliably strike, as a worked example of technique-as-content. Both docs cross-link,
  each stating when to use the other. `AGENTS.md` points at the new doc.
- Evidence: markdown-link and ASCII compliance tests pass.

### Work package: WP-D2 geometry and rules docs

- Owner: WS-D.
- Touch points: `docs/GEOMETRY_MODEL.md`, `docs/GAME_RULES.md`, `README.md`.
- Depends on: M3.
- Acceptance criteria: `GEOMETRY_MODEL.md` describes the foot-based coordinate space, the
  lane-width formula, the fixed-gutter and fixed-travel policy with its rationale, the
  gutter, deck, and pit bodies, and the arrow placement rule, and no longer describes the
  ten-diamond two-row layout. `GAME_RULES.md` documents the four controls, the hook model,
  the sweep table, and the one-time best-score reset. The README's first paragraph stays
  pure prose under 250 characters, the live Pages link stays directly below it, and the
  screenshots are the M3 captures.
- Evidence: markdown-link and ASCII tests pass; README first paragraph confirmed under 250
  characters.

### Work package: WP-D3 changelog and plan close-out

- Owner: WS-D.
- Touch points: `docs/CHANGELOG.md`, `docs/active_plans/active/super_bowling_v1.md`.
- Depends on: WP-D1, WP-D2.
- Acceptance criteria: a dated changelog entry uses the canonical subsection order and
  records additions, behavior changes (removed rolling-ball steering, cleared best scores,
  new power range), fixes, and decisions -- including why unit conversion was chosen over
  local patching, why gutters and travel are fixed while width scales, why the preview runs
  the real engine instead of a parallel model, and the measured values that settled hook
  strength, pin damping, settle scaling, the 990 budget, and the frame-rate threshold. The
  active plan gains an M9 row, and its superseded "Falling pins" and "Lane geometry"
  settled-decision rows are corrected.
- Evidence: `wc -l docs/CHANGELOG.md` checked against the 1000-line rotation threshold;
  rotate with `devel/rotate_changelog.py` if exceeded.

## Acceptance criteria and gates

- Per-patch gate: `./check_codebase.sh` passes, and the patch's durable tests pass.
- Integration gate: all four front doors pass -- `./check_codebase.sh`,
  `./build_github_pages.sh`, `./run_playwright_tests.sh --build`, and `npm run benchmark`
  as the explicit thirty-shot release gate, now reporting 990 cost against the M1-recorded
  budget.
- Visual gate: a reviewer inspects the M3 screenshots and confirms, **by ID**, that S1
  through S10 are each resolved, naming the specific screenshot that shows each one. This
  stays a reviewer checklist. It does not become a pixel diff or a draw-coordinate
  assertion, because the failure it guards against is "the picture looks wrong", which is a
  judgment a person makes and a hash cannot.

Durable behavioral invariants, asserted permanently, for all six racks:

- A simulated minimum-power roll reaches the pit, at zero spin, at full spin both
  directions, and from the center and both lane edges.
- A settled roll always has the ball in the pit; the not-in-pit case is fatal, not silent.
- The ball cannot register in the pit before crossing the head-pin plane.
- No pin ends a roll outside the lane-plus-gutter envelope.
- A sweep removes all deadwood, preserves standing pin count, and leaves standing pins
  within the documented positional and angular tolerance.
- Every pin projects inside the lane silhouette.
- Zero spin produces a straight path; nonzero spin curves in the sign's direction.
- No aim-guide geometry overlaps the ball at any power.
- Snapshot buffers round-trip at the declared stride for every rack.

## Test and verification strategy

New unit tests are Node tests under `tests/test_*.mjs`, run by
`node --import tsx --test`, per `docs/TYPESCRIPT_STYLE.md`. Browser evidence is Playwright
under `tests/playwright/e2e/`. Existing specs asserting the old scale, the old ten-diamond
lane, the old power range, or the removed steering control are updated by whichever work
package changes the behavior beneath them.

### Permanent tests versus temporary evidence

Before adding a test permanently, evaluate it against the permanent-test checklist in
`docs/PYTEST_STYLE.md`. Tuning probes, calibration comparisons, baseline captures, and
one-time migration evidence may remain temporary M3 fixtures or recorded evidence rather
than permanent regression tests. The checklist question that decides most cases: will this
still pass next week without code changes?

| Check                                                    | Home      | Why                                                                       |
| -------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| Deadwood removed between same-rack rolls                 | Permanent | Behavioral, engine-independent                                            |
| Standing pins stay within tolerance across a sweep       | Permanent | User-facing invariant, tolerance-based                                    |
| Minimum-power roll reaches the pit, every rack           | Permanent | The S1 guarantee; outcome, not number                                     |
| Protocol buffers round-trip without stride error         | Permanent | Structural property                                                       |
| Zero spin straight, spin curves in sign direction        | Permanent | Behavioral property of the model                                          |
| Every rack projects inside lane geometry                 | Permanent | Retires the overflow clamp                                                |
| Sweep-transition table, control clamping, save migration | Permanent | Pure reducer and pure data; fast and stable                               |
| Ball cannot enter pit before the head-pin plane          | Permanent | Negative geometry guard                                                   |
| Hook displacement of 2 to 3 feet                         | Temporary | A tuning target; the durable form is "spin curves in the right direction" |
| Six-shot pin-scatter table                               | Temporary | A tuning instrument; exact counts are fragile as gates                    |
| Preview-versus-live calibration measurements             | Temporary | Confirms the preview world at M1; not a standing regression               |
| 990 baseline-relative performance experiments            | Temporary | Environment-dependent; recorded as evidence                               |
| Screenshot comparisons for S1 through S10                | Temporary | Reviewer acceptance evidence for this rebuild                             |

Durable tests assert properties. `min_power_roll_reaches_pit(n) === true` is a property;
`damping === 0.05` is a brittle constant assertion and must not be written.

### Shot harness (tuning instrument, not a gate)

Pin damping was the one quantity left to subjective judgment in an earlier draft. It is
replaced by this repeatable harness, run on a ten-pin lane, reporting numbers into the M3
tuning report. Ranges are targets for the tuning loop, not permanent assertions.

| Shot | Launch                                                   | Target outcome                             |
| ---- | -------------------------------------------------------- | ------------------------------------------ |
| A    | center, full power, zero spin                            | 6 to 9 down, and **not** a reliable strike |
| B    | center, minimum power, zero spin                         | 4 to 8 down, ball reaches pit              |
| C    | lane edge, full power, zero spin                         | 0 to 3 down                                |
| D    | in the gutter, any power                                 | 0 down, ball reaches pit                   |
| E    | pocket line, full power, full spin                       | 9 or 10 down                               |
| F    | full spin left versus full spin right, mirrored launches | broadly mirrored outcomes                  |

Shot A deliberately does **not** strike. A dead-on head-on hit deflects and leaves pins in
real bowling, and making the safe centered default optimal would contradict the plan's
stated intent that technique is the content. Shot E, the pocket line with spin, is the one
that strikes. That inversion is the game-design point, and it is also why these are targets
rather than gates: the durable assertions are the broad invariants above.

### Control scale check across modes

Start position and angle scale with lane width while travel stays fixed, so a control that
feels precise at 10 pins could feel useless at 990. Measured at both extremes, expressed in
**boards** so the target is scale-invariant: one increment of angle, of start position, and
of spin should each move the head-pin-plane entry point by a perceptible but controllable
amount -- on the order of half a board to two boards -- at both 10 and 990 pins. Recorded
in the M3 tuning report; if the extremes diverge, the increment is scaled with lane width.

### Measured quantities

| Quantity       | Observed failure                                                     | Single change                                   | Success metric                                                                 | Revert criterion                                                                                         |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Hook strength  | No spin control exists                                               | Tune hook gain and phase thresholds             | Full spin displaces head-pin-plane entry 2 to 3 ft vs zero spin                | Zero-spin path deviates from straight, or a ball can be steered out of the gutter                        |
| Pin damping    | `1.9` was tuned for the old unit scale                               | Retune against foot units                       | The shot harness lands inside its target ranges, including shot A not striking | Shot E stops striking, or shot C starts striking                                                         |
| Settle timeout | Flat `12 s`; a 37-ft-deep 990 cascade will exceed it                 | Scale `settle_max_seconds` with `deck_depth`    | Zero false timeouts across the thirty-shot benchmark for all six racks         | Any rack routinely consumes the full scaled budget, meaning the timeout is masking a physics problem     |
| 990 cost       | Larger geometry, static bodies, hook math, richer paint all add cost | Measure against the WP-M1e baseline and profile | Inside the budget recorded in M1, chosen absolute-first from acceptable play   | Budget exceeded; activation radius and snapshot rate are the first levers before reducing visual quality |
| 990 frame rate | Undefined in earlier drafts                                          | Measure by the WP-M1e reproducible rule         | Inside the threshold recorded in M1                                            | Threshold exceeded on the recorded machine and window                                                    |

If a tuning loop cannot reach its success metric in three passes, the owner reports the
measured achievable range instead of widening the metric silently, and the integration
owner decides whether to revise the target or change the model.

### Repository rule coverage

| Artifact                                  | Governing rule                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| New `.ts` modules and filenames           | `docs/TYPESCRIPT_STYLE.md`: snake_case files, named exports, explicit return types, no `any`, two-space indent under Prettier |
| Node unit tests                           | `docs/TYPESCRIPT_STYLE.md` and `docs/E2E_TESTS.md`: `tests/test_*.mjs`, run by `node --import tsx --test`                     |
| Browser fixtures                          | `docs/PLAYWRIGHT_TEST_STYLE.md` and `docs/PLAYWRIGHT_USAGE.md`, under `tests/playwright/e2e/`                                 |
| Permanent-versus-temporary test decisions | `docs/PYTEST_STYLE.md` checklist, applied to every candidate test                                                             |
| SVG assets                                | ASCII-only, enforced by `tests/test_ascii_compliance.py`                                                                      |
| Benchmark changes                         | `npm run benchmark` stays the authoritative thirty-shot release gate that exits nonzero on any unsettled sample               |
| Docs                                      | `docs/MARKDOWN_STYLE.md` and `docs/REPO_STYLE.md`                                                                             |
| Version                                   | `docs/REPO_STYLE.md` CalVer, `VERSION` and `package.json` in sync                                                             |

## Migration and compatibility policy

The save schema version is bumped. Names, ball designs, mute, and reduced motion migrate
forward. Best scores are cleared, because scores earned under the old power range and old
lane length are not comparable to scores earned after the rebuild; carrying them forward
would silently corrupt the one persistent record the player cares about. A
previous-version file must load without throwing. This is a one-time reset, called out in
both the changelog and the README.

## Risk register

| Risk                                                                                        | Impact                                         | Trigger                                                                   | Owner             | Mitigation                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The existing two-state projection cannot represent a 43-ft-wide 990 deck legibly            | High -- the 1,000 mode is the headline feature | M1 deck-camera render                                                     | Contract owner    | The render moved into M1 precisely so this surfaces before WS-C builds on it. A blocking finding adds a camera work package before M2 dispatch.                                                        |
| 990 cost regresses past acceptable play                                                     | High                                           | Benchmark exceeds the M1-recorded budget                                  | WS-A and WS-C     | Baseline and profile captured before any change, so the regression is attributable. Activation radius and snapshot rate are the first levers; visual quality is reduced only after both are exhausted. |
| Retuned pin damping makes cascades outlast even a scaled settle timeout                     | High -- rolls reported fatal                   | Benchmark reports timeouts                                                | WS-A              | Settle-timeout scaling and pin-damping tuning share one owner, so the two are tuned together.                                                                                                          |
| Controls feel imprecise at one rack extreme                                                 | Medium                                         | Control scale check at 10 and 990                                         | WS-B              | Measured in boards, a scale-invariant unit; increments scale with lane width if the extremes diverge.                                                                                                  |
| Permanent tests calcify tuned numbers and start failing on harmless changes                 | Medium -- teaches the team to ignore red       | Any test asserting a constant, an exact count, or floating-point identity | Integration owner | The permanent-versus-temporary table is the standing rule, checked against `docs/PYTEST_STYLE.md` before a test joins the suite.                                                                       |
| Many browser specs and benchmark fixtures break at once, making M3 look like a mass failure | Medium -- risks a wrong revert                 | First full suite run in M3                                                | Integration owner | Each M2 work package updates the specs its own change breaks, so M3 inherits a mostly-green suite.                                                                                                     |
| Rapier2D circular pin colliders behave poorly at foot scale with new mass ratios            | Medium                                         | Pins jitter, tunnel, or fail to sleep                                     | WS-A              | Fixed 120 Hz stepping is already in place; raise substep count before changing collider shapes.                                                                                                        |
| Scope creep from "make the game better" into new features                                   | Medium                                         | Work packages growing beyond their acceptance criteria                    | Integration owner | `## Non-goals` is the boundary; anything outside becomes a follow-on plan.                                                                                                                             |

## Rollout and release checklist

- [x] M1 complete: lane module, protocol, hook, shared ball force, preview world -- all
      reviewed and frozen at the interface level, no stubs.
- [x] M1 evidence recorded in this plan: 990 baseline and profile, chosen cost budget,
      frame-rate threshold, deck-camera render at 10 / 105 / 990.
- [x] WS-A, WS-B, WS-C work packages accepted against their own criteria.
- [x] Tuning loops have measured, good-enough outcomes in the M3 report; the aspirational
      pocket count remains eight rather than being relabeled as a nine-to-ten result.
- [ ] Shot harness inside its target ranges, including shot A not striking.
- [x] Control scale check acceptable at both 10 and 990.
- [x] All durable behavioral invariants passing for all six racks.
- [x] `./check_codebase.sh` passes.
- [x] `./build_github_pages.sh` passes.
- [ ] `./run_playwright_tests.sh --build` has a single fully green final suite; current specs
      pass in focused/component reruns, while two 23/24 full attempts were interrupted by host
      suspension or browser-session closure.
- [x] `npm run benchmark` passes the thirty-shot gate and reports 990 cost inside budget.
- [x] Evidence captured at 1600 x 1000: 10, 105, and 990 racks; a minimum-power roll
      reaching the pit; a deck before and after a sweep; a full-spin shot beside a
      zero-spin shot; the four-control panel.
- [ ] Visual gate: S1 through S9 retain independent acceptance. Player review reopened S10; its
      source-based replacement and named maintained captures are ready for player confirmation.
- [x] Docs updated and hygiene tests pass.
- [x] Version bumped to CalVer `26.07.1`; `VERSION`, `package.json`, and root lock metadata agree.

## Documentation close-out requirements

- Active plan / progress tracker: add an M9 row to
  `docs/active_plans/active/super_bowling_v1.md` describing the rebuild and its evidence,
  and correct the superseded "Falling pins" and "Lane geometry" rows in its
  settled-decisions table.
- `docs/CHANGELOG.md` entry: one dated entry using the canonical subsection order, per
  WP-D3.
- Archive / closure notes: the v1 plan stays active; this rebuild extends it rather than
  replacing it, so no move to `docs/archive/` yet.

## Patch plan and reporting format

- Patch 1: M1 -- `lane.ts`, `protocol.ts`, `hook.ts`, `ball_force.ts`, `preview.ts`, their
  durable tests, and the recorded baseline, budget, threshold, and render evidence.
- Patch 2: WS-A physics -- WP-A1 through WP-A5 plus durable tests and fixture updates.
- Patch 3: WS-B controls -- WP-B1 through WP-B3 plus reducer, transition, and save tests.
- Patch 4: WS-C art and lane paint -- WP-C1 through WP-C4 plus renderer tests and refreshed
  asset screenshots.
- Patch 5: M3 integration -- merge, tuning loops, tuning report, spec and benchmark
  updates, evidence capture.
- Patch 6: docs, changelog, active-plan status, version bump.

Each patch reports: files changed, acceptance criteria met, the front-door commands run
with their results, any measured value that settled a tuning loop, and -- for every new
test -- whether it is permanent or temporary and why.

## Resolved decisions

| Decision                       | Choice                                                                      | Rationale                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Lane realism                   | Regulation proportions, scaled                                              | Anchors every constant to a checkable published number                                                                                    |
| Lane width                     | Scales with back-row pin count                                              | The user's explicit requirement                                                                                                           |
| Lane travel                    | Fixed 60 ft for every rack                                                  | Scaling travel with width is unplayable even sub-linearly; the resulting wide 990 lane is inherent to the premise and stated openly       |
| Gutter width                   | Fixed regulation 9.25 in for every rack                                     | A gutter swallows one ball, so its size follows ball diameter; a proportional gutter at 990 would be 10 ft wide and read as a second lane |
| Board count                    | Fixed 39, board width scales                                                | Bowlers describe position in boards; stable vocabulary beats constant physical width                                                      |
| Approach area                  | Out of scope                                                                | No release-timing mechanic exists, so approach markings would imply a control the game lacks                                              |
| Spin model                     | Three-phase skid / hook / roll                                              | Rewards technique, suits the young-adult audience, and a pure function is cheap to test                                                   |
| Spin transfer to pins          | Not in this plan                                                            | The hook path is the expressive element; contact spin multiplies the tuning surface                                                       |
| Aim preview                    | Pins-free scratch Rapier world in the worker, sharing one `ball_force` step | Replaces a parallel integrator that would have needed permanent synchronization with the real physics                                     |
| Freeze boundary                | Interfaces frozen through M2; values tunable through M3                     | Preserves parallel safety without making early numeric guesses expensive to correct                                                       |
| Safe centered shot             | Deliberately does not reliably strike                                       | Making the unskilled default optimal would contradict technique-as-content                                                                |
| Sweep verification             | Positional and angular tolerance, not floating-point identity               | Rapier body removal can perturb solver islands harmlessly; the user-facing invariant is "standing pins do not materially move"            |
| Aim-guide tolerance            | One board width at the head-pin plane                                       | Derived from what a player can perceive, rather than institutionalizing the first implementation's error                                  |
| Visual acceptance              | Reviewer checklist against S1-S10                                           | The original failures were visual judgments; a pixel hash cannot make that judgment                                                       |
| Settle condition               | Ball in pit plus quiet pins; not-in-pit settle is fatal                     | Makes the reach guarantee loud if violated instead of silently reproducing S1                                                             |
| Design doc shape               | New `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md`, cross-linked                  | Keeps the kid-arcade doc intact as a sibling genre; no guidance is lost                                                                   |
| Pin and ball art               | New SVG assets, not procedural canvas                                       | Keeps the sprite pipeline and the shipped ball designer; the ball rolls by scrolling a seamless surface strip                             |
| Rolling-ball steering          | Removed                                                                     | Not a bowling control, and it conflicts with the spin model replacing it                                                                  |
| Best scores across the rebuild | Cleared, with a schema version bump                                         | Old scores are not comparable; carrying them forward would corrupt the player's persistent record                                         |

## Open questions and decisions needed

Every design decision is settled above. Two items remain open by intent, and neither blocks
dispatch, because both are answered by M1 evidence before M2 begins:

- 990 cost budget and frame-rate threshold: the numbers are recorded in M1 from the
  baseline and profile, per WP-M1e. The plan states the rule for choosing them rather than
  guessing a multiplier.
- 990 deck-camera legibility: answered by the M1 render. If the existing projection cannot
  represent the new geometry, the contract owner reports it and a camera work package is
  added before M2 dispatch. Rack geometry is not a lever here.
