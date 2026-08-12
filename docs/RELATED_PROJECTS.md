# Related projects

## Confirmed related projects

### Rapier

- Relationship: direct dependency
- Link: https://rapier.rs/docs/user_guides/javascript/getting_started_js/
- Evidence: `package.json` declares `@dimforge/rapier2d-compat`, and the simulation imports it
  to create the game's two-dimensional rigid-body world.
- Notes: Rapier provides the WebAssembly-backed collision and physics layer; it is not a game
  design reference.

### Solid

- Relationship: direct dependency
- Link: https://docs.solidjs.com/
- Evidence: `package.json` declares `solid-js`, and the application imports its components and
  reactive primitives for the browser interface.
- Notes: Solid owns UI reactivity around the Canvas renderer and simulation worker.

### Wii Sports Bowling

- Relationship: prior art or inspiration
- Link: https://www.nintendo.com/en-gb/Games/Wii/Wii-Sports-283971.html
- Evidence: [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) identifies Nintendo
  Wii Bowling as an inspiration for approachable screen bowling, readable lane play, and frame
  scoring.
- Notes: Super Bowling keeps keyboard and pointer technique controls rather than motion control,
  and uses its own interface, layout, and presentation. Its pin silhouette is an adapted
  public-domain OpenClipart source, not Wii artwork.

### UNIS Lane Master

- Relationship: prior art or inspiration
- Link: https://www.unistechnology.com/products/lane-master-extreme-ticket-version/
- Evidence: [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) identifies the Lane
  Master product family as an inspiration for camera drive, energetic pin motion, large racks,
  and concentrated result staging.
- Notes: Super Bowling is not a cabinet emulation. It omits the physical ball, cabinet sensors,
  ticket rewards, product branding, and source artwork.

## Evidence notes

The dependency entries are confirmed by the manifest and source imports. The inspiration entries
are confirmed by the repository's design-lineage record and official product pages. They describe
creative context only; neither inspiration is a runtime dependency, integration target, port, or
asset source.
