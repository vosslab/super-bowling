# Young-adult game design style

Design guide for games played voluntarily by young adults. Use it when the
player should feel capable, curious, and ready to improve, rather than managed
by a reward loop.

## Scope and audience

This guide applies to TypeScript browser games and interactive tools when the
audience is roughly high-school age through early adulthood and the experience
is built around judgment, technique, or practice.

Use it when the desired reaction is:

> I can see what I did, I can improve it, and I want another try.

It fits sports, tactics, craft, rhythm, movement, and simulation games. It is
not a guide for a dashboard, a formal certification assessment, or a
middle-school kid arcade. For saturated, reward-driven kid replay, use
[docs/FUN_VIBES_DESIGN_STYLE.md](FUN_VIBES_DESIGN_STYLE.md) instead.

## Rule layers and use

The guide has two layers. Layer 1 is portable. Layer 2 establishes the
young-adult tone.

### Layer 1: portable interaction rules

These travel to most interactive projects:

- Polish the core loop before expanding the feature list.
- Make state changes quick, visible, and understandable.
- Give touch input large targets and give every action keyboard parity.
- Keep reversible choices friction-free and confirm irreversible ones.
- Make the interface self-explanatory; use short labels and immediate
  feedback instead of a help-text wall.
- Preserve progress with a versioned save schema and forward migration.
- Keep event handling centralized where events feed scoring, progress, or
  feedback.
- Build with cachebusted assets and a fresh development origin so playtests
  inspect the code that was just built.
- Capture important visual states. Unit tests prove rules; screenshots prove
  that players can read and use them.
- Treat accessibility as part of the interaction contract: readable contrast,
  visible focus, keyboard operation, and motion that can be reduced.

### Layer 2: young-adult game guidance

These rules establish a game that respects a player's judgment and time:

- Mastery and technique are the reward. Scores, personal bests, and a clean
  replay are useful feedback; coins, loot, and streak theatrics are not the
  main reason to continue.
- Difficulty should read as skill expression. A miss must reveal something a
  player can adjust, not feel like the game withheld a hidden answer.
- Use restrained color and motion. Reserve strong contrast, color shifts, and
  movement for a shot state, a meaningful result, or an actionable warning.
- Respect player time. Let a player restart, adjust, and launch without
  ceremony. Keep result dwell long enough to learn from, then move on.
- Let the interface carry itself. Clear labels, visible ranges, and direct
  response teach the controls. Mascots, praise scripts, and tutorial
  hand-holding are unnecessary when the game can show cause and effect.
- Keep the surface confident, not cold. A precise field, a readable result,
  and honest feedback create invitation without pretending every attempt was
  a triumph.

## Core design principles

When rules conflict, these principles decide the tradeoff.

- **Technique is content.** The player is here to form a better mental model
  and execute it. Present meaningful choices and show their consequences.
- **Feedback earns its space.** A result panel, trajectory, sound, or motion
  exists because it improves the next decision.
- **Clarity supports confidence.** The player should know what can be changed,
  what just happened, and what happens next without being led through it.
- **Time is part of the design.** Fast control response, concise transitions,
  and restartable practice respect a player who chose to spend time here.
- **Restraint creates emphasis.** Calm defaults make a real success, failure,
  or danger legible when it matters.

## Player interaction rules

- Show the live value of every player-controlled variable near the control.
  Ranges and labels should state the effect in the player's vocabulary.
- Keep controls stable across rounds. A learned input should remain a learned
  input, not move to make a menu look fresh.
- Support keyboard and pointer input equally. A control that can be dragged
  should also have clear, repeatable key adjustments.
- Let players inspect a planned move before committing it. Previews must
  describe the real system closely enough to teach, not sell a false promise.
- Make a reset or replay direct. Confirm only actions that discard meaningful
  saved progress.
- Use errors and misses as information. State what occurred and leave room for
  the next attempt; do not shame or over-celebrate either outcome.

## Visual and motion rules

- Build hierarchy from type scale, spacing, and contrast before decoration.
- Use a compact palette with a clear base, a small set of accents, and one
  reserved status treatment. Saturation is deliberate, not a background hum.
- Let the play surface dominate. Controls and scores should be easy to find
  without competing with the action.
- Use motion to show force, trajectory, settling, or state change. Avoid
  looping celebration and ornamental movement that delays the next decision.
- Tune motion for force, trajectory, settling, and earned results before adding
  a lower-motion alternative. That alternative preserves information without
  defining the normal presentation; see [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Progress and reward signals

- Prefer records that reflect practice: personal bests, a score history,
  mastery of a difficult shot, or a replay that demonstrates control.
- Keep rewards subordinate to the skill loop. A badge may mark a real
  accomplishment, but it must not turn ordinary practice into a grind.
- Avoid currency, rarity tiers, daily quotas, and shops unless they serve a
  specific game decision. They commonly replace a thin core loop instead of
  strengthening it.
- Show enough context to make progress legible, then return attention to play.
  A player needs the next useful adjustment, not a dashboard of obligations.

## Super Bowling worked example

Super Bowling makes technique visible through four controls:

- **Power** determines how much pace the ball carries down the lane.
- **Start position** chooses the launch board.
- **Angle** sets the initial direction.
- **Spin** bends the later part of the path and rewards a planned entry angle.

The preview follows the same physical model as the live roll, so it gives the
player a testable plan rather than a decorative dotted line. Pins stay on the
deck long enough to read the result, then fallen pins are swept before the
next roll on that rack. The game shows the consequence of a choice without
making the player wait through a reward ritual.

A centered, safe-looking shot deliberately does not reliably strike. That
choice makes the game's subject matter clear: the player must use position,
angle, power, and spin to create a productive entry, rather than discovering
that the least expressive input is optimal. Difficulty is therefore a skill to
learn and communicate, not a toll before a coin reward.

Practice records make improvement legible without turning setup into a wall of
zeroes. An empty record invites the first game; a returning player sees `LAST 5`,
`BEST FRAME`, `BEST RUN`, and `GAMES BOWLED`. During play, ordinary results are
never silent: each completed roll reports pins down, `Strike!`, or `Spare!`.
That immediate result explains the scorecard and lets the player connect an
input with what happened before choosing the next shot.

The game has one earned-moment toast slot. It reports a meaningful practice
milestone, stays out of the way of the controls, and permits the next roll
without acknowledgement. Its priority favors transferable skill evidence over
streak theater: a carried-record `HIGH GAME` replaces a simultaneous moment;
once that has been announced, a once-per-player `BEST FRAME` replaces a named
strike run. A named run begins at `Turkey` and rises with the run. This keeps a
single clear message on screen rather than making every successful shot compete
for attention.

| Trigger | Surface | What the player learns |
| --- | --- | --- |
| Every completed roll | Result text near the lane: pins down, `Strike!`, or `Spare!` | The shot has resolved and the scorecard is about to reflect a concrete bowling result. |
| First positive frame or a frame that beats the carried frame record, once for that player | `BEST FRAME` toast | A single frame is a practice target; a first game can establish it, and later games can improve it. |
| Completed score exceeds the carried high-game record, once per match | `HIGH GAME` toast | The whole-game result has surpassed the player's real prior standard. |
| Three or more consecutive strikes after higher-priority record moments are handled | Named-run toast, beginning with `Turkey` | Repeated execution is visible, but it does not outrank a durable practice record. |
| Match completion | Final comparison with score change, best-frame context, and best-run context | The player can decide whether to replay for a specific, understandable improvement. |

Review this contract by following the visible path, not a mockup: start with no
record, establish a positive frame, continue from a saved record, complete a
spare and a strike run, and finish the match. Each case must leave a readable
text result while controls remain usable. Do not add a toast for every roll:
ordinary result text teaches cause and effect, while the toast remains reserved
for the few outcomes that earn a practice milestone.

## Engineering rules for tone

- Keep one authoritative model for gameplay and preview behavior. Separate
  models drift and teach the wrong lesson.
- Version saved player preferences and progress. A rebuild must not turn a
  returning player's trust into a migration surprise.
- Keep score, input, simulation, and rendering responsibilities explicit.
  Clear boundaries make behavioral tuning possible without hiding a change in
  unrelated presentation code.
- Test behavior at the seam between user input and visible result. Use exact
  values only for stable contracts; use perceptual tolerances for visual or
  physical outcomes that naturally vary.
- Keep screenshots and benchmark probes as maintained tools. They are useful
  evidence when they represent the real production path, not a second game.

## Review design questions

Ask these questions during design and visual review:

- Can a new player identify the available controls and their current values?
- Does a miss point to a change the player can make on the next roll?
- Does color or motion explain a state change, or merely ask for attention?
- Can a player reach another meaningful attempt quickly?
- Does the default strategy reward learning the game, rather than avoiding
  its expressive controls?

## See related guides

- [docs/FUN_VIBES_DESIGN_STYLE.md](FUN_VIBES_DESIGN_STYLE.md): use the
  kid-arcade guide when the intended audience is middle-school players and
  saturated replay rewards, mascots, and celebration are central to the tone.
- [docs/PLAYFUL_TRAINING_GAME_STYLE.md](PLAYFUL_TRAINING_GAME_STYLE.md): use
  this training guide for older learners practicing a real-world professional
  skill in an instructor-friendly setting.
- [docs/REPO_STYLE.md](REPO_STYLE.md): repo-wide engineering principles.
- [docs/MARKDOWN_STYLE.md](MARKDOWN_STYLE.md): documentation conventions.
