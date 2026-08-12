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
- Research an optional advanced/practice-mode lane-oil system before changing physics. It should
  use deterministic or seeded spatial friction maps, make conditioning understandable to players,
  and keep technique plus preview feedback learnable and fair. This is explicitly deferred from
  the current arcade-presentation rebuild.

## Motion evidence

- If later camera work needs to follow a secondary local cascade, first extend worker evidence with
  a locality-aware connected subject. Do not use a relative impulse threshold: the current
  496-pin measurement contains remote later impacts with substantial running-peak ratios. Reuse
  the reports linked from [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) for a
  proposed visual change, and keep dense-mode shadows intentionally omitted.

## Evidence

- [active_plans/active/practice_records_and_earned_moments.md](active_plans/active/practice_records_and_earned_moments.md)
  records the three deferred gameplay decisions and their data dependencies.
- [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) defines the unattended fixture,
  transition probe, and browser-contract evidence for the remaining motion follow-up.
