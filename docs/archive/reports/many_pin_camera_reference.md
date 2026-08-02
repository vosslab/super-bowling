# Many-pin camera reference

## Capture basis

- Fixture: `camera_deck`, 105 pins, fresh browser context, fresh match, aiming state.
- Page viewport: 1600 x 1000 CSS pixels at device-pixel-ratio 1.
- Lane canvas: 1248 x 884 CSS and backing-store pixels at page position `(0, 116)`.
- Shared framing: full-rack crown at 4% of canvas height, aiming-ball bottom at 95%, and
  occupied lane/rack/ball span at 91%.
- Every candidate solved without a calibration or framing clamp.

## Candidate measurements

| Candidate | Target reveal | Achieved median | Adjacent-row range | Depth exaggeration | Horizon fraction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dense | .03 | .03 | .02960-.03041 | .34136 | -.62999 |
| Balanced | .06 | .06 | .05839-.06170 | .71009 | -.59387 |
| Open | .10 | .10 | .09546-.10499 | 1.24854 | -.54760 |

`Open` is a real 90%-height-overlap / 10%-pin-height-showing candidate. Its row values are
local measurements for all 13 adjacent row pairs, rather than a label applied to an arbitrary
projection multiplier.

## Evidence artifacts

| Candidate | Artifact | SHA-256 |
| --- | --- | --- |
| Dense | `test-results/camera_bakeoff_105_aiming_dense.png` | `c59e78eb1b6462c68d87bb1f36a997e2016e8ba0b717a7de7790aee5e87a7d21` |
| Balanced | `test-results/camera_bakeoff_105_aiming_balanced.png` | `596f6e4a5593d7789f0f97cb0b6baf1d4f077d786dcfc4029abf8718b899ad53` |
| Open | `test-results/camera_bakeoff_105_aiming_open.png` | `8259701172230816908de1827b4ca777d943d2b66a11c5ff8276c081a9734e03` |

The corresponding machine-readable provenance is
`test-results/camera_bakeoff_105.json`. It records the viewport, canvas rectangle, candidate
targets, every local row measurement, rack/ball bounds, depth, horizon, and artifact hashes.
