# Plan: Shot camera that travels with the ball into its own collision

## Context

The live shot camera advances monotonically in forward focus and zoom
(`src/render/camera.ts:251,255,270`), which fixed the earlier backward-jitter problem. It is still
confusing because the frame converges on a *rack-center pin-deck anchor* rather than on the shot the
player actually rolled, so the ball stops reading as the subject partway down the lane.

The evidence of record is `docs/LANE_MASTER_VIDEO_FINDINGS.md`. The source recordings are
local-only research material and are not repository inputs (`:42-44`), so that document -- not a
re-measurement of footage, and not an intuition about how a bowling camera should feel -- is the
authority this plan is built on. It also states plainly that its observations are references rather
than a specification (`:6-8`), so this plan treats each observation as a design constraint to be
satisfied by measurement, never as a numeric target to copy.

| Observation | Findings line |
| --- | --- |
| The resting view establishes the full lane and distant target before the ball appears | `:57` |
| The view pushes toward the pin deck **throughout ball travel** instead of waiting for impact | `:58` |
| The ball **grows substantially** on screen as the lane foreground drops out of view | `:59` |
| The closest view **holds the pin deck through the collision**, making individual reactions readable | `:60` |
| The camera returns to a wide establishing view **only after the outcome has been shown** | `:62` |
| Increasing screen size communicates forward travel as strongly as lane translation does | `:67` |
| The most energetic motion is concentrated near impact; the deck then stays visible long enough to read standing and fallen pins | `:87` |
| Dense pin fields propagate a collision **wave** through local contacts, not a uniform radial explosion | `:84` |
| The result presentation replaces the collision view **only after the player has seen the pins react** | `:99` |

Measured against that list, the current camera fails three things and gets the rest right:

1. **The push target is the wrong point.** `get_camera_focus_y_fraction`
   (`src/render/camera.ts:162-180`) maps `focus_y / rack_front` onto a fixed deck anchor and
   `focus_x` is `ball_x` scaled by a late progress ramp (`camera.ts:274`), so the view arrives at the
   rack center rather than at the collision this ball is about to cause.
2. **The push runs out before the collision.** `shot_progress` saturates at the rack front
   (`camera.ts:250`), so travel through the deck -- where findings `:87` puts the most energetic
   motion -- has no camera language left.
3. **The collision view is a frozen point, not a held view.** `latch_camera_impact`
   (`camera.ts:279-310`) freezes lateral focus at first contact and `advance_camera_for_ball`
   early-returns afterward (`camera.ts:253`). Findings `:60` describes a view that *holds the deck
   through the collision* and `:84` a wave spreading through local contacts; a frozen point cannot
   hold a spreading wave.

Preserved because they already match the reference: the establishing view before release (`:57`) and
the late result handover after the pins have reacted (`:99`, `:62`), triggered by the authoritative
settled event today (`src/app/game.tsx:400-418`).

### The giant deck is the primary case

All three failures are mild in ten-pin and severe in the many-pin modes. A 990-pin rack is about 44
rows deep on a widened lane (`src/config/lane.ts:18-25`) with `depth_distance` near 176
(`src/config/camera.ts:86-98`). At that size "the pin deck" is not a place: the rack center can sit
many rows and boards from where the ball enters, so a rack-centered anchor aims at a region the shot
never touches. In ten-pin the same anchor is accidentally correct, because the whole rack *is* the
local neighborhood.

The only per-mode knob today is `get_large_rack_weight` (`camera.ts:182-185`), a scalar that raises
the zoom ceiling (`:187-193`) and vertical anchor (`:166-174`). It changes how *close* the camera
gets, never *where it looks* -- so it magnifies a mis-aimed frame. That matches the reported
symptom: the more pins, the more confusing.

The framing unit must therefore be a **local neighborhood around the ball's entry, sized in absolute
world units** (rows and boards), not a rack fraction. That rule degrades correctly: at ten pins the
neighborhood covers the whole rack; at 990 it covers the part being hit.

### The giant deck also breaks rasterization

A captured 990-pin frame shows the deck reading as banded vertical stripes rather than pins. Two
independent causes needing two different fixes:

1. **Size-floor flattening.** `src/render/pins.ts:145,153,198,205,206` clamp radii with
   `Math.max(1, ...)`. Below one pixel a pin's drawn size stops tracking depth, so far rows share a
   floor and merge into slabs. Fix: coverage-proportional alpha.
2. **Bitmap minification aliasing, read as moire.** Verified in code rather than assumed:
   `src/render/game_assets.ts:37-49` rasterizes each pin SVG **once at a fixed size**
   (`asset_raster_sizes`), and `src/render/pins.ts:180,189` then `drawImage`-downscales that single
   bitmap for every pin. At 990 pins a roughly 120-pixel pin bitmap is minified to about 4 pixels.
   Canvas 2D performs no mipmapping, and `imageSmoothingQuality` is never set anywhere in `src/`, so
   minification falls to a cheap browser filter that samples a small, effectively arbitrary subset of
   source texels. Across a regular rack this produces per-pin sampling differences that read as a
   beat pattern, and the pattern shifts whenever the projected scale changes -- which is why it swims
   under a moving camera. Coverage alpha does not fix this; pre-filtering the source at the scales
   actually drawn does.

   This mechanism is more specific than "the lattice is under-sampled", and it changes which fix is
   likely cheapest: with an image source, the classical answer is a mip-style pre-filtered asset set,
   not a supersampled destination buffer. M14 tests that rather than assuming it.

This belongs in the same plan because the camera work makes both worse: a continuously zooming
camera turns a static beat pattern into one that **swims**, and makes clamped far rows pop as they
cross the one-pixel threshold. Current mitigations point the wrong way -- shadows, a separation cue,
are disabled exactly in the dense modes (`game_renderer.ts:995`), and the device pixel ratio is
capped at 2 (`src/app/game.tsx:464`) where more samples would help.

### Documentation is verified, not trusted

Repository documentation in this project has drifted from the code, so this plan treats every doc
claim it depends on as a hypothesis to check against `src/` before relying on it. Three checks were
run while drafting, with mixed results:

| Doc claim | Verdict | Checked against |
| --- | --- | --- |
| `GEOMETRY_MODEL.md:85-88` -- "the renderer does not zoom, follow, or reframe during a shot" | **Stale.** Shipped code zooms during the roll | `src/render/camera.ts:270`; `docs/CHANGELOG.md:60-72` |
| `CODE_ARCHITECTURE.md:32-33` -- SVG rasterized once into reusable Canvas assets | **Accurate**, and more specific than stated: rasterized once at a *fixed* size, then downscaled per pin | `src/render/game_assets.ts:37-49`; `src/render/pins.ts:180,189` |
| `DEVELOPMENT.md:51` -- `npm run benchmark` covers performance | **Partly stale for this plan's purpose.** It runs `devel/run_simulation_benchmark.mjs`, a *simulation* benchmark; it does not measure render frame cost | `package.json:12` |

Two consequences for this plan. First, the third finding means M11 cannot lean on the existing
benchmark for a render budget and must capture render frame time in its own harness. Second, the
distinction between kinds of documentation matters: `LANE_MASTER_VIDEO_FINDINGS.md` is authoritative
only for its **observations** section, because the source recordings are not in the repository
(`:42-44`) and those observations cannot be re-derived from code. Its "Super Bowling response" table
and acceptance list are *claims about this codebase* and are subject to the same drift as any other
doc, so M0 verifies them rather than inheriting them.

### Documentation conflict, resolved

`docs/GEOMETRY_MODEL.md:85-88` states that the complete-rack solve is immutable across aiming,
mid-roll, and settled states and that "the renderer does not zoom, follow, or reframe during a
shot." That is **already false in shipped code**: `rolling_zoom` ratchets during the roll
(`src/render/camera.ts:270`) and `docs/CHANGELOG.md:60-72` documents the monotonic shot camera and
the 1.9497x impact view. The paragraph is stale documentation describing a superseded design, not a
live architectural contract, so this plan supersedes it and M16 rewrites it. The rest of
`GEOMETRY_MODEL.md` -- the one-point projection, the shared depth scale, physical scale invariance
across states -- remains binding and is preserved by every milestone below.

## Objectives

- Aim the forward push at the collision the ball is actually creating, so the frame arrives where
  the shot lands rather than at the rack center (findings `:58`).
- Size the framing unit as an absolute local neighborhood, so 496- and 990-pin decks are framed at
  their contact region while ten-pin is unchanged in character (findings `:84`, `:87`).
- Keep the push running through the deck so the most energetic motion is framed (findings `:87`).
- Grow the ball substantially on screen through travel as the foreground drops away (findings `:59`,
  `:67`).
- Hold a collision view that covers the spreading contact wave and keeps the ball inside it, instead
  of freezing on one contact point (findings `:60`, `:84`).
- Keep the result composition arriving only after the pins have visibly reacted (findings `:99`).
- Make the dense deck resolve into individual pins under a moving camera.
- Complete every milestone unattended: manager and subagents alone, with captured fixtures,
  synthetic transitions, debug harnesses, and automated behavior checks.

## Design philosophy

The trade-off this plan accepts: **aim the camera at a predicted collision zone and plan the zoom
against a forward envelope, rather than reacting to the ball's instantaneous position.** A camera
that recentres on wherever the ball is right now would have to widen later when the ball hooks
outward or clears the pins, breaking the monotonic zoom that made the camera watchable. Predicting
the deck region this shot is heading for lets the push commit early and stay committed -- which is
also what findings `:58` describes.

This is "fix the design, not the symptom" from `docs/REPO_STYLE.md`. The confusing motion is a
symptom of a rack-centered composition model; the model is replaced, not corrected per frame.

The deliberate cost, stated plainly: **the 990-pin collision view will no longer show the complete
rack.** Findings `:152` currently reads "Wide fantasy racks retain a complete, readable deck", and
that criterion produced today's rack-centered anchor. It is right for the establishing view and the
result composition and wrong for the collision -- `:84` and `:87` describe a local wave inside a
large field. Complete-rack legibility moves to the two phases that can carry it: the pre-release
establishing frame and the settled content-fit pullback (`src/render/result_camera.ts:85-128`). M16
amends `:152` accordingly, and M9 quantifies the trade rather than arguing it.

Rejected alternative one: temporal smoothing (an exponential follow on `focus_x`/`focus_y`). The
obvious way to make a camera feel natural, and forbidden here -- `tests/test_camera.mjs:269` asserts
the camera is a pure function of the furthest physical sample, identical at any draw cadence. That
contract is worth keeping; recursive smoothing would make framing depend on frame rate.

Rejected alternative two: chasing the ball into the backstop, and blending the subject toward a
moving cascade centroid. Not supported by the evidence: `:60` describes a view that *holds* the deck
through the collision, and `:62`/`:99` keep the wide view until after the outcome. Chasing the ball
past the collision would carry the frame away from the pin reactions the reference holds on. The
ball stays visible because the held view is sized to contain it, not because the camera follows it
out.

Evidence strategy for uncertain methods: every tuning choice and every method still in question
resolves through a harness before it is locked. Prediction quality (M4), sampling strategy (M14),
and frame cost (M11, M12) are each measured before the dependent milestone commits. Findings
`:166-167` is explicit that these are perceptual acceptance questions and that behavior tests must
verify state and projection contracts without freezing tuned decimals;
`docs/DEVELOPMENT.md:53-57` says the same in repository terms -- frame timings and visual thresholds
stay under `devel/` or ignored `artifacts/`, never as permanent suite assertions. M15 classifies
every new check against that line before any of them land in `tests/`.

### Autonomy contract

Every milestone below closes on an artifact a subagent can produce and a fresh subagent can read.
No milestone waits on a person looking at a screen, listening to audio, or approving a step.

- Each milestone names its exact command and its captured artifact.
- Perceptual claims become measured relations against a recorded baseline, captured from the
  production path via `devel/` harnesses.
- Independent review means a fresh `reviewer` subagent reads the diff and the artifacts and records
  a disposition with findings. A failing command or a review finding returns work to a bounded
  package; it does not escalate to a person.
- Committing is explicitly **outside** every milestone's scope. Milestones close on a verified
  working tree plus a `docs/CHANGELOG.md` entry, per `docs/REPO_STYLE.md` (only humans run
  `git commit`) and `docs/HUMAN_GUIDANCE.md:16`. No milestone's exit criteria reference a commit,
  so a sleeping human never blocks progress.

## Scope

- Audit every documentation claim this plan relies on against `src/` before building on it.
- Extract shared projection and depth-scale math into one module; delete the duplicate.
- Memoize the per-frame deck-exaggeration bisection to buy frame headroom before adding solver work.
- Add a collision-zone prediction module that reuses the authoritative worker free path, and fix the
  deck-assist parity gap between that path and the live world.
- Measure prediction accuracy, and free-path-versus-live divergence, before the camera commits.
- Extend the forward-progress domain through the deck; replace the deck anchor with a zone-based
  vertical composition; replace the instantaneous corridor zoom limit with a forward-envelope
  ceiling; add trend-based ball-growth pacing.
- Replace the point latch with a held collision view expanded only by impulse-qualified contacts.
- Define a 990-pin frame budget from a recorded baseline, characterize the existing draw pipeline,
  then fix sub-pixel size floors and choose an anti-moire sampling strategy by measurement.
- Retire `get_large_rack_weight` as the mechanism that adapts framing to rack size.
- Classify every new check as permanent test or `devel/` probe, then land the permanent ones.
- Rewrite the stale `docs/GEOMETRY_MODEL.md:85-88` paragraph; update the findings doc, changelog,
  and repo-side active plan.

## Non-goals

- Change the physics worker, the simulation protocol wire format, or pin behavior.
- Introduce temporal or frame-rate-dependent camera smoothing.
- Relax the monotonic forward-progress or monotonic zoom contracts.
- Move the result handover earlier than the authoritative settled event.
- Follow the ball into the pit or the backstop after the collision view is established.
- Redraw the pin or ball art, or move rendering off the 2D canvas.
- Reduce the pin count, thin the rack, or cull pins to make the deck easier to rasterize.
- Redesign the result burst, confetti, scoring, or audio.
- Alter the reduced-motion neutral-camera contract (`src/render/camera.ts:359-375`).
- Make any absolute frame-rate claim about real user hardware; the budget is a relative regression
  bound on one recorded environment (`docs/CODE_ARCHITECTURE.md:161` records the absolute-hardware
  confirmation as an open gap this plan does not close).

## Current state summary

| Concern | Today | File:line |
| --- | --- | --- |
| Forward progress | `ball_y / rack_bounds.front`, clamped to 1, ratcheted | `src/render/camera.ts:250-251` |
| Push target | fixed deck anchor from progress; lateral is a late `ball_x` ramp | `src/render/camera.ts:162-180,274` |
| Zoom | progress ramp, capped by instantaneous corridor limit, ratcheted | `src/render/camera.ts:203-241` |
| Mode adaptation | one scalar raising zoom and anchor; never changes aim | `src/render/camera.ts:182-193` |
| Collision | hard point latch; further ball follow disabled | `src/render/camera.ts:253,279-310` |
| Contact data | impact windows carry centroid and impulse per window | `src/simulation/protocol.ts:75-81,101-109` |
| Ball velocity | transmitted every frame, unused by the camera | `src/simulation/protocol.ts:140-147` |
| Result | settled-event fit to fallen-pin footprint (already late, keep) | `src/render/result_camera.ts:85-128` |
| Depth math | duplicated, two different formulas | `camera.ts:54-58` vs `game_renderer.ts:159-172` |
| Deck solve | 32-iteration bisection runs every frame | `game_renderer.ts:342-418,470-553` |
| Sub-pixel pins | radii clamped by `Math.max(1, ...)`; far rows share a floor | `src/render/pins.ts:145,153,198,205,206` |
| Sampling | device pixel ratio capped at 2; no supersampling; lattice unfiltered | `src/app/game.tsx:464` |
| Pin art | SVG rasterized **once** into reusable Canvas assets for dense racks | `docs/CODE_ARCHITECTURE.md:32-33` |
| Dense-mode shadows | omitted for 496 and 990, removing a separation cue | `game_renderer.ts:995` |
| Geometry doc | claims no zoom/follow/reframe during a shot; already false | `docs/GEOMETRY_MODEL.md:85-88` |
| 990 frame budget | open gap; `npm run benchmark` writes `artifacts/benchmark/` | `docs/CODE_ARCHITECTURE.md:161`, `docs/DEVELOPMENT.md:51` |
| Line budget | `game_renderer.ts` at 999/1000, `game.tsx` at 960 | `tests/test_source_file_line_limit.py:14` |

## Architecture boundaries and ownership

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Review boundary |
| --- | --- | --- |
| M0 / WS-close | `docs/` claims checked against `src/` | Report only; no code or doc edits yet |
| M1-M2 / WS-foundation | new `src/render/projection.ts`, `game_renderer.ts` | Pure refactor and memo: no numeric drift in existing tests |
| M3-M5 / WS-prediction | new `src/render/collision_zone.ts`, `contracts.ts`, `src/app/game.tsx` | Pure function of ratcheted state; accuracy gated before use |
| M6-M9 / WS-composition | new `src/render/shot_framing.ts`, `camera.ts`, `src/config/camera.ts` | Monotonic and cadence contracts hold |
| M10 / WS-hold | `camera.ts`, `src/app/game.tsx` | Held view contains ball and qualified wave |
| M11-M14 / WS-raster | `src/render/pins.ts`, `game_renderer.ts`, `src/app/game.tsx` | Rasterization only; pin pose, count, ordering unchanged |
| M15-M16 / WS-close | `tests/`, `devel/`, `docs/` | Test-tier classification honored; docs match shipped behavior |

## Milestone plan

Sixteen small milestones. Each is one dispatchable package with one owner, one outcome, and one
verification command, so progress is visible and a failure is recoverable without unwinding
unrelated work.

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M0 | Doc-vs-code drift audit | Verify every doc claim this plan depends on | No milestone rests on stale documentation |
| M1 | Projection extraction | One shared depth/projection module | Exact math, line headroom |
| M2 | Deck-solve memo | Cache the per-frame bisection | Frame headroom before new solver work |
| M3 | Collision-zone module | Predict the local entry neighborhood | The push gets a real destination |
| M4 | Prediction accuracy gate | Measure predicted vs actual first contact | Proof the prediction is good enough to commit |
| M5 | Zone wiring | Zone into camera state; retire the point latch call | Camera can consume the zone |
| M6 | Journey-length push | Progress runs to collision depth | Findings `:87` |
| M7 | Zone vertical composition | Compose against the zone, not the deck anchor | Findings `:58` |
| M8 | Envelope zoom ceiling | Zoom committed against the forward envelope | Monotonic zoom survives following |
| M9 | Ball-growth pacing | Trend-based growth and foreground drop-out | Findings `:59`, `:67` |
| M10 | Held collision view | Impulse-qualified outward expansion | Findings `:60`, `:84` |
| M11 | Raster baseline and budget | Shimmer probe plus recorded frame budget | A defined pass condition before any raster fix |
| M12 | Pipeline cost characterization | Where dense-mode frame time actually goes | Sampling choice grounded in the real pipeline |
| M13 | Sub-pixel coverage | Replace size floors with coverage alpha | Far rows track depth again |
| M14 | Sampling strategy selection | Compare candidates, adopt cheapest effective | Moire reduced within budget |
| M15 | Test-tier classification | Permanent tests vs `devel/` probes | No brittle thresholds in the suite |
| M16 | Documentation close-out | Geometry, findings, changelog, plan closure | Docs match shipped behavior |

### Milestone: M0 doc-vs-code drift audit

- Owner: `reviewer`. Depends on: none.
- Deliverables: a short drift report checking, against `src/`, every documentation claim this plan
  relies on: the `GEOMETRY_MODEL.md:85-88` framing paragraph; `CODE_ARCHITECTURE.md:32-33` asset
  rasterization; `CODE_ARCHITECTURE.md:161` frame-budget gap; `DEVELOPMENT.md:51` benchmark
  coverage; `DEVELOPMENT.md:53-57` test-tier rules; and the `LANE_MASTER_VIDEO_FINDINGS.md`
  "Super Bowling response" table (`:107-116`) plus acceptance list (`:144-153`), which are claims
  about this codebase rather than observations of the footage. Each row records claim, verdict, and
  the `file:line` evidence.
- Exit criteria: report exists in the working tree with a verdict for every row; any claim found
  stale is either corrected in M16's documentation work or, if it invalidates a milestone's premise,
  returned to that milestone before it starts. The three checks already run during drafting are
  carried in as seed rows.
- Bounded deliberately: M0 covers **only claims that can change this plan's implementation or its
  validation**, which is the row list above. It is not a general documentation audit. Drift found
  elsewhere is noted for M16 or a later plan, never pulled into M0's scope, so this prerequisite
  cannot expand into an open-ended survey that delays M1.
- Parallel-plan ready: yes. Rows are independently checkable.
- Note: this milestone exists because the drafting checks already found one stale claim, one
  partly-stale claim, and one live code parity gap (`preview.ts:78` versus `world.ts:82`). Documentation is treated as a hypothesis about the code, never as authority
  over it. The single exception is the findings document's observations section, which records
  footage that is not in the repository and therefore cannot be re-derived.

### Milestone: M1 projection extraction

- Owner: `expert_coder`. Depends on: M0.
- Deliverables: `src/render/projection.ts` owning `get_depth_scale`, `exaggerate_deck_y`,
  `solve_rack_framing`, `solve_deck_exaggeration`, `create_projection`, `project_world_point`;
  `game_renderer.ts`, `camera.ts`, `result_camera.ts` import it; `camera.ts:54-58` duplicate deleted.
- Exit criteria: `./check_codebase.sh` passes; `tests/test_projection.mjs` and `tests/test_camera.mjs`
  pass **unmodified**; `game_renderer.ts` under 900 physical lines; `pytest tests/test_source_file_line_limit.py` passes.
- Parallel-plan ready: no. Single-owner refactor touching every downstream file.

### Milestone: M2 deck-solve memo

- Owner: `coder`. Depends on: M1.
- Deliverables: `solve_deck_exaggeration` memoized per `(pin_count, canvas_width, canvas_height)`
  instead of running its 32-iteration bisection every frame (`game_renderer.ts:342-418,470-553`).
- Exit criteria: identical projection output for identical inputs, asserted in
  `tests/test_projection.mjs`, plus a focused timing measurement showing the memoized solve costs
  less per frame than the bisection it replaces. Renderer frame-cost measurement belongs to M11 and
  is deliberately not claimed here; `npm run benchmark` is not used, because M0 established it
  measures simulation rather than render cost.
- Parallel-plan ready: no. Small and serial; it buys the headroom M8 and M14 spend.

### Milestone: M3 collision-zone module

- Owner: `coder`. Depends on: M2.
- Deliverables: `src/render/collision_zone.ts` producing a world rectangle -- the local deck
  neighborhood this shot is predicted to strike -- sized in absolute rows and boards, then clipped to
  the rack extent.
- Prediction source, decided here: **reuse the authoritative worker free path, do not build a second
  extrapolation model in the renderer.** `src/simulation/preview.ts:28-90` already simulates a
  pins-free Rapier roll using the same `apply_ball_force` as the live world -- real spin, hook,
  damping, and gutter capture, sampled to the pit. A renderer-side linear extrapolation of
  `velocity_x/y` would be a second model of a curved path, which
  `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md:175-177` and `docs/REPO_STYLE.md` both forbid: one
  authoritative model for gameplay and preview, because separate models drift.
- Required parity fix, found while drafting: `preview.ts:78` passes `deck_assist_enabled: false`
  while the live world defaults it **true** (`src/simulation/world.ts:82,665`). The preview path
  therefore diverges from the real path exactly where deck assist acts -- near the deck, where entry
  accuracy matters most. This milestone adds a committed-shot free path computed at launch with live
  parity by parameterizing `create_preview_path`, rather than forking a near-copy. The aiming
  preview keeps its current assist-free behavior unless M4 shows that is also wrong, which would be a
  gameplay-preview finding reported, not silently changed here.
- Live snapshot samples still refine the zone during the roll; the free path supplies the shape of
  the curve, the snapshot supplies where along it the ball actually is.
- Exit criteria: left-corridor shots predict left-of-center zones and right-corridor right; the zone
  narrows as the ball nears the deck; a gutter ball yields an edge zone; at 10 pins the clipped zone
  equals the whole rack and at 990 it is a strict subset of matching absolute size; identical inputs
  are idempotent. Verified by `tests/test_collision_zone.mjs` via `node --import tsx --test`.
- Parallel-plan ready: no. One module, one owner.

### Milestone: M4 prediction accuracy gate

- Owner: `tester`. Depends on: M3.
- Deliverables: `devel/measure_zone_prediction.mjs` replaying scripted shots through the real worker
  and comparing, per frame, the predicted zone against the actual first ball-pin contact centroid
  reported by `ImpactPathSummary` (`src/simulation/protocol.ts:75-81`). Report gives prediction error
  in boards and rows versus remaining travel, per mode, for center, hook, off-center, and gutter
  shots.
- Also measured: the free-path-versus-live divergence caused by the deck-assist parity gap, before
  and after the M3 fix, so the fix is demonstrated rather than assumed.
- Exit criteria: from the point where the camera would commit (the start of the push ramp), the
  predicted zone contains the eventual first-contact centroid for every scripted shot in 105, 496,
  and 990.
- Failure handling, defined so the outcome is never a silent degradation: if reliable prediction
  arrives only late in travel, the report states that travel fraction, and the response depends on
  whether findings `:58` -- a push running **throughout** ball travel -- can still be satisfied.
  - Reliable before the push ramp would need to start: M6 uses that commit point.
  - Reliable only after roughly the mid-travel point, so a push from there could not read as
    throughout-travel: **return to M3 and improve the predictor**; do not quietly move the camera
    commitment near impact, which would trade the plan's central objective for a passing gate.
    The named next attempts, in order: correct any remaining preview-versus-live force parity gaps;
    recompute the free path from the live snapshot mid-roll rather than only at launch; widen the
    early zone and let it narrow, so early commitment stays inside a defensible bound.
- Parallel-plan ready: no. This is the gate the composition milestones depend on.
- Note: this milestone exists because prediction quality is the plan's highest-risk assumption. It
  fails cheaply here rather than expensively in M7.

### Milestone: M5 zone wiring

- Owner: `coder`. Depends on: M4.
- Deliverables: `CameraState` carries the ratcheted zone (`src/render/contracts.ts:28-50`); impact
  events update it in `src/app/game.tsx:362-366`; `advance_camera_for_ball` no longer early-returns
  after contact (`camera.ts:253`).
- Exit criteria: `./check_codebase.sh` passes; `game.tsx` under 1000 lines -- if it crosses its
  39-line headroom, the camera driver block moves to `src/app/camera_driver.ts` in this milestone.
- Parallel-plan ready: no.

### Milestone: M6 journey-length push

- Owner: `expert_coder`. Depends on: M5.
- Deliverables: `shot_progress` denominator changes from the rack front to the predicted collision
  depth, still ratcheted by `Math.max`; the commit point is the one M4 measured.
- Exit criteria: push does not saturate before collision depth, asserted in `tests/test_camera.mjs`;
  existing monotonic and cadence-independence tests pass.
- Parallel-plan ready: no.

### Milestone: M7 zone vertical composition

- Owner: `expert_coder`. Depends on: M6.
- Deliverables: `get_camera_focus_y_fraction` rewritten to compose against the zone;
  `focus_x` tracks the zone laterally with no ratchet so a hook reads as a bend;
  `get_large_rack_weight` no longer drives aiming.
- Exit criteria, self-contained so this milestone closes on its own: monotonic and cadence tests
  pass, and a deterministic projection relation in `tests/test_shot_framing.mjs` asserts that for
  synthetic left, center, and right zones the projected zone center lands nearer the canvas center
  than the projected rack center does, in 105, 496, and 990. No dependency on a later milestone's
  probe. M9 later supplies the broader perceptual evidence over real shots.
- Parallel-plan ready: no.

### Milestone: M8 envelope zoom ceiling

- Owner: `expert_coder`. Depends on: M7.
- Deliverables: the instantaneous corridor limit (`camera.ts:203-220`) replaced by a ceiling computed
  over the forward envelope -- lateral lane plus gutter, longitudinal remaining travel -- so a
  committed zoom stays honorable for the rest of the roll.
- Exit criteria: monotonic zoom test passes; no scripted shot in the M9 probe requires a zoom
  reduction before the result phase.
- Parallel-plan ready: no.

### Milestone: M9 ball-growth pacing and archetype probe

- Owner: `expert_coder` with `tester`. Depends on: M8.
- Deliverables: `devel/capture_camera_archetypes.mjs` driving the production client over center
  strike, strong hook, off-center pocket, and gutter for every mode, plus a many-pin set entering at
  center, mid-board, and outside board in 496 and 990; it samples ball projected point and area,
  near-lane foreground share, and zone coverage. Growth constants in `src/config/camera.ts` are then
  tuned from that report, each with a one-line rationale.
- Exit criteria: ball on canvas for every frame from release to settle in every archetype and mode;
  ball area shows a **rising trend from release to contact measured over travel intervals**, with
  end-to-end growth above a recorded floor -- not strict frame-to-frame increase, since projection,
  interpolation, hook geometry, and rasterization can flatten or slightly reverse adjacent samples
  while the perceptual trend is correct (findings `:59` says substantial growth, not monotone
  growth); foreground share falls end to end; contact-frame zone coverage recorded for the M16
  changelog trade note.
- Parallel-plan ready: yes. The probe and the solver tuning are separable once the probe exists.

### Milestone: M10 held collision view

- Owner: `coder`. Depends on: M9.
- Deliverables: `latch_camera_impact` replaced by `hold_collision_view`. The expansion rule is
  decided here, not deferred: a later impact window expands the held view only if it **qualifies** --
  its `maximum_impulse` is within a qualifying fraction of the running peak impulse for this roll.
  Low-energy chain contacts far from the pocket do not expand the view, because in a dense field an
  unqualified "every contact expands" rule would walk the frame back out to whole-rack framing and
  undo M7.
- How the fraction is chosen, assigned rather than left to implementation: this milestone captures
  the impulse distribution of real 990, 496, and ten-pin rolls from `ImpactPathSummary.maximum_impulse`
  into a `devel/` report, then picks the fraction that separates the primary pocket cascade from the
  long tail of chain contacts. The chosen value lives in `src/config/camera.ts` with a one-line
  rationale. Its numeric value stays out of permanent tests per `docs/DEVELOPMENT.md:53-57`; the
  permanent test asserts only the durable behavior -- a below-threshold contact leaves the view
  unchanged and an above-threshold one expands it outward.
- Exit criteria: 990 cascade grows the view to cover qualified contacts while unqualified chain
  contacts leave it unchanged; a ten-pin pocket hit stays tight; the ball is inside the held view
  every frame from first contact to settle; the view never shrinks or moves backward; the
  settled-event result trigger and `result_camera_transition_ms` are unchanged (findings `:99`).
- Parallel-plan ready: no.

### Milestone: M11 raster baseline and frame budget

- Owner: `tester`. Depends on: M10.
- Deliverables: `devel/measure_deck_shimmer.mjs` driving a physics-frozen camera zoom across a static
  complete rack for 105, 496, 990; reports per-step mean absolute pixel delta in the deck region, the
  delta's dominant spatial frequency, and **render** frame time. The frame budget is defined here as
  a **relative regression bound** against that recorded baseline on the same automated environment.
- The existing `npm run benchmark` is deliberately not the instrument: M0 verified it runs
  `devel/run_simulation_benchmark.mjs` (`package.json:12`), a simulation benchmark that does not
  measure render cost. This milestone captures render frame time in its own harness rather than
  inheriting a doc claim that does not hold.
- Exit criteria: baseline artifacts present in the working tree for all three modes before any
  rasterization change lands, each recording pixel delta, dominant spatial frequency, and render
  frame time. `docs/CODE_ARCHITECTURE.md:161` records absolute real-hardware confirmation as an open
  gap; this milestone defines a relative bound instead of claiming to close it.
- Parallel-plan ready: yes. The delta measurement and the frame-time measurement are independent.

### Milestone: M12 pipeline cost characterization

- Owner: `expert_coder`. Depends on: M11.
- Deliverables: a short report locating dense-mode frame cost across the existing draw path --
  the once-rasterized reusable SVG Canvas assets (`docs/CODE_ARCHITECTURE.md:32-33`), per-pin draw
  calls, the painter sort, and compositing -- with the memory-bandwidth and per-frame cost a
  supersampled intermediate surface would add, and whether the pre-rasterized assets would need
  re-rasterization at a higher scale to benefit from it.
- Exit criteria: report exists and names the dominant cost centers with measurements. This milestone
  is why M14 is not pre-committed to a whole-canvas buffer.
- Parallel-plan ready: no.

### Milestone: M13 sub-pixel coverage

- Owner: `expert_coder`. Depends on: M11.
- Deliverables: coverage-proportional alpha replacing the `Math.max(1, ...)` size floors
  (`src/render/pins.ts:145,153,198,205,206`); no size floor remains on a depth-scaled pin dimension;
  the dense-mode shadow policy (`game_renderer.ts:995`) re-decided on measured frame time rather than
  inherited.
- Exit criteria, split by tier so a perceptual measurement does not become a renderer invariant:
  - Permanent behavior (`tests/`): far-row drawn size keeps decreasing with depth past the old
    one-pixel threshold.
  - Probe evidence (`devel/`, M11 harness): shimmer report shows no regression in mean delta;
    aggregate row contribution stays above a recorded legibility floor so the 990 field keeps its
    mass; render frame time within the M11 relative bound. The legibility floor is recorded
    evidence for this milestone's decision, not a suite assertion -- same treatment M15 gives every
    other visual threshold.
- Parallel-plan ready: yes with M12.

### Milestone: M14 sampling strategy selection

- Owner: `expert_coder`. Depends on: M12, M13.
- Deliverables: a measured comparison of candidate strategies, each scored on high-frequency delta
  reduction against render frame cost from the M11 baseline, listed here in the order the verified
  mechanism suggests rather than the order a generic anti-aliasing answer would:
  1. **Pre-filtered multi-scale pin assets** (mip-style). `game_assets.ts:37-49` rasterizes once at a
     fixed size and `pins.ts:180,189` minifies it; pre-filtering the source at the scales actually
     drawn attacks that directly and costs memory rather than per-frame time. Leading candidate.
  2. **Explicit `imageSmoothingQuality`/`imageSmoothingEnabled` settings**, currently never set in
     `src/`. Nearly free, and strictly experimental: Canvas implementations differ in what a quality
     hint actually does, so this candidate is scored on captured output from the production path like
     every other candidate, never credited on the basis of the API setting being present.
  3. **Raising the `devicePixelRatio` cap** (`game.tsx:464`).
  4. **Supersampled buffer plus box downsample**, whole-canvas or restricted to the M10 held-view
     region. Most expensive, and M12 must show the pipeline can absorb it.
  The cheapest effective strategy is adopted.
- Exit criteria: comparison report committed; adopted strategy reduces the high-frequency deck delta
  at 496 and 990 versus baseline while staying within the M11 relative bound. If no candidate clears
  both, M13's coverage fix ships alone and the residual moire is recorded with its measurement --
  a measured outcome, not a stall.
- Parallel-plan ready: yes. Candidates are measured independently, then compared.

### Milestone: M15 test-tier classification

- Owner: `tester`. Depends on: M14.
- Deliverables: every new check classified against `docs/DEVELOPMENT.md:53-57` and
  `docs/PYTEST_STYLE.md` before it lands. Permanent (`tests/`): zone sidedness and convergence,
  idempotence, non-saturating push, envelope ceiling, held-view containment and outward-only growth,
  pin drawn size continuing to decrease past the old floor, existing monotonic and cadence contracts,
  replacing the two point-latch tests (`tests/test_camera.mjs:339,432`). Probe-only (`devel/`,
  `artifacts/`): pixel deltas, spatial frequencies, frame times, growth ratios, zone coverage
  fractions, prediction error magnitudes. Plus a Playwright spec asserting
  `data-camera-physical-progress` passes the old saturation point and `data-camera-zoom` never
  decreases before the result phase.
- Exit criteria: `node --import tsx --test 'tests/test_*.mjs'`, `./run_playwright_tests.sh`, and
  `pytest tests/` pass; no permanent test asserts a tuned decimal, a frame time, or a pixel
  threshold.
- Parallel-plan ready: yes. Unit and browser tiers are independent.

### Milestone: M16 documentation close-out

- Owner: `planner`. Depends on: M15.
- Deliverables: `docs/GEOMETRY_MODEL.md:85-88` rewritten to describe the shipped shot camera --
  fixed complete-rack solve for aiming and settled states, zone-led travel and held collision view
  during the roll -- while preserving the still-binding projection, shared depth scale, and physical
  scale invariance statements; `docs/LANE_MASTER_VIDEO_FINDINGS.md` response table gains
  collision-zone and held-view rows, `:152` amended to scope complete-rack legibility to the
  establishing view and settled pullback, `:144-153` gains growth and held-view criteria, `:155-167`
  updated to note what is now measured automatically; `docs/CHANGELOG.md` entry; repo-side active
  plan `docs/active_plans/active/shot_camera_collision_travel.md` created at M0 and `git mv`d to
  `docs/archive/` here; **plus a correction for every row M0 marked stale**, including the
  `DEVELOPMENT.md:51` benchmark-coverage claim, so the audit produces fixes rather than a filed
  report.
- Exit criteria: `pytest tests/test_markdown_links.py` passes; a fresh `reviewer` subagent confirms
  no doc still asserts the superseded fixed-framing behavior.
- Parallel-plan ready: no.

## Acceptance criteria and gates

- Per-milestone gate: the milestone's named command passes and its named artifact exists in the
  working tree.
- Per-patch gate: `./check_codebase.sh` and `pytest tests/`.
- Integration gate: `node --import tsx --test 'tests/test_*.mjs'`, `./run_playwright_tests.sh`,
  `devel/capture_camera_archetypes.mjs`, `devel/measure_zone_prediction.mjs`, and
  `devel/measure_deck_shimmer.mjs` all pass; reports show ball on canvas release-to-settle, rising
  ball-area trend, falling foreground share, contact frames centered on the entry neighborhood at
  every tested 496/990 entry board, qualified contacts inside the held view, and reduced
  high-frequency deck delta within the M11 relative bound.
- Independent evidence gate: a fresh `reviewer` subagent reads the diff and every report and records
  a disposition with specific findings against the findings-doc list (`:58`, `:59`, `:60`, `:62`,
  `:84`, `:87`, `:99`), the monotonic and cadence contracts, the test-tier split, and the
  documentation conflict. Its output is an evidence evaluation with findings, not an approval: any
  finding returns work to the bounded milestone that owns it and the loop repeats. Final project
  approval remains the human's, and sits outside the plan's completion path.

## Test and verification strategy

- Unit (`tests/test_*.mjs`): deterministic camera and renderer state contracts. No timing, no
  thresholds.
- Projection (`tests/test_projection.mjs`): one shared depth path after M1; memo determinism after
  M2.
- Browser (`tests/playwright/e2e/`): a real roll asserting camera DOM attributes behaviorally.
- Prediction probe (`devel/measure_zone_prediction.mjs`): predicted zone versus actual contact
  centroid, per mode and shot archetype.
- Archetype probe (`devel/capture_camera_archetypes.mjs`): ball residency, growth trend, foreground
  share, zone coverage.
- Shimmer probe (`devel/measure_deck_shimmer.mjs`): pixel delta, dominant spatial frequency, frame
  time under a physics-frozen zoom -- separates the two raster defects, since a size floor shows as
  far rows holding constant size while moire shows as high-frequency delta on near-static geometry.
- Render frame cost (M11 harness): the relative regression bound. Deliberately not
  `npm run benchmark`, which M0 verified measures simulation rather than render cost
  (`package.json:12`).
- Drift audit (M0 report): every doc claim this plan relies on, with `file:line` evidence.
- Hygiene (`pytest tests/`): line limits, ASCII, markdown links, typing.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Prediction is unreliable early, so the push commits to the wrong region | Camera arrives beside the action; worst at 990 where a miss is many rows wide | M4 report shows contact outside the predicted zone at the intended commit point | WS-prediction | M4 gates M6; the commit point moves to the measured-reliable travel fraction instead of the assumed one |
| Free path diverges from the live roll | Zone aims at the wrong entry despite using the authoritative model | M4 divergence measurement stays large after the deck-assist parity fix | WS-prediction | M4 measures divergence before and after the fix; remaining force-parity gaps are the first named remedy in M4's failure handling |
| Reliable prediction arrives too late for a throughout-travel push | Findings `:58` cannot be satisfied; the plan's central objective quietly degrades | M4 reports reliability only past mid-travel | WS-prediction | M4's failure handling returns work to M3 with three named remedies instead of moving the commit point near impact |
| Envelope-capped zoom is too conservative | Collision reads small; loses findings `:60` | M9 shows contact-frame ball area or zone coverage below baseline | WS-composition | Narrow the envelope using the committed aim corridor rather than full lane width |
| Losing the whole 990 rack from the collision view reads as a downgrade | Signature mode's spectacle weakens | Reviewer or M9 coverage shows a worse contact frame | WS-hold | Deliberate recorded trade; legibility moves to establishing and settled phases; M9 quantifies it |
| Held view walks back out to whole-rack framing | Undoes M7 in dense modes | Held view area approaches rack area in the 990 archetype | WS-hold | Impulse-qualified expansion decided in M10, not a contingency |
| Supersampling costs more than the pipeline can absorb | Moire fix cannot ship where it is needed | M12 or M14 shows cost outside the M11 bound at every useful factor | WS-raster | M14 compares four strategies including region-limited and pre-filtered assets; coverage-only shipping with recorded residual is an accepted outcome |
| Pre-rasterized SVG assets do not benefit from a supersampled surface | A supersample buffer blurs rather than resolves | M12 finds assets fixed at one scale | WS-raster | M12 runs before M14 precisely to surface this; multi-scale pre-filtered assets are a named candidate |
| Coverage fading makes far rows too faint | The 990 field loses its mass | Aggregate row contribution below the recorded floor | WS-raster | Floor applies to aggregate row contribution, not per-pin size |
| New probe measurements harden into brittle suite assertions | Suite breaks on unrelated tuning | A frame time or pixel threshold appears in `tests/` | WS-close | M15 classifies every check before it lands, per `docs/DEVELOPMENT.md:53-57` |
| A doc claim this plan relies on is stale, invalidating a milestone premise | Work built on fiction | M0 marks a row stale, or a later milestone finds code contradicting a doc | WS-close | M0 audits every relied-on claim against `src/` before M1 starts; a stale row that invalidates a premise returns to the owning milestone before it begins, and M16 corrects the doc |
| Documentation is corrected to match code that is itself wrong | Drift is laundered into an approved contract | A doc rewrite in M16 has no code-behavior evidence behind it | WS-close | M16 rewrites only what a passing milestone gate demonstrated; the geometry paragraph is rewritten to describe behavior M6-M10 verified, not behavior merely observed in source |

## Rollout and release checklist

- [ ] M0 lands; drift report has a verdict for every relied-on doc claim.
- [ ] M1-M2 land; existing camera and projection tests pass unmodified; deck-solve memo shows no
      dense-mode regression.
- [ ] M3-M5 land; prediction accuracy report recorded and the commit point set from it.
- [ ] M6-M9 land; archetype report shows residency, growth trend, and entry-neighborhood centering.
- [ ] M10 lands; held-view containment and qualified expansion verified.
- [ ] M11-M12 land; shimmer baseline, frame budget, and pipeline cost report recorded before any
      raster change.
- [ ] M13-M14 land; adopted sampling strategy measured against baseline within bound.
- [ ] M15 lands; test tiers classified; all suites pass.
- [ ] M16 lands; `docs/GEOMETRY_MODEL.md` no longer contradicts the shipped camera; changelog written.
- [ ] Independent evidence gate returns no open findings.

Committing and releasing are outside this checklist by design; the plan completes on a verified
working tree.

## Documentation close-out requirements

- Active plan / progress tracker: `docs/active_plans/active/shot_camera_collision_travel.md`, created
  at M0 (which already produces project evidence), updated at each milestone close, `git mv`d to
  `docs/archive/` at M16.
- `docs/CHANGELOG.md` entry: Behavior or Interface Changes for the camera and rasterization behavior;
  Decisions and Failures for the collision-zone-push decision, the two rejected camera alternatives,
  the findings `:152` amendment with its measured coverage trade, the stale-geometry-doc resolution,
  and the adopted sampling strategy with its cost comparison; Developer Tests and Notes for the three
  probes and the benchmark bound.
- Archive / closure notes: retain the report paths so a later reviewer can reproduce every
  comparison.

## Patch plan and reporting format

Patches are **integration boundaries, not a serial order**. Each milestone lands as its own patch,
and milestones whose dependencies are satisfied may be dispatched and land concurrently -- notably
M11's two independent measurements, then M12 and M13 in parallel, and M14's candidates measured
independently before comparison. The dependency edges in each milestone's `Depends on` line are the
real constraint; `Parallel-plan ready` marks where concurrent dispatch is safe. Prefer parallel
dispatch where those two allow it, since subagents are cheap and wall time is not
(`docs/REPO_STYLE.md`).

Each patch reports: files touched, gate commands run with their output, the named artifact path, and
the report delta when the patch changes framing or rasterization.

## Resolved decisions

- Documentation is a **hypothesis about the code, verified before use**, not an authority over it.
  Drafting checks already found one stale claim (`GEOMETRY_MODEL.md:85-88`) and one partly-stale
  claim (`DEVELOPMENT.md:51` benchmark coverage), so M0 audits every relied-on claim before M1
  starts. The lone exception is the findings document's observations section, which records footage
  absent from the repository and therefore cannot be re-derived from code.
- The dense-deck moire mechanism is **bitmap minification**, established from
  `game_assets.ts:37-49` and `pins.ts:180,189`, not inferred from the general lattice-undersampling
  argument. This changes the candidate ordering in M14: pre-filtered multi-scale assets lead,
  supersampling is the expensive fallback.
- `docs/GEOMETRY_MODEL.md:85-88` is **stale documentation, not an architectural contract**. Shipped
  code already zooms during a shot (`src/render/camera.ts:270`, `docs/CHANGELOG.md:60-72`), so the
  paragraph describes a superseded design. This plan supersedes it and M16 rewrites it; the rest of
  that document stays binding.
- Prediction **reuses the authoritative worker free path** (`src/simulation/preview.ts:28-90`)
  rather than extrapolating `SnapshotBall.velocity_x/y` in the renderer. A hook is a curved path
  produced by `apply_ball_force`; a renderer-side linear extrapolation would be a second model of
  it, which `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md:175-177` forbids because separate models drift.
  Velocity remains an input to the physical path, not a substitute for it.
- The **deck-assist parity gap is a real defect, fixed in M3**: `preview.ts:78` disables deck assist
  while `world.ts:82,665` enables it live, so the existing free path diverges from the real path near
  the deck. M4 measures the divergence before and after. Whether the *aiming* preview should also
  gain parity is reported as a gameplay-preview finding, not changed silently inside a camera plan.
- Held-view expansion is **impulse-qualified**, decided in M10 rather than left as a risk
  contingency, because an unqualified rule recreates the whole-rack framing M7 removes.
- Ball growth is a **trend over travel intervals with an end-to-end floor**, not strict per-frame
  monotonic increase. Findings `:59` describes substantial growth; discrete rasterization and hook
  geometry can flatten adjacent samples without breaking the perceptual trend.
- Band-limiting strategy is **selected by measurement in M14**, not presupposed. The plan advocates
  measurement; pre-committing to whole-canvas supersampling before M12 characterizes the pipeline
  would contradict that.
- The frame budget is a **relative regression bound** on one recorded automated environment, since
  `docs/CODE_ARCHITECTURE.md:161` lists real-hardware confirmation as an open gap.
- The dense-deck banding is **two defects with two fixes**. Coverage alpha addresses the size floor;
  only band-limiting addresses moire. Shipping coverage alone leaves the swimming beat pattern, so
  both are planned with the baseline measured before either lands.
- The many-pin decks are the **primary case**, not an edge case. The absolute local neighborhood
  serves 10 through 990 pins with one rule, retiring `get_large_rack_weight` as the size-adaptation
  mechanism.
- Findings `:152` is **amended, not satisfied**: complete-rack legibility is kept for the
  establishing view and the settled pullback and given up for the collision view.

## Open questions and decisions needed

No execution-blocking questions remain; each formerly open choice is either resolved above or has a
milestone whose job is to resolve it by measurement (M4 prediction commit point, M12 pipeline cost,
M14 sampling strategy).

- Non-blocking follow-up: whether the pre-filtered multi-scale pin asset set from M14, if not
  adopted, is worth pursuing separately for the establishing and result frames.
- Non-blocking follow-up: whether the archetype and shimmer probes should join the existing capture
  entry point, or stay separately invoked.
