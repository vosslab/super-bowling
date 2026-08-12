# Dense raster decision

Measurement snapshot: 2026-08-12T05:00:48.426Z

This M12/M14 record extends the production-Canvas baseline in
[dense_rack_canvas_baseline.md](dense_rack_canvas_baseline.md). It treats the
original raster plan as a hypothesis. No pin-body coverage fault appeared in
M11 or the production-browser M9 evidence, so M13 was not an automatic
implementation obligation.

## Method

The existing disposable browser harness runs the built `create_game_renderer`,
its loaded raster assets, a 1600 by 1000 Canvas, and the exact seven-state
105/496/990 camera traces from M11. After warm-up it rotates low, medium, and
high Canvas image-smoothing quality through eight identical trace cycles. The
quality order rotates, so no candidate always gets the first warmed position.

The full-renderer candidate timing uses `renderer.draw + getImageData -
immediately-following blank getImageData`; it is a same-process,
capture-inclusive comparison, not a frame-rate claim. A separate optional
direct command/draw phase observer measures command creation and sorting apart
from lane/accent, shadow, and pin-body/compositing passes. That direct profile
is diagnostic only: it does not replace the full-wrapper cost.

Raw JSON and screenshots remain ignored under `artifacts/`; this report does
not link to them. The commands below reproduce the local evidence.

```sh
npm run build
node devel/measure_dense_rack_canvas.mjs
```

## Pipeline characterization

The three reusable asset canvases occupy 990,720 bytes (0.945 MiB): the
upright pin is 160 by 504 pixels, the fallen pin is 504 by 160, and the ball
is 240 by 360. The renderer does not re-rasterize SVG per frame.

| Rack | Pin-body draws per frame |  Shadow pass | Body width range (px) | Command build median (ms) | Pin-body pass median (ms) |
| ---: | -----------------------: | -----------: | --------------------: | ------------------------: | ------------------------: |
|  105 |                      105 | 105 ellipses |           16.87-37.88 |                       0.0 |                       0.1 |
|  496 |                      496 |      omitted |           11.58-25.02 |                       0.1 |                       0.2 |
|  990 |                      990 |      omitted |            9.29-19.76 |                       0.2 |                       0.4 |

The small lane/accent and shadow phase readings quantize to 0.0 ms at this
browser timer resolution. The useful conclusion is structural: command work
and the fixed lane are small relative to a dense frame's 496 or 990 `drawImage`
calls, while shadows are already absent in dense modes. The independent M11
capture-inclusive baseline remains the production-path timing reference.

The source pin is at least four times wider than the largest sampled projected
body, and at least eight times wider in the 990 trace. The observed mechanism
is repeated minification and composition, not an image being enlarged from an
undersized source. No primary body-size floor exists in `pins.ts`; its one-pixel
floors only protect shadow and nearby fallen-pin overlay geometry.

## Candidate comparison

The following full-wrapper values compare only the interleaved smoothing
candidates with one another. Registered residual is the same conservative
motion-normalized luma proxy used in M11; it does not claim to remove
perspective, parallax, or occlusion. Low is the browser's existing default in
this run.

| Rack | Low residual median (IQR) | Medium residual median (IQR) | High residual median (IQR) | Low capture proxy median (IQR), ms | Medium capture proxy median (IQR), ms | High capture proxy median (IQR), ms |
| ---: | ------------------------: | ---------------------------: | -------------------------: | ---------------------------------: | ------------------------------------: | ----------------------------------: |
|  105 |              5.35 (17.61) |                 5.07 (17.04) |               5.07 (17.04) |                        5.70 (1.30) |                           7.80 (6.10) |                         7.85 (5.90) |
|  496 |             10.15 (21.67) |                 9.32 (19.84) |               9.32 (19.84) |                        7.70 (2.60) |                         13.80 (13.20) |                       13.85 (12.90) |
|  990 |             12.40 (21.31) |                10.49 (18.98) |              10.49 (18.98) |                        9.80 (3.10) |                         17.55 (15.20) |                       17.50 (15.20) |

Medium and high produced identical sampled output in this Chromium run. The
990 local high-frequency energy fell from 6.66 with low smoothing to 5.36 with
medium/high. Thus the modest lower registered residual is an expected blur
trade, not evidence that collision detail or pin-body readability improved.
M11's repeated identical-camera control was already stable, and M9 found no
unreadable dense pin-body condition. The extra capture-inclusive cost also has
wide candidate-run variation, so it cannot justify the blur without a visible
defect to solve.

## M13 and M14 disposition

M13 is intentionally not shipped. A coverage-alpha mechanism would reduce
visible dense pin mass without correcting an observed body defect, and it
would not address the repeated `drawImage` cost center.

M14 retains the current low-quality smoothing and one-time raster assets. It
is an evidence-backed decision, not a missing implementation:

- A higher smoothing setting lowers the residual by smoothing away local
  detail, with no demonstrated screenshot readability gain and a higher
  capture-inclusive proxy.
- Prefiltered multi-scale assets remain technically credible for repeated
  minification: a source larger than its destination can still benefit from a
  prefilter. They are untested because M11/M9 identify no unacceptable dense
  readability or stability defect, while a dynamic mip picker adds per-pin
  selection and asset memory.
- A higher-DPR or supersampled intermediate also remains technically credible
  as a sampling-stability trade. It is untested because it enlarges Canvas and
  readback work, and the current evidence provides no observed defect or visual
  benefit case that would justify that production complexity.

The retained dense deck remains stable for repeated identical camera draws and
keeps local pin detail and mass. If a future device-specific complaint shows a
real resampling defect, rerun this harness at that viewport and compare a
source-resolution-aware asset experiment against the same trace; do not infer
a new permanent performance threshold from this run.
