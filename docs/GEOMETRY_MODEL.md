# Geometry model

## Coordinate spaces

The simulation uses feet. World `x` increases across the lane and world `y`
increases from the foul line toward the pins. The foul line is `y = 0`; the
head pin is always 60 ft down-lane. A rack begins at that head pin and grows
in complete, centered triangular rows with 12 in neighbor spacing.

The Canvas renderer projects this flat world plane into the 16:10 lane view.
Screen `x` increases rightward and screen `y` increases downward. This is
faux-3D: Rapier simulates in 2D and Canvas draws a 2D perspective projection.
Rendering never changes physics coordinates or decides collisions.

## Lane dimensions

Each selected rack gets a lane wide enough for its back row while retaining
the same physical pin spacing. For a rack with `r` complete rows:

```text
lane_width = (r - 1) * 1 ft + 2 * 0.2292 ft
```

The two edge margins are the regulation difference between a 41.5 in lane and
a 36 in four-pin back row. The 39 boards remain a stable player vocabulary;
their width is `lane_width / 39` and therefore grows with the rack.

Width scales because the back row scales. Travel does not: every rack keeps a
60 ft foul-line-to-head-pin run. Scaling travel would put the 990-pin head pin
far beyond a playable distance. Gutters also stay fixed at 9.25 in: they must
catch one ball, rather than becoming a second proportional lane at large rack
sizes.

## Lane bodies

`src/config/lane.ts` owns the shared dimensions, and
`src/simulation/world.ts` builds the collision bodies from them.

- The lane has the selected width and ends at a deck behind the 60 ft head-pin
  plane.
- A fixed-width gutter runs beside each lane edge and leads into the pit.
- Kickbacks contain the lane-plus-gutter envelope while preserving the gutter
  path to the pit.
- The deck has a back boundary and a tail sized from the rack depth.
- A full-width pit sensor begins behind the deck. It removes arriving balls and
  pins from active simulation while retaining their snapshot state for the
  settled result.

This makes a gutter ball a real zero-pin path to the pit and keeps a completed
roll from leaving bodies outside the playable lane system.

## Pin collision shapes

An upright pin begins as the regulation-width circular collider used for rack
spacing and ball contact. When the physics fall rule first marks it fallen, the
world replaces that circle with a 1.25 ft capsule. The capsule keeps the
outgoing collider mass, friction, restitution, event settings, and body; only
its collision shape changes.

The capsule is offset outward from the pin's fall direction by half its length.
That gives a fallen pin a reachable body rather than leaving a tiny circle at
its original standing center. It lets native Rapier contacts carry energy from
the ball through pin-to-pin impacts, including a legal centered shot that can
strike. There is no renderer or score-side blast radius.

Only a pin that has physically fallen receives angular damping (`3`). Upright
pin response therefore remains unchanged, while a fallen capsule still turns
from native contacts but dissipates implausible repeated end-over-end spinning.
The permanent representative-roll check requires visible finite rotation and
less than one accumulated turn per fallen capsule. It is a broad realism guard,
not an exact angular trajectory or a claim that every legal shot strikes.

Snapshots publish the fallen capsule's actual world-space center and long-axis
angle. Canvas uses that pose for the fallen artwork, so the visible pin aligns
with the collision footprint rather than the retained upright body origin.

The simulation records each fallen pin's first meaningful dynamic contact as
`ball_pin` or `pin_pin`. This is a diagnostic, not a second physics rule: the
Rapier collision system remains the authority for every fall and cascade.

The simulation may wake likely nearby sleeping pins once when a ball enters a
new activation cell or a pin first becomes active. This is sleeping-set
bookkeeping only. It creates no impulse, does not mark a pin fallen, and does
not replace native pin-to-pin contact propagation.

## Lane marks and projection

The renderer paints a foul line, guide dots, a deck boundary, and seven
targeting arrows. The arrows form a down-lane chevron: boards 5 through 35 in
steps of five, with the center arrow deepest. They stay inside the projected
lane at every rack size and replace the old two rows of ten diamonds.

Pins use local projected physical spacing so their art remains recognizable
without changing collisions. The ball remains circular in screen space; its
surface scroll supplies the rolling cue. Removed pins and a ball already in
the pit are omitted from the draw commands.

## Centered shot camera

The camera uses one centered, full-lane composition for aiming, rolling, and
the result. Its horizon and lateral framing stay fixed. During a roll, the
physical ball `y` advances one monotonic shot-progress value that drives both
the ball's projected upward travel and a mild forward zoom. The visible ball
travels upward through at least 30 percent of the canvas height before impact.

The result holds that final framing; there is no deck-camera cut. A second roll
resets to the identical aiming composition before its controls are enabled,
after the worker acknowledges deck preparation. Reduced motion keeps the same
full-lane composition and disables the zoom.

## Preview boundary

The aim guide is a sampled `preview_path` from a pins-free Rapier world in the
worker. That preview shares the live ball-force step, including damping, spin,
hook, and gutter capture. It is a free-path preview before pin contact, not a
separate renderer approximation.

Physics owns bodies, collision, and scoring. The renderer owns framing, lane
paint, art scale, and the projection of finite world points. Renderer checks
exercise complete 10-, 105-, and 990-pin triangles.
