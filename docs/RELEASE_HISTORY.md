# Release history

## v26.08 - 2026-08-11

### Highlights

- Delivered a complete browser bowling game with one-to-four-player hot-seat setup,
  selected player ball designs, six complete-triangle rack modes, generalized scoring, and
  per-mode practice records.
- Established a regulation, rack-scaled lane with four pre-roll controls for start position,
  launch angle, power, and spin. The simulation worker supplies the live aim preview and
  processes each committed roll.
- Strengthened the lane-first presentation with a compact desktop layout, physical ball-surface
  roll, a result dwell and Continue control, and clear final-score and replay actions.
- Added release-driven deck framing, strike and spare result bursts, restrained confetti,
  richer ball lighting, and velocity-led fallen-pin presentation while retaining a reduced-motion
  alternative.
- Recorded the game's original design synthesis: Wii-style screen bowling without a motion
  controller and arcade-style lane energy without a physical ball or cabinet sensors. See
  [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md).

### Notable fixes

- Kept the rolling path consistent with the preview by removing rolling-ball steering and
  committing input before the ball rolls.
- Corrected score and result flow around second rolls, tenth-frame strike bonuses, spare marks,
  player handoffs, and visible next-aim readiness.
- Replaced presentation-only pin shadows and aligned fallen-pin art with the physical capsule
  pose so settled pins rest on the lane and moving pins retain grounded motion cues.
- Replaced brittle browser timing and fixed-dimension assertions with player-visible readiness,
  containment, accessibility, and clipping contracts.

### Compatibility notes

- Save data now uses V4 per-mode practice records and migrates compatible V1, V2, and V3 saves.
- Rack labels map to complete centered triangles: 10, 21, 45, 105, 496, and 990 pins. Existing
  score and simulation paths use those exact totals.
- Match results remain visible until the player selects Continue after the minimum result hold;
  Space and Enter activate the same action.

### Validation

- `./check_codebase.sh` passed with 167 Node tests after the action and presentation work.
- The GitHub Pages build completed, and the full browser suite passed 28/28 in 14.2 seconds.
- Original-resolution review covered collision motion, strike and spare states, narrow layout,
  and reduced motion with no blocker found for the four action upgrades.
- The retained 990-pin benchmark measured a 22.7 ms median and 28.8 ms p95 rAF capture, below
  the project's 50 ms and 60 ms perceptual guards.
