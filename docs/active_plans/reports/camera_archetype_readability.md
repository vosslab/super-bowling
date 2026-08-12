# M9 production-browser camera archetypes

Run 2026-08-11 against the built `dist/` application served over HTTP; the
496- and 990-pin outside-entry rows were refreshed 2026-08-12 after the held
zone began anchoring on the authoritative first ball-pin centroid. The probe
drives real mode selection and range controls, waits for each public worker
preview, launches through the normal Bowl path, samples each animation frame,
and writes its detailed ignored trace to `artifacts/m9/`.

## Reality corrections

The renderer deliberately omits a ball whose authoritative snapshot says it
is in the pit. M9 therefore requires a matching, on-canvas Canvas ball body
from the first rolling draw through first ball-pin impact and for every later
pre-pit rolling sample. It does not ask for a ball after the pit omission or
misrepresent a pit-boundary capture as settlement evidence.

The old `data-drawn-launch-platform-fraction` is the projected apron length,
which naturally increases with zoom. It is not visible foreground share. The
probe instead records the canvas fraction below the renderer-projected foul
line; it falls as the shot moves forward. The apron value remains descriptive
diagnostic context only.

The plan's literal nondecreasing early/middle/late ball-diameter premise is
also not supported by the shipped near-ball establish frame: the ball begins
large, recedes through the middle of the lane, then grows again toward impact.
Forcing that into monotonic diameter would damage the already readable release
composition. M9 retains actual third medians and minimum diameters, verifies
continuous readable body residency, and records release-to-impact ratios;
later visual review, not a fabricated trend gate, decides pacing changes.

## Evidence summary

| Archetype     | Rack | Pre-pit rAF readable | Diameter min / middle / late medians (px) | Release-to-impact ratio | Visible foreground change | Zone center offset | Zone coverage |
| ------------- | ---: | -------------------: | ----------------------------------------- | ----------------------: | ------------------------: | -----------------: | ------------: |
| Center        |  105 |            208 / 208 | 45.46 / 37.20 / 49.17                     |                   0.99x |                    -0.090 |              0.000 |       0.00937 |
| Strong hook   |  105 |            202 / 202 | 45.50 / 37.15 / 49.54                     |                   0.99x |                    -0.090 |              0.000 |       0.00938 |
| Off-center    |  105 |            210 / 210 | 45.33 / 37.11 / 49.40                     |                   0.99x |                    -0.090 |              0.000 |       0.00939 |
| Center        |  496 |            257 / 257 | 23.80 / 21.62 / 31.29                     |                   1.34x |                    -0.067 |              0.000 |       0.00461 |
| Mid-board     |  496 |            251 / 251 | 23.80 / 21.60 / 31.57                     |                   1.35x |                    -0.067 |             0.0002 |       0.00395 |
| Outside-board |  496 |            230 / 230 | 23.32 / 20.55 / 29.91                     |                   1.29x |                    -0.067 |              0.029 |       0.00346 |
| Center        |  990 |            119 / 119 | 17.47 / 16.33 / 24.92                     |                   1.48x |                    -0.061 |              0.000 |       0.00317 |
| Mid-board     |  990 |            112 / 112 | 17.52 / 16.29 / 24.21                     |                   1.47x |                    -0.061 |             0.0001 |       0.00245 |
| Outside-board |  990 |            111 / 111 | 17.07 / 15.48 / 23.60                     |                   1.44x |                    -0.061 |              0.026 |       0.00220 |

All listed contacting shots had zero undrawn, unmatched-ellipse, and clipped
pre-pit samples. The renderer's active collision-zone polygon was fully on
canvas at first impact in every listed case. Its center stayed at or close to
the canvas center while the local coverage stayed small, as intended for a
local collision neighborhood rather than a whole dense deck.

The requested visible-control 105 maximum-start/maximum-spin edge run still
reported one ball-pin impact. It is retained only as a contact edge observation
and is not claimed as browser gutter evidence; M4's production-worker gutter
traces remain the trustworthy no-contact evidence until a legal browser input
that stays no-contact is identified.

## Launch-path integration correction

This probe initially exposed an integration defect: the reactive aim preview
could clear between exact preview acceptance and the launch effect, leaving no
live collision zone. `game.tsx` now holds the accepted `Float32Array` in a
one-shot non-reactive launch handoff consumed by `begin_camera_shot`. A fresh
105 center run then produced a fully-on-canvas zone centered at `(0.5, 0.5)`
at first impact, rather than no zone. The normal worker remains the only
physics authority.

## Commands

In one terminal, build and serve the production artifact. Keep this process
running until the browser capture completes, then stop it with `Ctrl-C`.

```sh
npm run build
source source_me.sh && python3 -m http.server 8123 --directory dist
```

In a second terminal, run the capture and durable checks.

```sh
node --import tsx devel/capture_camera_archetypes.mjs --base-url http://127.0.0.1:8123/ --case 990_center
node --import tsx --test tests/test_camera_driver.mjs tests/test_shot_framing.mjs
npx tsc --noEmit
source source_me.sh && python3 -m pytest tests/test_source_file_line_limit.py
```

Collision-zone capture is explicitly enabled with `?camera-diagnostics=1`.
Normal play leaves it off, so routine Canvas draws take only the option branch
and do not reconstruct a projection or write diagnostic strings/datasets.

The detailed JSON is intentionally ignored: it contains frame-count and
pixel/area measurements that are useful for maintenance but unsuitable as
permanent machine-specific gates. This report contains the durable summaries
without linking to an untracked artifact.
