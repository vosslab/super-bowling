# Cascade baseline

## WP-D2 sweep definition

This is the immutable E1 search-space definition. WP-D3 executes it exactly as recorded here. Any
future search-space change is a new experiment and does not rewrite this baseline gate after results
are known.

The permanent command is:

```sh
npm run strike-matrix -- --sweep
```

It runs only the 10-pin rack with the existing fixed timestep and no seeded or stochastic
variability. Each sample is a fresh world, so samples do not share physics state.

| Dimension      | Limit-derived values                                                                                                            | Count |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Power          | `8`, `12`, `16`, `20`, `24`                                                                                                     | 5     |
| Start position | `-15.5` through `+15.5` boards, inclusive, at a `1`-board interval                                                              | 32    |
| Angle          | `-0.010086657911640918` through `+0.010086657911640918` radians, five equally spaced values (`-0.578` through `+0.578` degrees) | 5     |
| Spin           | `-1`, `-0.5`, `0`, `0.5`, `1`                                                                                                   | 5     |

The grid contains `5 x 32 x 5 x 5 = 4,000` deterministic samples. Power and angle endpoints come
from `aim_limits(10)`. Board endpoints come from `board_position_limits(10)`, which converts those
same start-position limits into the player-facing board unit. Spin endpoints come from
`aim_limits(10)`; its evenly spaced five-value representation is shown above.

## Outcome classification

Classification measures the ball centre at its first crossing of the `y = 60 ft` head-pin plane.
The probe linearly interpolates between adjacent fixed-timestep snapshots; it never infers the class
from launch position, angle, or spin.

- A pocket line crosses `0.15..0.40 ft` from lane centre, inclusive.
- A centered line crosses within `0.05 ft` of lane centre, inclusive.
- All other crossings, and shots that never reach the plane, remain in the report as `other` and
  `did_not_reach` respectively.

## Baseline results

WP-D3 owns this section.

### E1 execution record

The immutable sweep command was invoked once on 2026-08-02:

```sh
npm run strike-matrix -- --sweep
```

Its complete combined stdout/stderr capture is
`/private/tmp/super_bowling_e1_sweep_20260802.txt` (8,952,155 bytes, SHA-256
`9b6474bfaa91758594debcc26f953e8f04cdf72a0b6e77df656396eec7105111`). It completed all `4,000`
samples in `39.44` seconds (`39.81` user seconds, `0.48` system seconds). The trailing `sysctl
kern.clockrate` permission warning came from `/usr/bin/time`, after the sweep result, and did not
change the probe result. The frozen grid remains unchanged.

| Measure | E1 result |
| --- | --- |
| Validity and conservation | `4,000 / 4,000` samples completed; all reported `conservation=true`. |
| Outcome class | `304` pocket, `66` centered, `3,630` other, `0` did-not-reach. |
| Strike and robust region | `115 / 4,000` per-sample summaries reported `STRIKE`: `113 / 304` pocket (`37.2%`), `0 / 66` centered, and `2` other. Pocket strikes occur at powers `12: 6`, `16: 10`, `20: 26`, and `24: 71`; none occur at power `8`. Their crossing offsets span `0.1500..0.3278 ft` in magnitude. A symmetric interior pair for later WP-A6 selection is power `24`, start positions `-0.2216923` and `+0.2216923`, angle `0`, spin `0`, crossing at `-0.2224706` and `+0.2224706 ft`; both strike. |
| Runtime masses | Ball `13.7947893`, standing pin `0.1239106`; ball:pin ratio `111.3286:1`. |
| Ball-to-pin path | `7,721` contacts across `2,528` samples; total impulse `11,665.1785`, maximum `4.6082`; total endpoint delta `85,037.4303`, maximum `24.1941`; `1,953` contacts after a fallen-capsule replacement. |
| Pin-to-pin path | `16,137` contacts across `2,152` samples; total impulse `5,418.8334`, maximum `3.9409`; total endpoint delta `89,040.5443`, maximum `39.5682`; `20` force events; all `16,137` contacts occurred after a fallen-capsule replacement. |
| Propagation and fall provenance | Maximum propagation depth `3`, reaching row `3`; depth distribution `0: 1,848`, `1: 896`, `2: 1,156`, `3: 100` samples. Of `11,761` fallen pins, `6,742` first contacted a pin and `5,019` first contacted the ball. Pin-first final travel spans `0.0392..3.5849 ft`. |
| Activation, sleeping, and shape | Pin-first falls: `6,690` active/awake and `52` inactive/sleeping at impact. All `11,761` fallen pins ended as capsules. A fallen-set shape was present in `2,444` samples, every one reaching row `3`. |

| Hypothesis | E1 label | Deciding metric | E1 evidence |
| --- | --- | --- | --- |
| H1 mass ratio | Supported | Runtime ball:pin mass ratio | `111.3286:1`, far beyond the intended equipment-scale ratio and consistent with density times unequal collider area. |
| H2 threshold units | Refuted as the baseline cascade blocker | Pin-to-pin contacts followed by pin-first falls | `16,137` pin-to-pin contacts produced `6,742` pin-first falls. Contacts occur and do produce falls, so the rule is not unreachable on this path. |
| H3 energy loss | Undetermined | Energy delta after a controlled restitution/damping change | Baseline reaches row `3`, produces pin-first falls, and has `113 / 304` pocket strikes, but it cannot causally isolate restitution or damping without E3. |
| H4 activation and sleeping | Refuted as the baseline cascade blocker | Fallen pin state at impact | `52` pin-first falls were inactive and sleeping at impact; waking without the active flag is not preventing all cascade processing. |
| H5 capsule necessity | Undetermined | Same repaired configuration with and without the capsule | The baseline has `16,137` post-capsule pin contacts and `11,761` capsule-ended falls, but has no circles-only comparison. |

The key negative evidence is that the centered lane has `0 / 66` strikes and `191 / 304` pocket
samples still miss, even though pin-to-pin contact is present, reaches the final rack row, and can
produce falls. E2 therefore must not treat a missing contact path as its premise; E3 through E5
remain necessary to separate energy, mass, and capsule effects.

### E2 threshold-floor experiment

WP-X1 temporarily changed only `physics_config.fall_impulse` in
`src/config/physics.ts`, from the exact WP-D3 value `2.8` to `0.000001`. The floor is positive, so
Rapier's force-event filter remains enabled, while being low enough to report trivial qualifying
contacts. The patch was applied for the one experiment sweep and then a second patch restored the
exact original `2.8`; the temporary comment was also removed.

The immutable command ran once with the temporary value:

```sh
/usr/bin/time -l npm run strike-matrix -- --sweep
```

Its complete combined stdout/stderr capture is
`/private/tmp/super_bowling_e2_threshold_floor_sweep_20260802.txt` (9,921,888 bytes, SHA-256
`4997ae085b00a1426ffc5ce0f1a3321583a62bc8cfabb7b63c79c93eadcb4920`). It completed all `4,000`
samples in `38.82` real seconds (`39.27` user seconds, `0.50` system seconds). The measurement
uses propagation and rear-row pin contact, not pinfall: the near-zero threshold makes trivial
contacts create artifact falls.

| Metric | E1 (`2.8`) | E2 (`0.000001`) |
| --- | --- | --- |
| Maximum propagation depth | `3` | `6` |
| Depth distribution | `0: 1,848`, `1: 896`, `2: 1,156`, `3: 100` | `0: 1,844`, `1: 240`, `2: 764`, `3: 892`, `4: 138`, `5: 88`, `6: 34` |
| Pin-to-pin contact samples | `2,152` | `2,156` |
| Rear-row pin-contact samples | `2,108` | `2,156` |
| Pin-to-pin contact occurrences | `16,137` | `21,291` |
| Pin-to-pin force events | not the deciding metric | `64,799` |

E2 reaches deeper graph paths after the floor permits trivial contacts to convert pins into fallen
capsules, and rear-row contact rises from `2,108` to `2,156` samples (`+48`). The rear-row path was
already broadly present at baseline, so this experiment does not show that it was missing or make
pinfall a deciding result. It is evidence that the raw threshold can amplify artifact propagation
once a contact occurs; it does not select an M3 branch or replace the remaining E3 through E5
experiments.

After restoration, the unchanged sweep was rerun:

```sh
/usr/bin/time -l npm run strike-matrix -- --sweep
```

The post-revert capture is
`/private/tmp/super_bowling_e2_revert_baseline_sweep_20260802.txt` (8,952,177 bytes, SHA-256
`3eba35efa54fe8e81f72a65d9106b2576351606507773eaa3dbcfa1843606ee3`). It completed in `39.61`
real seconds (`39.97` user seconds, `0.48` system seconds). A Python 3.12 comparison parsed all
`4,000` `Sweep diagnostics` records from this capture and the E1 artifact; their complete
diagnostic records were exactly equal. `git diff --check -- src/config/physics.ts` and
`git diff --exit-code -- src/config/physics.ts` both passed, proving the exact physics-field revert
without Git restore, reset, or stash.

### 990-pin performance reference

The required pre-M3 command was also attempted once on 2026-08-02:

```sh
node devel/run_simulation_benchmark.mjs
```

It exited with status `1` before measuring a 990-pin shot. Node could not resolve the extensionless
`src/config/lane` import from `src/config/physics.ts` (`ERR_MODULE_NOT_FOUND`). This is retained as
negative evidence that the bare documented invocation is stale, not as a performance result.

The repository benchmark front door then completed successfully:

```sh
npm run benchmark
```

It wrote its normal `artifacts/benchmark/simulation_benchmark.json` report with `30` samples and
passed its release gate. Its five 990-pin fixtures all settled; their median settle time is
`10,350 ms` and their median `performance.now()` fixture wall-clock time is `762.1043 ms`. These
are the pre-M3 performance reference figures.

### E3 mass and energy experiment

WP-X2 ran the immutable 4,000-sample sweep once for each cumulative condition. The deciding
metrics are pin-to-pin contact impulse and final travel of pins whose first contact was another
pin, measured against the regulation `7.234 in = 0.602833 ft` gap. Strike and pinfall totals do not
select the E3 configuration.

The source experiment began with `ball_mass: 35`, `pin_mass: 1`, `restitution: 0.08`, and
`pin_linear_damping: 2.2`. First, only the standing-pin and ball declarations changed from
`setDensity(physics_config.*_mass)` to `setMass(physics_config.*_mass)`, deliberately keeping the
numeric config values. This isolates the named-unit correction. It produced runtime masses `35`
and `1` (`35:1`), rather than E1's `13.7947893` and `0.1239106` (`111.3286:1`).

Second, with corrected declarations held, restitution alone changed from `0.08` to `0.20`. This is
one bounded, still-inelastic trial: normal rebound stays at one fifth of incident normal speed.
Third, with selected restitution held, pin linear damping alone changed from `2.2` to `1.0`. This
retains positive damping while testing lower standing-pin translation loss; it is one bounded trial,
not a search.

| Condition | Pin-pin occurrences / samples | Total / maximum impulse | Pin-first falls crossing 0.602833 ft | Crossing fraction | Travel p25 / p50 / p75 / p90 (ft) | Max depth |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| E1 density baseline | `16,137 / 2,152` | `5,418.833 / 3.941` | `5,752 / 6,742` | `85.316%` | `0.769 / 1.287 / 1.808 / 2.351` | `3` |
| Mass declaration only | `17,159 / 1,996` | `37,508.630 / 22.990` | `5,846 / 6,644` | `87.989%` | `0.838 / 1.448 / 1.830 / 2.258` | `4` |
| Mass + restitution `0.20` | `17,290 / 2,094` | `41,205.964 / 30.691` | `6,113 / 6,885` | `88.787%` | `0.848 / 1.437 / 1.814 / 2.322` | `4` |
| Mass + restitution `0.20` + damping `1.0` | `18,499 / 2,096` | `41,882.443 / 31.445` | `7,142 / 8,047` | `88.754%` | `0.868 / 1.455 / 1.841 / 2.384` | `5` |

The declaration correction raises total impulse by `32,089.797`, gap crossings by `94`, and their
fraction by `2.673` points versus E1. With mass fixed, restitution adds `3,697.334` impulse,
`267` crossing pins, and `0.798` crossing-fraction points; median travel is `0.012 ft` lower, so
its retaining evidence is crossings, not every quantile. With selected mass and restitution held,
damping adds `676.479` impulse, `1,029` crossing pins, `1,162` pin-first falls, and raises median,
p75, and p90 travel by `0.019`, `0.027`, and `0.061 ft`; its crossing fraction is `0.034` points
lower because the denominator grows more than the crossing count. The count and upper-travel gains
make the damping trial useful despite that fraction tradeoff.

#### E3 experiment manifest for E4 and E5

E4 and E5 must apply this exact temporary configuration, with no additional E3 tuning:

| Source location | Exact temporary change | Reason retained |
| --- | --- | --- |
| `src/simulation/world.ts`, standing pin collider | `setDensity(physics_config.pin_mass)` to `setMass(physics_config.pin_mass)` | Correctly interprets the existing mass-named value; it supplies the largest impulse and gap-crossing improvement. |
| `src/simulation/world.ts`, ball collider | `setDensity(physics_config.ball_mass)` to `setMass(physics_config.ball_mass)` | Keeps ball and standing-pin declarations in the same named unit; runtime masses become exactly `35` and `1`. |
| `src/config/physics.ts` | `restitution: 0.08` to `restitution: 0.20` | Adds impulse and gap-crossing count/fraction with corrected mass held. |
| `src/config/physics.ts` | `pin_linear_damping: 2.2` to `pin_linear_damping: 1.0` | Adds pin-first travel and gap-crossing count with corrected mass and restitution held. |

This is temporary experiment data, not a permanent physics decision. It supports H1 and H3 enough
to test the same repaired configuration with and without the capsule. It does not select a final
regulation ratio or replace WP-A1/WP-A3's permanent measurements.

#### E3 artifacts and restoration proof

Each artifact is a complete combined stdout/stderr capture of `npm run strike-matrix -- --sweep`:

| Condition | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Mass declaration | `/private/tmp/super_bowling_e3_mass_declaration_sweep_20260802.txt` | `8,737,148` | `773603d241a5838aafe43f3382bd51d4bd86c11b5c296dea567c8a969ce36a47` |
| Mass + restitution | `/private/tmp/super_bowling_e3_mass_restitution_020_sweep_20260802.txt` | `9,117,160` | `df416605a195234657b50d17ab1e922b97ae00db180f49afd24947d9d6dc753d` |
| Mass + restitution + damping | `/private/tmp/super_bowling_e3_mass_restitution_020_damping_100_sweep_20260802.txt` | `9,431,877` | `6bf445ff6226628e6be79dc4a32a0165527c27c1f983b768ac078695f3789734` |

One non-decision audit capture, `mass + damping 1.0 + restitution 0.08`, remains at
`/private/tmp/super_bowling_e3_mass_damping_100_sweep_20260802.txt` (`9,108,212` bytes, SHA-256
`2add250619151fc93588791b4ced9737f39a447f8fa2a4655b7a9c9a323bd1eb`). It is explicitly excluded
because it did not hold selected restitution constant.

After the final measurement, `apply_patch` restored both declarations to `setDensity`, restitution
to `0.08`, and pin linear damping to `2.2`. The unchanged sweep then produced
`/private/tmp/super_bowling_e3_revert_baseline_sweep_20260802.txt` (`8,952,071` bytes, SHA-256
`6d06e713a984d9278779887838e4d5ea74c00b1c1b6d492b3004a6f4e221c871`). Python 3.12 parsed all
`4,000` `Sweep diagnostics` records from that capture and E1; the complete records compare exactly
equal. `git diff --check -- src/config/physics.ts src/simulation/world.ts` and `git diff --exit-code
-- src/config/physics.ts src/simulation/world.ts` both passed, showing no E3 working-tree diff.
`src/simulation/world.ts` remains staged for earlier WP-D1 instrumentation; E3 did not alter that
existing index state. Focused verification passed:

```sh
node --import tsx --test tests/test_strike_matrix.mjs
```

with `13 / 13` tests passing. Residual risk is intentional: E3 measures 10-pin energy and travel,
not capsule necessity, large-rack performance, or the permanent threshold repair. E4 and E5 must
use the manifest verbatim before those decisions.

### E4 circles-only comparison

WP-X3 applied the E3 experiment manifest verbatim: standing pins and the ball used `setMass` with
the existing `1` and `35` config values, restitution was `0.20`, and standing-pin linear damping
was `1.0`. It then made the smallest shape-only change: `mark_pin_fallen` retained the standing
circle instead of calling `replace_with_fallen_collider`. No threshold, activation, mass value,
damping value, or other collider shape changed.

The immutable 4,000-sample command completed with that temporary condition:

```sh
npm run strike-matrix -- --sweep
```

The clean output artifact is
`/private/tmp/super_bowling_e4_circles_only_clean_sweep_20260802.txt` (9,126,690 bytes, SHA-256
`8a00733b81312eb453dbdc2838e1021930e7f98c96606178bcb35a66b10693d1`). It parses as all `4,000`
per-sample diagnostics and has `4,000 / 4,000` `conservation=true` summaries. The earlier
`/private/tmp/super_bowling_e4_circles_only_sweep_20260802.txt` is preserved as failed procedural
evidence: an interrupted process injected one foreign `Probe failed` line into its capture, splitting
one JSON line. It is excluded from E4 measurement. The clean capture's final footer says
`execution valid=false` because at least one sample did not settle cleanly; that gate means *not
every* sample struck, not that no sample struck.

| Measure | E4 circles-only result |
| --- | --- |
| Outcome class | `314` pocket, `66` centered, `3,620` other, `0` did-not-reach. |
| Strike and robust region | `210 / 4,000` strikes: `192 / 314` pocket (`61.1%`), `2 / 66` centered, and `16` other. Pocket strikes by power are `8: 2`, `12: 26`, `16: 36`, `20: 40`, `24: 88`; their crossing offsets span `0.1516..0.3881 ft`. The symmetric power-8 pocket pair is start `-/+0.1330154 ft`, opposite `-/+0.0050433 rad` aim angles, spin `0`, crossing `+/-0.1733311 ft`; both strike. E4 therefore does not preserve a centered no-strike control. |
| Pin-to-pin path | `7,711` occurrences across `1,728` samples; `4,458` force events; total impulse `35,059.3647`, maximum `20.3738`; total endpoint delta `70,123.8066`, maximum `30.0682`. Exactly `0` contacts occur after a fallen-capsule replacement because no replacement occurs. |
| Propagation depth | `0: 2,272`, `1: 570`, `2: 836`, `3: 322`; this graph metric stays separate from rear-row evidence. |
| Rear-row pin-origin evidence | Exact `deepest_contact_row` distribution is absent `2,272`, row `2` `38`, and rear row `3` `1,690` samples. Separately, row-3 pins with first contact `pin_pin` account for `3,966` falls across `1,638` samples; pin-first rows are `1: 524`, `2: 1,748`, `3: 3,966`. Both measures prove a pin-origin path reaches the rear row; neither is the graph-depth metric above. |
| Fallen shape and travel | `12,600` fallen pins: `6,238` pin-first and `6,362` ball-first. Every final shape is `standing_circle`; pin-first travel spans `0.4632..3.5704 ft`, and all pin-first impacts are active and awake. |

This condition therefore has a reachable, broad pocket passing region and rear-row pin-origin
contacts. It does **not** settle every sample cleanly, and it does not decide capsule retention:
E5 must run the identical E3 manifest with the existing capsule swap restored, then compare the
named criteria directly.

After measurement, `apply_patch` restored both `setDensity` calls, restitution `0.08`, pin linear
damping `2.2`, and the call to `replace_with_fallen_collider`. The source SHA-256 values match the
pre-E4 values exactly: `src/config/physics.ts`
`63112fe762f9440bbdfe519fd8b57f3acf7cc25a6e6909885502f454b3a65552` and
`src/simulation/world.ts`
`798bc668b19f902a4e8c068569d1ee96f0e22a09a7b0566f98092ce5a841ee80`.

#### E5 targeted 990 fixture completion

The earlier full `npm run benchmark` failure stops in supported-mode order on a 10-pin fixture, so
its `0 / 5` 990 result is procedural only. To measure the requested 990 behavior, WP-X4 reapplied
the exact E5 manifest with capsules and invoked exported `run_benchmark(1000, fixture)` separately
for every exported `benchmark_fixtures` entry, catching every error so one failure could not hide a
later fixture. No durable benchmark source was edited. The complete combined output, including
outer wall clocks, samples, and caught errors, is
`/private/tmp/super_bowling_e5_capsule_990_fixture_probe_20260802.txt` (`3,841` bytes, SHA-256
`2d3fbeca4a50e8c4c71e1dc918ac73bb614f51386974ec0242ba224f4060cf0e`).

| 990 fixture | E5 capsule result | Settle time | Fixture `performance.now()` wall-clock |
| --- | --- | ---: | ---: |
| head-on | settled; `568` standing / `422` fallen; max awake `442` | `21,141.6667 ms` | `1,994.4101 ms` |
| left pocket | throws `Ball did not reach the pit before the settlement timeout` | none | none |
| right pocket | settled; `569` standing / `421` fallen; max awake `477` | `17,083.3333 ms` | `1,462.5335 ms` |
| late left hook | settled; `682` standing / `308` fallen; max awake `387` | `14,175 ms` | `1,080.0540 ms` |
| gutter recovery | settled; `790` standing / `200` fallen; max awake `260` | `18,083.3333 ms` | `1,286.9845 ms` |

Thus E5 completes `4 / 5` 990 fixtures and the five-fixture median does not exist because left
pocket fails. For the four completed fixtures only, the median settle time is `17,583.3333 ms` and
median fixture wall-clock is `1,374.7590 ms`, versus E1's all-five `10,350 ms` / `762.1043 ms`.
The targeted evidence confirms the earlier large-rack conclusion: deeper 10-pin propagation does
not arrive without a meaningful 990 playability regression under the exact temporary manifest.
After the probe, `apply_patch` restored the same source hashes stated above; no additional sweep
was run.
`git diff --check -- src/config/physics.ts src/simulation/world.ts` and
`git diff --exit-code -- src/config/physics.ts src/simulation/world.ts` both pass, preserving the
accepted WP-D1 instrumentation while leaving no E4 working-tree residual.

### E5 capsule comparison

WP-X4 applied the E3 manifest verbatim and left the baseline `mark_pin_fallen` call to
`replace_with_fallen_collider` enabled. Standing-pin and ball colliders used `setMass(1)` and
`setMass(35)` respectively, restitution was `0.20`, and standing-pin linear damping was `1.0`.
No fall threshold, activation, mass value, or non-capsule shape behavior changed.

The one clean immutable sweep command was:

```sh
npm run strike-matrix -- --sweep
```

It produced `/private/tmp/super_bowling_e5_capsule_clean_sweep_20260802.txt`
(`9,431,877` bytes, SHA-256
`6bf445ff6226628e6be79dc4a32a0165527c27c1f983b768ac078695f3789734`). Its bytes are exactly
identical to E3's same-manifest capsule capture, an independent determinism check. The command
returns status `1` because its footer says `execution valid=false; all samples strike=false`:
that status means at least one sample did not settle cleanly, **not** that the sweep has no strikes.
All `4,000` per-sample diagnostics parse and all `4,000` conservation summaries are true.

| Measure | E4 circles-only | E5 capsules | Direct comparison |
| --- | ---: | ---: | --- |
| Strikes | `210` total; `192 / 314` pocket (`61.1%`), `2` centered, `16` other | `235` total; `135 / 314` pocket (`43.0%`), `23` centered, `77` other | The total rises `25`, but the pocket passing proportion falls `18.1` points and the centered control regresses. |
| Pocket passing span and symmetric interior | `0.1516..0.3881 ft`; power-8 symmetric pair | `0.1516..0.3870 ft`; power-16 symmetric pair at starts `-/+0.7537538 ft`, aims `+/-0.0100867 rad`, spin `0` | Reachable in both; capsules do not make the pocket region materially more robust. |
| Graph propagation depth | `0: 2,272`, `1: 570`, `2: 836`, `3: 322` | `0: 1,904`, `1: 504`, `2: 1,076`, `3: 477`, `4: 35`, `5: 4` | Capsules reach deeper rows: maximum depth `5` rather than `3`. |
| Deepest pin-contact row | absent `2,272`; row 2 `38`; row 3 `1,690` | absent `1,904`; row 2 `18`; row 3 `2,078` | Rear-row pin-origin contact occurs in `388` more samples. |
| Pin-pin path | `7,711` occurrences; `4,458` force events; impulse `35,059.3647`; endpoint delta `70,123.8066`; post-swap `0` | `18,499`; `6,692`; `41,882.4428`; `83,473.8129`; post-swap `18,499` | Capsule contacts increase under the exact same manifest. |
| Fallen pins | `12,600`: `6,238` pin-first, `6,362` ball-first; all circles; pin-first travel `0.4632..3.5704 ft` | `13,679`: `8,047` pin-first, `5,632` ball-first; all capsules; pin-first travel `0.0137..3.8161 ft` | More pin-first falls, with capsule-specific short-travel falls included. |

E5 therefore observes one named capsule benefit: **propagation reaches deeper rows**. It does not
observe a strike becoming reachable where circles failed, nor a materially more robust pocket
passing region. Its large-rack criterion is not satisfied, because the performance measurement
below shows a meaningful playability regression. These facts are evidence for the architect; this
tester does not make the M3 branch selection.

With this exact E5 capsule condition still applied, `npm run benchmark` failed before writing a
new benchmark JSON:
`Ball did not reach the pit before the settlement timeout` from `world.ts:824`. Its complete
combined output is `/private/tmp/super_bowling_e5_capsule_benchmark_20260802.txt` (`888` bytes,
SHA-256 `62db9637586293de916b36d65d0ffeb80661436d1509ca2a20a301d945da1791`). Thus `0 / 5`
990 fixtures completed, no 990 median settle time or median `performance.now()` wall-clock exists,
and no E5 condition JSON was produced. This is an explicit failure against E1's all-five-settled
`10,350 ms` median settle time and `762.1043 ms` median wall-clock reference, not missing data.

After source restoration, `npm run benchmark` again passed all `30` samples and replaced the normal
ignored artifact. Its command output is
`/private/tmp/super_bowling_e5_postrestore_benchmark_20260802.txt` (`333` bytes, SHA-256
`3dd5f7d636f8240f9d081f93c6bdbe66fe820737c34692f7a669b55b463a8bda`) and its JSON is
`/private/tmp/super_bowling_e5_postrestore_benchmark_20260802.json` (`20,746` bytes, SHA-256
`94932253ec2bc56b1912b58070376e3c8463e3c5cbbc8e83ee3e9ce7b744a3cc`). The restored 990 fixtures
are all settled/reached-pit: head-on `10,350 ms`/`773.3612 ms`, left pocket `10,075 ms`/`738.7184 ms`,
right pocket `10,333.3333 ms`/`766.4907 ms`, late left hook `10,408.3333 ms`/`651.7352 ms`, and
gutter recovery `10,583.3333 ms`/`616.3469 ms` (settle / fixture `performance.now()` wall-clock).
Their restored median settle time is `10,350 ms`; the wall-clock variation is a fresh local timing
observation, not a replacement for E1's recorded `762.1043 ms` comparison reference.

Finally, `apply_patch` restored `setDensity` for both colliders, restitution `0.08`, and damping
`2.2`; the capsule swap was never disabled in this task. Source SHA-256 again exactly matches the
pre-task values: `src/config/physics.ts`
`63112fe762f9440bbdfe519fd8b57f3acf7cc25a6e6909885502f454b3a65552` and
`src/simulation/world.ts`
`798bc668b19f902a4e8c068569d1ee96f0e22a09a7b0566f98092ce5a841ee80`.

## M2 branch selection

M3 runs WP-A1, then WP-A2, then WP-A3, then WP-A5, followed by WP-A6 after the shipped
configuration passes the strike gate. WP-A4 is skipped. This is the required sequence, not a
license to copy the temporary E3 manifest into permanent configuration.

| Hypothesis | Status after E1-E5 | M3 decision |
| --- | --- | --- |
| H1 mass ratio | Supported: density produced a `111.3286:1` runtime ratio; `setMass` produced `35:1`. | Run WP-A1 unconditionally. Declare mass as mass, start its ratio from regulation proportions, and re-measure rather than retain an unmeasured number. |
| H2 threshold units | Refuted as the baseline binding cause: pin-first falls already followed pin contacts. E2 still shows raw-threshold artifact amplification. | Run WP-A2 unconditionally. Label it a mass-invariance design repair, not the proven binding cause. |
| H3 energy loss | Supported by E3: corrected mass plus individually tested restitution and damping increased impulse, gap crossings, travel, and depth. | Run WP-A3. Re-measure restitution and damping separately after A1/A2; choose no permanent value without that measurement. |
| H4 activation and sleeping | Refuted as the baseline blocker: `52` sleeping/inactive pin-first falls occurred. | Skip WP-A4. |
| H5 capsule necessity | Supported for retention under the stated any-one rule: E5 reaches depth `5` versus E4 depth `3` and adds `388` rear-row contact samples. | Run WP-A5 and retain the capsule. Do not copy the whole E3 manifest: its pocket and centered controls regress, and its 990 playability regresses. |

WP-A2 searches the lowest mass-normalized fall threshold at which a robust pocket line passes
while the exact centered control still fails. Every A1-A3 patch changes one variable, reruns the
diagnostics, and compares 990 performance to E1. WP-A5 preserves outgoing mass on the retained
capsule swap and rechecks the full sweep; it does not decide the visual fallen axis, which remains
an independent renderer-consumer check.

## A1 permanent regulation mass declaration

WP-A1 makes the config unit explicit and gives both colliders their declared mass, rather than a
density whose effective mass depends on shape area. `ball_mass_lb: 16` is the USBC maximum legal
ball mass; `pin_mass_lb: 3.5` is the USBC target pin mass (3 lb 8 oz). The resulting ratio is
`16 / 3.5 = 4.5714286:1`. This is a single regulation-derived starting point, not a search or an
attempt to compensate for the still-raw fall threshold or energy-loss settings. The [USBC Equipment
Specifications Manual](https://images.bowl.com/bowl/media/assets/usbc/equipment%20specs/26_231-26-march-es-manual.pdf)
specifies a ball not exceeding 16.00 lb and pin target/minimum/maximum weights of 3 lb 8 oz / 3 lb
6 oz / 3 lb 10 oz. `create_pin_collider` and `create_ball_body` now use `setMass`; the outgoing
standing collider's runtime mass remains the exact `setMass` input when
`create_fallen_pin_collider` builds its capsule.

The immutable command ran once with the permanent A1 source:

```sh
/usr/bin/time -l npm run strike-matrix -- --sweep
```

Its complete combined stdout/stderr capture is
`/private/tmp/super_bowling_a1_regulation_mass_sweep_20260802.txt` (`8,748,076` bytes, SHA-256
`eb6f1813704b04e5c611882317e14726afd61da661518b846a2a04936a5d8f4f`). It completed all `4,000`
samples in `39.35` real seconds (`39.76` user seconds, `0.50` system seconds). All `4,000`
summaries report `conservation=true`. The footer's `all samples strike=false` is the probe's
aggregate validity predicate, not a claim that no per-sample summary says `STRIKE`; the parsed
per-sample results below include `213` strikes.

| WP-D1 measure | E1 density baseline | A1 regulation mass | A1 minus E1 / interpretation |
| --- | ---: | ---: | --- |
| Runtime ball / pin mass and ratio | `13.7947893` / `0.1239106`; `111.3286:1` | `16` / `3.5`; `4.5714:1` | Direct declared-pound mass replaces shape-derived density mass. |
| Ball-pin contacts / samples with a contact | `7,721` / `2,528` | `7,694` / `2,528` | Occurrences fall by `27`; the number of samples with a ball-pin contact is unchanged. |
| Ball-pin impulse total / maximum | `11,665.1785` / `4.6082` | `222,383.1854` / `176.0667` | `+210,718.0069` total; direct masses change impulse scale as expected. |
| Ball-pin endpoint delta total / maximum | `85,037.4303` / `24.1941` | `72,107.3778` / `24.2699` | `-12,930.0525` total; these are qualified net pre/post-step deltas, so simultaneous contacts can contribute. |
| Ball-pin post-capsule contacts / force events | `1,953` / `878` | `2,524` / `8,044` | `+571` post-capsule contacts; force-event scale changes with the raw threshold. |
| Pin-pin contacts / samples with a contact | `16,137` / `2,152` | `16,401` / `2,050` | `+264` occurrences across `102` fewer samples. |
| Pin-pin impulse total / maximum | `5,418.8334` / `3.9409` | `96,545.0152` / `91.3627` | `+91,126.1818` total. |
| Pin-pin endpoint delta total / maximum | `89,040.5443` / `39.5682` | `53,267.7342` / `21.1434` | `-35,772.8101` total; same endpoint qualification applies. |
| Pin-pin post-capsule contacts / force events | `16,137` / `20` | `16,401` / `11,852` | All pin-pin contacts remain post-capsule; force events are not an A1 selection metric. |
| Propagation depth distribution / maximum | `0:1848, 1:896, 2:1156, 3:100`; `3` | `0:1952, 1:632, 2:897, 3:513, 4:6`; `4` | A1 adds depth `4` without changing capsule behavior. |
| Rear-row pin-contact samples | `2,108` | `2,046` | `-62`; rear-row contact remains broadly present. |
| Pin-first / ball-first falls | `6,742` / `5,019` | `6,970` / `4,486` | `+228` pin-first and `-533` ball-first falls. |
| Pin-first travel / 7.234 in gap crossings | `0.0392..3.5849 ft`; `5,752 / 6,742` | `0.0298..3.5906 ft`; `6,095 / 6,970` | `+343` crossing pins; the fraction is `87.45%` versus `85.32%`. |
| Pin-first impact state and fallen shape | `6,690` active-awake, `52` inactive-sleeping; `11,761` capsules | `6,970` active-awake, `0` inactive-sleeping; `11,456` capsules | A1 does not alter the retained capsule shape path. |
| Fallen-set samples | `2,444` | `2,436` | `-8`. |
| Outcome classes | `304` pocket, `66` centered, `3,630` other | `302` pocket, `52` centered, `3,646` other | All samples reach the head-pin plane. |
| Strikes / pocket range | `115`: `113 / 304` pocket, `0 / 66` centered, `2` other; `0.1500..0.3278 ft` | `213`: `136 / 302` pocket, `18 / 52` centered, `59` other; `0.1673..0.3917 ft` | Pocket strikes increase, but the centered control regresses. |

The prior symmetric interior pocket pair remains a strike under A1: power `24`, starts
`-/+0.2216923 ft`, zero aim angle and zero spin, crossing `-/+0.2386379 ft`. Thus a robust pocket
region is reachable, but the A1 strike gate is **not passed**: exact centered launches now strike
`18 / 52` times. WP-A2 must repair the mass-invariant threshold before any conclusion about A3
energy tuning.

`npm run benchmark` was also run under A1 and aborted before a 990 fixture with `Ball did not reach
the pit before the settlement timeout`; its capture is
`/private/tmp/super_bowling_a1_regulation_mass_benchmark_20260802.txt` (`888` bytes, SHA-256
`62db9637586293de916b36d65d0ffeb80661436d1509ca2a20a301d945da1791`). A per-fixture exported
`run_benchmark(1000, fixture)` probe then caught each result independently. Its capture is
`/private/tmp/super_bowling_a1_regulation_mass_990_fixture_probe_20260802.txt` (`877` bytes,
SHA-256 `cea57744aa294073ebdbcc578e11d577d6e2a759b5d8d2028605e421a9840c5b`). Head-on, left pocket,
right pocket, late left hook, and gutter recovery each failed to reach the pit; their outer wall
times were `1400.2768`, `1358.5457`, `1335.0243`, `1331.4544`, and `1333.9392 ms`, respectively.
No 990 settle or fixture-wall median exists, versus E1's five-settled `10,350 ms` / `762.1043 ms`
medians. This is residual A1 risk to remeasure after A2 and A3, not a reason to retune the
regulation-derived mass ratio.

Focused A1 verification passes `21 / 21` tests in
`node --import tsx --test tests/test_simulation_benchmark.mjs`, including the new runtime
mass-ratio and standing-to-fallen mass-preservation test. `git diff --check` also passes. The full
`./check_codebase.sh` completes typecheck, lint, and formatting, then runs `129 / 132` Node tests;
the three failures are all reach-pit assertions (`test_regulation_physics` minimum-power paths and
rail retention, plus the strike-matrix all-mode test), each throwing the same settlement timeout.
They match the direct benchmark failure above and are retained as A1 residual evidence for the
planned A1 mass selection rather than weakened or rewritten here.

### A1 bounded reachability bracket, declared before execution

The regulation `16 / 3.5 = 4.5714:1` start fails the required reach-pit gate, so A1 now makes one
bounded, monotonic selection of `pin_mass_lb` while holding the ball fixed at `16 lb`. The candidate
ratios are `8`, `16`, `32`, `64`, and `128:1`, corresponding respectively to pin masses `2`, `1`,
`0.5`, `0.25`, and `0.125 lb`. They are powers of two above the failed regulation start and stop at
`128:1`, which brackets E1's density-era `111.3286:1` configuration known to reach the pit. This is
a bounded search for the first complete behavioral pass, not threshold, restitution, damping,
capsule, or activation tuning.

For each candidate in that order, the predeclared evidence is one clean immutable 4,000-sample
sweep, `./check_codebase.sh`, and isolated caught `run_benchmark(1000, fixture)` calls for all five
fixtures. A candidate may be selected only when all summaries conserve pins, a robust pocket strike
region and pin-origin propagation remain, the exact centered control fails and is not reliably a
strike, the codebase gate passes, and all five 990 fixtures reach the pit and settle with medians
recorded against E1. Execution stops at the first complete pass; if none passes through `128:1`,
the source returns to the regulation start and the architect must choose a new scope.

#### Candidate 8:1 (`pin_mass_lb: 2`): rejected

The clean sweep artifact is `/private/tmp/super_bowling_a1_ratio_8_sweep_20260802.txt`
(`8,706,186` bytes, SHA-256
`d3320834b20f76a15ce00bbffbb1399f053d665ed99d75b8390df37b0a912c90`). All `4,000` samples
conserve pins; outcomes are `314` pocket, `64` centered, and `3,622` other, with `168` strikes
(`111` pocket, `20` centered, `37` other) and depth distribution `0:2050, 1:595, 2:904, 3:448,
4:3`. The centered-strike result independently fails the centered control.

Its isolated all-fixture 990 capture,
`/private/tmp/super_bowling_a1_ratio_8_990_fixture_probe_20260802.txt` (`847` bytes, SHA-256
`37f41e4ced658629de2e93593da8594f3c4b0fc4ecb7223425a28f4649499e31`), records a reach-pit timeout
for head-on, left pocket, right pocket, late left hook, and gutter recovery (outer wall times
`1427.0940`, `1379.8395`, `1355.8239`, `1369.2879`, and `1379.5405 ms`), so no settle medians
exist. The formatted `./check_codebase.sh` capture is
`/private/tmp/super_bowling_a1_ratio_8_check_formatted_20260802.txt` (`13,338` bytes, SHA-256
`bdabb1d53ea16b0cfe8bbfa69bd21068e1a40a5a10563b950e59b25d24cd8972`): typecheck, lint, and format
pass, but Node is `130 / 132`, failing the minimum-power reach-pit and strike-matrix all-mode
reach-pit assertions. Candidate `8:1` is therefore rejected; no later gate can select it.

### Superseded global-pin bracket

The global `8:1`, `16:1`, and `32:1` pin-mass candidates are preserved as negative evidence only.
They were superseded by the user direction to keep every pin at the regulation `3.5 lb` value and
make only the 990-mode ball superhuman. The in-progress global `128:1` sweep was interrupted on
receipt of that direction; it is not evidence. No global `64:1` or `128:1` result is selected.

### 990-only superhuman ball bracket

The user-directed design keeps `ball_mass_lb: 16` for modes 10 through 500 and `pin_mass_lb: 3.5`
for every rack. `get_ball_mass_lb` selects a separate 990-only ball mass, and `create_ball_body`
receives its rack total explicitly so respawns preserve that selection. The predeclared 990-only
ball bracket is `40`, `80`, `160`, `320`, then `448 lb`, with all other dynamics held fixed.

| 990 ball mass | Ratio to 3.5 lb pin | Isolated five-fixture outcome | Artifact SHA-256 |
| --- | ---: | --- | --- |
| `40 lb` | `11.4286:1` | `0 / 5` reach pit | `c399efd7206c9f28d7b24e8895d766dea490b5e44812dec72d97dfddc19b2f22` |
| `80 lb` | `22.8571:1` | only gutter recovery settles | `17c48962f84bdb03cadac024f8bf45d595322f96121fb372caa3013d6cb5848d` |
| `160 lb` | `45.7143:1` | `4 / 5` settle; left pocket times out | `e9298a19de851db8060aaf046aafa22994b51baf4f27e198a9913cd078f238a6` |
| `320 lb` | `91.4286:1` | first `5 / 5` settle | `c4d2b2037513ff1f9391c97596a5b5ce85210e3e3565adf22359fe0cc8a9f2f4` |

The selected `320 lb` 990 candidate has settle times `10,400`, `10,475`, `10,475`, `10,408.3333`,
and `9,858.3333 ms` (median `10,408.3333 ms`), close to E1's `10,350 ms`. The final standard-rack
confirmation sweep remains clean at `4,000 / 4,000` conserved samples:
`/private/tmp/super_bowling_a1_final_standard_sweep_20260802.txt` (`8,748,076` bytes, SHA-256
`bdb1f7cffead232ea6dc3e1f7bf9910dc0339bf7fba8849a559aed0f459272a4`).

However, this is not a complete A1 selection: its full check still fails standard-mode reach-pit
tests, and `npm run benchmark` aborts at a non-990 fixture. A 990-only mass cannot change those
standard-mode results. Candidate `448 lb` is therefore not run; a decision to alter the standard
reachability contract or its physical model is outside this bounded 990-only bracket.

### A1 final rack-aware mass selection

The architect resolved the earlier 990-only branch as insufficient: 10 and 21 actual pins retain a
16 lb ball and every pin retains the 3.5 lb regulation target, while fantasy racks receive only the
minimum ball mass that clears their fixed reachability bracket. The selected immutable table is
`10:16`, `21:16`, `45:40`, `105:80`, `496:320`, and `990:640` lb. The 10-pin sweep remains the
standard-rack control; `/private/tmp/a1_final_sweep.txt` contains its final 4,000 samples
(`8,747,970` bytes, SHA-256 `9ddcc156c949c184ed5067dd303b202d666370d979c002d8b3685b597ea7e59f`).
The final complete benchmark is `/private/tmp/a1_final_benchmark.txt` (`333` bytes, SHA-256
`3dd5f7d636f8240f9d081f93c6bdbe66fe820737c34692f7a669b55b463a8bda`).

The final selected-table gate artifact is `/private/tmp/a1_selected_extra_gates.json` (`1,184`
bytes, SHA-256 `e2c4152b519fa14d46f9752845c3d83e443d61f5565e453cf6061923d0e89ad7`): both p8 zero-spin
gutters reach the pit without pinfall, and the p24 center rail probe completes for 45, 105, 496,
and 990 pins. The default-aim all-rack diagnostic is
`/private/tmp/a1_selected_default_matrix.json`; it records conservation for each selected rack.
The final repository gate capture is `/private/tmp/a1_final_check.txt` (`12,058` bytes, SHA-256
`0e82f8ce5de68ecb61707eeb07dba44e1db7b9a71a704b5c84252a9faf2dcf60`), with typecheck, lint,
format, and all Node tests passing.

| Rack pins | Selected mass | First p8 nine-path pass | Five-fixture benchmark |
| ---: | ---: | --- | --- |
| 10 | `16 lb` | actual rack retained | final standard sweep control |
| 21 | `16 lb` | actual rack retained | final benchmark passes |
| 45 | `40 lb` | `40 lb` | all settle |
| 105 | `80 lb` | `40 lb` fails center; `80 lb` passes | all settle |
| 496 | `320 lb` | `40`, `80`, `160` fail center; `320 lb` passes | all settle |
| 990 | `640 lb` | `40`, `80`, `160`, `320` fail center; `640 lb` passes | all settle |

The earlier statement that 10 pins fail at 16 lb / 3.5 lb was mistaken: it resulted from applying
the provisional global-mass experiment before the architect's rack-aware resolution. The final
standard 10-pin sweep and final full benchmark/check are the controlling evidence.

#### Reproducible A1 evidence artifacts

The clean selected default matrix is `/private/tmp/a1_selected_default_matrix_clean.json`
(`165,597` bytes, SHA-256 `270c0b5cc427965d488cb7e7739963ab6aec569404023e60b8562614fa8af1f8`).
The clean selected extra-gate artifact is `/private/tmp/a1_selected_extra_gates_clean.json`
(`6,113` bytes, SHA-256 `410695f2fd4d48c6a2abf427f78858bdfc120cfdfc7a2ca3a6150713260fbadd`):
each rack labels all nine p8 start/spin paths, both zero-spin gutters and their pinfall counts, and
the p24 center rail final counts. The clean stop-rule manifest is
`/private/tmp/a1_candidate_manifest_clean.json` (`658` bytes, SHA-256
`e5de3acf578b5ebfba5ac59d37b7f5154b546f9fddbf77b428098286437fbeaf`).

The current benchmark JSON is `artifacts/benchmark/simulation_benchmark.json` (`20,818` bytes,
SHA-256 `ba2cda9f74ae4a9f3aa11a053dd9cfbe9a1e8a61307f8a1553026274d52dc152`). Its 990 fixtures are
head-on `10008.3333 ms` / `826.4711 ms`, left pocket `9608.3333` / `787.4805`, right pocket
`10933.3333` / `900.7584`, late left hook `9816.6667` / `673.9727`, and gutter recovery
`10958.3333` / `652.2112` (settle / fixture CPU). Their medians are `10008.3333 ms` settle and
`787.4805 ms` CPU, versus E1's `10350 ms` and `762.1043 ms` respectively.

## 1000-mode superhuman controls and deck drive

Ten-pin controls and its frozen E1 sweep remain `power 8..24` and `spin -1..1`. Actual rack
`990` (the 1000-mode) instead exposes the explicit, rack-aware envelope `power 8..60` and
`spin -4..4`; the preview and live launcher both consume those limits, so a power-60 launch is
not silently reduced to 24.

The 990 hook scales its speed phases to `65/42/2 ft/s` (skid/hook/roll). The 1x gain candidate
did not surpass old full-spin head-plane displacement, so the smallest succeeding 2x candidate is
selected; it gives a visibly stronger, symmetric left/right curve without a hidden forward boost.
A zero-spin trajectory remains unaffected.

After the first native ball-pin collision only, the 990 ball receives a forward deck assist at
each fixed step: `a = clamp((36 - max(vy, 0)) / 0.12, 0, 70) ft/s²`, where `vy` is its observed
fixed-step forward progress rather than a potentially stale contact-solver velocity; force is
applied as `F = m*a` using the ball's runtime mass. It never acts before contact, in a gutter, or
after pit capture, and its contact and acceleration state reset for the next roll. The selected 990 ball mass remains
`640 lb`; this control patch does not reopen the A1 mass calibration.

### A2 attribution correction

The earlier non-990 stall guard was recorded under A2, but it is not part of the authoritative
mass-normalized fall repair. WP-A7 owns it as a separate measured recovery guard: after real pin
contact and only within the same pin-field bounds, it targets `1 ft/s` with a `20 ft/s^2` cap. This
keeps ordinary rolls unassisted while preserving the full deterministic sweep's reach-pit gate.

## WP-A2 mass-normalized fall rule

WP-A2 replaces the raw impulse comparison with pin delta-v in ft/s. For each Rapier force event,
the simulation evaluates every participating pin independently as
`delta_v = totalForceMagnitude() * fixed_step_seconds / collider.mass()`. The ball is not a fall
target. The event publisher threshold is derived from that same response rule:
`threshold_force = fall_velocity_change_ft_per_second * pin_mass_lb / fixed_step_seconds`.
Standing pins, fallen capsules, and balls all receive that pin-derived threshold, so a rack-aware
superhuman ball cannot silently change the pin fall filter.

Local Rapier declarations establish the relevant semantics: `TempContactForceEvent` reports the
sum of contact-force magnitudes, and `ColliderDesc.setContactForceEventThreshold` describes its
argument as the total force magnitude beyond which an event can be emitted. The local type source
does not declare a combination rule for unequal collider thresholds. That ambiguity is not on this
path: every dynamic publisher uses the same derived pin threshold. Per-endpoint pin mapping is
therefore explicit for ball--pin and pin--pin events.

The bounded p24 probe used the recorded symmetric pocket starts `-/+0.2216923 ft` and the exact
center start, each at zero angle and spin. It is enough to reject a candidate before an expensive
full sweep when it violates the behavioral selection rule.

| Candidate delta-v | Pocket pair | Exact center | Decision |
| ---: | --- | --- | --- |
| `0.8 ft/s` | strike / strike | strike | reject: centered control strikes |
| `1.6 ft/s` | strike / strike | strike | reject: centered control strikes |
| `3.2 ft/s` | strike / strike | strike | reject: centered control strikes |
| `6.4 ft/s` | strike / strike | miss | reject: full sweep aborts on a ball that cannot reach pit |
| `12.8 ft/s` | miss / miss | miss | reject: no robust pocket strike |
| `25.6 ft/s` | miss / miss | strike | reject: no robust pocket strike and centered control strikes |

The complete `0.8 ft/s` sweep is `/private/tmp/a2_sweep_0_8.txt` (SHA-256
`d76dc55a2f623d5b9a5aae2f222b933c85e263a18fa18e358753bc8d5ffa9eff`): all 4,000 samples completed
and conserved pins, with 136 pocket strikes and 18 centered strikes. The `6.4 ft/s` full-sweep
attempt is `/private/tmp/a2_sweep_6_4.txt` (SHA-256
`1d2f3157964ce1124760bf2cffd1ffb64096810d3661c8ee7ecfbbdef745510a`); it aborts with the existing
"Ball did not reach the pit before the settlement timeout" guard, so it cannot be selected even
though the focused control looks correct. The shipped source is restored to the A1-equivalent
`0.8 ft/s` rather than inventing a new tuning range. The formula/unit test passes; the repository
front-door check reaches typecheck and lint but currently fails only format checks for unrelated
`src/game/match.ts` and `src/game/scoring.ts` files.

**WP-A2 status: DONE_WITH_CONCERNS.** The design defect is repaired and covered, but the frozen
bracket has no candidate that satisfies both the strike-control and reachability gates. This requires
the architect's bounded decision before WP-A3 changes energy retention.

### A2 final selection

`6.4 ft/s` remains the lowest bracket candidate with the required symmetric pocket strikes and
exact-center miss. The non-990 reach-pit recovery is owned and measured by WP-A7, not attributed
to the A2 fall-rule design.

The immutable 4,000-case 10-pin grid was rerun in four bounded execution chunks using its unchanged
published settings: `4,000 / 4,000` settled and conserved, with no thrown reach-pit errors. It has
`302` pocket crossings and `81` pocket strikes, `52` exact-centered crossings and `0` centered
strikes, `103` total strikes, rear-row pin-contact provenance in `1,944` samples, and maximum
propagation depth `4`. This is the behavior gate: the two recorded p24 symmetric interior pocket
starts strike, while the exact centered control misses.

The 990 normal (`p16`, zero spin) and maximum (`p60`, spin `4`) center fixtures both settle, reach
the pit, and conserve all `990` pins. `npm run benchmark` also passes its full 30-sample release
gate, including all five 990 fixtures; its generated report is
`artifacts/benchmark/simulation_benchmark.json` (SHA-256
`3dec958d8e412c2badcc034d6b839d50eb86357bb06d62b580b04f0fa309b274`). The final full repository
gate passes (`/private/tmp/a2_final_check_pass.txt`, SHA-256
`092a3e04b018684e8426de5033b4d1c2e01b290e592b0b1903e9083853570767`).

The stale test that required a legal exact-centered strike was corrected to the plan's behavioral
contract: exact centered rolls may topple pins but do not strike. This preserves a meaningful pocket
versus center distinction without asserting a tuned pinfall count.

**WP-A2 final status: DONE.**

## WP-A3 energy-retention decision

WP-A3 froze the accepted A2 configuration: the `6.4 ft/s` mass-normalized
fall rule, regulation pin mass, rack-aware ball masses, capsule transition,
and both deck-drive paths were unchanged. It made two isolated candidates and
did not search beyond them.

First, restitution alone changed from `0.08` to `0.20`. The ball, standing
pin, and fallen-capsule descriptions now all explicitly use Rapier's `Max`
combine rule. Equal coefficients make every dynamic pair exact: with the
shipped value, `max(0.08, 0.08) = 0.08`; the rejected candidate likewise
resolved to `0.20`. This removes an implicit engine-default dependency without
changing the retained physical coefficient.

At `0.20`, each p24 symmetric pocket still struck, exact p24 center still
missed, and the left/right pocket runs increased pin-to-pin impulse from about
`108.2` to `151.3` and `150.9` respectively. Both paths retained rear-row
pin-first falls. That apparent transfer gain was not safe: the existing
legal exact-center control found a strike at p16. Restitution was therefore
restored to `0.08`, rather than accepting a stronger but less discriminating
ten-pin game.

Second, after restoring the selected `0.08` restitution, pin linear damping
alone changed from `2.2` to `1.0`. This is the valid damping isolation. Its
focused controls all passed: both p24 pockets struck, p24 and p16 exact center
each remained `8/10`, the former p8 progress-stall fixture reached the pit and
settled `8/10`, and p60 spins `-4`, `0`, and `+4` on 990 pins all settled with
conserved pins. It increased the three 990 pin-first-fall counts from
`496/459/564` to `804/765/803`, and rear-row pin-first counts from `13/16/16`
to `20/26/26`.

That localized gain did not survive the release-relevant grid: the immutable
4,000-shot sweep completed with `execution valid=false` because at least one
ordinary ten-pin launch did not settle cleanly. Lower damping is therefore
rejected for a causal, delivery-critical reason, not because the old
restitution-`0.20` control was invalid. Damping is restored to `2.2`. Standing
and fallen linear damping remain shared; the existing fallen-only angular
damping is unchanged.

The selected configuration is consequently `restitution: 0.08` and
`pin_linear_damping: 2.2`, with explicit common restitution combining. Its
focused p24 controls are left pocket `10/10`, center `8/10`, and right pocket
`10/10`, all settled and conserved; each pocket has four rear-row pin-first
falls. The former p8 progress-stall fixture settles with `8` fallen and `2`
standing. At 990 pins, p60 spins `-4`, `0`, and `+4` all settle and conserve
the rack (`500`, `464`, and `569` fallen respectively).

The immutable 4,000-shot sweep also completes `4,000 / 4,000` settled and
conserved: `302` pocket crossings yield `78` strikes, `52` centered crossings
yield `0` strikes, and `100` strikes occur overall. The focused physics,
lane-contract, and strike-matrix tests pass `44 / 44`; the full
`./check_codebase.sh` gate passes. `npm run benchmark` passes all 30 samples;
all five 990 fixtures settle and conserve, with `9,350 ms` median settlement
and `911.9302 ms` median fixture CPU. The immediate pre-A3 energy values were
retained, so no energy-retention regression was introduced; compared with E1's
`10,350 ms` 990 settlement reference, the selected configuration settles
faster. Fixture CPU is timing evidence, not a gameplay selection criterion.

Evidence: `/private/tmp/a3_restitution_020_focused.jsonl`,
`/private/tmp/a3_damping_100_reselected_restitution_008.jsonl`,
`/private/tmp/a3_damping_220_selected_restitution_008.jsonl`,
`/private/tmp/a3_final_focused_cases.jsonl`,
`/private/tmp/a3_final_4000_sweep.txt`, `/private/tmp/a3_final_check.txt`,
and `artifacts/benchmark/simulation_benchmark.json` (SHA-256
`813f95b386747998e88a7c837bf9594a2f97df150760c60689297bd456cf1d52`).

**WP-A3 final status: DONE.**

## WP-A6 durable cascade regression

`tests/test_pin_cascade.mjs` runs two fresh offline ten-pin worlds: the robust
interior pocket launch (`p24`, start `-0.22169230769230772 ft`) and its
same-power centered control. Each roll uses the settlement budget derived from
`get_settle_max_seconds(10) / fixed_step_seconds`, checks rack conservation on
every step, and disposes its world in `finally`. The permanent assertions are
behavioral: both rolls settle without a timeout, the pocket drops more pins,
and a fallen pin in the dynamically derived last row first contacted a pin.
It deliberately does not lock a pin count, strike, tuned constant, or event
collection size.

The focused command passes on the shipped configuration:

```sh
node --import tsx --test tests/test_pin_cascade.mjs
```

A fresh disposable source mirror then applied guarded exact transforms only in
the mirror to restore the historical raw `fall_impulse: 2.8` rule, its
force-event gate, and raw per-step impulse predicate. The identical fixture
failed with the pocket-versus-centered ordering assertion, as expected; the
raw rule lets the centered control eliminate that distinction. The mirror was
removed after the check. This is negative evidence that the test protects the
mass-normalized threshold repair rather than a tuned count.

**WP-A6 status: DONE.**

## WP-A7 superhuman 990 through-pin drive

WP-A7 changes the 990 collider to a measured `40 lb` mass. The 10- and 21-pin modes retain their
`16 lb` regulation-scale ball configuration, and the existing mass-normalized pin fall rule and
mass-preserving fallen capsule transition are unchanged.

The drive first requires a real ball--pin collision, then remains active only inside the physical
pin field from the head-pin contact envelope to the deck backstop. It applies `F = m * a` in
`lb ft/s^2` along the launch's forward unit vector, so it cannot steer a roll sideways. With
`D = deck_depth(990)`, the superhuman 990 geometry scale is `target_speed = 24 + 0.30D ft/s` and
`maximum_acceleration = 24 + D ft/s^2`; regulation-scale recovery remains the separately bounded
`1 ft/s` / `20 ft/s^2` guard. The final quarter-deck multiplies acceleration by a linear fade that
reaches zero exactly at the backstop. Gutters, pits, pre-contact travel, and the pins-free preview
have no drive.

The deterministic paired probe is `npm run backstop-probe`. It records runtime mass, force/
acceleration/speed trace, terminal position, time to the pin-field backstop, collision provenance,
and settle outcome in `artifacts/m3/990_backstop_probe.json` (SHA-256
`441f28bded362364cf2029edfddd83352cf8424d99812d76a8a262db26c2078c`). The published legal
high-power/high-spin launch is `power=60`, `start_position=0`, `angle=0`, `spin=4`.

| Candidate | Runtime mass | Backstop | Time | Terminal y | Outcome | Evidence |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Drive on, legal p60/s4 | `40 lb` | yes | `1.8667 s` | `99.0829 ft`, pit | settled | 24 ball-pin contacts; 3,258 pin-pin contacts |
| Drive off, same launch | `40 lb` | no | none | `81.4656 ft`, not pit | stalled | explicit timeout failure; not coerced complete |
| Drive on, legal p8/s0 | `40 lb` | yes | `8.7250 s` | `99.4354 ft`, pit | settled | 30 ball-pin contacts; 3,641 pin-pin contacts |

This is the retained negative evidence: the identical legal high-power/high-spin launch stalls
when the 990 drive is disabled. It proves the drive's capability without disguising a stall as a
successful roll. The `npm run benchmark` release gate passes all 30 samples after this change; its
current artifact is `artifacts/benchmark/simulation_benchmark.json` (SHA-256
`7ef1e4c5aa5fc149e218d05b4bd1ffe9d6d588a54ef0b8ce53b672bd109835c1`). All five 990 benchmark
fixtures settle and conserve pins. After focused ten-pin, paired-990, and benchmark gates passed,
the immutable full sweep completed `4,000 / 4,000` with `execution valid=true`; the capture is
`/private/tmp/super_bowling_a7_final_sweep_20260802.txt` (SHA-256
`d23797a341358946026b5847665eb35dc895142dfbbbe99a7c91a1dd1a4fd17f`).

**WP-A7 status: DONE.**

### A7 force-unit reconciliation

The simulation preserves its measured through-pin kinematics while making the
conversion explicit. The authoritative lane mapping derives `S =
foul_to_head_pin / 60 = 1` world unit per foot. For each rack,
`geometry_factor = lane_width(rack) / (41.5 / 12 ft)`; the 990 rack's current
factor is `12.566284337349396`. The diagnostic lbf value is derived from the
selected pre-fade acceleration so the only applied force remains exactly the
previous response:

```
F_world = F_lbf * 32.174 * S * geometry_factor * field_fade
        = collider_mass * selected_acceleration * field_fade
```

Thus fade occurs once, reaches zero at the backstop, and does not alter the
proven acceleration path. The focused lane contract asserts finite positive
conversion factors and active lbf/world values, both formula equalities, and
zero reconstructed force at the backstop. `node --import tsx --test
tests/test_lane_contract.mjs` passes `12 / 12`; `npm run backstop-probe`
retains the same paired outcomes (drive-on high-power and low-power settle;
the identical drive-off launch stalls); and `npm run benchmark` passes all
`30` samples. Current artifact hashes are
`artifacts/m3/990_backstop_probe.json` SHA-256
`441f28bded362364cf2029edfddd83352cf8424d99812d76a8a262db26c2078c`
and `artifacts/benchmark/simulation_benchmark.json` SHA-256
`7ef1e4c5aa5fc149e218d05b4bd1ffe9d6d588a54ef0b8ce53b672bd109835c1`.

### A7 final evidence reconciliation

On 2026-08-02, frozen-behavior verification regenerated both A7 artifacts. `npm run
backstop-probe` preserved the paired outcomes: both drive-on launches settled at the backstop, and
the identical drive-off high-power launch stalled. `npm run benchmark` wrote 30 samples and passed
its release gate: every sample settled with conserved pins and finite measurements.

The focused frozen regressions also passed: `node --import tsx --test
tests/test_lane_contract.mjs tests/test_regulation_physics.mjs` reported `21 / 21`. The final
artifact provenance is `artifacts/m3/990_backstop_probe.json` (`56,615` bytes, SHA-256
`441f28bded362364cf2029edfddd83352cf8424d99812d76a8a262db26c2078c`) and
`artifacts/benchmark/simulation_benchmark.json` (`20,752` bytes, SHA-256
`7ef1e4c5aa5fc149e218d05b4bd1ffe9d6d588a54ef0b8ce53b672bd109835c1`). The benchmark artifact
hash is recorded from this exact final generation because fixture CPU measurements vary between
runs; this reconciliation changes no behavior.
