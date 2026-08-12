# Impact-window distribution measurement

M10 evidence for the live-shot collision camera. This is deliberately a
decision record, not a new visual or elapsed-time acceptance gate.

## Method and provenance

- Ran `npm run build`, then
  `npx tsx devel/measure_impact_window_distribution.mjs`.
- The probe served the freshly built `dist/` over loopback and, in Chromium,
  drove `simulation_worker.js` only with its public `initialize`, `launch`,
  `snapshot`, `impact`, and `settled` protocol. It did not construct a world,
  replay callbacks, or substitute its own physics.
- For center, strong-hook, and off-centre source-valid aims in 10-, 105-,
  496-, and 990-pin racks, it retained every worker-published `ball_pin` and
  `pin_pin` path summary: simulation time, contact count, maximum and total
  impulse, centroid, and the maximum-impulse ratio to the running global peak.
  The full raw trace is intentionally ignored under `artifacts/m10`; this
  report contains the durable summary rather than linking to an untracked
  artifact.
- `pit` and `settle` are the first in-pit and final snapshot times supplied by
  the worker. They describe the renderable-ball boundary and result handoff;
  they are not latency promises.

The `early`/`later` comparison below uses the first second after initial
ball-pin contact only as a readable descriptive slice. It is not a proposed
cut-off. `ratio` is each path's maximum impulse divided by the largest
maximum impulse reported up to that worker tick. Medians and maxima are shown
to make overlap visible without selecting a passing threshold.

| Rack | Aim         | ball/pin windows | first contact / pit / settle (ms) | Early ratio median--max | Later ratio median--max |
| ---: | ----------- | ---------------: | --------------------------------: | ----------------------: | ----------------------: |
|   10 | center      |            4 / 6 |                2551 / 2893 / 5534 |            0.270--1.000 |            0.010--0.010 |
|   10 | strong hook |            4 / 7 |                2562 / 2890 / 5514 |            0.294--1.000 |                      -- |
|   10 | off-center  |            3 / 5 |                2600 / 2823 / 4778 |            0.113--1.000 |                      -- |
|  105 | center      |           9 / 89 |                2555 / 3470 / 6799 |            0.078--1.000 |            0.005--0.048 |
|  105 | strong hook |          8 / 111 |                2606 / 3534 / 6908 |            0.097--1.000 |            0.006--0.047 |
|  105 | off-center  |          10 / 74 |                2760 / 3244 / 6370 |            0.069--1.000 |            0.006--0.061 |
|  496 | center      |         13 / 210 |                2561 / 4286 / 7803 |            0.178--1.000 |            0.014--0.472 |
|  496 | strong hook |         21 / 217 |                2726 / 4025 / 8921 |            0.179--1.000 |            0.010--0.401 |
|  496 | off-center  |         13 / 155 |                3018 / 3933 / 9033 |            0.181--1.000 |            0.009--0.103 |
|  990 | center      |         17 / 301 |                1024 / 1991 / 6785 |            0.274--1.000 |            0.005--0.057 |
|  990 | strong hook |           5 / 18 |                1602 / 1743 / 5406 |            0.167--1.000 |            0.002--0.009 |
|  990 | off-center  |            1 / 0 |                1653 / 1707 / 2443 |            1.000--1.000 |                      -- |

For reproducible magnitude context, this is the within-shot distribution of
each path record (`median / p90 / maximum`), retaining the worker's units.
It reports both maximum and total impulses and contact count; each individual
record, including its centroid and time, is serialized by the probe under the
ignored artifact boundary.

| Rack | Aim         | Maximum impulse             | Total impulse               | Contact count |
| ---: | ----------- | --------------------------- | --------------------------- | ------------: |
|   10 | center      | 14.729 / 36.834 / 70.735    | 21.284 / 46.836 / 70.735    |     1 / 2 / 4 |
|   10 | strong hook | 19.347 / 51.443 / 65.802    | 23.378 / 51.443 / 65.802    |     1 / 3 / 3 |
|   10 | off-center  | 7.370 / 52.586 / 65.228     | 7.370 / 52.586 / 65.228     |     1 / 1 / 2 |
|  105 | center      | 2.455 / 25.861 / 121.272    | 3.651 / 42.578 / 135.336    |     1 / 3 / 6 |
|  105 | strong hook | 4.916 / 33.578 / 102.171    | 7.137 / 53.116 / 106.326    |     2 / 5 / 9 |
|  105 | off-center  | 3.387 / 35.821 / 72.252     | 3.797 / 47.951 / 92.811     |     1 / 4 / 9 |
|  496 | center      | 6.630 / 40.283 / 101.809    | 14.058 / 68.522 / 169.166   |    3 / 9 / 18 |
|  496 | strong hook | 5.518 / 42.981 / 148.817    | 9.496 / 74.406 / 172.686    |    2 / 9 / 18 |
|  496 | off-center  | 3.305 / 38.945 / 94.449     | 5.331 / 72.749 / 174.365    |    2 / 7 / 18 |
|  990 | center      | 3.011 / 97.626 / 244.002    | 5.660 / 371.109 / 927.244   |   4 / 28 / 56 |
|  990 | strong hook | 9.692 / 148.851 / 238.990   | 9.692 / 148.851 / 238.990   |     1 / 5 / 7 |
|  990 | off-center  | 194.297 / 194.297 / 194.297 | 194.297 / 194.297 / 194.297 |     2 / 2 / 2 |

## Spatial counterexamples

The simple relative-peak premise is not supported across rack sizes. In the
496-pin center shot, the strongest window more than one second after first
contact had ratio `0.472` at `(-0.140, 83.359)`, about 23.2 ft downstream of
the first-contact centroid. The 496-pin hook likewise had a later `0.401`
window at `(-2.348, 85.247)`, about 21.8 ft downstream. Both are strong on
the proposed scalar but belong to a remote tail, not the first local
neighborhood. Some early records have zero or very small reported impulse,
but the aggregate summaries cannot establish whether those individual records
belong to the local branch. They therefore cannot rescue an intensity-only
rule or identify which lower-strength records should be retained.

The broad pattern is still informative. Most later windows are small (later
medians `0.002`--`0.014` where they exist), but 496-pin tails demonstrate that
an intensity-only expansion rule cannot be trusted as the authority for
camera geometry. The worker's own in-pit snapshots also arrive before many
of those tails, so demanding continued ball visibility during them would
contradict the renderer's intentional in-pit omission.

## Disposition

Do **not** implement a single relative-to-running-peak expansion rule. The
right source-derived next step, if the held view must follow a later local
cascade, is an authoritative connectivity signal: retain collision-pair
identity or a physics-owned connected-component identifier while draining the
impact window, then expose the component connected to the initial ball-pin
event. A camera could compose that component's centroid/envelope with the
already accepted collision zone. The current public summaries contain only
aggregate centroids and impulses, so they cannot distinguish a strong remote
branch from a strong local one without inventing a distance threshold.

Until that physics contract exists, preserve the current first-contact held
zone/envelope and the settled-result handoff. This is a concrete evidence
blocker for impulse-only M10 expansion, not a blocker for the already
authoritative local-collision framing.
