# Collision-zone prediction measurement

Historical prediction evidence for the archived shot-camera work record. It
supports the early, throughout-travel pre-impact commit before the camera
receives its authoritative first ball-pin centroid.

## Method and boundary

- Ran `npm run build`, then `npx tsx devel/measure_zone_prediction.mjs`.
- The probe serves `dist/` and drives the built production worker only through
  `initialize`, `preview_path`, `launch`, `snapshot`, `impact`, and `settled`.
  It does not construct a separate physics world. The worker supplies the
  pins-free Rapier path, live snapshots, and the first `ImpactPathSummary`.
- Source-valid center, strong-hook, off-center, and gutter shots were measured
  for 105, 496, and 990 pins. `0.5` is the existing
  `shot_focus_start_progress`, so it is the relevant candidate start, not an
  arbitrary timing threshold. `free_ball` is only 50 ms path interpolation for
  the divergence diagnostic; zone expansion uses the live ball's nearest path
  point.

M3 changed the subject geometry after the earlier failed report. It now finds
the earliest segment--circle entry among physically reachable immutable rack
pins, rather than choosing the pin at the path segment's closest point. It
then clips to the rack-pin envelope extended by exactly one `ball_radius`. The
previous strict immutable pin footprint excluded legal ball-centre contact
positions, so it was inconsistent with a measurement whose target is the
first-contact centroid. This is a physical contact envelope, not a tolerance
chosen to pass M4.

Deck assist cannot affect the approach: `apply_ball_force` requires a real
ball-pin hit, which a pins-free path cannot have. The public worker
`preview_path` remains assist-free. Pre-contact free/live comparison is valid;
post-contact divergence is expected evidence of this boundary.

## Measurements

`trend` is contained pre-contact snapshots / all pre-contact snapshots;
`commit` is containment at progress `0.5`; `err` is the last pre-contact
contact-centroid error in boards, rows; `div` is maximum free/live divergence
in feet before / after contact. Values below are rounded only for display; the
full-precision trace remains ignored locally under
`artifacts/m4/zone_prediction_measurements.json`.

| Rack | Shot        | Trend      | Commit | Err (boards, rows) | Div (approach / post-contact ft) |
| ---: | ----------- | ---------- | ------ | ------------------ | -------------------------------- |
|  105 | center      | 109/109    | yes    | 0.000, -1.145      | 0.208 / 5.011                    |
|  105 | strong hook | 113/113    | yes    | 0.218, -0.867      | 0.190 / 4.909                    |
|  105 | off-center  | 120/120    | yes    | -0.171, -0.818     | 0.206 / 2.486                    |
|  105 | gutter      | no contact | n/a    | n/a                | 2.433 / 0.000                    |
|  496 | center      | 68/68      | yes    | 0.000, -1.138      | 0.207 / 6.497                    |
|  496 | strong hook | 72/72      | yes    | 0.012, -0.996      | 0.198 / 4.152                    |
|  496 | off-center  | 82/82      | yes    | -0.068, -0.802     | 0.206 / 2.501                    |
|  496 | gutter      | no contact | n/a    | n/a                | 2.339 / 0.000                    |
|  990 | center      | 27/27      | yes    | 0.000, -0.779      | 0.512 / 11.539                   |
|  990 | strong hook | 43/43      | yes    | 0.150, -0.641      | 0.491 / 2.242                    |
|  990 | off-center  | 44/44      | yes    | 0.802, 1.200       | 0.485 / 2.115                    |
|  990 | gutter      | no contact | n/a    | n/a                | 2.263 / 0.000                    |

All 9 of 9 contacting shots contain their eventual first-contact centroid at
the `0.5` focus-ramp start and at every sampled pre-contact point through
contact. Gutters have no ball-pin centroid, so their live/free edge traces are
retained as observations rather than turned into a false containment claim.

## M6 journey relation

M6 uses `CollisionZone.journey_depth`, the trailing world-space boundary of
the accepted zone, as its monotonic progress denominator. Re-reading the
retained full-precision traces shows that every measured contacting archetype's
first-contact centroid is no farther than that boundary at both the existing
commit snapshot and the sampled contact snapshot. The camera therefore cannot
saturate at the old rack-front depth before those measured collisions, and it
continues into the local deck neighborhood after first contact. This is a
descriptive relation from the production-worker evidence, not a permanent
numeric threshold. Gutter traces continue only to their clipped edge-deck
neighborhood; they do not manufacture a collision depth.

## Current interpretation

The measurement supports an early pre-impact commit at the source focus-ramp
start for the measured 105-, 496-, and 990-pin archetypes, including the
large-rack hook and off-centre cases. It is evidence for the predicted approach
subject, not a claim that post-contact free and live paths remain equivalent.
At the first authoritative ball-pin impact, the camera now replaces that
prediction with the worker's measured contact centroid, using the same fixed
local wave and physical contact-shell clipping. Later work preserves physics
and the settled-result handoff; its visual and raster evidence is recorded
separately.
