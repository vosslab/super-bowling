# Plan: Collision audio excitement

## Context

The current collision system can start many sample voices during a 990-pin collapse, but the
captured 990 roll still reads as a dense first-second clatter rather than a sequence of
consequential impacts. The 990 capture has 503 fallen pins, 351 impact windows, and 206 source
starts, yet its peak is only 0.7 dB above the ten-pin strike. This supports the observed failure:
source count is not a perceptual result.

The current planner repeatedly starts short, broadband slices of the same samples about 25 ms
apart. Their attacks overlap for much longer than the gap, so temporal and spectral masking can
fuse many physical contacts into one noise mass. This plan replaces that burst rule with a
physics-driven articulated field: selected attacks stay readable, while unselected real energy
becomes a restrained supporting body.

The browser already has the correct technical primitive. Each overlapping voice gets its own
one-shot `AudioBufferSourceNode`; `start(when, offset, duration)` schedules it on the audio clock,
and sources mix through the graph. This plan uses varied safe offsets and longer hero decay rather
than repeatedly replaying the first 160 ms of one sample. `OfflineAudioContext` is used where
available to render a deterministic diagnostic mix without speakers or a human listener.

Feature completion is autonomous. Captured production fixtures, synthetic physical traces, and
machine-readable real-worker reports replace every listen, watch, approve, or wait-for-a-person
milestone. A later user observation can create a new scoped request; it does not reopen a passed
milestone.

## Objectives

- Make a large physical cascade sound like a readable opening crash, moving collision front, and
  naturally thinning tail rather than a continuous broadband wall.
- Preserve Rapier collision data as the sole source of collision timing, location, and energy.
- Prove scale, articulation, synchronization, spatial progression, safety, and bounded cost with
  unattended fixtures and production-path capture.
- Remove human perceptual approval from active plan, documentation, and release-gate language.

## Design philosophy

Use the repository's "fix the design, not the symptom" principle: do not make the existing burst
louder or allow more simultaneous clatters. Select a small number of physically grounded attacks
that protect their onsets, then represent the remaining real activity as a quieter, band-limited
body. Evidence measures the causes of a legible, exciting cascade rather than claiming to measure
an individual listener's emotion.

## Scope

- Replace aggregate burst expansion with a deterministic physics-driven cascade director.
- Reuse the existing bounded collision path, impulse, and pan summaries as the director input.
- Render independently scheduled hero, attack, deck, and body voices through the existing audio
  controller and cleanup ownership.
- Add synthetic traces, pure behavior tests, offline render analysis, and an unattended
  real-worker 990-versus-ten capture verifier.
- Replace human completion language with a durable autonomous-evidence policy and commands.
- Record reproducible reports and the required changelog entries.

## Non-goals

- Add a pre-rendered collapse soundtrack or fabricate collisions unrelated to physics.
- Require an exact source-node count, fixed waveform hash, fixed dB value, or golden media file.
- Replace the shipped CC0 bank or block this work on new sound recording.
- Change scoring, pin physics, camera behavior, mute semantics, or result-motif ownership.
- Remove human authority for commits, credentials, releases, or destructive operations.

## Current state summary

- `ImpactEvent` data reaches presentation and audio through bounded collision windows, but a
  window carries one centroid rather than a distributed collision front.
- The current audio layer limits semantic cues but expands accepted windows into repeated,
  short-lived broadband samples. The first hit can lose procedural low/body support when its
  sample is available.
- The current real-worker capture records meaningful provenance and media but does not assert
  `fallen_pins >= 400` for its 990 fixture or compare scale and temporal structure with ten pins.
- Fast Node tests cover individual bursts and mute/preload behavior, not a complete cascade trace.
- Several documents still state that listening or viewing is required to establish quality.

## Architecture boundaries and ownership

The worker reports bounded physical summaries; it never chooses a sound. The cascade director is
pure and deterministic: it chooses presentation voices and body-envelope changes from timestamped
physical summaries. The Web Audio controller renders that plan with one source per overlapping
voice, audio-clock `start()` calls, panners, and owned cleanup. Evidence tooling observes those
boundaries but does not mutate game state or substitute a result.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Review boundary |
| --- | --- | --- |
| M0 / WS-B | Dirty-baseline report and ownership map | Preserve every pre-existing hunk; no staging/reset |
| M1 / WS-D | Pure cascade director and synthetic traces | Determinism, masking policy, and voice contract |
| M2 / WS-R | Audio controller, backend, and baseline-focused tests | Web Audio scheduling, lifetime, slice contract, mute, and cap |
| M2 / WS-T | New browser behavior test | Public production behavior rather than node-count internals |
| M3 / WS-E | Offline and real-worker evidence tools | Captured production path and report oracle |
| M3 / WS-G | Autonomous-completion documentation | No human acceptance dependency remains |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M0 | Preserve the dirty baseline | Capture the current in-progress audio change as an input. | No user-owned diff is reset, staged, or lost. |
| M1 | Define cascade direction | Select audible events from existing physical summaries. | Deterministic, physics-grounded plan. |
| M2 | Render articulated cascade | Replace burst clumps with protected attacks and body. | Clear overlap within a live-voice budget. |
| M3 | Close autonomous evidence | Automate synthetic, offline, and real-worker proof. | Manager/subagent-only completion path. |
| M4 | Review and close out | Independently inspect, fix, rerun, and document. | No hidden human gate or unreviewed change. |

### Milestone: M0 preserve the dirty baseline

- Depends on: none.
- Deliverables: an owner report containing `git diff --name-status`, a per-owned-file diff capture,
  and an explicit ownership map before implementation begins.
- Workstreams: WS-B.
- Entry criteria: the worktree is left exactly as found.
- Exit criteria: the baseline owner has read the current changes listed in the baseline contract
  below, names how each is preserved as implementation input, and no command has reset, checked
  out, restored, staged, or discarded it.
- Parallel-plan ready: no. This serial handoff prevents two agents from overwriting the same dirty
  audio or test change.

### Milestone: M1 define cascade direction

- Depends on: none.
- Deliverables: pure director, maintained synthetic traces, and relational Node tests.
- Workstreams: WS-D.
- Entry criteria: current collision-window and audio contracts are readable.
- Exit criteria: the director produces finite, deterministic voices with source provenance for all
  maintained traces; fast behavior tests pass.
- Parallel-plan ready: no. One owner lands the director, fixtures, and its new focused test as one
  atomic public-contract patch; a fresh reviewer checks it before renderer work begins.

### Milestone: M2 render articulated cascade

- Depends on: WP-D1 and its fresh review, because the renderer consumes its public plan contract.
- Deliverables: renderer, body-envelope handling, fake-backend behavior coverage, and browser
  graph/lifetime capture.
- Workstreams: WS-R and WS-T.
- Entry criteria: M1 interface and test fixtures are checked in.
- Exit criteria: overlapping voices use independent scheduled sources, attack protection and cleanup
  are observable, and normal browser journeys remain green.
- Parallel-plan ready: partially. The baseline owner alone changes existing dirty audio/test files
  in WP-R1. After its public trace hook exists, WS-T may add a new browser-only test file.

### Milestone: M3 close autonomous evidence

- Depends on: WP-R1 and WP-T2, because the evidence must exercise the integrated production path.
- Deliverables: one unattended verifier, ignored media/JSON diagnostics, synthetic offline report,
  and all human-gate wording replaced by executable evidence wording.
- Workstreams: WS-E and WS-G.
- Entry criteria: M2 focused tests and browser graph checks pass.
- Exit criteria: the verifier creates fresh reports and exits zero for both authoritative scenarios;
  documentation names it as the terminal feature gate.
- Parallel-plan ready: yes. WS-G can replace policy wording independently while WS-E implements the
  verifier; only the final command description waits for WP-E2.

### Milestone: M4 review and close out

- Depends on: WP-E2 and WP-G1, because review examines the full evidence and final wording.
- Deliverables: independent review report, any bounded fix patches, rerun reports, and final status.
- Workstreams: one serial review/fix/rereview lane.
- Entry criteria: M3 exit criteria pass.
- Exit criteria: independent reviewer finds no blocker; every required command is unattended and
  passing; a fresh reviewer confirms any remediation.
- Parallel-plan ready: no. Fixes must be reviewed against the integrated capture evidence.

## Workstream breakdown

### Workstream: WS-D director and fixtures

- Goal: turn field summaries into a bounded, articulated, deterministic audio plan.
- Owner: expert_coder.
- Work packages: WP-D1.
- Needs: current collision material mapping and collision path/impulse/pan summaries.
- Provides: director, named traces, semantic plan trace, and pure summaries.
- Review boundary, when modifying the repository: no Web Audio calls in the pure module.

### Workstream: WS-B baseline preservation

- Goal: make the already dirty collision-audio work a reviewed input, rather than an accidental
  overwrite target.
- Owner: audio_baseline_integrator.
- Work packages: WP-B0.
- Needs: the exact working tree captured at dispatch time.
- Provides: one serial ownership handoff to WP-D1/WP-R1 and a baseline report.
- Review boundary, when modifying the repository: read and report only; do not stage, reset,
  restore, or rewrite an existing diff merely to make the tree clean.

### Workstream: WS-R renderer

- Goal: render the plan through Web Audio without recreating the masking failure.
- Owner: expert_coder.
- Work packages: WP-R1.
- Needs: WP-D1 contract and existing audio backend.
- Provides: independent `AudioBufferSourceNode` scheduling, body voice, panning, and cleanup trace.
- Review boundary, when modifying the repository: mute/disposal and active-voice ownership remain
  in the audio controller.

### Workstream: WS-T behavior tests

- Goal: prove public scheduling behavior, not implementation counts.
- Owner: tester.
- Work packages: WP-T2.
- Needs: WP-R1 for the production trace hook.
- Provides: a new, non-conflicting browser graph/lifetime assertion.
- Review boundary, when modifying the repository: tests use inline deterministic input and avoid
  fixed dB, timing sleeps, or mock-only wiring gates.

### Workstream: WS-E evidence

- Goal: make captured synthetic and real-worker cascade evidence an unattended pass/fail gate.
- Owner: playwright_operator.
- Work packages: WP-E1 and WP-E2.
- Needs: WP-D1 for offline traces and WP-R1/WP-T2 for production trace hooks.
- Provides: normalized JSON report, ignored WebM diagnostics, and one command with launch/teardown.
- Review boundary, when modifying the repository: real-worker scenarios use normal controls and
  authoritative worker result state; no direct result mutation or committed media.

### Workstream: WS-G autonomous documentation

- Goal: eliminate human-completion wording while retaining legitimate user authority boundaries.
- Owner: coder.
- Work packages: WP-G1.
- Needs: WP-E2 only for the final verifier command and report fields.
- Provides: policy and documentation links that describe machine-verifiable completion.
- Review boundary, when modifying the repository: do not weaken commit, credential, destructive,
  or real-hardware authority rules.

## Work packages

### Work package: WP-B0 capture and assign the dirty baseline

- Owner: audio_baseline_integrator.
- Touch points: report only; it reads the current diffs for
  `src/app/game.tsx`, `src/audio/audio.ts`, `src/audio/audio_backend.ts`,
  `src/audio/collision_audio.ts`, `tests/test_audio.mjs`,
  `tests/test_collision_audio.mjs`, `tests/test_impact_presentation.mjs`, and
  `devel/capture_real_gameplay_audio.mjs`.
- Depends on: none.
- Acceptance criteria: before any implementation dispatch, record all of the following in
  `_temp/audio_excitement_manager_20260811/dirty_baseline.md`: unstaged
  `git diff --name-status` and `git diff -- <each listed path>`; staged
  `git diff --cached --name-status` and `git diff --cached -- <each listed path>`; and the combined
  baseline `git diff HEAD --name-status` and `git diff HEAD -- <each listed path>`. Identify each
  hunk as staged, unstaged, or both, retain it as implementation input, and assign all listed paths
  to this owner through WP-R1. The separate documentation owner may append to the already modified
  `docs/CHANGELOG.md` and edit `devel/DEVEL_README.md`, but may not erase their pre-existing hunks.
- Evidence or review, when useful: a fresh reviewer compares the owner report to fresh unstaged,
  staged, and combined `--name-status` commands before M1 and flags any unexplained loss.
- Obvious follow-ons: this owner performs WP-D1 and WP-R1 serially; no other implementer edits the
  listed paths before its WP-R1 review passes.

### Work package: WP-D1 direct an articulated cascade

- Owner: audio_baseline_integrator.
- Touch points: new `src/audio/cascade_director.ts`, a new audio trace module, the existing impact
  presentation mapping, and new `tests/test_cascade_director.mjs`. It does **not** edit the dirty
  `tests/test_collision_audio.mjs` or `tests/test_impact_presentation.mjs` in this patch.
- Depends on: WP-B0; it consumes timestamped collision path, impulse, pan, and event sequence.
- Acceptance criteria: add `source_simulation_time_ms: number` and optional monotonic
  `source_event_sequence: number` beside `audio` in `ImpactPresentationCues`; copy them directly
  from `ImpactEvent.simulation_time_ms`/its sequence when mapping the event. The director buckets
  only that source time into 50 ms frames, selects a first-hit hero, sector-refractory attacks,
  and a decaying unselected-energy body, and records source time/path/pan on every output. The
  sole source-time-to-audio-time conversion occurs in the audio controller when it anchors the
  first received source frame to `AudioContext.currentTime`; neither presentation nor the director
  may use dispatch-arrival time or `currentTime` as a physics timestamp. No timer or random source
  participates.
- Evidence or review, when useful: provide named `ten_pin_strike`, `large_990_opening`,
  `large_990_propagation`, `large_990_tail`, dense-single-sector, and malformed-input traces.
- Obvious follow-ons: hand the `DirectedCollisionVoice`/body contract to WP-R1, WP-T2, and WP-E1.

### Work package: WP-R1 render protected layers

- Owner: audio_baseline_integrator.
- Touch points: `src/audio/audio.ts`, `src/audio/audio_backend.ts`, audio controller types, and
  `src/app/game.tsx` only if the public impact payload needs wiring.
- Depends on: WP-D1 and its fresh review.
- Acceptance criteria: extend the public backend contract to
  `AudioBufferSourceLike.start(when?: number, offset?: number, duration?: number): void` and add
  decoded-buffer `duration` to the backend buffer contract. Every simultaneous sample voice creates
  a separate one-shot source and calls that three-argument signature. Before the call, renderer
  code clamps `offset` to `[0, buffer.duration)`, clamps `duration` to the remaining decoded slice,
  and uses the procedural role fallback if no positive safe slice remains. The fake backend records
  `when`, `offset`, `duration`, scheduled `stop`, and disconnect cleanup for each source. Scheduled
  times use `AudioContext.currentTime`; hero uses impact plus low/body/attack roles; a quieter body
  reservoir ducks only its competing band during selected attacks; existing mute, preload, limiter,
  disposal, and active-voice cap remain valid.
- Evidence or review, when useful: expose a capture-only planned-voice trace with no gameplay
  behavior change.
- Obvious follow-ons: provide fake-backend hooks to WP-T2 and production trace hook to WP-E2.

### Work package: WP-T2 prove controller and browser behavior

- Owner: tester.
- Touch points: one new focused file under `tests/playwright/`; the baseline owner covers required
  fake-backend assertions in the existing dirty `tests/test_audio.mjs` as part of WP-R1.
- Depends on: WP-R1.
- Acceptance criteria: the WP-R1 fake backend trace proves overlapping intervals, signed panning,
  audio-clock starts, safe slice offsets/durations, cap preservation, scheduled stop/disconnect
  cleanup, and mute behavior. This browser test exercises normal controls and proves the live graph
  creates/cleans planned voices without a fixed node total.
- Evidence or review, when useful: focused Node command and
  `./run_playwright_tests.sh --grep audio-cascade`.
- Obvious follow-ons: hand production trace fields to WP-E2.

### Work package: WP-E1 render offline evidence

- Owner: playwright_operator.
- Touch points: `devel/verify_audio_cascade.mjs`,
  `devel/audio_cascade_evidence_contract.mjs`, a Playwright-hosted fixture page/helper, the
  `package.json` `verify:audio-cascade` script, and ignored `artifacts/audio-cascade/latest/`
  output.
- Depends on: WP-D1.
- Acceptance criteria: `npm run verify:audio-cascade` launches pinned Playwright Chromium and
  executes `OfflineAudioContext` inside that browser page, not Node. It renders synthetic ten and
  large traces, emits `artifacts/audio-cascade/latest/offline-report.json`, and evaluates the
  named contract below. Chromium offline rendering is required in this known terminal environment:
  unavailable capability, an incomplete report, or any failed metric exits nonzero. A pure-plan
  summary may be emitted for unsupported non-Chromium browsers as a compatibility diagnostic, but
  never substitutes for the Chromium report.
- Evidence or review, when useful: store raw measurements, fixture/source-asset revision,
  configured contract values, and each pass/fail reason in the ignored output.
- Obvious follow-ons: share report schema with WP-E2.

### Work package: WP-E2 verify real worker cascade

- Owner: playwright_operator.
- Touch points: the already dirty `devel/capture_real_gameplay_audio.mjs` (owned serially by the
  baseline owner), `devel/verify_audio_cascade.mjs`, the `package.json` script, and ignored
  `artifacts/audio-cascade/latest/` output.
- Depends on: WP-R1, WP-T2, and WP-E1.
- Acceptance criteria: the exact terminal command is `npm run verify:audio-cascade`. It builds,
  starts an ephemeral server, runs normal player-visible 990 and ten scenarios, captures
  post-master media and worker/planned-voice evidence, tears down even on failure, writes
  `artifacts/audio-cascade/latest/real-worker-report.json` and
  `artifacts/audio-cascade/latest/summary.json`, and exits nonzero for any missing artifact,
  failed contract metric, unavailable Chromium offline renderer, failed scenario, or cleanup
  failure. Its capture tap is a `MediaStreamAudioDestinationNode` connected directly from the same
  post-compressor/post-master-gain output that feeds the audible destination; each report records
  that `post_master_compressor_output` provenance. The 990 fixture asserts `fallen_pins >= 400`;
  the ten fixture asserts `Strike!`; both derive their result from the worker.
- Evidence or review, when useful: correlate first attack with first worker impact, reject audio
  after settlement, verify multiple physical/stereo regions, and compare large-cascade scale with
  ten without asserting a fixed node count.
- Obvious follow-ons: publish the exact terminal command for WP-G1 and M4.

### Work package: WP-G1 publish autonomous completion policy

- Owner: coder.
- Touch points: new `docs/HUMAN_GUIDANCE.md`; `AGENTS.md`; `README.md` "Status and boundaries";
  `devel/DEVEL_README.md` "Repo-local evidence tools"; `docs/CODE_ARCHITECTURE.md` collision
  audio/evidence paragraph; `docs/FILE_STRUCTURE.md` audio verification checklist;
  `docs/ROADMAP.md` next-priority audio acceptance item;
  `docs/active_plans/goal-objective.md` "Real-time review standard" and its terminal judgment;
  `goal-objective-revised.md` corresponding "Real-time review standard" and terminal judgment;
  `docs/active_plans/user-feedback-plan.md` "Acceptance criteria and gates" independent-review
  bullet; `docs/active_plans/active/practice_records_and_earned_moments.md` corresponding
  independent-review bullet; and `docs/CHANGELOG.md`'s current active-plan entry. It does not
  rewrite descriptive player-facing uses of "watch" elsewhere in those documents.
- Depends on: WP-E2 for command detail; policy wording may start earlier.
- Acceptance criteria: every owned terminal completion statement names fixtures, probes, commands,
  and independent-subagent review; no milestone requires listening, viewing, approval, or a
  sleeping human. Documents retain user authority for external/destructive actions.
- Evidence or review, when useful: add `devel/verify_autonomous_completion_policy.mjs` and a
  focused Node test. Its explicit owned-path list is every path named in this work package. It
  detects a completion word (`final`, `complete`, `accept`, `gate`, `close`, `done`, `authority`)
  within 160 characters of a human-dependency word (`listen`, `listening`, `view`, `viewing`,
  `watch`, `approve`, `approval`, `human`, `reviewer`) after stripping fenced code blocks. It
  allows documented `allow` records only for commit, credential, release, and destructive-operation
  authority with a reason and line-specific pattern. It exits zero only when no unallowed terminal
  dependency remains, otherwise prints `path:line:excerpt` and exits nonzero; normal gameplay
  descriptions are not search targets unless in a named terminal section.
- Obvious follow-ons: pass documentation diff to M4 reviewer.

## Acceptance criteria and gates

The terminal gate is a manager-run command, not a request for perception. The evidence harness owns
tunable values in `devel/audio_cascade_evidence_contract.mjs`, with comments explaining their
physical rationale. The table is that file's required exported contract: the harness must print
each value, unit, numerator/denominator, window, and pass/fail result. Fast tests assert durable
relations only, not these acoustic calibration values.

| Contract key | Observable and exact window | Required relation / threshold | Failure meaning |
| --- | --- | --- | --- |
| `source_provenance` | Every planned attack/body change in all fixtures; source time is milliseconds and path/pan are finite. | 100% cite a nonzero-worker source frame, valid path, and pan in `[-1, 1]`. | Fabricated or disconnected audio. |
| `opening_protection_ms` | Adjacent selected attack onsets in the same sector, source-time interval `[0, 1,200]` ms. | Each interval is at least 45 ms; no selected attack violates its director refractory rule. | Same-sector attacks fuse. |
| `propagation_gap_ms` | Consecutive audible attack-or-body activity groups while source energy remains nonzero in `[1,200, 4,500]` ms. | At least one group; longest gap is no more than 650 ms. | The cascade is sparse or loses the moving middle. |
| `tail_activity_ms` | Source-correlated activity groups in `[4,500, 7,500]` ms, measured from the large fixture's source-time anchor. | At least one group spans at least 120 ms and starts before physical settlement. | No readable physical tail. |
| `early_duty_fraction` | Offline-rendered large fixture, 50 ms RMS frames in `[0, 1,200]` ms; a frame is active above the fixture-relative noise floor. | Active-frame fraction is at least 0.35 and at most 0.82. | Below is sparse; above is a continuous wall. |
| `early_broadband_fraction` | Same offline frames; broadband is energy above the fixture's low/body band divided by total non-silent energy. | Fraction is at least 0.15 and at most 0.80. | Below lacks attack articulation; above is broadband wash. |
| `large_vs_ten_scale` | Offline render from first audible frame through last, with each fixture's own noise floor. | Large/ten non-silent duration is at least 1.50, integrated exposure ratio is at least 1.20, and large onset-group count is at least 1.25. | A 990 collapse does not develop beyond a ten-pin strike. |
| `transient_preservation` | First 1,200 ms of both offline fixtures; transient score is peak-to-100-ms-RMS crest factor in dB, reported only as a ratio. | Large crest score is at least 0.80 times ten's and at least two large onset groups are detected. | Dense mix erased the opening attacks. |
| `source_to_audio_ms` | Every selected large-fixture attack from source frame to planned audio start. | Delay is from 0 through 100 ms; no planned collision voice starts later than 250 ms after worker settlement. | Audio is detached or leaks after the roll. |
| `stereo_regions` | Large offline `[0, 7,500]` ms; signed post-pan energy bins left/center/right. | At least two bins carry at least 15% of non-silent energy and planned pans include both signs. | Permanently centered clump. |
| `master_safety` | Post-master Chromium capture and offline PCM for both fixtures. | Non-silent, finite samples; absolute PCM peak stays below 0.999; report provenance is `post_master_compressor_output`. | Silent, clipped, or wrong-tap media. |
| `bounded_cost` | 990 production capture and benchmark. | Active sources never exceed the declared controller cap; worker payload remains bounded by its existing contract; `npm run benchmark` exits zero. | Scale or cleanup regression. |

Gate sequence:

1. Before patches: WP-B0 captures and retains the dirty baseline; per-patch, owner runs focused
   tests and `git diff --check` without staging.
2. Integration: `./check_codebase.sh`, focused Playwright cascade test, and `npm run benchmark` pass.
3. Evidence: exactly `npm run verify:audio-cascade` produces fresh reports under
   `artifacts/audio-cascade/latest/` and exits zero. No alternate command closes this gate.
4. Independent review: a fresh reviewer reads source, reports, and documentation; any finding is
   fixed by a fresh owner and rereviewed. The reviewer disposition closes the gate.

## Test and verification strategy

| Layer | Owner | Command / artifact | What it proves |
| --- | --- | --- | --- |
| Pure behavior | audio_baseline_integrator | `node --import tsx --test tests/test_cascade_director.mjs tests/test_collision_audio.mjs tests/test_impact_presentation.mjs tests/test_audio.mjs` | Deterministic selection, overlap, provenance, pan, safe slices, cleanup, and bounds. |
| Browser behavior | tester | `./run_playwright_tests.sh --grep audio-cascade` | Production client wiring and graph lifetime through visible controls. |
| Browser-hosted offline fixture | playwright_operator | `npm run verify:audio-cascade` -> `artifacts/audio-cascade/latest/offline-report.json` | Chromium `OfflineAudioContext` rendered temporal, spectral, stereo, and dynamic relations without speakers. |
| Real worker | playwright_operator | `npm run verify:audio-cascade` -> `artifacts/audio-cascade/latest/real-worker-report.json` | Worker physics, post-master capture, comparison, safety, and settlement. |
| Human-dependency policy | coder | `node --import tsx devel/verify_autonomous_completion_policy.mjs` | Owned terminal docs have no human completion dependency. |
| Regression | integrator | `./check_codebase.sh && npm run benchmark && ./run_playwright_tests.sh` | Type, lint, unit, benchmark, and normal browser behavior. |

The offline and real-worker reports must identify their fixture revision, source assets, measured
values, configured evidence-contract values, and each pass/fail reason. Reports and media stay
ignored so a manager regenerates them; permanent tests do not compare their bytes.

## Migration and compatibility policy

- Keep the existing `CollisionSound` path available while WP-D1 lands behind one adapter.
- Preserve mute, preload fallback, result motifs, and public controller disposal behavior.
- Treat a missing decoded sample as a procedural fallback, not a reason to omit source provenance.
- A browser lacking offline rendering may receive the deterministic pure-plan diagnostic, but
  Chromium is the required known verifier host. Its missing `OfflineAudioContext` is a terminal
  verifier failure, never a green fallback.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Attack policy becomes too sparse | Flat cascade | Late field has no physics-correlated groups | WP-D1 owner | Compare stage coverage against ten and inspect evidence contract. |
| Attack policy becomes a wall | Masked cascade | Early duty/spectral occupancy saturates | WP-D1 owner | Sector refractory, global attack budget, and body ducking. |
| Offline audio differs by browser | False confidence | Offline capability or metrics differ | WP-E1 owner | Keep report diagnostic and corroborate with Chromium real-worker capture. |
| Chromium offline capability is missing | No autonomous closure | `OfflineAudioContext` is unavailable in the required verifier page | WP-E1 owner | Fail `npm run verify:audio-cascade` with capability details; repair the browser fixture rather than substituting a Node report. |
| Probe is flaky | No autonomous closure | Capture retries or settles inconsistently | WP-E2 owner | State-driven waits, bounded fixture timeouts, fresh report, and no arbitrary sleeps. |
| Plan/document drift restores human gate | Hidden blocker | Search finds approval/listen wording | WP-G1 owner | Owned source list, automated search, and independent documentation review. |
| Concurrent edits collide | Lost user work | Dirty overlapping file found | manager | Preserve current diff; dispatch disjoint owners and integrate deliberately. |

## Rollout and release checklist

- [ ] Preserve and inspect the pre-redesign capture report as a diagnostic, not a golden artifact.
- [ ] Record WP-B0's dirty-baseline report before any implementation owner edits its assigned files.
- [ ] Land M1 and M2 behind the existing audio controller boundary.
- [ ] Run the full automated evidence ladder on a freshly built app.
- [ ] Confirm browser fallback behavior when a sample decode fails.
- [ ] Include generated report paths and all commands in the final manager handoff.
- [ ] Do not commit or publish without the user's separate authorization.

## Documentation close-out requirements

- Active plan / progress tracker: this plan remains active until M4's rereview passes; record
  work-package status and report paths in the final execution handoff.
- docs/CHANGELOG.md entry: record the articulated cascade, autonomous verifier, and policy change
  in the date block that implements them.
- Policy: create `docs/HUMAN_GUIDANCE.md` with the durable manager/subagent-only completion rule,
  then link it from `AGENTS.md`.
- Reference docs: update the README, devel guide, architecture, file structure, roadmap, current
  objective/feedback plans, practice-record plan, and revised objective at the exact sections
  listed in WP-G1 so none makes human perception a terminal gate.
- Archive / closure notes: keep generated media and JSON ignored; link only the command and report
  schema from tracked documentation.

## Patch plan and reporting format

- Patch 0 (WP-B0): immutable dirty-baseline capture and serial ownership assignment.
- Patch 1 (WP-D1): one atomic `audio_baseline_integrator` patch containing the pure director,
  maintained traces, source-time bridge, and the new focused relational behavior proof.
- Patch 2 (WP-R1): the same baseline owner updates renderer/backend/fake-backend behavior,
  including safe sample slices, cleanup, and fallback proof; WP-T2 then adds only a new browser
  test file against its public trace.
- Patch 3 (WP-E1, WP-E2): browser-hosted offline and real-worker verifier plus fresh ignored report.
- Patch 4 (WP-G1): autonomous-completion policy and documentation repair.
- Patch 5 (M4): independent review, fresh fix patch if required, and rereview report.

Each owner report states: patch ID, files changed, contract fulfilled, commands run with result,
report paths, remaining risk, and handoff dependency. The manager records the exact failing metric
before dispatching a remediation; a fresh reviewer inspects every remediation.

## Open questions and decisions needed

- Manager/subagent decision procedure:
  - Decision owner or dedicated class: architect, with an independent reviewer.
  - Evidence and decision rule: start with the three-layer director. If its fresh evidence fails
    either the sparse or broadband-wall contract, run one bounded experiment changing only attack
    admission or body spectral role, compare its report against the same fixtures, and keep the
    variant that passes every contract with lower active-voice cost. If neither passes after two
    experiments, retain the reports and open a new architecture plan rather than accumulating
    unmeasured burst tweaks.
- Non-blocking follow-up: evaluate additional CC0 assets only after the existing bank passes the
  autonomous cascade contract; asset replacement is not required for this plan.
