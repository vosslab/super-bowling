# Super Bowling rules

Super Bowling uses classic ten-frame bowling with the actual complete-triangle
pin total as the rack size. Players select a convenient scale label; setup and
the game interface display the actual total N used for all rolls and scores.

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

## Frames one through nine

- A strike knocks all N pins on the first roll. Its score is N plus the next two rolls.
- A spare knocks all N pins across two rolls. Its score is N plus the next roll.
- An open frame scores the pins knocked in its two rolls.
- A second roll uses the standing pins left by the first roll.

## Tenth frame

- A tenth-frame open ends after two rolls.
- A spare earns one bonus roll on a fresh rack of N pins.
- A strike earns two bonus rolls. The first bonus starts on a fresh rack of N pins.
- When the first strike bonus is a strike, the final bonus starts on another fresh rack of N pins.
- When the first strike bonus leaves pins standing, the final bonus uses that bonus rack's remaining
  pins.
- A perfect game has twelve strikes and scores `30 * N`.

For example, a 10-pin tenth frame of `10, 7, 3` uses a fresh rack for the 7-pin bonus,
then uses its three remaining pins for the final bonus. `10, 10, 10` uses three fresh racks.
`10, 7, 4` is invalid because the final bonus rack has only three pins remaining.

## Worked scores

| Scale label | Actual N | Rolls           | First-frame score | Meaning                          |
| ----------: | -------: | --------------- | ----------------: | -------------------------------- |
|          10 |       10 | `3, 4`          |                 7 | Open frame.                      |
|          10 |       10 | `6, 4, 5`       |                15 | Spare plus the next roll.        |
|          10 |       10 | `10, 3, 4`      |                17 | Strike plus the next two rolls.  |
|          20 |       21 | `21, 6, 4`      |                31 | 21-pin strike.                   |
|          50 |       45 | `45, 15, 10`    |                70 | 45-pin strike.                   |
|         100 |      105 | `105, 30, 20`   |               155 | 105-pin strike.                  |
|         500 |      496 | `496, 150, 100` |               746 | 496-pin strike.                  |
|        1000 |      990 | `990, 400, 300` |              1690 | 990-pin strike.                  |

| Scale label | Actual N | Perfect-game score |
| ----------: | -------: | -----------------: |
|          10 |       10 |                300 |
|          20 |       21 |                630 |
|          50 |       45 |               1350 |
|         100 |      105 |               3150 |
|         500 |      496 |              14880 |
|        1000 |      990 |              29700 |

A score remains incomplete until every bonus roll needed to score its completed frame is known.
For example, a strike by itself has no displayed cumulative score until the next two rolls settle.

## Match and worker rules

- A roll records `standing_at_launch - standing_at_settlement` knocked pins.
- The worker reports standing and fallen counts whose sum equals the displayed actual rack total N.
- Each worker settlement contributes to a roll once while the match is in its rolling phase.
- The game resets the rack after a completed frame. In the tenth frame it also resets after a
  strike before bonus one, after a spare before its bonus, and after a strike bonus before bonus
  two. A partial bonus and every ordinary second roll use the existing rack.
