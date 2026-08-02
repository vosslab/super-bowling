# Many-pin camera selection

## Combined lock

The selected row-reveal profile is `open`: 10% pin-height showing between adjacent rows, which
means 90% height overlap. Independent tie-breaks D and E both select it.

An earlier composite viewer artifact made the compared images look non-equivalent. Original-detail
inspection of the actual browser PNGs resolved it; there is no remaining uncertainty about the
files. Both tie-breaks select `open` for concrete rack readability and faux-3D depth.

## Framing derivation

Derive framing per mode from authoritative complete-rack bounds, the backstop, and the aiming ball
or near lane edge. Never derive placement from the pins still standing.

| Mode | Complete-rack source | Crown target | Aiming-ball bottom target | Occupied span | State rule |
| --- | --- | ---: | ---: | ---: | --- |
| 10 pins | Full 10-pin rack and backstop | 4% | 95% | 91% | Fixed for aiming, mid-roll, partial, and settled. |
| 105 pins | Full 105-pin rack and backstop | 4% | 95% | 91% | Fixed for aiming, mid-roll, partial, and settled. |
| 990 pins | Full 990-pin rack and backstop | 4% | 95% | 91% | Fixed for aiming, mid-roll, partial, and settled. |

For each mode, solve placement from the complete-rack crown and the aiming-ball bottom after the
selected reveal calibration. A finite horizon may sit outside the canvas. The result must retain a
single believable lane direction, keep the complete rack and near edge in frame, and preserve the
91% vertical occupancy as pins disappear.

## Next gate

This report locks the selected source profile only. Apply `open` as the source default, then
capture every mode and lane state to prove the complete-rack 4% / 95% / 91% framing remains fixed.
