# Dense Rack Canvas Baseline

Measurement snapshot: 2026-08-12T05:00:48.426Z

This is an M11 baseline, not a visual-quality gate. It records the shipped
Canvas raster path before any dense-pin-body candidate is tried, so a later
M14 comparison can use the same probe and environment rather than inventing a
portable millisecond or pixel threshold.

## What was measured

`devel/measure_dense_rack_canvas.mjs` bundles a disposable browser harness
from `devel/m11_dense_rack_harness.ts`. The harness imports the production
`create_game_renderer`, sets its snapshot, camera, and ball visibility through
that renderer, and times its normal `renderer.draw()` method after its real
`load_game_assets` rasterization reports `ready`. It serves the built
production `dist/assets/` at the same document-relative URLs used by the game.
It does not use the synthetic benchmark renderer. A separate optional direct
command/draw profile exists only to attribute phases for the M12 smoothing
experiment; its results are explicitly not the M11 full-renderer baseline.

The browser page is a minimal same-origin harness page, rather than the live
app: no app worker, animation loop, HUD, or game-state work can contaminate a
renderer timing sample. Each mode uses an immutable complete rack snapshot
(zero velocity, no removed or pit pins) and a hidden ball. The trace advances
an actual `CameraState` through the accepted collision-zone journey at seven
monotonic progress values. Therefore this isolates static deck rendering under
intended camera motion; it does not claim to measure a live collision.

The production renderer intentionally enables pin shadows through 105 pins and
omits them above 105. The 496- and 990-pin samples therefore measure the
shipped dense path, not an accidentally reduced test mode.

Raw PNG frames and JSON traces are retained locally under ignored `artifacts/`
for inspection, but this report does not depend on an ignored-file link.

## Motion and raster observations

Frames were sampled at 200 by 125 luma points. "Raw delta" is successive-frame
mean absolute luma difference on the 0-255 scale. "Registered residual" first
fits a bounded global similarity transform over a deck-inclusive region and
then reports its residual. That registration removes some intended pan/zoom,
but not perspective, vertical pin parallax, resampling, or occlusion; it is a
conservative normalization, not a claim of camera-motion-free instability.

| Rack | Raw delta median (IQR) | Registered residual median (IQR) | Same-camera control |
| ---- | ---------------------: | -------------------------------: | ------------------: |
| 105  |           9.33 (18.08) |                     5.35 (17.61) |                0.00 |
| 496  |          14.37 (18.89) |                    10.15 (21.67) |                0.00 |
| 990  |          15.86 (18.41) |                    12.40 (21.31) |                0.00 |

The first three trace samples remain at zoom 1 and therefore have zero delta;
the later values include the intended zoom and focus changes. Repeated draws
of the identical midpoint camera had exactly zero sampled-luma delta in this
Chromium run. That makes the rising motion-inclusive dense values expected
camera/deck change, not evidence by itself of raster flicker.

For a supplementary texture diagnostic, the probe also records dominant
horizontal frequency of the luma-difference rows (cycles per 200-sample row)
and a local high-frequency energy. They describe what a later candidate may
preserve; neither is an acceptance score. The final nonzero transition had
dominant frequencies of 0.195 (105), 0.140 (496), and 0.170 (990) cycles per
sample. The 990 trace's local energy rose from 6.66 at neutral framing to
15.17 at its close view, consistent with more dense detail becoming visible.

## Same-environment timing baseline

The renderer was warmed after assets loaded. Eight A/B repetitions were
interleaved across every trace position (112 measurements per rack). The
submission timing surrounds only `renderer.draw`. Canvas can defer work, so a
separate capture-inclusive proxy surrounds `draw + getImageData` and subtracts
the immediately following blank `getImageData`; it is reported separately,
not added to submission cost.

| Rack | Draw submission median (IQR), ms | Draw + readback - same-run blank median (IQR), ms | A/B capture ratio median (IQR) |
| ---- | -------------------------------: | ------------------------------------------------: | -----------------------------: |
| 105  |                      0.10 (0.10) |                                       5.70 (1.30) |                  1.000 (0.055) |
| 496  |                      0.30 (0.00) |                                       7.70 (2.60) |                  1.000 (0.027) |
| 990  |                      0.60 (0.10) |                                      10.00 (3.00) |                  1.007 (0.042) |

The paired submission ratios are deliberately not used as an acceptance bound:
sub-millisecond timer quantization makes them noisy. The capture-inclusive
ratios are more stable in this run and are the appropriate same-environment
variability reference for M14. These numbers are not a cross-machine budget.

## Decision for the pin-body candidate

The baseline supports a comparison probe, not an automatic rasterization
change. Static repeated-camera output is stable, while dense decks naturally
increase capture-inclusive work and expose more high-frequency detail as the
camera closes. No M11 observation proves that pin bodies are unreadable or
that a lower-detail body is needed. M13 should proceed only as a bounded
candidate aimed at a concrete body-coverage/readability observation from the
live-shot evidence, then compare with this exact methodology in M14. A later
candidate should be rejected if it loses meaningful local pin-body readability
or falls outside the measured same-environment variability without a
compensating visual benefit.
