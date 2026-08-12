# Roadmap

This roadmap names the next evidence-driven work for Super Bowling. It does not set delivery
dates. The detailed acceptance record for the current arcade-presentation work lives in
[LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md), while completed practice-record
milestones remain in [docs/active_plans/active/practice_records_and_earned_moments.md](active_plans/active/practice_records_and_earned_moments.md).

## Current delivery

The playable build now combines technique-driven bowling with an arcade presentation layer.

- The camera advances from ball release to the pin deck through one shared projection.
- The ball has lighting, surface rotation, finger holes, contact shadow, and lane reflection.
- Pin presentation derives lift, shadows, and a short afterimage from physical snapshots.
- Strike and spare results use distinct, short celebration bursts while ordinary rolls stay quiet.

## Next priority

Run the autonomous hard, off-center pocket-hit acceptance fixture before scheduling more
presentation work.

- Capture the normal visible scenario, exercise synthetic transition probes, and run focused
  browser behavior tests for foreground pin continuity, ground-connected shadows, and afterimage.
- Check the deck-camera/result ordering with the captured fixture and an independent subagent.
- Record an automated failure as a bounded follow-up with a reproducible visible scenario; do not
  turn tuned animation values into brittle timing or pixel tests.

## Intentionally not started

- Do not copy Nintendo Wii Bowling or Lane Master artwork, branding, cabinet hardware, ticket
  rewards, or power-up systems. Super Bowling remains an original pointer-and-keyboard game.
- Do not replace Rapier's physically authoritative collision snapshots with presentation-only pin
  motion. Rendering emphasis must fade back to the settled physical pose.
- Do not expand the reward layer into currencies, prize wheels, or interruptions that prevent the
  player from reading the outcome and taking the next shot.
