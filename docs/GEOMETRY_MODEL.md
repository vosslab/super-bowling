# Geometry model

## Coordinate spaces

Simulation owns a flat world plane. `x` increases rightward across the lane and
`y` increases from the foul line toward the pins. A rack begins with one centered
head pin and grows in complete triangular rows. The physics world uses these
coordinates directly for pin spacing, collision, activation, and scoring.

The Canvas renderer maps that world plane to a 16:10 screen projection. Screen
`x` increases rightward and screen `y` increases downward. A rack-aware
`x_extent` contains the immutable opening rack bounds. Its lane silhouette is a
screen-space trapezoid: the top and bottom half widths grow with the selected
rack, while the top-to-bottom ratio remains at least 0.60 for a readable,
front-facing faux-3D lane.

## Projection policy

`src/render/game_renderer.ts` owns the projection and lane artwork.

- The camera records the initial rack bounds once and keeps them stable during
  a cascade.
- A point projects by normalized world `x` and forward world `y` within the
  current camera range.
- Pin width uses the local projected world-unit scale. Each standing sprite
  occupies about 73 percent of its physical neighbor spacing, bounded from 10
  to 64 screen pixels. This makes 45-, 105-, and 990-pin triangles dense and
  countable without changing their collision coordinates.
- Lane diamonds are two symmetric five-mark rows. Their centers and sizes come
  from the same trapezoid interpolation as pins, so they remain inside every
  super-lane width and act as aiming landmarks.
- The ball remains circular in screen space. Its rolling pattern supplies the
  motion cue; the renderer never changes its collision radius.

## Numerical boundaries

The renderer uses ordinary double-precision JavaScript numbers. Projection
depth and lateral normalized coordinates are clamped to finite display ranges.
Screen-space dimensions have explicit minimums so a distant pin or diamond
remains visible. The projection does not require exact predicates because the
simulation rack is deterministic and the renderer only maps finite points.

## Ownership boundary

Physics and rendering are intentionally separate. `src/simulation/rack.ts` and
`src/config/physics.ts` define the real rack spacing, bodies, and collision
rules. `src/render/camera.ts` and `src/render/game_renderer.ts` only select
framing, sprite scale, rails, and lane marks. Renderer changes must preserve the
world coordinates and use tests at the actual complete triangle totals: 10,
105, and 990 pins.
