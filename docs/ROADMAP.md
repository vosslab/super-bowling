# Roadmap

This roadmap names the next evidence-driven work for Super Bowling. It does not set delivery
dates. The detailed acceptance record for the current arcade-presentation work lives in
[LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md), while completed practice-record
milestones remain in [docs/active_plans/active/practice_records_and_earned_moments.md](active_plans/active/practice_records_and_earned_moments.md).

## Current delivery

The playable build now combines technique-driven bowling with an arcade presentation layer.

- The normal-motion camera advances monotonically from release toward a local worker-path collision
  zone, holds the first ball-pin neighborhood, and hands off to the authoritative settled result.
- The ball has lighting, surface rotation, finger holes, contact shadow, and lane reflection.
- Pin presentation derives lift and a short afterimage from physical snapshots; grounded shadows
  are intentionally omitted in 496- and 990-pin dense modes.
- Strike and spare results use distinct, short celebration bursts while ordinary rolls stay quiet.

## Next priority

If a future camera change needs to follow a later local cascade, extend the worker with an
authoritative locality signal rather than inferring it from impulse magnitude. The current evidence
shows that a relative-to-running-peak rule admits remote 496-pin impacts. Reuse the existing
production-browser and Canvas probes for any proposed change; do not turn their current pixels,
frame counts, or timings into universal gates.

## Intentionally not started

- Do not copy Nintendo Wii Bowling or Lane Master artwork, branding, cabinet hardware, ticket
  rewards, or power-up systems. Super Bowling remains an original pointer-and-keyboard game.
- Do not replace Rapier's physically authoritative collision snapshots with presentation-only pin
  motion. Rendering emphasis must fade back to the settled physical pose.
- Do not expand the reward layer into currencies, prize wheels, or interruptions that prevent the
  player from reading the outcome and taking the next shot.
