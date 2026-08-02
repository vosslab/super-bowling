# Super Bowling rules

Super Bowling uses classic ten-frame bowling with the actual complete-triangle
pin total as the rack size. Players select a convenient scale label; setup and
the game interface display the actual total N used for every roll and score.

| Scale label | Actual rack total N |
| ----------: | ------------------: |
|          10 |                  10 |
|          20 |                  21 |
|          50 |                  45 |
|         100 |                 105 |
|         500 |                 496 |
|        1000 |                 990 |

Every rack is a centered triangle with one head pin and complete rows 1, 2, 3,
and onward. The scale labels are convenient choices; scoring always uses N.

## Pre-roll technique

Set all four controls while the ball is aiming, by slider or keyboard:

| Control        | Keyboard     | What it changes                          |
| -------------- | ------------ | ---------------------------------------- |
| Power          | Up / Down    | Launch speed from 8 through 24 ft/s.     |
| Start position | Left / Right | Lateral release position in lane boards. |
| Angle          | A / D        | Release direction, shown in degrees.     |
| Spin           | Q / E        | Signed hook direction and strength.      |

Press Space to bowl. A rolling ball cannot be steered: technique is chosen
before release, then the roll resolves under physics.

The projected guide comes from a pins-free worker world that uses the same
ball-force step as the live roll. Its three phases are skid, hook, and roll:
zero spin stays straight, while signed spin curves in its selected direction
as the ball slows. The preview ends before pin contact, so it describes the
free path rather than predicting a specific pinfall.

## Frames one through nine

- A strike knocks all N pins on the first roll. Its score is N plus the next two rolls.
- A spare knocks all N pins across two rolls. Its score is N plus the next roll.
- An open frame scores the pins knocked in its two rolls.
- A second roll uses the standing pins left by the first roll.

## Rack cleanup

Fallen pins remain physical obstacles during a roll. Their native pin-to-pin
contacts can continue a cascade, so a legal centered shot can produce a strike;
the score is determined by the actual settled pins, not by a blast radius.
After settlement, the match chooses one of these next states:

| Situation                                      | Next action                                                 |
| ---------------------------------------------- | ----------------------------------------------------------- |
| First roll leaves pins standing                | Sweep fallen pins, then aim at the standing pins.           |
| Gutter ball or other zero-pin first roll       | Sweep (a no-op if nothing fell), then aim again.            |
| Strike or completed second roll                | Reset a fresh rack for the next frame.                      |
| Tenth-frame strike or spare that earns a bonus | Reset a fresh bonus rack.                                   |
| Tenth-frame partial bonus                      | Keep that bonus rack's standing pins.                       |
| Open final frame or player handoff             | Advance the match or handoff; do not sweep.                 |
| Settlement timeout                             | Stop with a lane error rather than silently changing state. |

The sweep removes only fallen deadwood. Standing pins keep their positions for
the next roll, so a two-roll frame remains one physical rack. The game waits
for the worker's preparation acknowledgement before enabling second-roll
controls, avoiding an aim guide or ball that belongs to the previous roll.

## Single shot presentation

The display uses one centered full-lane shot for aiming, rolling, and the
result. The ball moves predictably up the projected lane from its physical
down-lane position, while a small forward zoom adds emphasis without changing
the horizon or lateral framing. The result stays in that framing; the game does
not cut to a separate deck view. Every second roll returns to the same aiming
composition, and reduced motion removes the zoom while keeping the full lane.

## Tenth frame

- A tenth-frame open ends after two rolls.
- A spare earns one bonus roll on a fresh rack of N pins.
- A strike earns two bonus rolls. The first bonus starts on a fresh rack of N pins.
- When the first strike bonus is a strike, the final bonus starts on another fresh rack.
- When the first strike bonus leaves pins standing, the final bonus uses that bonus rack.
- A perfect game has twelve strikes and scores `30 * N`.

For example, a 10-pin tenth frame of `10, 7, 3` uses a fresh rack for the
7-pin bonus, then uses its three remaining pins for the final bonus. `10, 10,
10` uses three fresh racks. `10, 7, 4` is invalid because the final bonus rack
has only three pins remaining.

## Worked scores

| Scale label | Actual N | Rolls           | First-frame score | Meaning                         |
| ----------: | -------: | --------------- | ----------------: | ------------------------------- |
|          10 |       10 | `3, 4`          |                 7 | Open frame.                     |
|          10 |       10 | `6, 4, 5`       |                15 | Spare plus the next roll.       |
|          10 |       10 | `10, 3, 4`      |                17 | Strike plus the next two rolls. |
|          20 |       21 | `21, 6, 4`      |                31 | 21-pin strike.                  |
|          50 |       45 | `45, 15, 10`    |                70 | 45-pin strike.                  |
|         100 |      105 | `105, 30, 20`   |               155 | 105-pin strike.                 |
|         500 |      496 | `496, 150, 100` |               746 | 496-pin strike.                 |
|        1000 |      990 | `990, 400, 300` |              1690 | 990-pin strike.                 |

| Scale label | Actual N | Perfect-game score |
| ----------: | -------: | -----------------: |
|          10 |       10 |                300 |
|          20 |       21 |                630 |
|          50 |       45 |               1350 |
|         100 |      105 |               3150 |
|         500 |      496 |              14880 |
|        1000 |      990 |              29700 |

A score remains incomplete until every required bonus roll settles.

## Saved matches

The local save preserves recent player names and ball designs, mute, and
reduced-motion preferences. The one-time V1-to-V2 migration clears best scores:
the rebuilt foot-based lane and technique controls make old records
incomparable. A V2 save keeps its valid per-rack best scores.
