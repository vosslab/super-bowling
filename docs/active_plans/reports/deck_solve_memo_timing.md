# Deck-solve memo timing

M2 evidence for the archived shot-camera work record.

The bisection's inputs were checked at the production boundary in
`src/render/camera_projection.ts`: the calibration presentation has `zoom: 1`.
With that value, `focus_y_fraction` is a shared vertical translation that
cancels from row-reveal and framing equations, while `horizon_x` affects only
horizontal coordinates. The remaining solver inputs come from the immutable
complete rack and canvas dimensions. The smallest correct memo key is therefore
`(pin_count, canvas_width, canvas_height)`; live focus, lateral tracking, and
zoom are deliberately not cached.

`npx tsx devel/measure_deck_solve_memo.mjs` on 2026-08-11 measured medians of
20 production `create_camera_projection` calls at 1600 x 1000. Resetting the
memo before each first column sample forces the same bisection production uses;
the warm-cache column measures ordinary following draw frames.

| Pins | Forced bisection ms | Warm cache ms | Improvement |
| ---: | ------------------: | ------------: | ----------: |
|   10 |               0.074 |         0.003 |       22.3x |
|  496 |               0.159 |         0.017 |        9.4x |
|  990 |               0.117 |         0.029 |        4.1x |

This is a solver-only timing probe, not a renderer frame budget or permanent
threshold. M11 retains ownership of production Canvas render cost.
