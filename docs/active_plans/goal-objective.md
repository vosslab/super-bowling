# Goal Objective: Give Super Bowling More Impact, Energy, and Arcade Presence

## Primary experience: 1,000-pin Super Bowling

The 1,000-pin mode is the defining attraction of Super Bowling and should receive the highest presentation priority. Ten-pin bowling provides a familiar reference point, but a browser game that only makes ten-pin bowling exciting is not achieving the main product objective. The experience that should make Super Bowling memorable is launching an intentionally superhuman bowling ball into a physical rack of 990 individually simulated pins and watching the collision propagate through that enormous field.

The 1,000-pin roll should feel spectacular in a way that ordinary bowling cannot. Ball travel should build anticipation toward the enormous rack, the first impact should communicate exceptional force, and the player should be able to watch waves of physically caused collisions spread through the pin field. The scale of the rack should remain visually understandable throughout the action. Hundreds of pins moving at once should feel like a massive cascading physical event rather than visual noise, a uniform explosion, or a distant cluster of tiny objects.

Presentation decisions should therefore be designed and judged first against 1,000-pin gameplay. Camera behavior, projection, ball presence, pin motion emphasis, collision sound, performance, and result presentation should make the giant rack compelling to watch while preserving Rapier as the source of physical truth. Ten-pin and intermediate rack modes should inherit or adapt the resulting presentation where appropriate rather than defining constraints that weaken the 1,000-pin experience.

The defining test is whether someone seeing Super Bowling for the first time would want to watch another 1,000-pin roll. The enormous physical cascade should be the game's signature moment.

## Purpose

Super Bowling already works as a bowling game. The rules, scoring, controls, rack geometry, collision model, aiming model, and basic presentation are in place. The next objective is not to add another isolated feature or another small visual effect. The objective is to raise the quality of the entire bowling moment so that a roll feels exciting from release through impact and result.

The current game can be mechanically correct while still feeling visually and sonically flat. A roll can travel down the lane correctly, collide with pins correctly, count fallen pins correctly, and update the score correctly, yet still lack the feeling that makes an arcade bowling game satisfying to watch and replay. This objective is about that missing layer.

Super Bowling should feel like a polished arcade bowling game where every roll has momentum, impact, and payoff. A player should feel anticipation as the ball travels down the lane, feel force when the ball reaches the rack, be able to follow the pin action, and receive a clear result moment after the collision. The game should remain skill-driven and readable rather than becoming a noisy reward machine.

The desired improvement is experiential. Individual effects are useful only if the combined result is clearly more exciting during normal play.

## Design lineage

Super Bowling combines ideas from two broad references while remaining its own game.

Nintendo Wii Bowling contributes the approachable idea of screen-based bowling that is easy to understand, readable from a distance, and based on familiar bowling structure. Super Bowling does not use a motion controller and does not attempt to reproduce the Wii presentation.

UNIS Lane Master contributes a different kind of inspiration. Lane Master creates anticipation by changing visual emphasis during the roll, presents the ball and pin deck with a stronger sense of forward movement, allows impacts to dominate the screen at the right moment, and gives successful outcomes a concentrated arcade payoff. Super Bowling does not reproduce Lane Master artwork, hardware, cabinet interaction, ticket systems, power-ups, or visual branding.

The useful reference is the pacing and hierarchy of the action. Planning is calm. Ball travel builds anticipation. Impact becomes the dominant visual moment. The result receives a short payoff. The game then returns attention to the next decision.

Super Bowling should preserve its own dark teal lane, geometric interface, illustrated ball and pin family, amber strike language, cyan spare language, keyboard and pointer technique controls, regulation-inspired scoring, fantasy rack scales, and practice-oriented records.

The target is not a clone of either reference. The target is an original browser bowling game that has enough production value that a player immediately feels the difference between aiming, rolling, collision, and result.

## Core player experience

A complete roll should feel like one connected event rather than several independent systems running at the same time.

Before release, the player should have a stable view that supports aiming and decision-making. The lane, guide, ball, pin deck, score information, and controls should be readable. Nothing should compete unnecessarily with the player's preparation.

At release, the game should visibly transition from planning to action. The player should feel that the shot has begun. The ball should no longer look like a static circle translated along a path. Its movement, apparent depth, surface motion, lighting, and relationship to the lane should communicate forward travel and speed.

As the ball moves down the lane, the presentation should build anticipation. The pin deck should become more important in the composition. The player should sense that impact is approaching. Camera behavior, perspective, ball scale, lane motion, sound, and other presentation tools can contribute to that feeling. The exact technique is an implementation decision. The player-facing requirement is that the approach to the rack is obvious and satisfying.

At impact, the game should make the collision easy to see and exciting to watch. The ball-pin contact should feel forceful. Pins should remain individually readable as much as practical. Fast pin reactions should not collapse visually into a single indistinct cluster. Pin movement should feel connected to actual contacts while still receiving enough presentation emphasis to look energetic.

After impact, the game should give the rack time to resolve. Standing pins, fallen pins, sliding pins, late contacts, and unusual leaves are useful information. The player should be able to see what happened rather than having a result overlay immediately replace the physical outcome.

Once the physical result is readable, the game should communicate the result with an appropriate level of emphasis. Ordinary rolls should remain comparatively restrained. A strike or spare should feel clearly different. Major results should receive a short, concentrated payoff that is satisfying without delaying the next meaningful action.

The entire sequence should feel deliberate: aim, release, approach, impact, settle, result, next decision.

## Quality bar

The quality bar is not satisfied when a feature technically exists.

A camera effect that changes a number but is barely perceptible during normal play does not satisfy the objective.

A strike celebration that appears but does not feel meaningfully different from ordinary result text does not satisfy the objective.

A sound system that produces audio but sounds like a low sustained machine tone does not satisfy the objective.

A ball renderer that contains shading code but still reads as a flat moving disc does not satisfy the objective.

Pin animation that adds small visual offsets but does not make strong collisions feel more energetic does not satisfy the objective.

The finished experience should produce a clearly observable improvement during real-time play. A person who has not read the implementation notes should be able to watch several rolls and notice that the game has stronger anticipation, more convincing impact, more readable pin action, better sound, and a more satisfying result presentation.

The objective should therefore be judged through complete rolls, not by confirming the presence of individual modules, variables, transitions, particle systems, audio nodes, or configuration values.

## Anticipation and camera presence

The most important missing feeling is the transition from a distant aiming view into a close, consequential collision.

The resting view should establish the full lane and distant target. This view is useful because bowling begins as a planning problem. The player needs enough context to understand start position, angle, spin, power, lane boundaries, and the location of the rack.

Once the ball is released, the visual emphasis should change. The shot should feel as though it is moving toward something important. The pin deck should gradually become more prominent as the ball travels. The player should not spend the entire roll looking at a nearly unchanged wide establishing view.

The camera or projection does not need to imitate a physical cinematography system. Super Bowling already uses a faux-3D projection rather than a real 3D camera. The important requirement is the perceived movement of emphasis toward the pin deck.

The closest useful view should occur around the collision, not long before and not after the action has already finished. The collision should have enough screen space for individual pin reactions to remain visible.

The close view should remain stable long enough for the player to read the important portion of the collision. The presentation should not rush back to the wide view while pins are still performing meaningful movement.

Camera movement should remain tied to the actual state of the roll rather than behaving like an unrelated timer. Physical ball travel is a useful source of shot progress because the camera then reflects what is actually happening in the simulation.

A gutter ball, weak shot, fast shot, large rack, or unusual collision may require different presentation behavior. The goal is not a single fixed zoom curve copied across every game mode. The goal is a coherent sense of approach and impact.

Wide fantasy racks should remain readable as complete physical fields. A camera treatment that works beautifully for ten pins may be inappropriate for hundreds of pins. The presentation can adapt by rack scale while preserving the same underlying hierarchy of planning, approach, impact, and result.

Reduced-motion mode should preserve the information and hierarchy of the shot while reducing or removing strong camera motion.

## Ball presence

The bowling ball is one of the most visually important objects in the game. The player chooses its appearance, launches it, watches its path, and uses its movement to judge the success of the shot.

The ball should therefore read as a physical object with volume.

The current design already supports player-selected colors, patterns, and monograms. Those identity features should remain visible during play. The visual treatment should help the ball retain that identity rather than hiding it under generic effects.

The ball should communicate depth through a combination of shape, shading, highlight, surface pattern, finger holes, contact shadow, lane reflection, apparent size, and visible surface rotation. Not every technique must be used equally. The combined result should make the ball look round and moving.

The ball does not need photorealistic texture. A stylized illustrated ball is consistent with the existing visual identity. The key is readable volume and motion.

Forward travel should be communicated by more than translation along the lane. The ball should appear to move through depth. The relationship between ball size, lane perspective, shadow, and pin deck should reinforce the sense that the ball is approaching the viewer's point of interest.

Surface movement should make rolling obvious. Spin and forward roll should contribute to the player's understanding of the shot without becoming visually confusing.

Near impact, the ball should retain enough clarity that the player can understand where it entered the rack. Effects such as bloom, motion emphasis, shadow, or brief overlap may support perceived force, but the contact point should not become impossible to read.

## Pin impact and movement

The physical collision system is one of the strongest foundations of Super Bowling and should remain authoritative.

Pins and fallen pins are real physical obstacles. Ball-pin and pin-pin interactions should continue to arise from the simulation rather than from a scoring explosion or decorative blast radius.

The goal is to make that physically caused movement feel exciting.

Real bowling impacts contain many different visual reactions. Pins rotate, slide, tumble, cross paths, collide again, move sideways, move toward or away from the viewer, and occasionally appear to lift as forces propagate through the rack. Even when the simulation is two-dimensional, the renderer can use the physical state to create a stronger visual impression of those reactions.

Strong hits should produce clearly separated pin paths. The eye should be able to identify individual moving pins rather than seeing the entire rack behave as one flat group.

Fast contacts should look fast. Slow contacts should look slower. Presentation emphasis should respond to the physical state rather than applying the same animation to every pin.

A pin with substantial velocity may receive stronger motion cues than a nearly settled pin. A fallen pin sliding across the deck may need a different visual treatment than an upright pin beginning to tip. A pin involved in multiple contacts may briefly become a focal point because the physical simulation has made that pin important.

Depth cues can help make collisions feel larger than the underlying flat simulation. Lift, shadow separation, scaling, blur, afterimages, rotation emphasis, and temporary visual offsets are possible tools. Their use should remain grounded in the simulation state. The goal is presentation exaggeration of real events, not replacement of the physics.

Dense fantasy racks should propagate visible waves of contact. Hundreds of pins should not appear to participate in a uniform radial explosion. Local collisions should remain the cause of movement. The viewer should perceive energy traveling through the rack.

The most energetic visual treatment should occur near impact. As the rack settles, motion emphasis should naturally decrease. Resting pins should look resting.

Pin shadows should support the impression of deck contact. Any visual lift should return convincingly to the deck. Pins should not appear to hover, teleport, or remain detached from their physical location after the effect has served its purpose.

Settled pin state remains important gameplay information. The presentation should leave a clear final view of which pins remain standing.

## Sound design

Sound should contribute substantially to the missing sense of impact.

The current low, sustained, machine-like synthesized tones do not communicate bowling collisions effectively. Bowling impacts are short, percussive, layered events. The game should move toward that character.

A bowling roll contains several different sound categories. The ball moving on the lane is different from the first ball-pin collision. Pin-pin contacts are different from pins striking the deck. A gutter impact is different from a clean pocket hit. A strike or spare result can have its own short identity.

These sounds should not all be represented by the same oscillator character at different pitches.

Synthetic sound remains acceptable and can fit the browser-only architecture. The requirement is not that recorded audio assets must be introduced. The requirement is that the result sounds intentional, percussive, responsive, and appropriate to bowling.

Impact intensity should matter. A powerful collision should have more sonic weight than a weak secondary contact. Many simultaneous collisions should build a convincing short burst of activity without becoming an indistinct sustained drone.

The audio system should support the visual hierarchy. Ball travel can build expectation. The first major collision can provide a strong transient. Secondary pin contacts can fill the short impact window. The sound should then decay as the rack settles.

Strike and spare sounds should be clearly recognizable as result cues and should occur at the appropriate time. They should support the payoff after the player has had a chance to see the collision.

Ordinary rolls should not receive the same celebratory sound intensity as strikes and spares.

Mute preference must continue to work reliably.

## Result presentation

Result presentation should reinforce the importance of the physical shot rather than replacing it.

The player should first see the collision. The game should then communicate what the collision achieved.

Ordinary results can remain quiet and readable. Pins-down text, score changes, and frame progression already provide useful information.

Strikes and spares should be unmistakable.

The existing amber strike identity and cyan spare identity are useful parts of Super Bowling's visual language and should remain recognizable. The exact visual design can evolve while preserving that identity.

A strike should feel like the strongest standard bowling result. It can use a combination of large typography, short decorative motion, particles, confetti, lighting, screen-space effects, lane effects, or other original presentation techniques.

A spare should also receive a satisfying payoff, but the treatment can remain visually distinct from a strike.

The celebration should arrive after the player has seen enough of the pin action to understand the result. An effect that covers the pins immediately after contact reduces the value of the collision system.

Celebrations should be concentrated rather than prolonged. A short high-energy moment is more effective than a long sequence that delays the next shot.

Controls and game state should remain understandable during or immediately after the celebration. The player should not feel trapped inside a reward animation.

Reduced-motion mode should preserve the result information with an appropriately simplified static presentation.

## Young-adult tone

Super Bowling is aimed at players who can enjoy technique, experimentation, and improvement. The game should feel energetic without becoming childish.

The primary reward remains the bowling itself. Position, angle, power, and spin give the player meaningful control. The player should be able to form a plan, watch the consequences, adjust, and try again.

Visual excitement should strengthen that loop.

Strong color, motion, sound, and decoration should be reserved for meaningful moments. A calm default makes the approach, impact, strike, spare, major record, or other important event stand out.

The game should not require constant praise, mascots, currencies, loot systems, ticket mechanics, or exaggerated rewards for ordinary actions.

A missed shot should still be worth watching because the player can learn from the path and pin reaction.

A successful shot should feel satisfying because the player created it through technique and the game presents the physical result well.

The desired tone is confident, responsive, and arcade-like without becoming a children's redemption game.

## Physics and presentation boundary

Rapier remains the source of collision truth.

The physical world should continue to determine ball motion, pin motion, contacts, fallen state, gutters, pit capture, standing pins, and scoring-relevant outcomes.

Presentation systems can interpret physical state to improve readability and excitement.

Rendering can emphasize velocity, depth, lift, spin, contact, impact, and settling. Audio can respond to collision intensity. Camera behavior can respond to ball travel. Result effects can respond to match state.

These systems should not secretly replace the simulation with predetermined outcomes.

A strike should remain a strike because the physical rack was cleared according to the game rules, not because a celebration system decided that the shot looked powerful enough.

A pin should not be counted as fallen because a visual effect threw it off screen.

The separation between physical truth and presentation exaggeration allows the game to become more dramatic without losing the technique-driven character that makes Super Bowling distinctive.

## Technology direction

The objective is not tied to a required implementation language.

The existing TypeScript, SolidJS, Canvas, Web Audio, worker, npm, and Rapier architecture is capable of supporting substantial improvements in presentation.

SolidJS should continue to serve the application and interface layer rather than becoming the physics world.

Canvas remains appropriate for the custom lane, ball, pin, particle, shadow, lighting, and other game rendering.

Web Audio can support stronger synthesized sound if the sound design is improved.

Rapier already provides a high-performance physics foundation through WebAssembly.

Additional Rust or custom WebAssembly may be considered if a real computational need appears. The existence of Rust or WebAssembly should not itself be treated as an objective. A new implementation layer is valuable only when it solves a demonstrated problem or enables a meaningful result that is difficult to achieve cleanly in the current architecture.

The goal is a better game, not a more complicated technology stack.

## Rack-scale behavior

Super Bowling includes rack scales from the familiar ten-pin game to fantasy racks containing hundreds of pins.

The presentation should respect those differences.

Ten-pin mode is the most natural place for strong arcade camera movement because the complete rack remains readable at a close scale. Individual pin reactions are especially important here.

Larger racks create a different visual challenge. The player needs to understand a much wider physical field and see collision propagation through many pins.

The same exact camera framing should not be forced onto every rack if doing so damages readability.

The shared design principle is that the shot should increase in visual intensity from release to impact. Each rack scale can solve that problem in a way appropriate to its geometry.

Fantasy racks should preserve the sense that every pin exists physically and can participate in local collision cascades.

The presentation should emphasize the spectacular scale of these racks without turning them into decorative particle fields.

## Bowling rules and gameplay preservation

The presentation work should preserve the current bowling model.

The selected rack remains a complete centered triangular rack.

The actual physical pin count remains authoritative for scoring.

The existing rack labels and actual rack totals remain distinct where the game currently defines them that way.

The four pre-roll technique controls remain meaningful: power, start position, angle, and spin.

A launched ball remains committed to the chosen technique. The player does not steer the ball after release.

The preview remains a guide to the pins-free physical path before contact rather than a prediction of exact pinfall.

Classic bowling continues to use familiar strike, spare, and tenth-frame behavior.

Super frame modes continue to use their defined bowl counts and scoring model.

Fallen pins and standing pins continue to follow the physical cleanup rules already established between eligible bowls.

Practice records and saved preferences should remain compatible with the presentation improvements.

The objective is to make the same game substantially more satisfying to play and watch.

## Accessibility and reduced motion

Accessibility is part of the design contract.

Important results should never depend only on animation, color, particles, or sound.

Strike, spare, pinfall, score, current player, and game progression should remain available through the existing accessible text and interface.

Reduced-motion preference should meaningfully reduce camera movement, confetti movement, strong motion effects, and other presentation that can cause discomfort.

Reduced motion should not remove the information communicated by those effects.

A player using reduced motion should still receive a clear distinction between aiming, rolling, impact, result, and next-shot readiness.

Mute should continue to remove game audio without affecting play.

Visual effects should preserve sufficient contrast and should not make score information or controls difficult to read.

## Original identity

Super Bowling should remain visually recognizable as Super Bowling after the improvements.

The purpose of studying Lane Master is to understand why the action feels energetic, not to copy its art direction.

Do not reproduce Lane Master artwork, logos, cabinet graphics, ticket imagery, reward systems, specific screen compositions, or proprietary audio.

Do not reproduce Wii Bowling visual assets, characters, interface graphics, or controller behavior.

Super Bowling should continue to use its own lane palette, geometric presentation, custom ball identity, illustrated pin style, typography, result colors, fantasy scale concept, and technique controls.

The final game should feel influenced by good arcade pacing while still looking clearly original.

## Autonomous motion-evidence standard

The most important validation is an unattended captured roll from release through settlement.

Static screenshots check composition, layout, ball appearance, result typography, and final pin readability. Synthetic transitions and browser behavior tests check motion ordering; offline audio rendering and real-worker probes check articulation, timing, and scale.

The manager closes this objective with captured fixtures, automated behavior/probe gates, and independent-subagent review. A hard off-center pocket-hit fixture exercises the complete sequence from aim through result.

The ball release should clearly begin the action.

The approach to the rack should feel progressively more consequential.

The camera or projection should make the pin deck meaningfully more prominent.

The ball should retain visible volume and motion.

The first impact should feel strong both visually and sonically.

Individual pins should separate into readable motion.

Fast pins should look energetic without appearing disconnected from the physics.

Shadows and depth cues should remain plausible.

The collision should remain visible long enough to understand.

The result presentation should begin after the collision has communicated the outcome.

A strike or spare should feel substantially more satisfying than an ordinary result.

The game should then return attention to the next useful decision without unnecessary delay.

If the captured fixtures, behavior probes, or independent review expose a missing quality, the
manager opens a bounded follow-up even if the corresponding systems technically exist.

## Completion standard

This objective closes when its unattended fixtures and evidence gates establish a cohesive arcade
bowling presentation built around the simulation.

The difference should be immediately visible and audible during ordinary play.

A player should be able to release the ball and feel the shot gathering momentum.

The pin deck should feel like the destination of the action.

The ball should look like a moving physical object.

Impact should have enough visual and sonic force to make a strong hit satisfying.

Pin movement should remain physically believable while gaining enough depth, separation, and emphasis to become fun to watch.

The player should have time to read the result of the physical collision.

Strikes and spares should produce a clear short payoff.

Ordinary rolls should remain restrained enough that those stronger moments retain contrast.

The game should preserve the existing technique-driven rules, scoring, accessibility, reduced-motion support, saves, rack geometry, physical collision truth, and original visual identity.

The terminal decision is based on the captured fixture reports, automated behavior/probe results,
and an independent-subagent review of their evidence.

If those artifacts show camera movement, ball rendering, collision emphasis, sound effects, or
result effects remain flat, quiet, distant, weak, or visually unchanged, continue with a bounded
automated follow-up.

The intended end state is simple to describe even if it requires substantial iteration to achieve:

**Super Bowling should make the player want to watch the ball hit the pins.**
