# Super Bowling rules

Super Bowling scales bowling from a familiar ten-pin match to a deliberately
superhuman 1,000-pin challenge. Choose a rack scale and bowls per frame before
starting. The game always scores the pins actually in the physical rack.

## Rack scales

The setup labels are friendly scale names, not the physics rack totals. Each
rack is a complete centered triangle with one head pin and rows of 1, 2, 3,
and onward.

| Setup label | Physics rack total | Ball mass |
| ----------: | -----------------: | --------: |
|          10 |                 10 |     16 lb |
|          20 |                 21 |     16 lb |
|          50 |                 45 |     40 lb |
|         100 |                105 |     80 lb |
|         500 |                496 |    320 lb |
|        1000 |                990 |     40 lb |

For example, the 1,000 label means a 990-pin triangle. A strike in that mode
knocks down all 990 pins, and every score and record uses 990 rather than the
display label.

The 990-pin ball is deliberate special equipment: a measured 40 lb collider,
not a regulation ball or a hidden density label. This fantasy endurance mode
also permits superhuman power and spin. After genuine ball-pin contact, a
bounded through-pin drive helps the ball reach the backstop through a deep
rack; it never acts at launch, in a gutter, or after pit capture.

## Bowl options

Choose one through five bowls per frame (`B`). This creates two clear game
modes:

| Selection | Mode        | Frames 1-9                                  | Tenth frame                    | Score marks     |
| --------- | ----------- | ------------------------------------------- | ------------------------------ | --------------- |
| B = 2     | Classic     | Standard two-roll bowling                   | Standard conditional fill ball | `X` and `/`     |
| B != 2    | Super frame | Up to B bowls, ending early on a clear rack | Exactly B + 1 bowls            | Numeric pinfall |

In Super frame mode, a clear rack resets to a fresh rack for any bowls still
available in the tenth frame. The tenth frame is exactly `B + 1` bowls; it
never grants `B + 2`. Super frame scores are actual pinfall, with no strike or
spare bonuses and no `X` or `/` marks.

Classic `B = 2` keeps familiar scoring: a strike is a full-rack first roll plus
the next two rolls, a spare is a full-rack two-roll frame plus the next roll,
and the tenth frame has its normal conditional fill ball. A classic perfect
game scores `30 * actual_rack_pin_count`. The Super frame maximum is
`(10 + B) * actual_rack_pin_count`.

## Controls and power

Set the controls while aiming, then press Space to bowl. A launched ball
cannot be steered. The preview uses the same authoritative limits and ball
force logic as the live world, so a displayed setting is the one that launches.

| Control        | Keyboard     | 10-pin envelope             | 1,000-label envelope        |
| -------------- | ------------ | --------------------------- | --------------------------- |
| Power          | Up / Down    | 8 through 24 ft/s           | 8 through 60 ft/s           |
| Start position | Left / Right | Lane-board release position | Lane-board release position |
| Angle          | A / D        | Release direction           | Release direction           |
| Spin           | Q / E        | -1 through +1               | -4 through +4               |

The 10-pin controls stay intentionally modest. The 1,000-label mode is a
fantasy endurance challenge with explicitly superhuman power, spin, and
through-pin support instead of silently changing ordinary ten-pin bowling.

The guide shows the pins-free path through skid, hook, and roll. It ends before
pin contact, so it helps aim a shot without pretending to predict exact
pinfall.

## Pinfall and progress

Pins and fallen pins remain physical obstacles throughout a roll. A settled
result counts the pins actually knocked down; there is no blast-radius scoring.
The game sweeps fallen deadwood between eligible bowls while keeping standing
pins in place when the same rack continues.

## Saving records

The local save remembers recent setup choices, including `B`, along with player
names, ball designs, mute, and reduced-motion preferences. Old saves default or
migrate to `B = 2`. Best scores are separate for each rack scale and
bowls-per-frame mode, so a Super frame result never replaces a Classic record.
