# Geometry model

## Coordinate spaces

The simulation uses feet. World `x` increases across the lane and world `y`
increases from the foul line toward the pins. The foul line is `y = 0`; the
head pin is always 60 ft down-lane. A rack begins at that head pin and grows
in complete, centered triangular rows with 12 in neighbor spacing.

The Canvas renderer maps that flat world plane into a 16:10 faux-3D view.
Screen `x` increases rightward and screen `y` increases downward. Rapier
simulates in 2D and Canvas draws the projection; rendering never changes
physics coordinates or decides collisions.

## Lane dimensions and bodies

Each selected rack gets a lane wide enough for its back row while retaining
the same physical pin spacing:

```text
lane_width = (rows - 1) * 1 ft + 2 * 0.2292 ft
```

The 39 boards remain a stable player vocabulary; their width is
`lane_width / 39` and grows with the rack. Travel does not scale: every rack
keeps the 60 ft foul-line-to-head-pin run. Gutters remain 9.25 in wide, lead
to the pit, and are contained by kickbacks. The deck, back boundary, and
full-width pit sensor extend from the fixed head-pin plane for the selected
rack depth.

`src/config/lane.ts` owns these dimensions and `src/simulation/world.ts`
creates the collision bodies. The pit removes an arriving ball or pin from
active simulation while retaining its settled snapshot. A gutter ball is
therefore a real zero-pin route to the pit.

## Pin collision shapes and settled art

An upright pin starts as the regulation-width circular collider used for rack
spacing and ball contact. At its physical fall transition, the world replaces
that circle with a mass-preserving 1.25 ft capsule offset along the fall axis.
The capsule retains its body's material and event settings, so native Rapier
contacts carry ball-to-pin and pin-to-pin cascades. Only fallen capsules get
angular damping; upright response remains unchanged.

Snapshots publish the actual capsule center and axis. A capsule axis has two
equivalent directions, while the fallen sprite has a crown and a base. The
renderer chooses the equivalent screen orientation with the crown at or above
the base. This canonical crown-up presentation prevents a settled pin from
ending visually upside down without changing the raw physics axis.

## Shared faux-3D projection

Lane paint, pins, ball, guides, rails, and deck use one rational one-point
projection. For a world point whose depth-adjusted lane coordinate is `y'`,
the shared scale is:

```text
s = D / (D + y' - near_y)
screen_x = horizon_x + x * pixels_per_world_unit * s
screen_y = horizon_y * (1 - s) + near_screen_y * s - z * pixels_per_world_unit * s
```

`D` is the mode-derived finite depth denominator. Deck depth exaggeration
changes `y'` for row separation only; it never changes lane dimensions, pin
spacing, collision geometry, ball mass, or shot physics. The selected `open`
composition solves for 10% of a rear pin showing above the row ahead of it
(90% height overlap). The retained `dense` and `balanced` profiles target 3%
and 6%, respectively, so future visual tuning is data-driven rather than a
new projection implementation.

## Complete-rack and shot framing

The neutral establishing projection uses the complete authoritative rack,
never the currently standing survivors. Once the rack and canvas size are
known, the renderer solves two projection anchors together:

- the rear complete-rack crown is at 4% of the lane canvas height;
- the aiming ball bottom is at 95% of the lane canvas height.

Those anchors give a 91% occupied lane-plus-rack-plus-ball span on the actual
canvas. The resulting horizon may be above the canvas, but it remains finite
and bounded. This is a valid one-point composition for a very deep rack, not
a crop or a second camera.

The immutable complete-rack solve establishes aiming and supplies the neutral
input for the authoritative settled-result fit. During normal motion, the
camera follows monotonic physical ball progress toward the local collision
zone predicted from the committed worker path. The first authoritative
ball-pin event holds that local zone through the cascade; pin-pin summaries do
not retarget it. The settled snapshot then starts the separate result fit.

This is presentation only: the shared projection never changes lane or
collision geometry, and the worker remains the collision authority. Reduced
motion uses the neutral presentation instead of live follow or zoom. A ball
already in the authoritative pit is omitted from draw commands, so the camera
does not pretend to follow it into the pit.

## Lane marks and aim preview

The renderer paints a foul line, guide dots, deck boundary, and seven
down-lane targeting arrows. Pins use local projected physical spacing so their
art stays recognizable without changing collisions. The ball remains circular
in screen space; its surface scroll supplies the rolling cue. Removed pins and
a ball already in the pit are omitted from draw commands.

The aim guide is a sampled `preview_path` from a pins-free Rapier world in the
worker. It shares the live ball force, damping, spin, hook, and gutter capture.
It is a free-path preview before pin contact, not a separate renderer
approximation.
