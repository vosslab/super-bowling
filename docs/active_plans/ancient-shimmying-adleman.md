# Plan: Repair planar pin collisions and add camera-based perspective

## Context

**User direction, source of truth.** Preserve simple planar physics, translate the results into a
convincing bowler-perspective view, make pin-to-pin cascades capable of producing strikes, keep
large racks impressive rather than shrunken, and prefer durable design repairs over symptom-level
patches. The latest direction additionally requires a visibly more elevated, compressed composition
where a small portion of each rear pin/row is visible behind the row ahead. "About 3%" is a visual
starting guess, not a required overlap or gap calculation: the believable choice is selected from
representative 3%, 6%, and 10% rear-row-reveal bakeoff variants on the real 16:10 canvas; customizable
bowls per frame (with a tenth-frame allowance of `bowls_per_frame + 1`); deliberately superhuman
large-rack equipment and through-pin drive; and no visually upside-down settled pin. Where this
plan and that direction disagree, the latest direction wins.

The proposed architecture is already the repository's architecture. `src/simulation/world.ts:214`
builds `new RAPIER.World({ x: 0, y: 0 })`: Rapier2D, zero gravity, overhead plane, with the ball as
a circle, standing pins as circles, fallen pins as capsules, and the lane as static colliders. So
the simulation model needs confirmation, not replacement.

The renderer is a different case, and the wording matters. `src/render/game_renderer.ts:233` draws a
**faux-perspective trapezoid**: a converging lane silhouette with linear depth interpolation and
fixed-pixel body sizes. This plan replaces its fixed-size/linear-depth behavior with a durable
camera-guided depth transform. It may use a perspective divide, a bounded nonlinear faux-3D
exaggeration, or a hybrid of the two; screen position and size must both vary coherently with depth,
while simulation/world scale remains unchanged. Perfect physical projection is not a requirement.

**Defect 1: pins fall only on ball contact.** The ball is 8.5 in across and pins sit 12 in apart, so
one ball can contact only three or four pins on a 10-pin rack. The changelog's deterministic sweep
is consistent with weak propagation: "only 10 pins struck" across five power settings, all centered.
The evidence is not one-sided. That same sweep reports 359 of 990 fallen at maximum power, and a
ball plowing 44 rows can contact on the order of 50 to 90 pins directly, so something moved the
rest. Whether that is genuine cascade or shoving, where the ball pushes a pin that pushes another
while still in contact, is what M1 measures.

**Defect 2: the ball rolls in place and the lane looks short.** Read directly from source. Ball
diameter is `max(22, width * 0.045)` (`game_renderer.ts:397`); pin width is
`clamp(x_per_world_unit * 0.5, 10, 64)` (`game_renderer.ts:334`), which saturates at 64 px for every
rack at every depth. Both are constant with distance, and relative size is the dominant depth cue.
Depth is linear in `y` through `(far_y - y) / (far_y - near_y)`, giving uniform screen speed instead
of fast-near and slow-far.

Geometric context. The repository's dimensions are faithfully regulation: 12 in pin spacing,
4.766 in pin belly diameter, 15 in pin height, 8.5 in ball, 41.5 in lane, 2.75 in edge margins,
9.25 in gutters. Two ratios follow:

- Adjacent standing pins leave a **7.234 in gap**, narrower than the 8.5 in ball, so a ball cannot
  pass between two pins without touching both. Correct bowling behavior, obtained emergently.
- A real pin is 15 in tall against that gap, so a tipping pin's crown sweeps **2.07 times the gap**
  while its base barely moves. A 2D circle must slide the full 7.234 in to reach a neighbour. That
  is the quantitative reason a planar disc model might not cascade, and the reason the fallen
  capsule exists. Its outward offset is half the 15 in length, 7.5 in, landing its far end just past
  the neighbour's centre. Suggestive, and still a hypothesis (H5).

Rack size shifts the balance. Pin spacing and diameter are constants, so the 7.234 in gap holds in
every mode, but the ball falls from 20.5 percent of lane width at 10 pins to 1.6 percent at 990.
Propagation is therefore almost the entire mechanism in large modes, making them the most sensitive
cascade test rather than the least.

## Objectives

- Establish by measurement why a pin does not knock down another pin.
- Restore pin-to-pin cascades so a pocket shot can strike a 10-pin rack through propagation.
- Replace the faux-perspective trapezoid with a camera model where size and apparent speed both
  vary with distance, so the lane reads its full 60 ft.
- Make complete 10-, 105-, and 990-pin racks and pins visible on the actual 16:10 play canvas;
  the observed 105-mode rack clipped above that canvas is a blocking regression.
- Make large racks read as impressive depth rather than as a shrunken flat grid.
- Leave intact the design property that a centered shot does not reliably strike.
- Show more of each deep rack without wasting play-canvas space: adjacent projected rack rows should
  read as dense, layered pins with a small but legible rear-row reveal. The 3%, 6%, and 10% variants
  are candidate compositions, not acceptance thresholds. Diagnostics prevent clipping, separated
  stacks, and a tiny centered lane island; independent screenshot reviewers choose the believable result.
- Make frame length an explicit match setting and retain ordinary ten-pin scoring as the
  `bowls_per_frame = 2` specialization, while making the tenth frame permit one extra bowl.
- Make high-count play intentionally superhuman: a 990 rack uses an approximately 40 lb ball and
  has enough player-selectable power, spin, and mode-scaled through-pin drive to reach the backstop
  without hiding a stall or a physics regression.
- Ensure a pin can never remain visually upside down once its motion has settled.

## Design philosophy

Lead with **use the scientific method**, then **fix the design, not the symptom**. The second cannot
be applied to defect 1 until the fault is known: a `setDensity` call is not by itself proof that the
dynamics are wrong, because body type, collider attachment, derived inertia, contact settings, and
the sleeping set can each dominate. M1 measures before M3 changes anything permanent.

Defect 2 needs no diagnosis; bodies are drawn at fixed pixel sizes. The repair needs coherent size,
convergence, and near-fast motion, but can deliberately exaggerate depth with a bounded nonlinear
faux-3D transform when that keeps the complete rack on the 16:10 play canvas and reclaims empty lane
space. Continuing with fixed-size linear interpolation is rejected because the flatness is
structural; a durable hybrid transform is not rejected merely for being non-physical.

Two repairs are design defects independent of the diagnosis, and are separated here from the
cascade question so the distinction is not blurred:

- **The raw-impulse fall threshold is replaced regardless of M1's outcome.** Its configured meaning
  changes with collider mass, so it cannot be reasoned about or safely retuned. M1 determines
  whether that flaw is *also* the binding cause of the cascade failure; it does not determine
  whether the flaw is worth fixing.
- **Collider mass is declared in the units its config keys claim, regardless of M1's outcome.** The
  *value* of the resulting ratio is what M1 informs.

Every other numeric target is an **initial hypothesis with a derivation rule**, never a requirement.

**Physics investigation status (historical, frozen).** M1 and M2, together with WP-A1 through
WP-A6, are completed investigation and implementation records. They are retained as evidence for
the accepted physics now present in the dirty tree; they are not work queues, delegation targets,
or authority to edit a physics, simulation, diagnostic, or physics-test file. M3 has exactly one
remaining package, WP-A7: reconcile the already-generated report/artifact hashes and rerun the
named regressions. A mismatch or failed regression is evidence for a separately approved diagnosis,
not authorization to change behavior here.

## Scope

- Preserve the completed collision baseline, controlled-experiment, and accepted repair records as
  historical evidence.
- Reconcile the accepted physics report artifact with regenerated deterministic evidence, without
  changing a physics implementation file.
- Replace the faux-perspective trapezoid with a camera-based perspective projection.
- Adapt camera placement per rack mode to preserve the aiming region and lane readability.
- Draw bodies as base plus crown, and conditionally animate pin tipping.
- Update `docs/GEOMETRY_MODEL.md` and `docs/CHANGELOG.md`.

### Camera recovery boundary

The camera recovery is a clean-room slice, not a repository reset. Start by copying the current
`Git HEAD` versions of exactly these four files into the active implementation boundary:
`src/config/camera.ts`, `src/render/camera.ts`, `src/render/contracts.ts`, and
`src/render/game_renderer.ts`. Rebuild the simple, parameterized projection and renderer from that
baseline. Treat the current added `src/render/projection.ts` and the current camera-test changes as
**rejected experiments**: do not retain their equations, constants, or assertions merely because
they already exist. New focused camera/projection tests may be written from the clean baseline.

No destructive Git operation is authorized: do not use `git reset`, `git checkout`, or erase the
dirty tree. Files outside those four camera files and their newly written focused tests stay byte-for-
byte untouched by camera recovery. In particular, preserve the accepted bowls-per-frame, compact
layout, and functional physics work. The renderer may adapt only already accepted pin-draw or
orientation interfaces needed to compile and draw; it must not change their producer, simulation
state, or pin-physics semantics. The recovery first produces and reviews real 105-pin aiming
candidates, then locks the selected transform before propagating it to 10/990 or other lane states.

## Non-goals

- Move physics into three dimensions or add gravity.
- Replace Rapier2D or introduce a second simulation model.
- Replace ordinary bowling with unbounded power or arbitrary physics cheats. Superhuman ability is
  mode-specific, documented, measurable, and still uses the one authoritative simulation path.
- Guarantee that any launch setting strikes every one of the six racks.
- Revisit the settled scaling policy: width scales with the back row, travel stays 60 ft, gutters
  stay 9.25 in, board count stays 39.
- Change pin physical scale between modes, or shrink pins to make a rack fit.
- Model the tip as physics: no staged intermediate colliders, no third dimension in the solver.
- Split `physics_config` into separate physical, solver, and presentation groups. It would make the
  next retune safer, but neither reported defect requires it, and this plan succeeds without it
  because M3 changes one variable per patch under measurement rather than relying on the file's
  organization for safety.

## Current state summary

| Area | State | Status | Evidence |
| --- | --- | --- | --- |
| Simulation model | Planar, zero gravity, suitable as-is | confirmed | `world.ts:214` |
| Renderer | Faux-perspective trapezoid, linear depth | confirmed | `game_renderer.ts:233,240` |
| Collider mass declaration | `setDensity` receives values named `*_mass` | confirmed | `physics.ts:8,16`; `world.ts:120,177` |
| Effective mass ratio | Far from regulation proportions | suspected | arithmetic on assumed areas; H1 |
| Pin fall rule | Raw impulse compared to a constant | confirmed | `pin_state.ts:22` |
| Fall rule blocks pin contacts | Threshold unreachable on the pin-to-pin path | suspected | H2 |
| Pin-to-pin cascade | Evidence mixed | open | changelog 2026-08-01, centered lines only |
| Strike feasibility | Unknown until measured | open | no sweep has tested pocket lines |
| Fallen-pin representation | 1.25 ft capsule present; necessity untested | open | `world.ts:132`; H5 |
| Body sizing | Fixed pixels, depth-independent | confirmed | `game_renderer.ts:334,397` |
| 990 cost reference | 390.22 ms median wall-clock per shot, pre-rebuild | reference | `regulation_lane_rebuild_plan.md` M1 record |
| Frame length | Fixed traditional two-bowl assumption | confirmed pending code inspection | game/scoring/save/setup contracts |
| 990 ball and drive | Regulation-oriented launch, possible stall before backstop | reported; must measure | user report plus 990 diagnostics |
| Settled orientation | Fallen art may preserve an upside-down pose | reported; must inspect | live settled captures |
| 16:10 rack visibility | Earlier 105-mode rack clipped above the play canvas; later attempted fixes became a tiny centered lane/rack island, then a huge 990-mode top void. The supplied 990-mode frame-5/roll-2 capture (456 of 990 standing) confines the active lane/rack/ball to roughly the lower 40%; the supplied top-chrome and bottom-control captures show that both bands are consuming the height the lane needs. These are rejection evidence, not target references. | confirmed visual failures | supplied 16:10 screenshots (2026-08-02) |

## Recovery checkpoint and frozen work

The desktop 16:10 layout and camera path are the only implementation restart. The prior compact
bottom-control-deck layout is explicitly unfrozen because it cannot supply enough lane height. A new
desktop side-control layout is measured and frozen before camera calibration; it is not a tuning
variable during the bakeoff. The independently reviewed `bowls_per_frame` implementation is complete
and frozen. Functional superhuman physics is complete
and frozen as well: the remaining physics work is limited to reconciling the exact report artifact and
hashes, then rerunning its regression verification. It is explicitly not permission to retune force,
mass, spin, or collision behavior. Upright-safe settled-pin presentation remains pending.

## Assumptions

- **The circular standing pin is good enough.** A regulation pin's widest body diameter is 4.766 in
  and `pin_radius = 0.1986` ft is exactly half that. Overhead, a standing pin is a circle at its
  widest point and is near rotationally symmetric about its vertical axis, so the circle is the real
  footprint. Every hypothesis below is shape-independent. Replacing the standing shape is out of
  scope.
- **Confidence is not uniform across the two defects.** Defect 2 is read from source. Defect 1 is
  inferred from mechanism and unverified arithmetic. Read the plan at those two levels.
- **Strike feasibility is unknown.** No sweep has tested pocket lines. This plan does not assert a
  strike is currently impossible.
- **The fallen capsule is a hypothesis, not a requirement.** It is already in the code, so testing
  circles-only means disabling it.
- **Visual tipping is independent of the collision shape.** The renderer tips a pin the same way
  whether physics keeps a circle or swaps to a capsule.

## Hypotheses

- **H1, mass ratio.** `setDensity` means Rapier computes `mass = density x area`, so values named
  `ball_mass: 35` and `pin_mass: 1` against different radii may land far from the intended ratio.
- **H2, threshold units.** `fall_impulse: 2.8` compares against a raw impulse, so its meaning is
  mass-dependent and may be unreachable on the pin-to-pin path.
- **H3, energy loss.** `restitution: 0.08` and `pin_linear_damping: 2.2` may remove the momentum a
  struck pin needs to cross its 7.234 in gap.
- **H4, activation and sleeping.** `update_active_pins` (`world.ts:480`) inspects only records with
  `active === true`, so a pin woken by a route that never sets that flag could be skipped.
- **H5, capsule necessity.** A corrected circular model might already cascade, making the shape
  transition unearned complexity. The swap also rebuilds the collider and its solver island, so it
  may itself drop contacts.

## Architecture boundaries and ownership

`src/simulation/world.ts` is frozen for this plan: M1/M2 and WP-A1--WP-A6 are historical records,
and WP-A7 performs verification only. WP-C1 may later edit only its snapshot region after the
accepted physics review boundary. `src/render/game_renderer.ts`: WP-B2 owns it through M4 and then
releases it; WP-C2 owns only its pin command if WP-E2c selects the smooth-tip path, and mandatory
WP-C3 subsequently owns final orientation canonicalization in that command. These are sequential
handoffs, never concurrent writes.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Review boundary |
| --- | --- | --- |
| Historical M1 / WS-D | Baseline diagnostic and read-only accessors | Completed investigation record; non-dispatchable and no edits under this plan |
| Historical M2 / WS-X | Reverted experimental evidence | Completed investigation record; non-dispatchable and no edits under this plan |
| M3 / WS-A | Existing physics report artifact/hash reconciliation | WP-A7 only; frozen behavior, regression-only verification, no physics-file edits or retuning |
| Pre-M4 / WS-H | `src/app/game.tsx`, `src/game/score_display.ts` if needed, `src/style.css`, focused UI/Playwright tests | New 16:10 desktop side-control layout is measured and frozen first; it supplies the actual enlarged canvas dimensions |
| M4 / WS-B | Clean `HEAD` baseline of `config/camera.ts`, `render/camera.ts`, `render/contracts.ts`, `render/game_renderer.ts`; new focused tests | Renderer only; simple projection is rebuilt after the frozen layout; simulation untouched |
| M5 / WS-E | `docs/screenshots/`, `artifacts/milestone/`, `docs/active_plans/reports/` | Initial capture/review establishes composition and the M6 tip decision; capture and judgement have different owners |
| M6 / WS-C | `protocol.ts`, snapshot region of `world.ts`, `pins.ts`, `game_renderer.ts` pin command | Stride change reviewed with every reader; mandatory C3 is followed by fresh capture and orientation review |
| M7 / WS-G | match, scoring, setup/display, save/load, and their tests | Published 1--5 bowls contract before sequenced boundary edits |
| M8 / WS-F | `docs/GEOMETRY_MODEL.md`, `docs/GAME_RULES.md`, `docs/CHANGELOG.md`, `tests/TESTS_TYPESCRIPT_README.md` | Docs only, after all final capture/review evidence |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| Historical M1 | Instrumentation and baseline | Completed read-only diagnostic and recorded launch sweep | Preserved evidence; not dispatchable |
| Historical M2 | Controlled experiments | Completed, reverted E2 through E5 experiments | Preserved evidence; not dispatchable |
| M3 | Frozen physics verification | Reconcile the exact report artifact/hashes and rerun regression evidence only | Preserve the accepted 40 lbm/through-pin behavior without retuning |
| M4 | Camera/render recovery | Frozen side-control layout first; clean-room projection/rebuild; actual 105 aiming bakeoff before propagation | Believable dense rack, no empty-gap stacks or tiny lane island, >=90% lane/rack/ball span, and complete racks on the measured 16:10 play canvas |
| M5 | Visual acceptance | Capture and independently judge all three modes and lane states after the 16:10 side-control integration | Multiple independent confirmations accept the composition, reclaimed space, and pin orientation |
| M6 | Pin presentation and settled orientation | Tip progress plus upright-safe settled draw | No visible upside-down final state |
| M7 | Configurable frames | Accepted, independently reviewed implementation | Frozen `bowls_per_frame` works with tenth-frame `+ 1` |
| M8 | Close-out | Contract, changelog, tool docs, archival | Record matches behavior |

### Historical milestone record: M1 instrumentation and baseline

- Status: completed historical investigation; do not dispatch or edit from this record.
- Recorded deliverables: WP-D1, WP-D2, WP-D3.
- Recorded checks: the diagnostic reproduces identical physics fields across repeated runs at a fixed
  launch, with wall-clock and timing fields excluded from that comparison since they legitimately
  vary; the change contains no dynamics edit; the sweep definition is recorded before it is run.
- Recorded outcome: the E1 baseline table was published with every hypothesis marked supported, refuted,
  or undetermined.

### Historical milestone record: M2 controlled experiments

- Status: completed historical investigation; do not dispatch or edit from this record.
- Recorded dependency and deliverables: M1 baseline; WP-X1 through WP-X4.
- Recorded checks: every experiment was reverted and each result recorded with its deciding metric.
- Recorded outcome: the branch-selection statement is preserved below only as historical rationale for
  the already accepted implementation. It has no execution authority.

### Milestone: M3 frozen physics verification

- Depends on: existing accepted functional physics work.
- Deliverables: reconcile the exact 990 report artifact and its hashes, then rerun the listed
  backstop probe, focused tests, and benchmark.
- Done checks: report contents and recorded hashes agree with the generated evidence; all named
  regression checks pass without behavior edits.
- Entry criteria: no unreviewed physics source change.
- Exit criteria: reconciliation report and regression evidence are published. Any behavioral failure
  stops this plan and returns to a separately approved physics diagnosis; it does not authorize tuning.
- Parallel-plan ready: yes, because it is read-only verification after artifact generation.

### Milestone: M4 camera/render recovery

- Depends on: the new desktop 16:10 side-control layout and its measured canvas bounds, frozen before
  any camera calibration.
- Deliverables: WP-B1, WP-B2, WP-B4, then the actual-capture WP-B0 reveal bakeoff, its
  per-mode vertical-framing calibration, and selected-camera WP-B3/WP-B5, all executed inside the
  camera recovery boundary.
- Done checks: projected size decreases monotonically with depth; lane edges converge coherently;
  the horizon holds fixed across a shot; every world point the renderer draws, including the aiming
  ball at `y = -9`, has finite clipped output; complete 10-, 105-, and 990-pin racks are visible on
  the actual 16:10 play canvas; and the diagnostic exposes clipping, row ordering, rear-row reveal,
  and unused bands without encoding a guessed rear-row-reveal percentage as a pass/fail condition.
  Separately, each mode has a complete-rack framing derivation: the highest complete rack crown or
  backstop extent targets about 4% down from the actual lane canvas top, the aiming-ball bottom or
  near edge targets about 96% down, and the combined lane+rack+ball vertical span is never below
  90%. These are composition guardrails subject to screenshot review, not a replacement for it.
- Entry criteria: WP-B6's accepted measured 16:10 canvas rectangle is published.
- Exit criteria: `./check_codebase.sh` passes, the revised renderer tests pass, and the independent
  105 aiming selection has been locked into the camera parameters. Full all-state visual acceptance
  remains M5; a post-freeze layout change invalidates that selection and requires recapture/re-review.
- Parallel-plan ready: no. The frozen layout, implementation, candidate capture, independent review,
  selection lock, and mode propagation are deliberate sequential handoffs.

### Milestone: M5 visual acceptance

- Depends on: M4 for the shipped camera, WP-B6 for the measured desktop side-control 16:10 play
  canvas, and M3
  so the captured rolls show a real cascade.
- Deliverables: WP-E1 captures and WP-E2a/E2b independent initial reviews, with WP-E2c
  reconciliation. This diagnoses orientation and records the M6 tip decision; it cannot block
  mandatory WP-C3.
- Done checks: all three modes and each required lane state are captured, then independently judged
  by at least two screenshot reviewers, neither of whom captured them or implemented any plan
  package; the M6 orientation decision and any upside-down finding are recorded for M6. The
  reviewers' believable full-rack 16:10 composition judgement is the final visual authority;
  projection assertions and diagnostic measurements are guardrails, not a substitute for it.
- Entry criteria: M4 exit criteria met.
- Exit criteria: defect 2 accepted in writing, and the M6 go/no-go recorded in
  `docs/active_plans/reports/perspective_visual_acceptance.md`.
- Parallel-plan ready: no. Judgement reads the captures.

### Milestone: M6 pin presentation and settled orientation

- Depends on: M5 for the initial decision, M4 for the camera draw path, M3 for a cascade worth
  showing. M6 cannot pass until mandatory WP-C3 has refreshed captures and two fresh independent
  post-fix orientation reviews have passed.
- Deliverables: WP-C1, WP-C2, mandatory WP-C3, then WP-E3 capture, WP-E4a/E4b fresh orientation
  reviews, and WP-E4c reconciliation. A smooth tip is conditional on visual evidence, but the
  settled-orientation guard is mandatory.
- Done checks: upright and fallen pins share one sizing path, and every settled fallen pin has an
  upright-safe visual orientation even if its physics capsule has rotated further.
- Entry criteria: M5 captures exist; WP-E2c records the smooth-tip decision.
- Exit criteria: `./run_playwright_tests.sh` passes, WP-E3 captures are refreshed, and WP-E4a and
  WP-E4b, owned by two fresh reviewers, confirm no upside-down settled pin in every mode/state.
- Parallel-plan ready: no. WP-C2/C3 read the field WP-C1 writes.

### Milestone: M7 configurable frames

- Depends on: none; implementation and independent review are already accepted.
- Deliverables: preserve the frozen WP-G1 through WP-G4 work and include it in final regression.
- Done checks: setup exposes a bounded `bowls_per_frame`; frame progression uses that value; the
  tenth-frame semantics follow the shared 1--5 contract: B=2 preserves classic early strike closure
  in frames 1--9 and conditional tenth-frame fills; B!=2 permits up to B bowls in frames 1--9,
  closing early/resetting on a cleared rack, while the tenth records exactly B+1 bowls and resets a
  fresh rack after clears as needed. Score display, save/load, and rules text agree.
- Entry criteria: contract ownership is assigned before simultaneous changes begin.
- Exit criteria: no further implementation is authorized unless a regression check fails.
- Parallel-plan ready: not applicable; frozen.

### Milestone: M8 close-out

- Depends on: M3, M4, M5, M6, and M7.
- Deliverables: WP-F1.
- Done checks: contract and changelog describe shipped behavior, including whether the capsule and
  the tip animation survived.
- Entry criteria: implementation milestones complete or explicitly closed.
- Exit criteria: `pytest tests/` passes, including the markdown link check.
- Parallel-plan ready: yes.

## Workstream breakdown

### Historical workstream record: WS-D diagnostics

- Status: completed historical investigation; not dispatchable and not permitted to edit files.
- Recorded scope: WP-D1, WP-D2, WP-D3, and WP-A6 produced the baseline, permanent `--sweep` mode,
  and cascade test evidence used by the accepted implementation.
- Current relation: WP-A7 may rerun named diagnostics and tests as read-only regression verification;
  it does not reopen WS-D or WP-A6.

### Historical workstream record: WS-X controlled experiments

- Status: completed historical investigation; not dispatchable and not permitted to edit files.
- Recorded scope: WP-X1 through WP-X4 separated fall detection from momentum propagation and tested
  capsule necessity; all temporary changes were reverted. Their branch-selection record explains the
  accepted implementation only and cannot authorize a new physics change.

### Workstream: WS-A simulation dynamics

- Historical record: WP-A1 through WP-A6 are completed, non-dispatchable, non-editing records of
  the accepted physics implementation. They must not be assigned as follow-up work.
- Sole active package: WP-A7, owned by `tester`, reconciles exact report/artifact hashes and reruns
  named regressions only.
- Review boundary: WP-A7 cannot modify any physics implementation, simulation, diagnostic, or
  physics-test file. A failed regression is an evidence blocker for a separately approved follow-up,
  not a reason to retune here.

### Workstream: WS-B clean-room render projection

- Goal: cleanly replace the failed camera/projection path with one durable camera-guided or hybrid
  depth transform carrying position, size, convergence, and framing without changing simulation scale.
- Owner: `coder` implements; a separate `playwright_operator` captures WP-B0; two separate
  `image_evaluator` reviewers select; WP-B4 is owned by `tester`.
- Work packages: WP-B0 through WP-B5.
- Needs: nothing from WS-A; consumes published snapshot positions only.
- Provides: the projection API including the base-and-crown interface WS-C needs.
- Review boundary, when modifying the repository: owns only the files named in `### Camera recovery
  boundary` through M4. Frame rules and physics are explicitly preserved.

### Workstream: WS-H 16:10 play-area layout

- Goal: reclaim vertical room from both top chrome and the bottom control deck so the actual lane
  canvas, not merely its projection, dominates a 16:10 game while score and controls remain
  immediately readable and operable.
- Owner: a `coder` distinct from WS-G and WS-B; a `tester` owns focused UI/Playwright coverage;
  independent screenshot reviewers in WS-E judge the resulting lane states rather than this owner.
- Work packages: revised WP-B6.
- Needs: the accepted WP-G work only. It precedes all camera implementation and calibration; it
  does not wait for, consume, or alter a projection API.
- Provides: a measured, accepted, frozen 16:10 play canvas and its dimensions to the M4 camera test
  fixture and M5 capture manifest. Any proposed later layout change is a new layout revision and
  invalidates the selected 105 bakeoff and all dependent captures until they are recaptured and
  independently re-reviewed.
- Review boundary: `src/app/game.tsx`, `src/game/score_display.ts` if needed, `src/style.css`, and
  focused UI/Playwright tests only. It does not alter scoring, keyboard bindings, simulation, or
  projection equations.

### Workstream: WS-C tip presentation

- Goal: make the fall legible without adding physics state and keep settled art upright-safe.
- Owner: `coder`.
- Work packages: WP-C1 and WP-C2 conditional on WP-E2c, mandatory WP-C3, then WP-E3,
  WP-E4a/WP-E4b, and WP-E4c.
- Needs: M3 complete, so WS-A has released `world.ts`; and M4 complete, so WS-B has released
  `game_renderer.ts` with the base-and-crown draw path in place. WP-B2 releases that file after M4;
  WP-C2 may own only its pin command when WP-E2c selected the smooth-tip path, and mandatory WP-C3
  owns final orientation canonicalization after that conditional handoff. No WS-C package writes the
  command concurrently with WP-B2 or another WS-C package.
- Review boundary, when modifying the repository: `protocol.ts`, the snapshot region of `world.ts`,
  `src/render/pins.ts`, and the sequentially owned pin command in `src/render/game_renderer.ts`.

### Workstream: WS-E visual acceptance

- Goal: judge composition first, then independently confirm the mandatory post-fix orientation.
  Capture and judgement are deliberately different owners, and judgement has multiple independent
  reviewers.
- Owner: `playwright_operator` captures WP-E1 and fresh WP-E3; two fresh `image_evaluator` owners
  separately judge WP-E2a/E2b, and two *different* fresh `image_evaluator` owners judge
  WP-E4a/E4b. An `architect` reconciles only disagreements in WP-E2c/E4c.
- Work packages: WP-E1, WP-E2a, WP-E2b, WP-E2c, then WP-E3, WP-E4a, WP-E4b, WP-E4c.
- Needs: M4 complete for the camera, M3 complete so the captured rolls show a real cascade.
- Provides: the written acceptance of defect 2, the recorded M6 decision, and the post-C3
  orientation acceptance needed for M6.
- Review boundary, when modifying the repository: `docs/screenshots/` and report files only.

### Workstream: WS-G configurable frame rules

- Goal: make frame length a persistent, player-visible match setting without weakening the existing
  two-bowl ten-pin specialization.
- Owner: `expert_coder` for the pure match/scoring contract; distinct `coder` owners subsequently
  own setup/display and save/load. A `tester` owns tests and an independent `reviewer` audits the
  merged cross-boundary diff.
- Work packages: accepted WP-G1 through WP-G4.
- Needs: none; this work is frozen after independent review.
- Provides: one `bowls_per_frame` value whose setup, reducer, scoring, display, persistence, and
  documentation semantics agree.
- Review boundary: `src/game/contracts.ts`, `match.ts`, and `scoring.ts` are WP-G1 only;
  setup/display and save/load are separately sequenced; no owner edits another package's files.

### Workstream: WS-F documentation

- Goal: leave the repository record matching shipped behavior.
- Owner: `maintainer`.
- Work packages: WP-F1.
- Needs: M3, M4, M5, M6, and M7 outcomes, including final WP-E4c evidence.
- Review boundary, when modifying the repository: `docs/` only.

## Recovery execution sequence and handoffs

This sequence supersedes any older parallel-language for the recovered camera path.

1. Preserve the dirty tree and the accepted bowls-per-frame and physics behavior. Replace the failed
   desktop layout first: compact/merge the top chrome to <=12% of viewport height, remove the empty
   pre-lane band, move desktop controls into the bounded side panel, measure the enlarged lane canvas,
   and freeze that layout before any camera calibration.
2. The camera implementer starts from `Git HEAD` copies of the four named camera/render files, writes
   a small parameterized projection and renderer, and passes focused machine checks. This implementer
   supplies candidate knobs only; they do not judge screenshots.
3. A separate capturer uses the newly frozen layout to produce the real 105-pin aiming 3/6/10 candidate
   captures. Two independent screenshot reviewers assess them separately. Neither reviewer captured
   a candidate or implemented camera/layout code.
4. A non-implementing camera owner records the agreed row-reveal choice, then calibrates a separate
   full-rack vertical-framing profile for 10, 105, and 990 from each authoritative complete rack,
   backstop, and aiming ball/near edge. The solver's priority is (1) fill the actual canvas endpoints
   and reach the >=90% scene span, (2) solve horizon/near placement, (3) apply only the minimum
   deck-depth exaggeration needed for the chosen rear-row reveal, and (4) reject clipping. Current
   survivors are never input to framing. This order explicitly rejects the current failure mode:
   exaggerating the lane/deck while wasting most of the vertical canvas.
5. That owner locks the combined reveal-and-framing profiles in the camera slice. Only after that
   lock does the implementer propagate them to 10 and 990 and the remaining aiming, mid-roll,
   partial-rack, and settled states; those states keep the same per-mode framing.
6. A separate capturer creates the all-mode state matrix; independent reviewers then perform M5. If a
   later layout adjustment is proposed, return to step 1's measurement, rerun the camera solver, and
   repeat steps 3--6. Do not
   silently reuse the earlier selection or screenshots.
7. In parallel only with this read-only sequence, reconcile the physics report/hash artifact and run
   regression verification. Do not change physics behavior. Keep settled-orientation work pending
   until M5 has supplied its evidence, then run its fresh capture/review path.

The acceptance crosswalk is therefore: frozen layout -> clean-room renderer -> candidate capturer ->
two independent candidate reviewers -> complete-rack per-mode vertical derivation -> combined lock ->
all-mode propagation -> all-state capturer -> two independent visual reviewers. A failure returns to
the immediately responsible implementation owner and requires fresh captures and fresh reviewers; it
never authorizes changing the frozen layout or physics as a camera workaround.

## Work packages

**Historical-package boundary.** WP-D1 through WP-D3, WP-X1 through WP-X4, and WP-A1 through
WP-A6 below preserve completed evidence and implementation history only. None is dispatchable or
allowed to edit a file. Their original acceptance and verification language remains so future
readers can audit how the frozen implementation was reached. WP-A7 is the sole remaining physics
package, and it is verification/report reconciliation only.

### Work package: WP-D1 instrument the collision path

- Owner: `tester`.
- Touch points: `devel/probe_strike_matrix.mjs`; read-only accessors in `src/simulation/world.ts`
  only if existing ones are insufficient.
- Depends on: none.
- Acceptance criteria: per run the probe reports runtime ball and pin collider mass from
  `get_pin_collision_profile`; contact impulses on the ball-to-pin and pin-to-pin paths with the
  velocity change each produced; per fallen pin its first-contact source from
  `get_pin_first_contact` and its distance travelled from its rack slot; sleeping and active state
  at impact; whether contacts continue after a collider is replaced by its fallen capsule;
  contact occurrence, propagation depth, and fallen-set shape as defined in
  `## Test and verification strategy`. The existing exit-code contract and `--require-all-strikes`
  behavior are unchanged. **No simulation behavior changes**; the diff is additive and read-only.
- Verification step: `npm run strike-matrix -- --power 16` run twice reproduces identical **physics**
  fields, with any wall-clock or timing fields excluded from that comparison since they legitimately
  vary; and `node --import tsx --test 'tests/test_*.mjs'` passes unchanged.
- Obvious follow-ons: none.

### Work package: WP-D2 add a permanent sweep mode and define the search space

- Owner: `tester`.
- Touch points: `devel/probe_strike_matrix.mjs`; sweep definition recorded in
  `docs/active_plans/reports/cascade_baseline.md`.
- Depends on: WP-D1.
- Acceptance criteria: the sweep ships as a **permanent `--sweep` mode of the existing probe**, not
  a throwaway script, so any future physics change can re-ask "can a pocket shot still strike" with
  one command. It keeps the probe's existing determinism contract: fixed timestep, no seeded or
  stochastic variability. The sweep is defined and recorded **before** it is run, derived from
  `src/game/aim.ts` limits rather than chosen ad hoc. For the 10-pin rack those limits are power
  8 to 24, start position plus or minus 15.5 boards, angle plus or minus 0.578 degrees, spin
  plus or minus 1. The recorded definition names the power steps, board interval, angle steps, spin
  steps, and total deterministic sample count. Shot classification is by **measured outcome, not
  input**, since hook makes the two differ: compute where the ball centre crosses the 60 ft head-pin
  plane, then classify a **pocket line** as a crossing between 0.15 and 0.40 ft from centre, which
  is the band that contacts both the head pin and a second-row pin, and a **centered line** as a
  crossing within 0.05 ft of centre.
- Verification step: `npm run strike-matrix -- --sweep --help` documents the mode; the recorded
  definition lands in `docs/active_plans/reports/cascade_baseline.md` before WP-D3 runs; `architect`
  confirms the gate cannot be adjusted after results are seen.
- Obvious follow-ons: document the mode in the "Deterministic strike matrix" section of
  `tests/TESTS_TYPESCRIPT_README.md`, which already documents the probe. Assigned in WP-F1.

### Work package: WP-D3 record the E1 baseline

- Owner: `tester`.
- Touch points: `docs/active_plans/reports/cascade_baseline.md` only.
- Depends on: WP-D2.
- Acceptance criteria: the sweep is executed unchanged; each hypothesis is marked supported,
  refuted, or undetermined with the deciding number. E1 may already settle the main split: if
  pin-to-pin contacts never occur at baseline, the fall rule is not the blocker and no threshold
  change will help; if contacts occur but produce no falls, the threshold is implicated.
- Verification step: `architect` reviews the table before M2 opens.
- Obvious follow-ons: none.

### Work package: WP-X1 experiment E2, threshold floor

- Owner: `tester`.
- Touch points: `src/config/physics.ts`, temporarily.
- Depends on: WP-D3.
- Acceptance criteria: the fall threshold is dropped near zero with nothing else changed. The metric
  is **propagation depth and rear-row pin contact, explicitly not pinfall count**: a near-zero
  threshold makes pins fall from trivial contacts, so a higher count would be an artifact. The
  change is reverted before WP-X2.
- Verification step: after reverting, re-run the unchanged baseline and confirm its physics fields
  match the WP-D3 record, which proves the revert was clean without invoking Git.
- Obvious follow-ons: none.

### Work package: WP-X2 experiment E3, mass and energy probes

- Owner: `tester`.
- Touch points: `src/config/physics.ts`, `src/simulation/world.ts`, temporarily.
- Depends on: WP-X1.
- Acceptance criteria: mass declaration corrected, then restitution, then damping, each measured
  separately. Metric: pin-contact impulses and post-impact travel against the 7.234 in gap. All
  reverted afterward. The package's deliverable is an **experiment manifest** recorded in
  `docs/active_plans/reports/cascade_baseline.md`: the exact temporary values that improved the
  metric, so E4 and E5 reproduce one named configuration rather than each tester re-deriving it.
- Verification step: after reverting, re-run the unchanged baseline and confirm its physics fields
  match the WP-D3 record; deltas recorded per sub-change; the manifest names every value.
- Obvious follow-ons: none.

### Work package: WP-X3 experiment E4, circles-only sweep

- Owner: `tester`.
- Touch points: `src/simulation/world.ts`, temporarily disabling the capsule swap.
- Depends on: WP-X2.
- Acceptance criteria: apply the WP-X2 experiment manifest verbatim, then disable the capsule swap
  and run the WP-D2 sweep on the 10-pin rack. Metric: whether any pocket line strikes, and whether
  rear-row pins are reached by pin contact. **A failure here does not establish that circles cannot
  bridge the spacing**; it establishes only that the tested circular model did not pass after the
  repairs tried so far. Either result proceeds to E5 for comparison.
- Verification step: results recorded against the same sweep definition used in WP-D3.
- Obvious follow-ons: none.

### Work package: WP-X4 experiment E5, capsule comparison

- Owner: `tester`.
- Touch points: `src/simulation/world.ts`, re-enabling the capsule swap.
- Depends on: WP-X3.
- Acceptance criteria: with the same manifest applied, the swap is re-enabled and the identical
  sweep repeated. Metrics: E4's metrics plus 990-rack settle time and median wall-clock per shot.
  The comparison states which of these the capsule delivered, rather than resting on the phrase
  "clear improvement": a strike becomes reachable where circles failed; propagation reaches deeper
  rows; the passing region of the sweep becomes materially more robust, meaning more of the pocket
  band strikes rather than a single knife-edge line; or large-rack propagation improves without a
  meaningful playability regression. Any one of those justifies retaining the capsule. None of them
  is a fixed numeric threshold, and the recorded numbers are the evidence.
- Verification step: `architect` reviews the comparison and records the M3 branch selection.
- Obvious follow-ons: none.

### Historical work package record: WP-A1 declare collider mass as mass

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `src/config/physics.ts`, `world.ts` (`create_pin_collider`, `create_ball_body`).
- Historical dependency: WP-X4. It ran unconditionally; H1 informed only the ratio.
- Recorded acceptance: both colliders declare mass in the units their config keys claim; the ratio
  starts from regulation equipment proportions and moves only as far as the strike gate requires;
  `create_fallen_pin_collider` still preserves the outgoing collider mass across a swap, if the
  swap survives.
- Recorded verification: the WP-D1 diagnostic was rerun and its H1 delta recorded.
- Historical follow-on: `get_pin_collision_profile` coverage was checked for hardcoded mass values.

### Historical work package record: WP-A2 make the fall threshold mass-invariant

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `src/config/physics.ts`, `src/simulation/pin_state.ts`, both
  `setContactForceEventThreshold` sites in `world.ts`.
- Historical dependency: WP-A1. It ran unconditionally; see `## Design philosophy` for why this was independent of
  whether H2 is the binding cause.
- Recorded acceptance: the rule compares a mass-normalized quantity, a velocity change in ft/s,
  rather than a raw impulse; the Rapier event gate derives from the same value so the filter and the
  game rule cannot drift apart; the value follows the rule in `## Execution-time decision rules`.
- Recorded verification: WP-D1 diagnostic rerun; delta recorded.

### Historical work package record: WP-A3 tune energy retention

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `src/config/physics.ts`, `world.ts` (`create_pin_body`,
  `replace_with_fallen_collider`).
- Historical dependency: WP-A2; it was conditional on H3 being supported.
- Recorded acceptance: restitution and pin linear damping were tuned individually, one patch each, so a
  struck pin can cross the 7.234 in gap while deadwood still settles; if damping is split by
  standing versus fallen state, the fallen value is applied where the fallen angular damping already
  is; the config comment records the effective pair restitution under Rapier's combine rule.
- Recorded verification: `node devel/run_simulation_benchmark.mjs` ran on the 990 rack against the recorded
  baseline, evaluated against the performance gate.
- Historical follow-on rule: if settling slowed, raise `get_settle_max_seconds` rather than re-damping.

### Historical work package record: WP-A4 repair activation bookkeeping

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `world.ts` (`activate_pin`, `update_active_pins`, activation index).
- Historical dependency: WP-A2; it was conditional on H4 being supported.
- Recorded acceptance: a pin receiving a qualifying contact is evaluated by the fall rule regardless
  of how it was woken; the once-per-pin activation query protecting 990-rack cost is preserved.
- Recorded verification: WP-D1 diagnostic plus the 990 benchmark.

### Historical work package record: WP-A5 retain or remove the capsule

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `world.ts` (`replace_with_fallen_collider` and callers), `src/config/lane.ts`.
- Historical dependency: WP-A3 and WP-A4 where they ran.
- Recorded acceptance: the capsule is retained only if WP-X4 recorded at least one of its named
  improvements. If circles alone pass the strike gate, the shape transition is removed rather than
  carried unused, and `fallen_pin_length` is retired with it. **The fallen-axis snapshot field is
  decided separately**, not automatically: this plan states that visual tipping is independent of
  collision shape, so a stable visual fall direction may still be wanted with circular physics. The
  package first determines whether `fallen_axis_angle` has a renderer consumer that survives capsule
  removal, and if so re-sources it, for example from pin velocity at the moment of the fall, rather
  than deleting it and stranding M6.
- Recorded verification: full sweep rerun; strike gate passes in the shipped configuration; if the
  field is retired, no renderer or benchmark reader still references it.
- Historical follow-on: `docs/GEOMETRY_MODEL.md` "Pin collision shapes" was marked for rewriting either way.

### Historical work package record: WP-A6 lock cascade behavior in a durable test

- Status: completed historical implementation record; non-dispatchable and no file edits permitted.
- Historical touch points: `tests/test_regulation_physics.mjs`, or a sibling `tests/test_pin_cascade.mjs`.
- Historical dependency: the strike gate passed in the final shipped configuration. The test locks
  that released configuration, not an intermediate A1--A5
  result.
- Recorded acceptance: a permanent Node test locks the two properties this plan exists to create,
  so the class of regression cannot silently return. It asserts that a pocket line knocks down more
  pins than a centered line at the same power, and that the pocket line reaches the rear row through
  pin-contact provenance. The launch is chosen from the **robust interior** of the sweep's passing
  region rather than its marginal edge, so ordinary retuning does not flip it. Following
  `docs/PYTEST_STYLE.md`, it asserts behavioral properties and an ordering, not an exact pin count,
  a tuned constant, or a collection size. Setup is inline, it runs offline with no sleeps, and it
  covers two rolls so it stays fast.
- Recorded verification: `node --import tsx --test 'tests/test_pin_cascade.mjs'`, including confirmation it fails
  when the fall threshold is temporarily restored to its pre-repair form.
- Historical follow-on: report propagation depth and fallen-set shape from
  `devel/run_simulation_benchmark.mjs` as well, so future physics work sees cascade health beside
  cost rather than cost alone.

### Work package: WP-A7 reconcile frozen large-rack evidence

- Owner: `tester` for frozen-artifact reconciliation only; the functional implementation is accepted.
- Touch points: the generated report artifact and its hash/report fields only. WP-A7 reads the
  existing physics/configuration/diagnostic/test sources to regenerate evidence but must not edit
  them.
- Depends on: accepted functional physics implementation.
- Acceptance criteria: reconcile the already-generated report artifact's exact source hashes with
  the deterministic 990 backstop probe, benchmark, and focused tests. Confirm the accepted 40 lbm
  collider, documented lbf/world conversion, bounded through-pin drive, and successful backstop
  trace are represented exactly. This package makes no physics source edit and performs no force,
  mass, power, spin, damping, or collision retuning.
- Verification step: rerun the named probe, benchmark, and focused aim/force/world tests; report the
  generated hashes beside the artifact hashes. A mismatch is a documentation/evidence reconciliation
  blocker, not a license to alter behavior.
- Obvious follow-ons: WP-F1 documents the superhuman mode and its non-regulation purpose.

### Work package: WP-B0 105-pin aiming bakeoff and reference sheet

- Owner: a fresh `playwright_operator` capturer, not the camera implementer and not either reviewer.
- Touch points: `docs/active_plans/reports/many_pin_camera_reference.md`.
- Depends on: frozen WP-B6; WP-B1/WP-B2's simple parameterized projection and renderer; and WP-B4's
  focused renderer tests.
- Acceptance criteria: the camera implementer exposes only the bounded candidate parameters. The
  separate capturer then produces three otherwise-identical **actual 105-pin aiming** captures on
  the accepted 1600 x 1000 play canvas, initially labelled about 3%, 6%, and 10% rear-row reveal.
  Each named profile carries explicit metadata: `target_rear_row_reveal_fraction` (`0.03`, `0.06`,
  or `0.10`), its measured local reveal for every adjacent row pair, the derived depth/exaggeration
  parameter, and the measured rack/canvas geometry used to calibrate it. Thus the 10% profile is a
  real 90%-height-overlap / 10%-pin-height-reveal candidate, not an arbitrary multiplier. Targets
  are bounded calibration hypotheses rather than mathematical requirements: local reveal may vary
  by row under perspective, and the sheet rejects neither candidate by percentage alone. The sheet
  records horizon, rack and aiming-ball bounds, lane bands, and diagnostics. It must include the
  actual 10% candidate capture before reviewers can lock a selection.
  Two fresh independent `image_evaluator` reviewers, neither capturer nor implementer, each select
  or reject a candidate in `many_pin_camera_review_a.md` and `many_pin_camera_review_b.md`. A
  non-implementing `architect` first records the agreed **row-reveal** choice. Before locking or
  propagating it, that owner derives a separate vertical-framing profile for each 10-, 105-, and
  990-pin complete rack from authoritative full-rack bounds plus the backstop and aiming-ball/near
  edge, never from the currently surviving pins. The profile targets the highest complete rack crown
  or backstop extent at about 4% of the actual lane canvas, the aiming-ball bottom or near edge at
  about 96%, and a lane+rack+ball span of at least 90%. Its horizon may be off-canvas; the
  requirement is a believable, unclipped lane composition, not a literal visible horizon. The solver
  fills the available canvas and satisfies that span before solving horizon/near placement, then
  applies only the minimum deck-depth exaggeration needed for the reviewer-selected row reveal.
  The same full-rack-derived framing must be retained for aiming, mid-roll, partial-rack, and
  settled states so removals cannot pull the composition downward or recreate the giant top void.
  The architect records the row-reveal decision, per-mode derivations, and the combined lock in
  `many_pin_camera_selection.md`; if reviewers disagree, the capturer obtains a bounded replacement
  set and two new reviewers assess it. Only then does WP-B3 lock the selected parameters.
- Verification step: three labelled captures and two independent selection reports exist with concrete
  visual reasons. The lock record includes all three complete-rack framing derivations and their
  target/measured top, near, and span values. No 10/990 propagation or other lane-state capture
  starts before the combined reveal-and-framing lock record.
- Obvious follow-ons: none.

### Work package: WP-B1 inspect conventions and rebuild the simple projection

- Owner: `coder`.
- Touch points: the clean `HEAD` camera/render slice and new focused camera/projection tests.
- Depends on: frozen WP-B6 canvas dimensions.
- Acceptance criteria: begins with a written inspection of existing camera conventions covering axis
  directions, the `lane_near_y: -10` near bound, the aiming ball drawn at `y = -9` behind the foul
  line, near clipping, points behind the eye, and what a zero height means; equations are fixed only
  after that inspection. The clean-slice helper implements a documented camera-guided depth transform: a
  perspective divide may be followed by a bounded nonlinear visual-exaggeration term, provided its
  monotonicity and parameters are explicit. Candidate profiles do not merely store arbitrary
  multipliers: given the measured rack row positions, physical pin height, and frozen play-canvas
  rectangle, calibration derives the depth/exaggeration parameter that most closely produces the
  profile's target local rear-row reveal (including `0.10`). It emits the resulting per-row measured
  reveal and calibration residual so the bakeoff can distinguish a real 10% candidate from a label.
  Near clipping and points behind the eye have defined,
  tested behavior. The API accepts a body as a base point plus a crown, not a single centre, and
  covers projected width, depth ordering, and clipping. Pure and unit-testable. New tests are Node `.mjs` under `tests/`, per
  `tests/TESTS_TYPESCRIPT_README.md`; the rejected `src/render/projection.ts` is not revived or
  imported. The compact helper belongs inside the clean camera/render slice. No pytest file is added
  for TypeScript behavior, and
  assertions target behavior rather than tuned constants per `docs/PYTEST_STYLE.md`.
- Verification step: rewritten focused camera/projection tests (not the rejected current assertions)
  assert monotonic size falloff, a single vanishing point, and defined behavior at and behind the
  near bound.
- Obvious follow-ons: none.

### Work package: WP-B2 route renderer geometry through the camera

- Owner: `coder`.
- Touch points: only the four clean-room camera files named in `### Camera recovery boundary` and
  newly written focused tests.
- Depends on: WP-B1.
- Acceptance criteria: fixed-size `project_point`/`project_lane_y` behavior and the old
  `top_half_width` / `bottom_half_width` trapezoid are retired; every body is sized from its own
  depth transform; a pin draws as
  one segment from `(x, y, 0)` to `(x, y, 1.25)` and the ball's centre sits at `z = ball_radius` so
  it rests on the lane; the arrow depth expression `13 + (1 - abs(centered_board) / 16) * 3` is
  replaced by the arrows' true world position; depth sort uses base depth.
- Verification step: `./check_codebase.sh`, plus the revised renderer tests from WP-B4.
- Obvious follow-ons: the `clamp(..., 10, 64)` pin clamp and the `max(22, width * 0.045)` ball floor
  become dead; remove them rather than keeping them as a safety net.

### Work package: WP-B3 per-mode eye placement

- Owner: `coder`.
- Touch points: `src/render/camera.ts`, `src/config/camera.ts`.
- Depends on: WP-B2 and the locked, independently selected WP-B0 105 aiming candidate.
- Acceptance criteria: **pin physical scale and rack physical scale are identical in every mode**;
  only camera/hybrid transform placement adapts. Start from the WP-B0 reviewer-selected 105-pin
  aiming composition. Eye height, pitch, setback, and any bounded visual depth exaggeration are
  calibrated from actual rack and frozen canvas geometry, then may scale with lane width so that at
  990 pins the near lane edges and aiming region remain on screen while
  the composition is visibly less front-on and does not waste its lower-frame lane area. On the
  actual 16:10 play canvas the complete 10-, 105-, and 990-pin rack, including every pin base and
  crown, remains within the clipped play area at aiming, mid-roll, and settled states. The composition
  purposefully uses the canvas height without clipping, empty row gaps, unexplained bands, or a tiny
  centered lane/rack island. Independently of the selected local rear-row reveal, each mode's
  framing uses authoritative complete-rack/backstop bounds (not standing/surviving pin bounds) to
  place the highest complete rack crown or backstop extent around 4% of lane-canvas height and the
  aiming-ball bottom or near edge around 96%, with a lane+rack+ball span of at least 90%. Filling
  those canvas endpoints is solved before horizon placement; deck-depth exaggeration is the minimum
  necessary to preserve the selected reveal, never a reason to shrink the scene. A horizon may sit
  above the canvas when that achieves believable framing; no camera state may reframe after pins
  fall. The helper reports row ordering, target and measured local
  rear-row reveal, calibration residual, full-rack bounds, top/near positions, occupied span, and
  unused bands only as diagnostic evidence; it cannot approve or reject a composition by percentage.
  Shot zoom runs through the same transform so the horizon holds fixed; reduced motion keeps the
  composition and drops the zoom.
- Verification step: `node --import tsx --test 'tests/test_camera.mjs'` asserting that the aiming
  region and complete rack bounds stay within the actual 16:10 play canvas at every supported mode.
  Visual judgement of the result happens
  later in M5 and is deliberately not a gate on this package, so M4 stays independently completable.
- Obvious follow-ons: none.

### Work package: WP-B5 lock camera non-regression diagnostics

- Owner: `tester`, independent from the WP-B coder.
- Touch points: `tests/test_camera.mjs`, `tests/test_projection.mjs`, and a small pure projection
  helper only if the existing API cannot expose the measurement without duplicating equations.
- Depends on: WP-B3.
- Acceptance criteria: tests calculate adjacent row ordering and rear-row reveal from projected
  pin-row geometry in 10-, 105-, and 990-pin settled fixtures, rather than comparing screenshot
  pixels to a guessed camera constant. They assert finite projection, correct depth order, no clipped
  rack/aiming ball, and no separated row stacks. Tests retain finite aiming/mid-roll coverage and
  assert complete 10/105/990 rack bounds, the aiming ball, and near-lane bounds are inside the actual
  16:10 play canvas. For every mode and aiming/mid-roll/partial-rack/settled fixture, they assert
  that the identical complete-rack-derived framing is used regardless of survivor count, the highest
  complete-rack crown/backstop extent is within a safe 2--6% top margin, the aiming-ball bottom or
  near edge is within a safe 94--98% lower placement, and lane+rack+ball span is at least 90%.
  A <90% span is a hard failure, not a diagnostic warning or an invitation to silently shrink the
  lane. The helper reports reveal,
  top/bottom safe margins, horizontal bounds, occupied span, and unused canvas bands, plus each
  profile's target, per-row measured reveal, full-rack framing derivation, and calibration residual
  for reviewer evidence; it deliberately does not turn a 3%, 6%, or 10% sample into a universal
  acceptance band.
- Verification step: focused camera/projection tests plus `./check_codebase.sh`.
- Obvious follow-ons: WP-E reviewers use the emitted metric beside their visual judgement.

### Work package: WP-B6 reclaim 16:10 play area without losing score clarity

- Owner: `coder` distinct from WP-G1/WP-G2 and WS-B; a separate `tester` owns the focused
  UI/Playwright assertions, and WS-E's fresh image evaluators remain the independent visual
  authority.
- Touch points: `src/app/game.tsx`, `src/game/score_display.ts` if needed, `src/style.css`, and
  focused UI/Playwright tests.
- Depends on: accepted WP-G1/WP-G2 frame surfaces only. This package is completed and frozen before
  WP-B1 starts; it must not wait for or be calibrated against a camera implementation.
- Acceptance criteria: measure the existing 1600 x 1000 layout first, then replace the desktop
  bottom control deck with an accessible bounded 300--360 px side control panel in the content row
  below scoring. The lane takes all remaining content-row height and at least 75% of viewport width;
  the panel must neither overlay nor clip it. Stack status, sliders, and buttons accessibly in that
  panel while preserving focus order, keyboard controls, pointer controls, labels, selected
  bowls-per-frame explanation, and current-frame state. Compact the top chrome into one shallow
  score/header band: merge New Match, title, and active player; remove the redundant player strip;
  shrink score cells without losing readability; and remove the decorative pre-lane blue band. At
  1600 x 1000, the complete top chrome (header plus scoring) is no more than 120 px / 12% of viewport
  height. Score cells and the multiplayer selector remain readable, reachable, and non-overlapping.
  The renderer receives and tests against the **actual** enlarged canvas bounds rather than a stale
  assumed rectangle, and its 10/105/990 complete-rack, aiming, mid-roll, partial-rack, and settled
  fixtures use that space. Only after this package is measured and frozen may camera calibration
  resume. At narrow or short sizes, responsive layout may return controls to a bottom or stacked
  arrangement, but remains usable with no overlay or clipping.
- Verification step: focused UI and Playwright coverage at 1600 x 1000 proves the 300--360 px
  side-panel width, lane >=75% viewport width, full remaining content-row height, no bottom control
  deck, top chrome <=120 px / <=12% viewport height, no decorative pre-lane band, readable
  score/multiplayer controls, and no overlap/clipping; also cover
  representative narrow and short responsive fallbacks. Rerun `tests/test_camera.mjs` and
  `tests/test_projection.mjs` against the newly measured canvas; `./check_codebase.sh`; then hand
  the dimensions, before/after unused bands, and capture-ready states to WP-B1/WP-B0. The tester
  verifies behavior separately from the implementer.
- Obvious follow-ons: publish the newly frozen measured canvas to WP-B1 and WP-B0, rerun the
  fill-space-first camera solver, and recapture/re-review every mode/state. Any later layout edit
  requires a new WP-B0 candidate capture and independent re-review before camera work can proceed.

### Work package: WP-B4 revise the renderer tests

- Owner: `tester`.
- Touch points: `tests/test_game_renderer.mjs`.
- Depends on: WP-B2.
- Acceptance criteria: `pins.every(pin => pin.width >= 7 && pin.height >= 16)` is replaced by a
  monotonic assertion, that projected size decreases with depth, because a distant 990-rack pin is
  legitimately smaller under a real camera. This is a deliberate revision to a stronger property,
  not a repair to accommodate a regression.
- Verification step: `node --import tsx --test 'tests/test_*.mjs'`.
- Obvious follow-ons: none.

### Work package: WP-C1 publish per-pin tip progress

- Owner: `coder`.
- Touch points: `src/simulation/protocol.ts`, snapshot region of `src/simulation/world.ts`.
- Depends on: M3 complete, so WS-A has released `world.ts` and no two owners hold it; and a "go"
  recorded by WP-E2c.
- Acceptance criteria: one float per pin, either a 0-to-1 progress or the fall time taken from the
  `roll_elapsed_seconds` the world already tracks, recorded at the physical transition; every stride
  reader updated including the benchmark renderer; `create_game_draw_commands` stays pure with no
  renderer-side memory.
- Verification step: `node --import tsx --test 'tests/test_contracts.mjs'`.
- Obvious follow-ons: none.

### Work package: WP-C2 draw a continuous base-to-crown pin

- Owner: `coder`.
- Touch points: `src/render/game_renderer.ts` pin command, `src/render/pins.ts`.
- Depends on: WP-C1, WP-E2c's "go" decision, and M4 complete so WP-B2 has already routed the pin command through the camera
  and released `game_renderer.ts`.
- Acceptance criteria: the crown rotates about the base from vertical to horizontal over a bounded
  duration. Lean **direction** comes from velocity or the published fallen axis; lean **angle** comes
  from the monotonic tip progress. Driving the angle from instantaneous speed is rejected: pin
  damping bleeds velocity to zero within roughly half a second while a fallen pin stays down
  forever, so a speed-driven angle would stand fallen pins back up as they coast to rest. A pin that
  is still standing leans at most a few degrees, so a jostled pin reads as wobble. The
  `width: fallen ? standing_height : standing_width` split is gone.
- Verification step: `node --import tsx --test 'tests/test_game_renderer.mjs'` and
  `./run_playwright_tests.sh`.
- Obvious follow-ons: none.

### Work package: WP-C3 enforce upright-safe settled pin presentation

- Owner: `coder`, with a separate `reviewer` required before visual acceptance is rerun.
- Touch points: `src/render/pins.ts`, the pin draw command in `src/render/game_renderer.ts`, and
  focused renderer/Playwright tests. It must not alter standing/fallen collision state or fake a
  simulation result.
- Depends on: WP-B2/M4 must release `game_renderer.ts` first. If WP-E2c records "go", WP-C2 must
  release the pin command before WP-C3 begins; WP-C2 and WP-C3 never overlap. If WP-E2c records
  "no-go", WP-C3 may proceed after the WP-B2/M4 release. It is not conditional on the M6
  smooth-tip decision. WP-E3 and WP-E4a/E4b must follow it before M6 can pass.
- Acceptance criteria: simulation remains free to use its physical fallen-axis angle, but rendering
  canonicalizes the final resting presentation to an upright-safe half-plane: a pin may tip and lie
  in a believable direction, yet no settled sprite/profile can be upside down. The canonicalization
  is continuous through the visual tip where possible, uses one documented orientation convention,
  and applies identically to normal play, benchmark/capture readers, and reduced motion. Tests cover
  representative input angles including the formerly upside-down range and assert finite output,
  a right-side-up crown/neck ordering, and no visual flip after settlement.
- Verification step: focused renderer test and `./run_playwright_tests.sh`; then WP-E3 refreshed
  10/105/990 captures and WP-E4a/E4b reviews provide the separate visual acceptance.
- Obvious follow-ons: WP-F1 records the simulation/render orientation contract.

### Work package: WP-E1 capture the visual scenes

- Owner: `playwright_operator`.
- Touch points: `docs/screenshots/`, `artifacts/milestone/`.
- Depends on: M4 for the camera, WP-B6 for the real compact 16:10 layout, and M3 so the captured
  rolls show a real cascade; WP-B0's independent 105-pin aiming selection is a mandatory first gate.
- Acceptance criteria: 10-, 105-, and 990-pin captures of the actual 1600 x 1000 (16:10) play
  canvas via `./devel/capture_screenshots.sh`, covering aiming, mid-roll, and partial-rack or
  settled states for each mode. Every capture shows the complete rack/pins inside that canvas; a
  clipped rack is fail. The current 990 survivor count may change the drawn pins but may not change
  the measured per-mode framing: all state captures use the authoritative complete-rack/backstop
  bounds selected in WP-B0. For each mode, the manifest records the complete-rack/backstop safe top,
  aiming-ball or near-edge position, lane+rack+ball vertical span, and unused top/bottom bands beside
  the rear-row-reveal data. It blocks capture review if the crown/backstop extent is outside a safe
  2--6% top margin, the near edge is outside 94--98%, or the occupied span is below 90%; it never
  silently shrinks the lane to make an exaggerated deck fit.
  The capture manifest names the source build, deterministic launch/configuration, measured
  play-canvas bounds, chrome arrangement, and emitted row-order/reveal/bounds/backstop diagnostics.
  Capture only;
  the capturer records no judgement.
- Verification step: files exist at the expected paths and match the documented resolution.
- Obvious follow-ons: none.

### Work package: WP-E2a independent screenshot review: composition and depth

- Owner: fresh `image_evaluator`, explicitly different from WP-E1 and **every implementer in every
  plan work package**, including WS-B, WS-C, WS-G, and WP-A7.
- Touch points: `docs/active_plans/reports/perspective_visual_review_a.md`.
- Depends on: WP-E1, WP-B0.
- Acceptance criteria: review all nine mode/state captures independently, covering lane elevation,
  removal of wasted empty space, dense layered rows with a small visible rear-row portion, ball
  recession, usable 10-pin scale, deep 990 field, visible aiming region, complete rack/pin bounds
  inside the 16:10 canvas, compact readable scoring/header chrome, and supplied row-order, reveal,
  horizontal-bounds, and vertical-occupancy diagnostics. Explicitly compare each mode's aiming,
  mid-roll, and partial-rack/settled framing: a disappearing pin must not make the lane slide down
  or resurrect the huge top void seen in the rejected 990 frame-5/roll-2 capture. Explicitly reject
  visible empty gaps or separated stacks, a narrow lane/rack island, extreme row stretching, a rack
  hidden above the canvas, or large unexplained play-area bands. Decide whether the composition looks
  believable and bowling-like in motion; diagnostics are guardrails, not a reason to reject a
  realistic full-rack composition.
  Compare to WP-B0 and make no implementation edits.
- Verification step: the report names the decision and the evidence for it.
- Obvious follow-ons: none.

### Work package: WP-E2b independent screenshot review: pin orientation and readability

- Owner: a second fresh `image_evaluator`, different from WP-E1, WP-E2a, and every implementer.
- Touch points: `docs/active_plans/reports/perspective_visual_review_b.md`.
- Depends on: WP-E1.
- Acceptance criteria: independently inspect the same nine captures, emphasizing whether the
  complete rack remains visible/readable at aiming and mid-roll, whether settled pins appear
  physically coherent, and whether any pin has an upside-down final presentation. Record pass/fail
  for every mode/state with concrete screenshot evidence; make no implementation edits.
- Verification step: report exists and has all nine verdicts.
- Obvious follow-ons: none.

### Work package: WP-E2c reconcile independent visual evidence and decide smooth tip

- Owner: `architect`, who did not implement, capture, or write either review.
- Touch points: `docs/active_plans/reports/perspective_visual_acceptance.md`.
- Depends on: WP-E2a, WP-E2b, WP-B0.
- Acceptance criteria: accept the composition decision only if both reviewers independently pass
  every required composition mode/state and the machine non-regression diagnostics pass. If they disagree,
  quote the exact differing state, return it to the responsible implementation owner, require
  recapture, and obtain fresh independent re-reviews. It closes with the M6 smooth-tip decision;
  it cannot waive or pre-pass the mandatory no-upside-down contract, which is accepted only by
  post-C3 WP-E4a/E4b.
- Verification step: report names both reviews, the composition metric, each mode/state outcome,
  and the M6 decision.
- Obvious follow-ons: none.

### Work package: WP-E3 refresh post-C3 visual scenes

- Owner: a fresh `playwright_operator`, different from every WP-E4 reviewer and every implementer.
- Touch points: `docs/screenshots/`, `artifacts/milestone/`.
- Depends on: WP-C3 and `./run_playwright_tests.sh` passing.
- Acceptance criteria: recapture the same nine 1600 x 1000 10-/105-/990-pin aiming, mid-roll, and
  settled scenes from the post-C3 build. The manifest identifies the C3 revision/build and retains
  the row-order/reveal/bounds/backstop diagnostics. Capture only; no judgement.
- Verification step: files exist at the expected paths, identify the post-C3 build, and match the
  documented resolution.
- Obvious follow-ons: WP-E4a, WP-E4b, WP-E4c.

### Work package: WP-E4a fresh post-fix orientation review

- Owner: fresh `image_evaluator`, different from WP-E1, WP-E2a/E2b, WP-E3, WP-E4b, every
  implementer, and the M6 reviewer.
- Touch points: `docs/active_plans/reports/perspective_orientation_review_a.md`.
- Depends on: WP-E3.
- Acceptance criteria: independently review every post-C3 capture, record a concrete verdict for
  each mode/state, and pass only if every settled pin has a right-side-up final presentation.
- Verification step: report exists with all nine verdicts and screenshot evidence.

### Work package: WP-E4b fresh post-fix orientation review

- Owner: a second fresh `image_evaluator`, different from every owner excluded from WP-E4a.
- Touch points: `docs/active_plans/reports/perspective_orientation_review_b.md`.
- Depends on: WP-E3.
- Acceptance criteria: independently review the same post-C3 captures for final orientation,
  readability, and no settlement flip; make no implementation edits.
- Verification step: report exists with all nine verdicts and screenshot evidence.

### Work package: WP-E4c reconcile post-fix orientation evidence

- Owner: `architect`, different from all capturers, reviewers, and implementers.
- Touch points: `docs/active_plans/reports/perspective_orientation_acceptance.md`.
- Depends on: WP-E4a, WP-E4b.
- Acceptance criteria: pass M6 only when both fresh reviewers pass every settled state. Any failure
  returns to the C3 owner, then requires a new capture and two new fresh reviewers; neither an
  initial E2 review nor an E4 reviewer may be recycled.
- Verification step: report identifies the post-C3 manifest, both reviews, and each mode/state
  verdict.

### Work package: WP-G1 publish the configurable-frame contract

- Owner: accepted and frozen; no active implementation owner.
- Touch points: `src/game/contracts.ts`, `src/game/match.ts`, `src/game/scoring.ts`, focused tests.
- Depends on: none.
- Acceptance criteria: introduce one bounded integer `bowls_per_frame` in the match/setup contract;
  frame progression and generalized score calculation consume it rather than a hidden literal.
  This one shared contract defines supported `B` bounds as integers 1 through 5 and is imported by
  setup, reducer, scoring, display, and save validation. For B=2, frames 1--9 preserve classic
  strike/spare behavior: a strike closes the frame early and the tenth uses conditional fill bowls.
  For B!=2, frames 1--9 permit up to B bowls and close early when a rack is cleared, resetting a
  fresh rack for a later available bowl; the tenth records exactly B+1 total bowls and likewise
  resets after clears as needed. Super frames use numeric pinfall, not strike/spare bonuses.
- Verification step: focused match/scoring tests including two bowls and at least one non-default
  value, with explicit ninth-to-tenth transition coverage.
- Obvious follow-ons: WP-G2 through WP-G4 consume this released contract.

### Work package: WP-G2 expose and display the frame setting

- Owner: accepted and frozen; no active implementation owner.
- Touch points: `src/app/setup.tsx`, `src/app/game.tsx`, `src/game/score_display.ts`, style/tests.
- Depends on: WP-G1.
- Acceptance criteria: setup exposes the supported range with a clear current value; active game and
  score display explain the selected frame length and tenth-frame bonus bowl without claiming that
  every mode is regulation bowling. Keyboard and pointer operation remain usable.
- Verification step: setup/score-display tests and a focused Playwright setup-to-game path.
- Obvious follow-ons: none.

### Work package: WP-G3 persist and migrate frame settings

- Owner: accepted and frozen; no active implementation owner.
- Touch points: `src/save/contracts.ts`, `src/save/settings.ts`, `src/save/save_file.ts`,
  `src/save/load.ts`, save tests.
- Depends on: WP-G1.
- Acceptance criteria: save format/version handling persists the setting, defaults legacy saves to
  two bowls, validates bounds, and never lets malformed saved data create an invalid tenth-frame
  allowance.
- Verification step: focused load/save tests for round trip, legacy default, and invalid input.
- Obvious follow-ons: none.

### Work package: WP-G4 independently review frame integration

- Owner: accepted independent review complete; no active owner.
- Touch points: no implementation file; report under `docs/active_plans/reports/` only if findings
  require a record.
- Depends on: WP-G1, WP-G2, WP-G3.
- Acceptance criteria: audit reducer/scoring/UI/save diffs against the shared 1--5 contract, run
  focused tests, and confirm B=2 classic early/conditional-fill behavior plus B!=2 early clear and
  reset semantics with exactly B+1 tenth-frame bowls. Findings return to the owning implementer; a
  fresh reviewer rechecks any fix.
- Verification step: listed focused tests and diff evidence in handoff.
- Obvious follow-ons: WP-F1 updates rules documentation.

### Work package: WP-F1 documentation close-out

- Owner: `maintainer`.
- Touch points: `docs/GEOMETRY_MODEL.md`, `docs/GAME_RULES.md`, `docs/CHANGELOG.md`, and the
  developer-tool documentation in `tests/TESTS_TYPESCRIPT_README.md`; then
  `docs/active_plans/active/` and `docs/archive/` for plan archival.
- Depends on: M3, M4, M5, M6, and M7.
- Acceptance criteria: see `## Documentation close-out requirements`.
- Verification step: `pytest tests/`, including `tests/test_markdown_links.py`.
- Obvious follow-ons: none.

## Acceptance criteria and gates

- **Strike gate.** A pocket line as defined in WP-D2 strikes the 10-pin rack; a centered line does
  not reliably strike; pin conservation holds on all six racks. Propagation is **required**: rear-row
  pins must show pin-contact first-contact provenance, and propagation depth must reach the final
  rack row. The *proportion* of pins falling by pin contact is recorded as evidence rather than
  gated at a threshold, because no derivation supports a specific cutoff. A raw comparison of total
  pin-to-pin against total ball-to-pin contacts is not the gate.
- **990-pin playability, measured not pre-bounded.** Record the benchmark before M3, then compare
  each relevant physics change against it. Investigate any regression large enough to affect
  gameplay or settling; do not impose a numerical tolerance chosen before the evidence. Rapier runs
  through WASM and 990 simple 2D bodies that sleep once settled is a reasonable intended workload,
  so treat this as regression detection rather than as a ceiling the plan is pressed against. The
  earlier figures in `docs/active_plans/regulation_lane_rebuild_plan.md` are useful reference points
  for what "material" looks like, not thresholds this plan inherits.
- **Superhuman 990 gate.** The diagnostic proves the 990 collider is 40.0 +/- 0.1 lbm, then the
  published maximum legal power/spin and bounded through-pin drive carry a representative deterministic
  launch to the backstop. The report includes drive-disabled evidence and force in lbf/world units,
  speed/position/settle data. A missing backstop arrival, non-finite state, hidden timeout, or the
  current roughly 640 lb effective mass fails this gate.
- **Camera composition gate.** The durable camera-guided/hybrid depth transform preserves finite
  clipping, depth ordering, ball recession, stable horizon, and unchanged simulation/world scale.
  First, a fresh reviewer selects the believable 105-pin aiming composition from the 3%, 6%, and
  10% rear-row-reveal samples. Before propagation, each mode derives framing from complete-rack
  bounds, fills the actual canvas endpoints first, and blocks if lane+rack+ball span is below 90%;
  the practical review target is crown/backstop about 4% from top and aiming-ball bottom/near edge
  about 96% from bottom. Then captures of the actual 1600 x 1000 (16:10) play canvas cover 10, 105,
  and 990 at aiming, mid-roll, partial-rack, and settled states; every complete rack/pin and aiming
  ball is inside the canvas and survivor count cannot change framing. Two independent reviewers pass
  all states on believable, readable, compact-score/no-wasted-lane composition, rejecting visible
  empty row gaps or separated stacks, a narrow centered lane/rack island, clipped racks, extreme
  stretched rows, large unexplained play-area bands, or a low-occupancy scene; neither is the
  capturer or an implementer. Their independent visual acceptance is authoritative. Projection
  assertions and reported diagnostic values are non-regression guardrails, never a rear-row-reveal
  percentage substitute for visual judgement.
- **Settled-orientation gate.** The post-C3 nine captures and renderer tests show no upside-down pin
  final state. WP-E4a and WP-E4b are fresh independent reviewers; physics angle may remain truthful;
  visual canonicalization must be documented and cannot mutate the simulation to satisfy this gate.
- **Configurable-frame gate.** The shared 1--5 contract remains green: B=2 keeps classic early
  strike closure and conditional tenth fills, while B!=2 has early clear/reset frames 1--9 and
  exactly B+1 tenth bowls. Reducer/scoring/setup/save tests cover both paths.
- **Regression gate.** `./check_codebase.sh` passes. M3 reruns the named deterministic diagnostics
  without any physics source change; a failure blocks close-out and starts a separately approved
  diagnosis rather than a retune in this plan.
- **Integration gate.** `./run_playwright_tests.sh` passes.
- **Independent review gate.** A reviewer reconciles the frozen M3 report/hash evidence against the
  generated diagnostics without approving a physics change. Two separate `image_evaluator` reviewers
  own visual judgement, separate from capturer and coders; the completed frame-rule review remains
  frozen unless regression evidence requires a new review.

## Test and verification strategy

Three metrics recur and are defined once.

- **Contact occurrence**: whether a pin-to-pin contact happens at all. Observed from Rapier collision
  events and independent of the fall rule, so it separates a momentum problem from a fall-detection
  problem without changing anything.
- **Propagation depth**: the deepest rack row reached by a contact chain originating from a pin
  rather than the ball. Measures reach, which pinfall count does not.
- **Fallen-set shape**: lateral spread of fallen pins by row depth. Because the 8.5 in ball exceeds
  the 7.234 in gap, a ball plowing a deep rack contacts many pins directly in a narrow channel. A
  channel indicates bulldozing; a set widening with depth indicates propagation. Independent of the
  fall threshold, so it is robust to the E2 artifact, and it checks the changelog's 359-of-990 result
  against the bulldozing reading.
- **Backstop reach**: ball centre crosses the published backstop plane before settle/timeout, with
  finite speed and a retained diagnostic trace. This distinguishes a completed superhuman roll from
  a score/result path that simply gives up on a stalled ball.
- **Projected row layering**: the exposed portion of the next rendered row, row ordering, and whether
  adjacent projected row envelopes leave a visible empty gap. Rear-row reveal is reported relative
  to local projected pin-row height. The 3%, 6%, and 10% samples are reviewed on the actual 105-pin
  aiming canvas; the selected result is propagated only if it stays believable without losing the
  aiming region or wasting the play canvas.

Test placement follows `tests/TESTS_TYPESCRIPT_README.md`: Node unit tests are `tests/test_*.mjs`
run by `./check_codebase.sh` through `node --import tsx --test`; browser tests live under
`tests/playwright/`; `pytest tests/` covers repository hygiene only. No pytest file is added for
TypeScript behavior. Assertions follow `docs/PYTEST_STYLE.md` in spirit: behavior and invariants,
not tuned constants, collection sizes, or hardcoded defaults.

- Behavioral regression: `node --import tsx --test 'tests/test_*.mjs'`.
  `tests/test_regulation_physics.mjs` asserts behavior rather than constants and should pass
  unchanged.
- Performance: `node devel/run_simulation_benchmark.mjs`, evaluated against the performance gate.
- Visual: WP-E1 captures, WP-E2a and WP-E2b independent judgements, WP-E2c reconciliation, then
  post-C3 WP-E3 captures, fresh WP-E4a/E4b orientation reviews, and WP-E4c reconciliation.
- Hygiene: `pytest tests/` before close-out.
- Failure semantics: a failed M3 regression blocks close-out and requires a separately approved
  diagnosis; it cannot reopen historical M1/M2 or WP-A1--WP-A6. A failed composition, orientation,
  or frame gate returns only to its responsible non-physics implementation owner and blocks M8.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Historical evidence falls outside every anticipated branch | Closed historical risk | M2 statement did not match a branch | `architect` | Preserved as investigation context; it cannot reopen physics under this plan |
| Frozen cascade behavior regresses | High: accepted physics no longer holds | WP-A7 regression fails | `architect` | Block close-out and obtain separately approved physics diagnosis; do not retune here |
| Plan constants copied as requirements | Medium: today's guess becomes a contract | A patch sets a value without deriving it | `reviewer` | Numeric targets are hypotheses with derivation rules; the review gate checks derivation |
| Historical strike gate misread as a tuning target | High: frozen behavior is reopened | Any request to edit physics from historic M1/M2 evidence | `architect` | Historical-package boundary and WP-A7's edit prohibition; require separate approval for diagnosis |
| 990 playability regression | Medium: large modes degrade | WP-A7 benchmark moves materially against the recorded baseline | `architect` | Record the failure and block close-out; do not adjust force, mass, spin, or drive in this plan |
| Rack clips outside the 16:10 play canvas | High: 105/990 game is visually empty | Attached 105-mode screenshot shows no pins because the rack is above canvas | `coder` | WP-B3/B5 require complete rack/pin bounds in every 16:10 aiming/mid-roll/settled capture |
| Perspective regresses a mode | Medium: a mode gets worse | Any capture fails WP-E2a or WP-E2b | `image_evaluator` | All three modes and states judged, not only the primary |
| Historical capsule decision is reopened | Medium: unreviewed simulation change | A future task treats WP-A5 as actionable | `architect` | WP-A5 is non-dispatchable; create a separately approved physics diagnosis if needed |
| 990 drive evidence disagrees with artifacts | High: acceptance evidence is ambiguous | WP-A7 finds report/hash or backstop mismatch | `tester` | Reconcile artifacts or block close-out; never change drive behavior in WP-A7 |
| Elevated camera hides aiming, creates empty row gaps, makes a small lane/rack island, or stretches rows | Medium: unreadable play | Diagnostics pass but a 105 aiming bakeoff or later capture fails visual composition | `coder` | Start with three 105 aiming samples, select by independent screenshot review, then test all three lane states in every mode; screenshot reviewers are final authority |
| Chrome/control layout consumes the recovered lane area or becomes unusable | High: camera cannot solve the actual 16:10 composition | Top chrome exceeds 12%, controls remain in a bottom deck, lane is <75% viewport width, or score/control focus overlaps | `coder` | WP-B6 uses the bounded desktop side panel, merged top chrome, and responsive fallbacks; it measures the actual canvas before rerunning solver/captures and WS-E independently judges every state |
| Camera fills too little vertical canvas | High: exaggerated lane still feels small and wastes play space | Any complete-rack fixture/capture has lane+rack+ball span <90%, or survivor loss moves the framing | `coder` | Full-rack-derived framing is state-independent; WP-B5 and WP-E1 block the result, then require solver rerun and fresh all-mode captures/reviews |
| Reviewers converge on the same mistaken reading | Medium: false visual acceptance | Shared reviewer/capturer/implementer ownership | `architect` | Two fresh independent reviewers, separate reports, and re-review after any fix |
| Frame setting drifts across boundaries | High: incorrect game result or save | Different reducer, UI, or save interpretation | `reviewer` | Publish WP-G1 contract first; independently audit merged work |
| Upside-down final pin returns | Medium: implausible settled deck | Fallen axis crosses visual unsafe range | `coder` | Renderer canonicalization plus test/capture gate across modes |

## Documentation close-out requirements

- Active plan: file the working copy under `docs/active_plans/active/` with a snake_case name;
  `git mv` to `docs/archive/` at close.
- `docs/CHANGELOG.md`: one dated block in the canonical subsection order. Record the M1 baseline
  numbers and every hypothesis outcome under "Decisions and Failures", including any hypothesis this
  plan ranked highly that measurement refuted, and whether the capsule survived.
- `docs/GEOMETRY_MODEL.md`: rewrite "Lane marks and projection" and "Centered shot camera" for the
  camera-guided/hybrid depth transform, including any bounded nonlinear exaggeration, how eye
  placement scales with lane width while pin scale stays fixed, and the 16:10 complete-rack bound;
  rewrite "Pin collision shapes" for the mass-normalized fall rule, the capsule outcome, and the tip
  contract if M6 lands.
- `docs/GAME_RULES.md`: document the selectable bowls-per-frame range, ordinary two-bowl behavior
  as a specialization rather than a universal law, and the exact tenth-frame extra-bowl rule.
- `docs/GEOMETRY_MODEL.md` and `docs/GAME_RULES.md`: record the measured 16:10 play-canvas/chrome
  arrangement if it materially changes layout behavior, including the responsive fallback and the
  rule that camera verification uses actual canvas bounds rather than a fixed viewport assumption.
- `docs/GEOMETRY_MODEL.md` and developer tool documentation: state the elevated-camera row-layering
  diagnostic, the 105 aiming bakeoff outcome, 16:10 rack-visibility and canvas-occupancy diagnostics, the intentional superhuman 990
  ball/drive model, actual collider-mass verification, force units and conversion formulas, its
  diagnostic data, and the distinction between physical fallen orientation and upright-safe rendered
  orientation.
- `tests/TESTS_TYPESCRIPT_README.md`: extend the existing "Deterministic strike matrix" section with
  the permanent `--sweep` mode and the propagation metrics, so the diagnostic stays a maintained
  tool rather than decaying into single-use scaffolding.
- State plainly in the changelog that planar physics was already present and that the renderer moved
  from a faux-perspective trapezoid to a camera projection, so the record neither implies an
  architectural rewrite nor understates the rendering change.
- Repository-rule conformance for every artifact this plan creates: working reports go under
  `docs/active_plans/reports/` with snake_case names per `docs/REPO_STYLE.md`; new source is
  snake_case TypeScript under `src/`; Node unit tests are `tests/test_*.mjs`; no `tests/fixtures/`
  directory is created, since that needs explicit human sign-off; no test opens a network
  connection, sleeps, or writes outside `tmp_path`; no pytest file is added for TypeScript
  behavior. Git operations stay with the human: the agent updates `docs/CHANGELOG.md` for review and
  runs no committing, branching, or resetting. The one exception is `git mv` for plan archival,
  where preserving file history is the point.

## Execution-time decision rules

These are decided procedures for the remaining work. Historical M1/M2 and WP-A1 through WP-A6
decisions are recorded for audit, not reopened as executable rules.

- **Historical M3 branch rationale** (completed): H1 informed the mass declaration, H2 the
  mass-invariant fall rule, H3 energy retention, H4 activation bookkeeping, and H5 the capsule
  decision. This is an explanation of the frozen implementation, not authority to reapply, vary,
  or retune any branch.
- **Frozen physics evidence** (`tester`): reconcile the existing 40 lbm/drive report and hashes
  against regenerated deterministic evidence. WP-A7 is the sole M3 follow-up. Do not edit a
  physics, simulation, diagnostic, or physics-test file; do not change mass ratio, energy
  retention, power, spin, drive, damping, collision behavior, or the regression tests in this plan.
  Any disagreement stops close-out for a separately approved diagnosis.
- **Camera placement** (`coder`, informed by WP-B0): calibrate the 105-pin aiming rack first using
  candidate profiles whose target metadata includes 3%, 6%, and a real 10% pin-height rear-row
  reveal, derived from measured rack/canvas geometry rather than arbitrary multiplier settings.
  Capture and independently review the actual 10% candidate before selection, then use the
  independently selected composition as the starting transform for 10 and 990. Raise, pitch down,
  and pull back the eye only as needed to
  keep each wide-mode aiming region on screen while preserving dense, believable row layering. Pin
  and rack physical scale never change. Use the available 16:10 play canvas rather than shrinking
  the lane/rack into a centered island; diagnostics prevent clipping and separated stacks while
  independent screenshots decide the final composition.
- **16:10 chrome placement** (`WS-H`): the prior compact bottom-deck layout is rejected. Replace it
  with the measured desktop side-panel layout before M4: 300--360 px controls, lane >=75% viewport
  width and full remaining content-row height, and merged header/scoring chrome <=120 px at 1600 x
  1000. Camera tests use only this newly measured canvas rectangle. Any later chrome change is a new
  layout revision: it must be measured, then the 105 candidate bakeoff and all dependent captures
  receive fresh independent review before the camera can be accepted.
- **M6 go/no-go** (`architect`, from independent WP-E2a/E2b evidence in WP-E2c):
  - No-go if the captures show the fall already reads clearly once size varies with distance. Smooth
    tip animation is then out of scope, but mandatory WP-C3 still prevents an upside-down settled
    presentation and the decision is recorded in the changelog.
  - Go if the fall still reads as abrupt or confusing. WP-C1 and WP-C2 then run in full: publish tip
    progress, update every stride reader, add the base-to-crown draw path, then run mandatory C3,
    WP-E3 captures, WP-E4a/E4b fresh reviews, and the browser tests.

Every scope question this plan raised is now classified as in scope or as a non-goal. Nothing is
left open for a human to resolve before dispatch.

## Implementation close-out (2026-08-02)

All implementation milestones are complete. This plan remains in `docs/active_plans/` by current
direction; it has not been archived or moved.

| Milestone | Completed outcome | Verified evidence |
| --- | --- | --- |
| M3 | Frozen physics evidence reconciled without retuning. | The 990 report hashes match regenerated backstop-probe and benchmark artifacts; the 990 ball is 40 lb, supports power 60 and spin 4, and its contact-gated forward drive/anti-stall reaches the backstop. |
| M4 | The desktop layout is frozen at 116 px of header-plus-score chrome. Controls occupy a desktop side panel, leaving a 1248 x 884 lane canvas at 1600 x 1000. | The selected `open` camera profile uses a measured 10% rear-row reveal (90% overlap). Complete-rack framing places the rack crown at 4%, aiming-ball bottom at 95%, and the lane+rack+ball span at 91%. |
| M5 | The selected camera remains invariant through the final 10-, 105-, and 990-pin aiming, mid-roll, and settled-result captures. | All nine captures retain the 1248 x 884 canvas, 4%/95% anchors, 91% occupied span, and 10% reveal. Independent screenshot reviews accepted composition, large-rack readability, orientation, and settled-result state semantics. |
| M6 | Fallen pins use crown-up visual canonicalization without changing truthful physics axes. | A real settled-pin integration test verifies finite canonical axes, preserved undirected axis, and no render-side mutation; independent final orientation review found no upside-down final pin. |
| M7 | `bowls_per_frame` is a persistent bounded match setting from 1 through 5. | B=2 retains classic early-strike/conditional tenth-fill semantics; other values use the shared super-bowling flow, and frame ten always permits exactly B+1 bowls. |
| M8 | Behavior, geometry, rules, capture tooling, and changelog documentation were refreshed. | Camera bakeoff and final state-matrix reports record the selected composition, measurements, reviewer decisions, and reproducible artifacts. |

Final repository gates passed:

- `./check_codebase.sh`: exit 0; Node tests 158/158.
- `./run_playwright_tests.sh`: exit 0; Playwright tests 31/31.
- `git diff --check`: exit 0.
