# Plan: Repair planar pin collisions and add camera-based perspective

## Context

**User direction, source of truth.** Preserve simple planar physics, translate the results into a
convincing bowler-perspective view, make pin-to-pin cascades capable of producing strikes, keep
large racks impressive rather than shrunken, and prefer durable design repairs over symptom-level
patches. Where this plan and that direction disagree, the direction wins.

The proposed architecture is already the repository's architecture. `src/simulation/world.ts:214`
builds `new RAPIER.World({ x: 0, y: 0 })`: Rapier2D, zero gravity, overhead plane, with the ball as
a circle, standing pins as circles, fallen pins as capsules, and the lane as static colliders. So
the simulation model needs confirmation, not replacement.

The renderer is a different case, and the wording matters. `src/render/game_renderer.ts:233` draws a
**faux-perspective trapezoid**: a converging lane silhouette with linear depth interpolation and
fixed-pixel body sizes. That is a perspective *appearance*, not a perspective *projection*. This
plan replaces it with a **camera-based perspective projection** in which screen position and screen
size both derive from one perspective divide. Introducing that camera is new work; the converging
look is not.

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
- Make large racks read as impressive depth rather than as a shrunken flat grid.
- Leave intact the design property that a centered shot does not reliably strike.

## Design philosophy

Lead with **use the scientific method**, then **fix the design, not the symptom**. The second cannot
be applied to defect 1 until the fault is known: a `setDensity` call is not by itself proof that the
dynamics are wrong, because body type, collider attachment, derived inertia, contact settings, and
the sleeping set can each dominate. M1 measures before M3 changes anything permanent.

Defect 2 needs no diagnosis; bodies are drawn at fixed pixel sizes. Adding a size-versus-depth ramp
onto the trapezoid would treat the symptom. One camera makes correct sizing, convergence, and
near-fast motion a single model. Continuing to tune the trapezoid was rejected because the flatness
is structural.

Two repairs are design defects independent of the diagnosis, and are separated here from the
cascade question so the distinction is not blurred:

- **The raw-impulse fall threshold is replaced regardless of M1's outcome.** Its configured meaning
  changes with collider mass, so it cannot be reasoned about or safely retuned. M1 determines
  whether that flaw is *also* the binding cause of the cascade failure; it does not determine
  whether the flaw is worth fixing.
- **Collider mass is declared in the units its config keys claim, regardless of M1's outcome.** The
  *value* of the resulting ratio is what M1 informs.

Every other numeric target is an **initial hypothesis with a derivation rule**, never a requirement.

- Evidence strategy for uncertain methods: M1 instruments without changing behavior. M2 runs
  temporary, reverted experiments. M3 makes permanent repairs along branches already defined in
  `## Execution-time decision rules`, one variable per patch, each re-measured.

## Scope

- Instrument the collision path and record an unchanged baseline.
- Run controlled, reverted experiments that separate fall detection from momentum propagation.
- Make the permanent physics repairs the evidence selects, along pre-defined branches.
- Replace the faux-perspective trapezoid with a camera-based perspective projection.
- Adapt camera placement per rack mode to preserve the aiming region and lane readability.
- Draw bodies as base plus crown, and conditionally animate pin tipping.
- Update `docs/GEOMETRY_MODEL.md` and `docs/CHANGELOG.md`.

## Non-goals

- Move physics into three dimensions or add gravity.
- Replace Rapier2D or introduce a second simulation model.
- Change the four player controls, the aim limits, or the scoring rules.
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

Two files are written by more than one workstream and are sequenced, not shared.
`src/simulation/world.ts`: WP-D1 adds read-only accessors, then WS-A owns it through M3, then WP-C1
edits only its snapshot region. `src/render/game_renderer.ts`: WP-B2 owns it through M4, then WP-C2
edits only its pin command. No two owners hold a file concurrently.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Review boundary |
| --- | --- | --- |
| M1 / WS-D | `devel/probe_strike_matrix.mjs`, read-only accessors in `world.ts` | No behavior change; diff must not touch dynamics |
| M2 / WS-X | temporary edits to `physics.ts`, `pin_state.ts`, `world.ts` | Every edit reverted; nothing from M2 is committed as behavior |
| M3 / WS-A | `physics.ts`, `pin_state.ts`, collider and damping regions of `world.ts` | One variable per patch, each re-measured |
| M4 / WS-B | `src/render/projection.ts` (new), `game_renderer.ts`, `ball.ts`, `camera.ts`, `config/camera.ts` | Renderer only; simulation untouched |
| M5 / WS-E | `docs/screenshots/`, `artifacts/milestone/`, `docs/active_plans/reports/` | Capture and judgement owned by different agents |
| M6 / WS-C | `protocol.ts`, snapshot region of `world.ts`, `pins.ts` | Stride change reviewed with every reader |
| M7 / WS-F | `docs/GEOMETRY_MODEL.md`, `docs/CHANGELOG.md`, `tests/TESTS_TYPESCRIPT_README.md` | Docs only |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Instrumentation and baseline | Read-only diagnostics; define and record the launch sweep | Measure without perturbing |
| M2 | Controlled experiments | Temporary reverted changes E2 through E5 | Select the repair branch |
| M3 | Permanent physics repair | Pre-defined branches, one variable per patch | Cascades and a reachable strike |
| M4 | Camera implementation | Replace the trapezoid; per-mode eye placement; automated tests | Depth reads; large racks impress |
| M5 | Visual acceptance | Capture and independently judge all three modes | Defect 2 accepted; tip decision recorded |
| M6 | Tip presentation, conditional | Tip progress and a continuous pin draw | Runs only on a recorded "go" |
| M7 | Close-out | Contract, changelog, tool docs, archival | Record matches behavior |

### Milestone: M1 instrumentation and baseline

- Depends on: none.
- Deliverables: WP-D1, WP-D2, WP-D3.
- Done checks: the diagnostic reproduces identical physics fields across repeated runs at a fixed
  launch, with wall-clock and timing fields excluded from that comparison since they legitimately
  vary; the change contains no dynamics edit; the sweep definition is recorded before it is run.
- Entry criteria: none.
- Exit criteria: the E1 baseline table is published with every hypothesis marked supported, refuted,
  or undetermined.
- Parallel-plan ready: yes. M1 and M4 share no files and may run concurrently.

### Milestone: M2 controlled experiments

- Depends on: M1, for the baseline each experiment is measured against.
- Deliverables: WP-X1 through WP-X4.
- Done checks: every experiment reverted; each result recorded with the metric that decided it.
- Entry criteria: E1 baseline published.
- Exit criteria: a written statement selecting the M3 branches from
  `## Execution-time decision rules`.
- Parallel-plan ready: no. Each experiment perturbs shared physics state and must run alone.

### Milestone: M3 permanent physics repair

- Depends on: M2.
- Deliverables: WP-A1 through WP-A5, only those the M2 statement selects, then WP-A6.
- Done checks: the strike gate in `## Acceptance criteria and gates` passes, and WP-A6's durable
  test locks it so the regression class cannot silently return.
- Entry criteria: M2 exit statement written.
- Exit criteria: the behavioral strike gate passes, unit tests pass, and the 990-pin benchmark shows
  no material gameplay or settling regression relative to the recorded baseline.
- Parallel-plan ready: no. One variable per patch, each re-measured.

### Milestone: M4 camera implementation

- Depends on: none for implementation; WP-B0 reference sheet should land first as input.
- Deliverables: WP-B0 through WP-B4.
- Done checks: projected size decreases monotonically with depth; lane edges converge to one
  vanishing point; the horizon holds fixed across a shot; every world point the renderer draws,
  including the aiming ball at `y = -9`, projects to a finite on-screen value.
- Entry criteria: none.
- Exit criteria: `./check_codebase.sh` passes and the revised renderer tests pass. Visual judgement
  is deliberately **not** an exit condition here; it lives in M5, so this milestone cannot depend on
  work that depends on it.
- Parallel-plan ready: yes. WS-B and WS-D/WS-X/WS-A share no files.

### Milestone: M5 visual acceptance

- Depends on: M4 for the shipped camera, and M3 so the captured rolls show a real cascade.
- Deliverables: WP-E1 captures, WP-E2 judgement.
- Done checks: all three modes captured and judged by an owner who neither captured them nor wrote
  the projection; the M6 decision is recorded either way.
- Entry criteria: M4 exit criteria met.
- Exit criteria: defect 2 accepted in writing, and the M6 go/no-go recorded in
  `docs/active_plans/reports/perspective_visual_acceptance.md`.
- Parallel-plan ready: no. Judgement reads the captures.

### Milestone: M6 tip presentation, conditional

- Depends on: M5 for the decision, M4 for the camera draw path, M3 for a cascade worth showing.
- Deliverables: WP-C1, WP-C2. Both are skipped on a "no-go".
- Done checks: a pin rotates from vertical to horizontal over a bounded duration; upright and fallen
  pins share one sizing path.
- Entry criteria: WP-E2 records "go".
- Exit criteria: `./run_playwright_tests.sh` passes and WP-E1 captures are refreshed.
- Parallel-plan ready: no. WP-C2 reads the field WP-C1 writes.

### Milestone: M7 close-out

- Depends on: M3, M4, M5, and M6's recorded decision either way.
- Deliverables: WP-F1.
- Done checks: contract and changelog describe shipped behavior, including whether the capsule and
  the tip animation survived.
- Entry criteria: implementation milestones complete or explicitly closed.
- Exit criteria: `pytest tests/` passes, including the markdown link check.
- Parallel-plan ready: yes.

## Workstream breakdown

### Workstream: WS-D diagnostics

- Goal: measure without perturbing.
- Owner: `tester`.
- Work packages: WP-D1, WP-D2, WP-D3, and WP-A6 which lands after M3.
- Needs: nothing for WP-D1 through WP-D3; WP-A6 needs M3's shipped configuration.
- Provides: the baseline every later measurement is compared against, a permanent `--sweep` mode,
  and a durable test locking the cascade behavior once it exists.
- Review boundary, when modifying the repository: `devel/`, `tests/`, and read-only accessors only.

### Workstream: WS-X controlled experiments

- Goal: separate fall detection from momentum propagation, and test capsule necessity.
- Owner: `tester`, with `architect` reviewing the selection statement.
- Work packages: WP-X1 through WP-X4.
- Needs: WS-D instrumentation and baseline.
- Provides: the branch selection for WS-A.
- Review boundary, when modifying the repository: every change is temporary and reverted; nothing
  from this workstream is committed as behavior.

### Workstream: WS-A simulation dynamics

- Goal: make the permanent repairs the evidence selects.
- Owner: `expert_coder`.
- Work packages: WP-A1 through WP-A5.
- Needs: the WS-X selection statement.
- Provides: a cascade for WS-C to present.
- Review boundary, when modifying the repository: owns `physics.ts`, `pin_state.ts`, and the
  collider, damping, and activation regions of `world.ts` through M3.

### Workstream: WS-B render projection

- Goal: one camera model carrying position, size, convergence, and framing.
- Owner: `coder`, with WP-B0 owned by `image_evaluator` and WP-B4 by `tester`.
- Work packages: WP-B0 through WP-B4.
- Needs: nothing from WS-A; consumes published snapshot positions only.
- Provides: the projection API including the base-and-crown interface WS-C needs.
- Review boundary, when modifying the repository: owns `src/render/` and `src/config/camera.ts`
  through M4.

### Workstream: WS-C tip presentation

- Goal: make the fall legible without adding physics state.
- Owner: `coder`.
- Work packages: WP-C1, WP-C2, conditional on WP-E2.
- Needs: M3 complete, so WS-A has released `world.ts`; and M4 complete, so WS-B has released
  `game_renderer.ts` with the base-and-crown draw path in place.
- Review boundary, when modifying the repository: `protocol.ts`, the snapshot region of `world.ts`,
  and `src/render/pins.ts`.

### Workstream: WS-E visual acceptance

- Goal: judge defect 2 and decide M6. Capture and judgement are deliberately different owners.
- Owner: `playwright_operator` captures (WP-E1); `image_evaluator` judges (WP-E2).
- Work packages: WP-E1, WP-E2.
- Needs: M4 complete for the camera, M3 complete so the captured rolls show a real cascade.
- Provides: the written acceptance of defect 2 and the recorded M6 decision.
- Review boundary, when modifying the repository: `docs/screenshots/` and report files only.

### Workstream: WS-F documentation

- Goal: leave the repository record matching shipped behavior.
- Owner: `maintainer`.
- Work packages: WP-F1.
- Needs: M3, M4, M5, M6 outcomes.
- Review boundary, when modifying the repository: `docs/` only.

## Work packages

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

### Work package: WP-A1 declare collider mass as mass

- Owner: `expert_coder`.
- Touch points: `src/config/physics.ts`, `world.ts` (`create_pin_collider`, `create_ball_body`).
- Depends on: WP-X4. Runs unconditionally; it is a design repair, and H1 informs only the ratio.
- Acceptance criteria: both colliders declare mass in the units their config keys claim; the ratio
  starts from regulation equipment proportions and moves only as far as the strike gate requires;
  `create_fallen_pin_collider` still preserves the outgoing collider mass across a swap, if the
  swap survives.
- Verification step: re-run the WP-D1 diagnostic and record the delta on every H1 metric.
- Obvious follow-ons: check `get_pin_collision_profile` test coverage for hardcoded mass values.

### Work package: WP-A2 make the fall threshold mass-invariant

- Owner: `expert_coder`.
- Touch points: `src/config/physics.ts`, `src/simulation/pin_state.ts`, both
  `setContactForceEventThreshold` sites in `world.ts`.
- Depends on: WP-A1. Runs unconditionally; see `## Design philosophy` for why this is independent of
  whether H2 is the binding cause.
- Acceptance criteria: the rule compares a mass-normalized quantity, a velocity change in ft/s,
  rather than a raw impulse; the Rapier event gate derives from the same value so the filter and the
  game rule cannot drift apart; the value follows the rule in `## Execution-time decision rules`.
- Verification step: WP-D1 diagnostic re-run; delta recorded.
- Obvious follow-ons: none.

### Work package: WP-A3 tune energy retention

- Owner: `expert_coder`.
- Touch points: `src/config/physics.ts`, `world.ts` (`create_pin_body`,
  `replace_with_fallen_collider`).
- Depends on: WP-A2. Conditional on H3 being supported.
- Acceptance criteria: restitution and pin linear damping tuned individually, one patch each, so a
  struck pin can cross the 7.234 in gap while deadwood still settles; if damping is split by
  standing versus fallen state, the fallen value is applied where the fallen angular damping already
  is; the config comment records the effective pair restitution under Rapier's combine rule.
- Verification step: `node devel/run_simulation_benchmark.mjs` on the 990 rack against the recorded
  baseline, evaluated against the performance gate.
- Obvious follow-ons: if settling slows, raise `get_settle_max_seconds` rather than re-damping.

### Work package: WP-A4 repair activation bookkeeping

- Owner: `expert_coder`.
- Touch points: `world.ts` (`activate_pin`, `update_active_pins`, activation index).
- Depends on: WP-A2. Conditional on H4 being supported.
- Acceptance criteria: a pin receiving a qualifying contact is evaluated by the fall rule regardless
  of how it was woken; the once-per-pin activation query protecting 990-rack cost is preserved.
- Verification step: WP-D1 diagnostic plus the 990 benchmark.
- Obvious follow-ons: none.

### Work package: WP-A5 retain or remove the capsule

- Owner: `expert_coder`.
- Touch points: `world.ts` (`replace_with_fallen_collider` and callers), `src/config/lane.ts`.
- Depends on: WP-A3 and WP-A4 where they run.
- Acceptance criteria: the capsule is retained only if WP-X4 recorded at least one of its named
  improvements. If circles alone pass the strike gate, the shape transition is removed rather than
  carried unused, and `fallen_pin_length` is retired with it. **The fallen-axis snapshot field is
  decided separately**, not automatically: this plan states that visual tipping is independent of
  collision shape, so a stable visual fall direction may still be wanted with circular physics. The
  package first determines whether `fallen_axis_angle` has a renderer consumer that survives capsule
  removal, and if so re-sources it, for example from pin velocity at the moment of the fall, rather
  than deleting it and stranding M6.
- Verification step: full sweep re-run; strike gate passes in the shipped configuration; if the
  field is retired, no renderer or benchmark reader still references it.
- Obvious follow-ons: `docs/GEOMETRY_MODEL.md` "Pin collision shapes" needs rewriting either way.

### Work package: WP-A6 lock cascade behavior in a durable test

- Owner: `tester`.
- Touch points: `tests/test_regulation_physics.mjs`, or a sibling `tests/test_pin_cascade.mjs`.
- Depends on: the strike gate passing in WP-A5's shipped configuration.
- Acceptance criteria: a permanent Node test locks the two properties this plan exists to create,
  so the class of regression cannot silently return. It asserts that a pocket line knocks down more
  pins than a centered line at the same power, and that the pocket line reaches the rear row through
  pin-contact provenance. The launch is chosen from the **robust interior** of the sweep's passing
  region rather than its marginal edge, so ordinary retuning does not flip it. Following
  `docs/PYTEST_STYLE.md`, it asserts behavioral properties and an ordering, not an exact pin count,
  a tuned constant, or a collection size. Setup is inline, it runs offline with no sleeps, and it
  covers two rolls so it stays fast.
- Verification step: `node --import tsx --test 'tests/test_pin_cascade.mjs'`, and confirm it fails
  when the fall threshold is temporarily restored to its pre-repair form.
- Obvious follow-ons: report propagation depth and fallen-set shape from
  `devel/run_simulation_benchmark.mjs` as well, so future physics work sees cascade health beside
  cost rather than cost alone.

### Work package: WP-B0 many-pin camera reference sheet

- Owner: `image_evaluator`.
- Touch points: `docs/active_plans/reports/many_pin_camera_reference.md`.
- Depends on: none.
- Acceptance criteria: a short reference sheet drawn from publicly available screenshots or footage
  of an existing many-pin bowling game, recording horizon position as a fraction of frame height,
  near-lane visibility at the player's feet, how much of the rack is on screen, apparent pin scale
  at the front and back of the rack, and how the framing differs between the standard and many-pin
  modes. Sources cited. Where a detail cannot be established from available material, it is recorded
  as unknown rather than inferred.
- Verification step: the sheet exists with sources and feeds WP-B3's placement decisions.
- Obvious follow-ons: none.

### Work package: WP-B1 inspect conventions and add the projection module

- Owner: `coder`.
- Touch points: `src/render/projection.ts` (new), `tests/test_projection.mjs` (new).
- Depends on: none.
- Acceptance criteria: begins with a written inspection of existing camera conventions covering axis
  directions, the `lane_near_y: -10` near bound, the aiming ball drawn at `y = -9` behind the foul
  line, near clipping, points behind the eye, and what a zero height means; equations are fixed only
  after that inspection. The module implements a perspective divide whose exact form follows from
  it. Near clipping and points behind the eye have defined, tested behavior. The API accepts a body
  as a base point plus a crown, not a single centre, and covers projected width, depth ordering, and
  clipping. Pure and unit-testable. New tests are Node `.mjs` under `tests/`, per
  `tests/TESTS_TYPESCRIPT_README.md`; no pytest file is added for TypeScript behavior, and
  assertions target behavior rather than tuned constants per `docs/PYTEST_STYLE.md`.
- Verification step: `node --import tsx --test 'tests/test_projection.mjs'` asserting monotonic size
  falloff, a single vanishing point, and defined behavior at and behind the near bound.
- Obvious follow-ons: none.

### Work package: WP-B2 route renderer geometry through the camera

- Owner: `coder`.
- Touch points: `src/render/game_renderer.ts`, `src/render/ball.ts`.
- Depends on: WP-B1.
- Acceptance criteria: `project_point`, `project_lane_y`, and the `top_half_width` /
  `bottom_half_width` trapezoid are retired; every body is sized from its own depth; a pin draws as
  one segment from `(x, y, 0)` to `(x, y, 1.25)` and the ball's centre sits at `z = ball_radius` so
  it rests on the lane; the arrow depth expression `13 + (1 - abs(centered_board) / 16) * 3` is
  replaced by the arrows' true world position; depth sort uses base depth.
- Verification step: `./check_codebase.sh`, plus the revised renderer tests from WP-B4.
- Obvious follow-ons: the `clamp(..., 10, 64)` pin clamp and the `max(22, width * 0.045)` ball floor
  become dead; remove them rather than keeping them as a safety net.

### Work package: WP-B3 per-mode eye placement

- Owner: `coder`.
- Touch points: `src/render/camera.ts`, `src/config/camera.ts`.
- Depends on: WP-B2, WP-B0.
- Acceptance criteria: **pin physical scale and rack physical scale are identical in every mode**;
  only camera placement adapts. Eye height and setback scale with lane width so that at 990 pins,
  where the player stands on a 43 ft wide lane, the near lane edges and the aiming region remain on
  screen. Shot zoom runs through the camera so the horizon holds fixed; reduced motion keeps the
  composition and drops the zoom.
- Verification step: `node --import tsx --test 'tests/test_camera.mjs'` asserting that the aiming
  region stays within frame bounds at every supported mode. Visual judgement of the result happens
  later in M5 and is deliberately not a gate on this package, so M4 stays independently completable.
- Obvious follow-ons: none.

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
  recorded by WP-E2.
- Acceptance criteria: one float per pin, either a 0-to-1 progress or the fall time taken from the
  `roll_elapsed_seconds` the world already tracks, recorded at the physical transition; every stride
  reader updated including the benchmark renderer; `create_game_draw_commands` stays pure with no
  renderer-side memory.
- Verification step: `node --import tsx --test 'tests/test_contracts.mjs'`.
- Obvious follow-ons: none.

### Work package: WP-C2 draw a continuous base-to-crown pin

- Owner: `coder`.
- Touch points: `src/render/game_renderer.ts` pin command, `src/render/pins.ts`.
- Depends on: WP-C1, and M4 complete so WP-B2 has already routed the pin command through the camera
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

### Work package: WP-E1 capture the visual scenes

- Owner: `playwright_operator`.
- Touch points: `docs/screenshots/`, `artifacts/milestone/`.
- Depends on: M4 for the camera, M3 so the captured rolls show a real cascade.
- Acceptance criteria: 10-, 105-, and 990-pin captures at 1600 x 1000 via
  `./devel/capture_screenshots.sh`, covering aiming, mid-roll, and settled states. Capture only; the
  capturer records no judgement.
- Verification step: files exist at the expected paths and match the documented resolution.
- Obvious follow-ons: none.

### Work package: WP-E2 judge the captures and decide M6

- Owner: `image_evaluator`, explicitly a different owner from WP-E1 and from the WS-B coder.
- Touch points: `docs/active_plans/reports/perspective_visual_acceptance.md`.
- Depends on: WP-E1, WP-B0.
- Acceptance criteria: a written judgement covering whether the lane reads its full 60 ft, whether
  the ball visibly recedes, whether the 10-pin view sits at a usable scale, whether the 990 rack
  reads as a deep receding field rather than a flat grid, whether the aiming region near the foul
  line stays visible at 990, and how each compares to the WP-B0 reference sheet. It closes with an
  explicit M6 decision, recorded either way. See `## Execution-time decision rules` for the rule.
- Verification step: the report names the decision and the evidence for it.
- Obvious follow-ons: none.

### Work package: WP-F1 documentation close-out

- Owner: `maintainer`.
- Touch points: `docs/GEOMETRY_MODEL.md`, `docs/CHANGELOG.md`,
  `tests/TESTS_TYPESCRIPT_README.md`, `docs/active_plans/active/` then `docs/archive/`.
- Depends on: M3, M4, M5, and the M6 decision.
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
- **Per-patch gate.** `./check_codebase.sh` passes. In M3, the WP-D1 diagnostic re-runs after every
  single-variable change so each stays individually attributable.
- **Integration gate.** `./run_playwright_tests.sh` passes.
- **Independent review gate.** `reviewer` audits the M3 diff against the measurement log, confirming
  no constant changed without a matching measurement. `image_evaluator` owns the defect-2 judgement,
  separate from both the capturer and the coder.

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

Test placement follows `tests/TESTS_TYPESCRIPT_README.md`: Node unit tests are `tests/test_*.mjs`
run by `./check_codebase.sh` through `node --import tsx --test`; browser tests live under
`tests/playwright/`; `pytest tests/` covers repository hygiene only. No pytest file is added for
TypeScript behavior. Assertions follow `docs/PYTEST_STYLE.md` in spirit: behavior and invariants,
not tuned constants, collection sizes, or hardcoded defaults.

- Behavioral regression: `node --import tsx --test 'tests/test_*.mjs'`.
  `tests/test_regulation_physics.mjs` asserts behavior rather than constants and should pass
  unchanged.
- Performance: `node devel/run_simulation_benchmark.mjs`, evaluated against the performance gate.
- Visual: WP-E1 captures, WP-E2 judgement.
- Hygiene: `pytest tests/` before close-out.
- Failure semantics: a failed per-patch gate blocks the next change in that milestone; a failed
  strike or performance gate blocks M7; unexpected M1 or M2 evidence returns to `architect` under
  the escalation rule below.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Evidence falls outside every anticipated branch | High: M3 has no defined path | M2 statement matches no rule | `architect` | Branches cover all five hypotheses; a genuine miss escalates to `architect` for one bounded re-diagnosis rather than an open-ended replan |
| Mass and threshold corrected, cascades stay dead | High: cause is elsewhere | Strike gate fails after WP-A1 and WP-A2 | `expert_coder` | Per-patch re-measurement exposes this at the first patch |
| Plan constants copied as requirements | Medium: today's guess becomes a contract | A patch sets a value without deriving it | `reviewer` | Numeric targets are hypotheses with derivation rules; the review gate checks derivation |
| Strike gate adjusted after seeing results | High: the gate stops meaning anything | Sweep definition edited during M2 or M3 | `architect` | WP-D2 records the definition before WP-D3 runs |
| 990 playability regresses | Medium: large modes degrade | Benchmark moves materially against the recorded baseline | `expert_coder` | Baseline recorded before M3; regressions investigated on evidence rather than pre-bounded |
| Wide-rack near lane falls outside the frame | Medium: aiming unreadable at 990 | Perspective lands with a fixed eye | `coder` | WP-B3 scales eye height and setback with lane width; verified by the 990 capture |
| Perspective regresses a mode | Medium: a mode gets worse | Any capture fails WP-E2 | `image_evaluator` | All three modes judged, not only the primary |
| Capsule removed and later needed | Medium: rework | WP-A5 removes it on thin evidence | `architect` | Removal requires WP-X4 showing no clear improvement, on the identical sweep |
| Scope creep past the two defects | Medium: slow feedback | M6 work begins before WP-E2 records "go" | `architect` | M6 entry criteria are explicit and evaluator-owned |

## Documentation close-out requirements

- Active plan: file the working copy under `docs/active_plans/active/` with a snake_case name;
  `git mv` to `docs/archive/` at close.
- `docs/CHANGELOG.md`: one dated block in the canonical subsection order. Record the M1 baseline
  numbers and every hypothesis outcome under "Decisions and Failures", including any hypothesis this
  plan ranked highly that measurement refuted, and whether the capsule survived.
- `docs/GEOMETRY_MODEL.md`: rewrite "Lane marks and projection" and "Centered shot camera" for the
  camera model, including how eye placement scales with lane width while pin scale stays fixed;
  rewrite "Pin collision shapes" for the mass-normalized fall rule, the capsule outcome, and the tip
  contract if M6 lands.
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

These are decided procedures, not open questions. Each names its owner and its rule.

- **M3 branch selection** (`architect`, from the M2 statement):
  - H1 supported: WP-A1 corrects the mass declaration and retests. WP-A1 runs regardless; H1 informs
    only the target ratio.
  - H2 supported: WP-A2 replaces the raw-impulse rule and the event threshold together, in one
    patch, since a split would let the filter and the rule disagree. WP-A2 runs regardless; H2
    informs only whether it is also the binding cause.
  - H3 supported: WP-A3 tunes restitution and damping individually, one patch each.
  - H4 supported: WP-A4 repairs activation bookkeeping.
  - H5: WP-A5 retains the capsule only if WP-X4 beat WP-X3 on the identical sweep; otherwise it is
    removed along with `fallen_pin_length` and the fallen-axis field.
  - Evidence matching no branch: escalate to `architect` for one bounded re-diagnosis; do not tune.
- **Fall threshold value** (`expert_coder`): the lowest mass-normalized value at which the strike
  gate passes while a centered line still fails to strike, both read from the WP-D1 diagnostic.
- **Mass ratio and energy retention** (`expert_coder`): start from regulation equipment proportions,
  move only as far as the strike gate and the performance gate require, recording each step.
- **Camera placement** (`coder`, informed by WP-B0): compose the 10-pin rack at a usable scale with
  the foul-line ball fully visible, then raise and pull back the eye as lane width grows until the
  wide-mode aiming region is on screen. Pin and rack physical scale never change.
- **M6 go/no-go** (`image_evaluator`, in WP-E2):
  - No-go if the captures show the fall already reads clearly once size varies with distance. M6 is
    then out of scope: both reported defects are solved without expanding the snapshot protocol, and
    the decision is recorded in the changelog as a deliberate close.
  - Go if the fall still reads as abrupt or confusing. WP-C1 and WP-C2 then run in full: publish tip
    progress, update every stride reader, add the base-to-crown draw path, then re-run WP-E1
    captures and the browser tests.

Every scope question this plan raised is now classified as in scope or as a non-goal. Nothing is
left open for a human to resolve before dispatch.
