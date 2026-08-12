# Lane Master video findings

## Purpose

This document records Lane Master visual findings used to increase Super Bowling's sense of
speed, impact, and reward. It separates observed evidence from the design decisions made for
this game. The observations are references, not a visual or mechanical specification.

## Design lineage

Super Bowling combines two reference ideas while removing their specialized hardware:

| Reference            | Inspiration retained                                                               | Hardware removed                           |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| Nintendo Wii Bowling | Approachable screen bowling, readable lane play, and familiar frame scoring        | No motion controller                       |
| UNIS Lane Master     | Arcade camera drive, energetic pin action, fantasy scale, and concentrated results | No physical ball, cabinet lane, or sensors |

Super Bowling's synthesis is a browser bowling game controlled with labeled pointer and
keyboard inputs for power, start position, angle, and spin. Rapier supplies physical collision
behavior, while the renderer gives important moments arcade emphasis. The named games identify
design influences; Super Bowling is not a port, clone, or hardware emulation of either one.

## Source and limits

The cabinet is identified by the user as Lane Master. The
[ASI Lane Master product page](https://asi-world.com/product/lane-master/) describes a physical
and digital alley bowler whose sensors translate ball speed, angle, and spin to the screen.
That relationship makes it a relevant comparison for Super Bowling's power, start position,
angle, and spin controls.

The [UNIS Lane Master Extreme page](https://www.unistechnology.com/products/lane-master-extreme-ticket-version/)
is the manufacturer source for the Extreme ticket version. UNIS identifies Extreme as an upgrade
from the original Lane Master and describes single- or multiplayer timed play in which players
hit as many pins as possible. That description provides useful product-family context for the
many-pin stages included in the visual review.

The ASI page uses both `Lane Master` and `Lane Master Extreme` in its copy, while the UNIS page
documents the Extreme ticket version specifically. This review therefore attributes the shared
product family and labels only observable behavior. It does not claim that the reviewed cabinet
is a particular revision or redemption configuration.

The source recordings remain local-only research material. They are not repository inputs,
published documentation assets, test fixtures, or distribution files. This document is the
durable repository record of the findings.

- The reviewed material includes standard ten-pin play and a red and gold `Golden Pin Stage`
  with large pin fields.
- The oblique phone view, display glare, exposure changes, and cabinet lighting make exact
  color, scale, and pixel measurements unreliable.
- Ambient arcade sound is not a sound-design specification.
- No source image, audio, logo, character, or interface artwork ships with Super Bowling.

## Observed motion language

### Shot framing

- The resting view establishes the full lane and distant target before the ball appears.
- The view pushes toward the pin deck throughout ball travel instead of waiting for impact.
- The ball grows substantially on screen as the lane foreground drops out of view.
- The closest view holds the pin deck through the collision, making individual reactions
  easier to read.
- The camera returns to a wide establishing view only after the outcome has been shown.

The useful idea is not a particular zoom value. It is the change in emphasis: planning uses
the whole lane, ball travel creates anticipation, and collision receives the largest readable
view.

### Ball presentation

- The ball uses a bright highlight, shaded edge, and obvious color identity.
- Increasing screen size communicates forward travel as strongly as lane translation does.
- The highlight and surface appearance remain readable while the ball grows.
- Near impact, bloom and overlap favor perceived force over a perfectly clean silhouette.

The footage demonstrates that a convincing arcade ball needs readable volume and motion, not
photorealistic texture.

### Pin response

- Pins separate into individually readable paths instead of moving as one flat cluster.
- Fast contacts send pins sideways, forward, and across neighboring pin paths.
- Several reactions imply lift or a change in visual height, especially near the foreground.
- Dense pin fields propagate a collision wave through local contacts rather than producing a
  uniform radial explosion.
- The most energetic motion is concentrated near impact. The deck then remains visible long
  enough to read standing and fallen pins.

The reference balances physical causality with presentation exaggeration. Pin motion begins
at contact and spreads through the rack, while depth, separation, blur, and lighting make the
result feel larger than a literal top-down simulation.

### Result staging

- Standard rolls use comparatively quiet frame labels and score updates.
- The Golden Pin Stage changes the full lane palette before the roll, signaling higher stakes.
- Its result arrives in stages: collision, a large pin-count reveal, then a score lockup.
- Radial light, saturated color, large text, and short decorative motion create one concentrated
  reward moment.
- The result presentation replaces the collision view only after the player has seen the pins
  react.

This hierarchy matters more than the specific graphics. Ordinary play stays legible; a special
outcome earns a stronger visual interruption.

## Super Bowling response

| Reference cue                          | Super Bowling decision                                         | Status      |
| -------------------------------------- | -------------------------------------------------------------- | ----------- |
| Camera advances during ball travel     | Use one shot-driven projection for lane, ball, and pins        | Adopted     |
| Ball keeps visible volume while moving | Add rim shade, fixed gloss, lane reflection, holes, and shadow | Adopted     |
| Fast pins separate in depth            | Derive lift, shadow, and one afterimage from snapshot velocity | Adopted     |
| Collision remains physically caused    | Keep Rapier snapshots authoritative for every pin pose         | Adopted     |
| Large outcome reveal                   | Use distinct `STRIKE` and `SPARE` bursts with short confetti   | Adapted     |
| Full-screen reward sequence            | Keep controls available and confine the burst to the lane      | Adapted     |
| Cabinet power-ups and ticket rewards   | Preserve technique, regulation scoring, and practice records   | Not adopted |

The implementation keeps those decisions at existing ownership boundaries:

- [src/config/camera.ts](../src/config/camera.ts) defines mode-sensitive camera tuning.
- [src/render/camera.ts](../src/render/camera.ts) derives shot progress from physical ball travel.
- [src/render/ball.ts](../src/render/ball.ts) paints ball depth and surface rotation.
- [src/render/pins.ts](../src/render/pins.ts) paints grounded pin shadows and motion emphasis.
- [src/render/game_renderer.ts](../src/render/game_renderer.ts) applies one coherent projection.
- [src/app/roll_celebration.ts](../src/app/roll_celebration.ts) derives strike and spare bursts
  from match state.
- [src/style.css](../src/style.css) supplies the original result and confetti presentation.

## Original identity

Super Bowling borrows accessible screen-bowling principles from Nintendo Wii Bowling and
timing and motion hierarchy from Lane Master. It does not borrow either game's artwork,
branding, or hardware interaction.

- Keep Super Bowling's dark teal lane and geometric interface.
- Keep amber `STRIKE` and cyan `SPARE` as this game's result language.
- Keep the illustrated ball and pin family rather than copying the cabinet's rendered assets.
- Keep pointer and keyboard technique controls rather than imitating a Wii Remote or physical
  alley roller.
- Keep real bowling frames, player-controlled technique, and practice records.
- Keep the physical snapshot as the source of collision truth.
- Keep the result readable without a prize wheel, tickets, QR power balls, or reward currency.
- Keep celebrations short enough that the player can inspect the result and take the next shot.

## Acceptance criteria

- Camera progress begins with the released ball, increases smoothly, and resets before aiming.
- Lane, ball, pins, and shadows remain aligned because they share one projection.
- Moving fallen pins may receive lift and a short afterimage; resting pins receive neither.
- Strike and spare presentations are visually distinct and never appear for an ordinary roll.
- The existing visible status remains the single accessible result announcement.
- Ten-pin collisions remain dramatic without obscuring the final standing-pin state.
- Wide fantasy racks retain a complete, readable deck instead of copying the ten-pin zoom.
- Shipped assets and layouts remain original to Super Bowling.

## Follow-up evidence

The remaining visual follow-up is a captured normal-control hard off-center pocket-hit fixture.
Run it with a deterministic camera-and-impact transition probe and focused browser behavior
checks, then retain the machine-readable report. The zero-exit evidence command closes the
follow-up when it establishes that:

- foreground pins do not teleport or linger at an extreme height;
- pin shadows remain connected to plausible ground contact;
- the afterimage reads as speed instead of a duplicate pin;
- the camera reaches the deck without clipping meaningful pin action; and
- the result burst starts after the collision is readable.

The probe and browser checks verify state, projection, ordering, and bounded-transition contracts
without freezing tuned animation decimals. A fresh independent-subagent report reviews the
captured artifacts and command output; it returns a bounded remediation package when evidence
fails.
