# Small follow-ups

This scratchpad records bounded product and review tasks that have clear evidence but no
scheduled milestone. It is for maintainers choosing the next small improvement after the
current bowling and presentation work.

## Gameplay decisions

- Decide whether clearing a full 990-pin rack earns a third, restrained earned-moment kind.
  The current record work deliberately ships only the established moment set; any addition
  needs a player-facing purpose and visible result contract.
- Plan one standing-pin identity contract before adding split detection, a circled split mark,
  a between-roll standing-pin indicator, or a split-conversion statistic. These features share
  the same missing settled-roll data and belong in one change.
- Decide whether a clean-game marker adds enough value to the final summary to justify another
  statistic. It is derivable from completed frames and needs no persistence change.

## Motion review

- Review one real-time, hard off-center pocket hit against the perceptual criteria in
  [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md): grounded pin shadows,
  restrained lift and afterimages, readable deck framing, and a result burst that starts after
  the collision can be understood.

## Evidence

- [active_plans/active/practice_records_and_earned_moments.md](active_plans/active/practice_records_and_earned_moments.md)
  records the three deferred gameplay decisions and their data dependencies.
- [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) defines the remaining motion
  review as a perceptual acceptance check rather than a frozen animation test.
