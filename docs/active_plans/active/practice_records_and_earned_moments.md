Status: Complete - M1-M4 and F1-F5 are accepted.

Execution note: F1 delivered the shared finalized frame-score seam, first
positive or improved once-per-player BEST FRAME, visible `Spare!`, and final
best-frame record context. F2 compacted the supported setup, F3 made the
young-adult feedback contract operational, F4 corrected the strike-matrix
baseline path, and F5 refreshed the existing tracked
`docs/screenshots/thousand_pin_deck.png` with a readable live BEST FRAME toast.
`./check_codebase.sh` passed with 181 Node tests, the full browser suite passed
33/33, focused practice-record coverage passed 2/2, and `pytest tests/` passed
667. No staging action was taken.

Reality-grounded test decision: permanent coverage owns pure earned-moment logic,
the shared browser-toast seam, and final best-frame summary context. Exact
transient BEST FRAME DOM visibility is an ordinary one-time live implementation
check, not a fast-fixture, fake-clock, screenshot, pixel, or timing gate.

Archival is deferred solely because moving this active-plan file with `git mv`
would write the Git index, which is out of scope. The file remains in `active/`
without a move, copy, or staging action.

# Plan: Practice records and earned-moment feedback

## Context

Super Bowling now plays well: the physics, camera, pin art, and configurable
`bowls_per_frame` work are accepted, and the previous plan
[docs/archive/ancient-shimmying-adleman.md](../../archive/ancient-shimmying-adleman.md)
is at its M8 close-out. What the game still lacks is the part of
[docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md](../../YOUNG_ADULT_VIBES_DESIGN_STYLE.md)
titled "Progress and reward signals": the guide asks for "records that reflect
practice: personal bests, a score history, mastery of a difficult shot" and for
feedback that "earns its space."

Today the save file keeps exactly one number per mode. `SaveFileV3.best_scores`
maps `${pin_count}:${bowls_per_frame}` to a single integer, rendered as one line
of text on the setup screen. Nothing marks the moment a player beats that best,
nothing shows whether this session is trending up, and a finished match ends on
a bare "Final score" number. A player who just rolled their best game ever gets
the same visual treatment as a player who gutter-balled ten frames.

This plan adds a per-mode practice record to local storage and restrained
feedback: a non-blocking in-play toast for genuinely earned moments, ordinary
roll-result text for Strike and Spare, and an end-of-match summary that names
what changed. The intended outcome is the guide's target reaction -- "I can see
what I did, I can improve it, and I want another try" -- without adding coins,
rarity tiers, or a dashboard of obligations.

Real bowling alleys already solved the naming half of this problem, and their
vocabulary is the reason the feedback can stay restrained. An overhead monitor
does not print "STRIKE STREAK: 3" -- it says TURKEY, and every bowler in the
building knows what that means. Borrowing the house vernacular (double, turkey,
four-bagger, and the rest of the bagger ladder) gives each moment a name a
player already recognizes, so the toast can be three words instead of a
sentence. The same applies to the record labels: an alley scoreboard reads
HIGH GAME, not "best score." This plan adopts that vocabulary throughout, and
fixes one scoresheet detail the current score strip gets wrong -- a missed roll
prints `0` where an alley prints `-`.

## Objectives

- Persist a per-mode practice record: high game, the last five finished scores,
  best single-frame score, longest strike run, and games bowled.
- Name strike runs with real bowling-alley vernacular -- double, turkey,
  four-bagger, and onward -- from one shared module every surface reads.
- Fire one non-blocking earned-moment toast per qualifying transition: HIGH
  GAME first, then BEST FRAME, then a named run starting at the turkey.
- Name ordinary classic scoring results in the result surface, including
  `Strike!` and `Spare!`, without treating every pins-down result as an earned
  moment.
- Replace the bare final-score block with a summary that names the change
  against the record the player carried into the match.
- Show the practice record on the setup screen so a returning player sees their
  trend before choosing a mode.
- Correct the score strip to print `-` for a missed roll, matching the mark a
  house scoresheet uses.
- Migrate every existing save forward without discarding a stored high game.

## Design philosophy

The trade-off this plan accepts is **more save-schema surface in exchange for
feedback that is derivable rather than tracked**. Every new statistic is
computed by a pure function from a completed score card, not accumulated in
mutable match state. That costs one extra module and a schema version bump, but
it means the stats cannot drift out of sync with the score card that produced
them, and it makes each statistic testable with an inline literal frame array
instead of a simulated match.

The rejected alternative was **incremental counters inside `MatchState`**:
increment a strike-streak field on each settled roll and write it out at match
end. That is fewer lines today and it is what most game code does. It was
rejected under "fix the design, not the symptom" and "long-term over
short-term" from
[docs/REPO_STYLE.md](../../REPO_STYLE.md): a counter
mutated across the reducer's nine phases has to be reset correctly at every rack
reset, handoff, and tenth-frame fresh rack, and each new `bowls_per_frame` rule
is another place the counter can silently diverge from the score card. Deriving
from the score card has exactly one source of truth.

The second trade-off is **restraint over volume in the feedback itself**. The
toast considers three earned conditions in a fixed priority order -- HIGH GAME,
BEST FRAME, then a named run -- auto-dismisses, and never blocks the next roll.
The style guide's "Feedback earns its space" and "Respect player time" rules
make an every-strike celebration a defect, not a feature; ordinary `Strike!`
and `Spare!` result text reports what happened without becoming a reward popup.
House vernacular is what makes the earned feedback affordable: TURKEY carries
the whole meaning of a three-strike run in one word, so the surface stays small
while the signal stays loud. This also satisfies the guide's "Let the interface
carry itself" rule -- the game teaches its own terms through use, with no
tutorial text.

The third trade-off is **vernacular as data, not prose**. Every alley term lives
in one lookup module rather than being spelled inline at each call site, so the
toast, the summary, and the setup record can never disagree about what four
strikes in a row is called.

- Evidence strategy for uncertain methods: the strike-streak definition for
  `bowls_per_frame != 2` is the one open modelling choice (classic `is_strike`
  returns `false` for every non-classic frame). WP-S1 resolves it by
  implementing the generalized definition -- a frame whose FIRST bowl clears the
  whole rack -- and proving it against inline score cards at `B = 2`, `B = 3`,
  and `B = 5` in the same test module, including a tenth frame. If the
  generalized definition produces a streak that disagrees with the classic
  `is_strike` result on any `B = 2` card, the classic result wins and the
  generalized path is narrowed to `B != 2`.

## Scope

- Add `SaveFileV4` with a `mode_records` map keyed by the existing
  `${pin_count}:${bowls_per_frame}` shape, and migrate V1, V2, and V3 forward.
- Add a pure match-statistics module deriving total score, best single-frame
  score, and longest strike streak from a completed score card.
- Add a pure bowling-vernacular module holding the bagger ladder and the alley
  label vocabulary used by every surface.
- Add a pure earned-moment decision module that names which moment, if any, a
  state transition earned.
- Print `-` for a missed roll in the score strip, matching house scoresheet
  marks.
- Change the `match_complete` effect to carry per-player match summaries instead
  of bare totals.
- Render an in-play toast, an end-of-match summary panel, and a setup-screen
  practice-record block, each respecting the reduced-motion preference.
- Extend Node unit tests, add Playwright coverage, and update the changelog,
  README feature text, and the style guide's Super Bowling worked example.

## Non-goals

- Introduce currency, coins, rarity tiers, shops, daily goals, or streak
  multipliers. The style guide lists these as the failure mode for this audience.
- Track statistics per player name. Records stay keyed by mode and bowls per
  frame, as decided below.
- Add confetti, looping celebration animation, or a modal that blocks the next
  roll.
- Add a stats dashboard, a career screen, or cross-mode aggregate totals.
- Detect or mark splits. An alley scoresheet circles a split, but that needs to
  know WHICH pins are standing, and the scoring path carries only counts:
  `SettledRoll` in `src/game/contracts.ts:78-83` has `standing_pin_count`, not
  pin identity. The worker snapshot holds positions, so this is achievable
  later; it is a separate contract change and does not belong in this plan.
- Add foul-line handling, a `F` mark, handicap scoring, or league series
  formats. The game has no foul line and no three-game series concept.
- Retune physics, camera, pin art, or scoring rules. This plan reads the score
  card; it does not change how the score card is produced.
- Sync records to any server or export them.

## Current state summary

| Area | State | Evidence |
| --- | --- | --- |
| Save schema | `SaveFileV3` holds `best_scores: Partial<Record<BestScoreKey, number>>`; V1 and V2 migrations already exist | `src/save/contracts.ts:33-40`, `src/save/save_file.ts:134-162` |
| Score bound | Private `maximum_score(pin_count, bowls_per_frame)` already computes the legal ceiling | `src/save/save_file.ts:30-33` |
| Persistence | `load_save` / `store_save` wrap `StorageLike`; `create_save_settings` owns the in-memory copy and commits | `src/save/load.ts`, `src/save/settings.ts:21-43` |
| Match completion | `complete_match` builds `Record<player_id, total>` and emits `match_complete` | `src/game/match.ts:71-85` |
| Completion sink | `App.record_completed_scores` takes `Math.max` of the player totals and calls `record_completed_score` | `src/app/app.tsx:105-112` |
| Best-score display | One line on setup: `Best for {mode}: {score}` | `src/app/setup.tsx:169-172`, `src/style.css:230` |
| Final display | `.final_result` block with literal text `Final score` inside `role="status"` | `src/app/game.tsx:729-738`, `src/style.css:643-659` |
| Dialog precedent | `.handoff_panel` is the existing overlay pattern with `role="dialog"` and focus management | `src/app/game.tsx:748-776`, `src/style.css:661-691` |
| Strike detection | `is_strike` and `is_spare` return `false` whenever `bowls_per_frame != 2` | `src/game/scoring.ts:83-105` |
| Score strip marks | `format_frame_roll_marks` emits `X` and `/` but renders a missed roll as `0`, where a house scoresheet prints `-` | `src/game/score_display.ts:6-24` |
| Roll identity | The scoring path carries pin COUNTS only, so no split can be detected from it | `src/game/contracts.ts:78-83` |
| Persistence tests | `tests/test_save_file.mjs` uses inline literal saves; `tests/playwright/e2e/presentation_persistence.spec.ts` drives the `perfect_game` fixture and asserts stored bests | both files |

## Resolved decisions

These were settled with the repository owner before drafting and are not open
for re-litigation during execution.

- **Stat set**: best score, last five finished scores, best single-frame score,
  longest strike streak, matches played. Not the fuller career log (total pins,
  first-roll clear rate, total strikes), which reads as a dashboard.
- **Feedback shape**: in-play toasts AND an end-of-match summary panel. Not
  toasts alone, and not a summary alone.
- **Scope key**: per mode plus bowls per frame, reusing the existing
  `BestScoreKey` shape. Not per player name, which collides on rename and grows
  without bound.
- **Multiplayer semantics**: the record is a device record for the mode, so each
  statistic takes the best value ACROSS every player in the match. If Ari posts
  the top score and Sam posts the longest run, the record keeps both. Only
  `recent_scores` is single-valued, and it takes the match's top score, because
  a history entry represents one match. `matches_played` increments once per
  match. Storing one winning player's whole summary was rejected: it would make
  "best frame" mean "the winner's best frame," which is not what the label says,
  and it would need a tiebreak rule that this design does not.
- **Vernacular**: mimic real bowling-alley interfaces. Strike runs use the house
  bagger ladder, record labels use scoreboard language, and the score strip uses
  house marks. Invented labels are used only where the alley has no equivalent
  (for example the 105- and 990-pin racks, which no alley runs).
- **Naming**: player-facing text says "run" (BEST RUN, "Best run: Turkey");
  code identifiers keep the existing `strike_streak` spelling
  (`ModeRecord.best_strike_streak`, `PlayerMatchSummary.longest_strike_streak`,
  `current_strike_streak`). Do not churn the identifiers to match the prose --
  the vernacular belongs on the surface, not in the type names.

## Architecture boundaries and ownership

Three boundaries keep the work separable:

- **Persistence boundary** (`src/save/`): owns the V4 contract, normalization,
  validation bounds, migration, and the controller method that commits a
  finished match. Nothing outside `src/save/` constructs a `ModeRecord`.
- **Derivation boundary** (`src/game/match_stats.ts`,
  `src/game/bowling_terms.ts`, `src/app/earned_moments.ts`): pure functions
  only. No Solid signals, no DOM, no storage access. These are the modules the
  Node unit tests target directly. `bowling_terms.ts` is the single home for
  every alley word the game says; no surface spells one inline.
- **Presentation boundary** (`src/app/game.tsx`, `src/app/setup.tsx`,
  `src/style.css`): renders what the other two boundaries produce. It computes
  no statistic of its own.

`src/game/match.ts` sits at the seam: it changes only its `match_complete`
payload, calling into the derivation boundary to build it.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Review boundary |
| --- | --- | --- |
| M1 / WS-P persistence | `src/save/contracts.ts`, `src/save/save_file.ts`, `src/save/settings.ts` | Schema and migration reviewed as one patch; a partial migration is worse than none |
| M2 / WS-S statistics | `src/game/match_stats.ts`, `src/game/bowling_terms.ts`, `src/game/score_display.ts`, `src/app/earned_moments.ts`, `src/game/match.ts`, `src/game/contracts.ts` | Pure modules reviewed against their inline-literal tests; the reducer payload change reviewed with them; vernacular reviewed against a cited bowling reference |
| M3 / WS-U presentation | `src/app/game.tsx`, `src/app/setup.tsx`, `src/app/app.tsx`, `src/style.css` | CSS lands first as one patch so the three view patches never collide in the stylesheet |
| M4 / WS-V evidence | `tests/playwright/e2e/`, `docs/`, `README.md` | Browser evidence and documentation reviewed after behavior is frozen |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Save schema V4 | Add `ModeRecord`, migrate V1/V2/V3 forward, extend the settings controller | Every existing save loads with its best score intact and room for the new fields |
| M2 | Statistic derivation and vernacular | Pure match-stats, bagger-ladder, and earned-moment modules; house scoresheet marks; reducer carries per-player summaries | Each statistic is computed from a score card, and every alley word comes from one module |
| M3 | Feedback surfaces | Toast, ordinary roll results, match summary panel, setup practice-record block, shared CSS | A player sees a prioritized earned moment, clear ordinary result text, and a named change when the match ends |
| M4 | Evidence and close-out | Playwright coverage, capture check, changelog, README, style-guide example | Accepted: shipped behavior matches the written record |

### Milestone: M1 save schema V4

- Depends on: none.
- Deliverables: WP-A0 at execution start, then WP-P1, WP-P2.
- Workstreams: WS-P.
- Done checks: a literal V1, V2, and V3 save each normalize to V4; a V3 save's
  stored best score survives as `ModeRecord.best_score`; out-of-range and
  non-integer values in a hand-written V4 blob are rejected rather than stored;
  `recent_scores` never exceeds five entries and stays newest-first.
- Entry criteria: WP-A0 has landed the active-plan tracker, so milestone status
  has a home before implementation starts.
- Exit criteria: `./check_codebase.sh` passes with the extended
  `tests/test_save_file.mjs`.
- Parallel-plan ready: no. The contract, the normalizer, and the controller are
  one reviewable schema change; splitting them ships a half-migrated save file.

### Milestone: M2 statistic derivation and vernacular

- Depends on: M1, because `earned_moments` reads a `ModeRecord` and the reducer
  payload feeds the controller method M1 defines.
- Deliverables: WP-S1, WP-S2, WP-S3, WP-S4.
- Workstreams: WS-S.
- Done checks: best single-frame score and longest strike run are correct on
  inline score cards at `B = 2`, `B = 3`, and `B = 5`, including a tenth frame
  in each; the bagger ladder names rungs two through six and falls back to the
  n-bagger form for seven through twelve, with perfect game handled by its own
  ten-pin-classic predicate rather than by a ladder rung; the
  earned-moment function returns exactly one moment or none for a given
  transition; a missed roll prints `-` in the score strip; `match_complete`
  carries one summary per player.
- Entry criteria: the `ModeRecord` type is published by M1.
- Exit criteria: `./check_codebase.sh` passes with `tests/test_match_stats.mjs`,
  `tests/test_bowling_terms.mjs`, `tests/test_earned_moments.mjs`, and the
  updated `tests/test_match.mjs` and `tests/test_score_display.mjs`.
- Parallel-plan ready: yes. WP-S1 and WP-S4 touch disjoint new files, WP-S2
  depends on WP-S4 for the ladder, and WP-S3 depends on WP-S1 only.

### Milestone: M3 feedback surfaces

- Depends on: M1 for the record shape, M2 for the values to render.
- Deliverables: WP-U0 and WP-U4 first, then WP-U1, WP-U2, WP-U3.
- Workstreams: WS-U.
- Done checks: the toast appears and auto-dismisses without blocking the next
  roll, and prioritizes HIGH GAME, BEST FRAME, then the named run; ordinary
  classic results name Strike or Spare without adding an earned popup; reduced
  motion suppresses toast movement while keeping the text; the match summary
  names the previous high game, delta, and best-frame context; the setup block
  shows all five statistics under scoreboard labels; the two literal strings
  existing Playwright specs assert --
  `Final score` inside `role="status"` and `Best for {mode_label}: {score}` --
  are still present verbatim.
- Entry criteria: WP-U0's stylesheet additions and WP-U4's prop contracts are
  both merged. WP-U4 introduces the `previous_record` and `mode_record` props
  that WP-U1, WP-U2, and WP-U3 consume, so it leads rather than follows.
- Exit criteria: `./check_codebase.sh` passes and
  `./run_playwright_tests.sh` shows no regression in the existing suite.
- Parallel-plan ready: partially, and only after WP-U0 and WP-U4. WP-U1 and
  WP-U2 both edit `src/app/game.tsx` and share its match state, so ONE owner
  takes both in sequence. WP-U3 runs concurrently in `src/app/setup.tsx`. The
  effective maximum is two concurrent doers, not three.

### Milestone: M4 evidence and close-out

- Depends on: M3, because browser evidence needs the shipped surfaces.
- Deliverables: WP-V1, WP-V2, WP-V3.
- Workstreams: WS-V.
- Done checks: the accepted record loop remains covered. Follow-up completion
  adds F1's best-frame and Spare result feedback, F2's compact supported setup,
  F3's operational guide, F4's canonical matrix baseline, and F5's committed
  earned-moment documentation capture.
- Entry criteria: M3 exit criteria met.
- Exit criteria: each F1-F5 validation passes; `./check_codebase.sh`,
  `./run_playwright_tests.sh`, and `pytest tests/` are rerun after the combined
  follow-up. Earlier 163/163 Node, 33/33 browser, and 665 pytest results remain
  historical evidence, not completion claims for this follow-up.
- Parallel-plan ready: yes. WP-V1 writes tests; WP-V2 and WP-V3 write prose in
  separate files.

## Workstream breakdown

### Workstream: WS-P persistence

- Goal: a V4 save that carries the practice record and loses no existing data.
- Owner: one coder.
- Work packages: WP-P1, WP-P2.
- Needs: nothing.
- Provides: `ModeRecord`, `SaveFileV4`, `normalize_save_file`,
  `record_completed_match` on the settings controller.
- Review boundary, when modifying the repository: one patch across
  `src/save/contracts.ts`, `src/save/save_file.ts`, `src/save/settings.ts`, and
  `tests/test_save_file.mjs`.

### Workstream: WS-S statistics

- Goal: every displayed number derives from a completed score card, and every
  alley word derives from one vocabulary module.
- Owner: one coder (WP-S1 and WP-S3), one coder (WP-S4 then WP-S2); both may run
  concurrently.
- Work packages: WP-S1, WP-S2, WP-S3, WP-S4.
- Needs: `ModeRecord` from WS-P.
- Provides: `match_statistics`, `current_strike_streak`,
  `fold_match_summaries`, `strike_run_term`, `scoreboard_labels`,
  `earned_moment`, `PlayerMatchSummary`, `MatchRecordValues`.
- Review boundary, when modifying the repository: new pure modules plus their
  test files; the reducer payload change reviewed alongside WP-S1.

### Workstream: WS-U presentation

- Goal: three restrained surfaces that read the record and never interrupt play.
- Owner: one coder for WP-U0 and WP-U4, then two concurrent coders -- coder A
  takes WP-U1 and WP-U2 together because both edit `src/app/game.tsx`, coder B
  takes WP-U3 in `src/app/setup.tsx`.
- Work packages: WP-U0, WP-U4, then WP-U1 with WP-U2, and WP-U3.
- Needs: `ModeRecord` from WS-P; `earned_moment` and `PlayerMatchSummary` from
  WS-S.
- Provides: the rendered toast, summary panel, and setup block, plus the
  `data-*` hooks WS-V asserts against.
- Review boundary, when modifying the repository: `src/style.css` belongs to
  WP-U0 alone; each view patch is reviewed against the style guide's "Visual and
  motion rules" section.

### Workstream: WS-V evidence

- Goal: browser proof and a written record that matches shipped behavior.
- Owner: one coder for WP-V1, one writer for WP-V2 and WP-V3.
- Work packages: WP-V1, WP-V2, WP-V3.
- Needs: shipped surfaces and their `data-*` hooks from WS-U.
- Provides: the regression spec and the close-out documentation.
- Review boundary, when modifying the repository: tests and documentation are
  separate patches.

## Work packages

### Work package: WP-A0 activate the plan in the repository

- Owner: plan manager, at execution start.
- Touch points: `docs/active_plans/active/practice_records_and_earned_moments.md`.
- Depends on: none. This runs before M1.
- Acceptance criteria:
  - This plan is copied to
    `docs/active_plans/active/practice_records_and_earned_moments.md`, snake_case
    per the active-plans convention.
  - Every documentation link is rewritten relative to the new location:
    `docs/<NAME>.md` becomes `../../<NAME>.md`, and
    `docs/active_plans/<name>.md` becomes `../<name>.md`.
  - A milestone status line is added at the top so the file works as the
    progress tracker for the rest of the work.
  - `pytest tests/test_markdown_links.py` passes, proving the rewrite is
    correct rather than assumed.
- Evidence or review: the passing link check plus the file existing at its
  documented path.
- Obvious follow-ons: keep the status line current as milestones close; the
  close-out section owns the archival move.

### Work package: WP-P1 define the V4 contract and migration

- Owner: WS-P coder.
- Touch points: `src/save/contracts.ts`, `src/save/save_file.ts`.
- Depends on: none.
- Acceptance criteria:
  - `ModeRecord` has five required fields: `best_score`, `recent_scores`
    (newest-first, at most five), `best_frame_score`, `best_strike_streak`,
    `matches_played`. A missing map key means "no record yet"; a present record
    has every field, so no reader needs a fallback default.
  - `SaveFileV4` replaces `best_scores` with
    `mode_records: Partial<Record<BestScoreKey, ModeRecord>>` and sets
    `version: 4`.
  - `normalize_save_file` migrates V3 by lifting each stored best into
    `{ best_score, recent_scores: [], best_frame_score: 0,
    best_strike_streak: 0, matches_played: 1 }`, preserving the number a player
    already earned. `recent_scores` stays EMPTY: V3 recorded a best, not a
    history, and seeding the best as a recent game would present a fabricated
    score as the player's last result. `matches_played: 1` is the honest floor,
    since a stored best proves at least one completed match. V2 routes through
    the existing per-pin-count mapping to the same shape; V1 still yields an
    empty record map, matching today's behavior.
  - Validation reuses the existing private `maximum_score` helper as the ceiling
    for `best_score`, each `recent_scores` entry, and `best_frame_score`. This
    is a STORAGE-SAFETY bound, not a claim of semantic possibility: a frame
    score can never exceed a whole-game maximum, so one bound rejects absurd
    values without a second bound function. Counters (`best_strike_streak`,
    `matches_played`) must be finite non-negative integers.
  - Normalization repairs what is safely repairable and drops only what is not.
    An oversized `recent_scores` is TRUNCATED to the newest five, because the
    list being long is not evidence that the player's high game is wrong, and
    discarding a hard-won record over a fixable list is the destructive outcome
    this plan exists to avoid. An individual history entry that is not a valid
    score is dropped from the list, leaving the rest.
  - Only an unrepairable field drops its record: a missing, non-finite,
    negative, or non-integer `best_score`, `best_frame_score`,
    `best_strike_streak`, or `matches_played`, or a value over its bound. There
    is no sensible repair for a corrupt scalar -- clamping it would invent a
    statistic -- so that ONE mode record is dropped and every other mode record
    survives. One corrupt mode never wipes a player's other modes.
  - `update_best_score` is replaced by `record_completed_match(save, pin_count,
    bowls_per_frame, record_values)`, taking the `MatchRecordValues` that WP-S3
    folds from all players. It raises `best_score`, `best_frame_score`,
    and `best_strike_streak` only on improvement, unshifts the match's top score
    and truncates `recent_scores` to five, and always increments
    `matches_played` by one. The five-entry cap is a persistence contract and is
    asserted directly; it is not a tuning value.
- Evidence or review: extend `tests/test_save_file.mjs` with inline literal V1,
  V2, V3, and malformed-V4 saves. Follow
  [docs/PYTEST_STYLE.md](../../PYTEST_STYLE.md) fixture
  policy: literals in the test file, no new `tests/fixtures/` directory.
- Obvious follow-ons: none; WP-P2 consumes this directly.

### Work package: WP-P2 extend the settings controller

- Owner: WS-P coder.
- Touch points: `src/save/settings.ts`.
- Depends on: WP-P1, for `record_completed_match`.
- Acceptance criteria:
  - `SaveSettingsController` exposes `record_completed_match(pin_count,
    bowls_per_frame, record_values)` in place of `record_completed_score`,
    returning the committed `SaveFileV4`.
  - A `get_mode_record(pin_count, bowls_per_frame): ModeRecord | undefined`
    accessor exists so callers never index `mode_records` by hand.
  - The controller's existing commit-and-return contract is unchanged.
- Evidence or review: covered by the WP-P1 test additions plus a controller
  round-trip through an inline `StorageLike` stub.
- Obvious follow-ons: none.

### Work package: WP-S1 derive match statistics from a score card

- Owner: WS-S coder A.
- Touch points: new `src/game/match_stats.ts`, new `tests/test_match_stats.mjs`.
- Depends on: none.
- Acceptance criteria:
  - `match_statistics(frames, pin_count, bowls_per_frame)` returns
    `{ total_score, best_frame_score, longest_strike_streak }` and is pure.
  - `best_frame_score` is the largest per-frame contribution, computed as the
    delta between consecutive cumulative `FrameScore.score` values. Frames whose
    bonuses are unresolved carry no `score` at all (`score_frame` in
    `src/game/scoring.ts:232-259` returns `undefined`), so they are skipped
    until their contribution is final rather than counted as zero.
  - **The strike run counts BOWLS, not frames.** A strike bowl is a bowl of
    `pin_count` taken while the rack was full. Walk the card roll by roll,
    accumulating pins within a frame and resetting the accumulator whenever the
    rack clears -- the same accumulate-and-reset shape already used by
    `super_tenth_roll_clears_rack` in `src/game/match.ts:162-175`. The run is
    the longest span of consecutive strike bowls across the whole card.
  - A per-frame model would be wrong here: the classic tenth frame can hold
    three strike bowls on three fresh racks, so a perfect ten-pin game is twelve
    strikes across ten frames. A frame-counting model caps at ten and could
    never reach the twelve rung WP-S4 names.
  - The accumulate-and-reset rule resolves the tenth frame's ambiguous shapes,
    which is the case worth checking before dispatch. At `pin_count = 10`:
    - `[10, 3, 7]`: bowl 0 starts on a full rack and clears it -- a strike, then
      reset. Bowl 1 starts full, knocks 3, accumulator 3. Bowl 2 brings the
      accumulator to 10, clearing the rack, but that bowl did NOT start on a
      full rack, so it is a spare and not a strike. One strike bowl.
    - `[3, 7, 10]`: bowls 0 and 1 make a spare and reset the accumulator. Bowl 2
      starts on a fresh full rack and clears it. One strike bowl.
    - `[10, 10, 10]` after nine strike frames: each tenth-frame bowl starts on a
      full rack and clears it, giving 3 + 9 = 12. This is the case the ladder's
      top rung and WP-S4's perfect-game predicate both depend on.
    The distinguishing input is whether the accumulator was zero when the bowl
    was taken, which the frame's own roll list always supplies. No extra state
    is needed.
  - The bowl-level rule must agree with `is_strike` from
    `src/game/scoring.ts:83-93` on every frame in frames one through nine at
    `B = 2`, where the two models coincide. The test module asserts that
    agreement. `is_strike` returns `false` for every `bowls_per_frame != 2`
    frame, which is why the generalized rule exists at all.
  - `current_strike_streak(frames, pin_count, bowls_per_frame)` returns the run
    ending at the most recent recorded bowl, for live in-play use.
  - Both functions accept an incomplete score card and never throw on one.
- Evidence or review: `tests/test_match_stats.mjs` with inline literal frame
  arrays covering `B = 2`, `B = 3`, and `B = 5`, each including a tenth frame.
  The decisive case is a complete classic perfect game, which must report a run
  of twelve. Also cover a tenth frame with a strike then a non-strike, so the
  run breaks mid-frame. Assert behavior, not field lists.
- Obvious follow-ons: WP-S3 consumes this.

### Work package: WP-S4 build the bowling vernacular module

- Owner: WS-S coder B.
- Touch points: new `src/game/bowling_terms.ts`, new
  `tests/test_bowling_terms.mjs`, `src/game/score_display.ts`,
  `tests/test_score_display.mjs`.
- Depends on: none.
- Acceptance criteria:
  - `strike_run_term(consecutive_strikes): string | undefined` is a pure count
    lookup implementing the house bagger ladder. It returns `undefined` below
    two, because one strike is just a strike. It takes the count and nothing
    else:

    | Strikes | Term |
    | --- | --- |
    | 2 | Double |
    | 3 | Turkey |
    | 4 | Four-bagger |
    | 5 | Five-bagger |
    | 6 | Six-pack |
    | 7 to 12 | N-bagger, built from the count |

  - The ladder has NO perfect-game rung. A previous draft put "Perfect game" at
    twelve and then tried to gate it by rules, which contradicted itself: a
    maximum 990-pin card also reaches its legal maximum, so "reaches the legal
    maximum" cannot be the discriminator. Twelve is simply `Twelve-bagger` in
    the count lookup.
  - Perfect game is a SEPARATE predicate with a positive condition:
    `is_perfect_game(frames, pin_count, bowls_per_frame)` returns true only for
    standard ten-pin classic rules -- `pin_count === 10` and
    `bowls_per_frame === 2` -- with a complete card of twelve consecutive
    strikes scoring 300. Any other rack or rule combination is not a perfect
    game regardless of how clean the card is, because the term names one
    specific achievement in one specific ruleset.
  - Keeping these separate is why `strike_run_term` needs only a count. The
    caller that wants the perfect-game term calls the predicate and prefers its
    result over the ladder's.
  - `scoreboard_labels` centralizes the record vocabulary: HIGH GAME, LAST 5
    GAMES, BEST FRAME, BEST RUN, GAMES BOWLED. Every surface reads these; none
    spells a label inline.
  - Terms are ASCII only, per
    [docs/TYPESCRIPT_STYLE.md](../../TYPESCRIPT_STYLE.md).
  - `format_frame_roll_marks` returns `-` for a roll of zero, matching a house
    scoresheet. `X` and `/` are unchanged, so the existing score-strip
    assertions and the `data-roll-mark` values keep working; the miss case gains
    its own mark value.
- Evidence or review: `tests/test_bowling_terms.mjs` asserts each named rung and
  the n-bagger fallback, plus `is_perfect_game` returning true for a 300 card
  and false for a maximum 105-pin card and for a maximum `B = 3` ten-pin card.
  `tests/test_score_display.mjs` gains a miss-mark case. Cite the vernacular
  source in a module comment so a later reader can check it.
- Obvious follow-ons: WP-S2 and every WS-U surface consume this.

### Work package: WP-S2 decide earned moments

- Owner: WS-S coder B.
- Touch points: new `src/app/earned_moments.ts`, new
  `tests/test_earned_moments.mjs`.
- Depends on: WP-P1 for the `ModeRecord` type, WP-S4 for the bagger ladder.
- Acceptance criteria:
  - `earned_moment(input): EarnedMoment | undefined` is pure and returns at most
    one moment per call.
  - Three moment kinds ship: `high_game` (the finalized score has passed
    `previous_record.best_score`), `best_frame` (a finalized frame contribution
    has passed the carried-in frame record), and `strike_run` (the current run
    just reached three or grew beyond three).
  - **`high_game`, then `best_frame`, then `strike_run`** is the one-toast
    priority. Practice records reflect earned improvement and take priority over
    streak theater; a continuing run can still name its next rung.
  - A `strike_run` moment carries the term from `strike_run_term`, not a raw
    count. The threshold is three because that is the turkey -- the first run an
    alley bothers to name aloud. A double is tracked in the record but does not
    interrupt play with a toast.
  - `high_game` compares against the last FINALIZED cumulative score on the
    card. Cumulative scores are `undefined` while a strike or spare bonus is
    unresolved, so the comparison uses the highest resolved total, never a
    provisional one. The toast can therefore land a roll or two after the record
    became inevitable; that is correct, because until the bonus resolves the
    player has not actually earned the number.
  - `high_game` fires at most once per match. The caller passes
    `high_game_already_fired: boolean` as part of the input, so the once-only
    rule lives in the caller's state and the function stays pure. With no
    previous record it does not fire at all -- a first-ever game has nothing to
    beat.
  - `best_frame` fires at most once per player. With no previous record, the
    first positive finalized frame starts that player's visible practice record;
    with a record, the contribution must beat `previous_record.best_frame_score`.
  - The module holds no timers, no DOM access, and no Solid primitives.
- Evidence or review: `tests/test_earned_moments.mjs` uses inline inputs for a
  below-record score, unresolved score, high-game suppression, first and
  improved frame records, named run rungs, and the record-first priority.
- Obvious follow-ons: WP-U1 renders the result and owns the fired flag.

### Work package: WP-S3 carry per-player summaries in match completion

- Owner: WS-S coder A.
- Touch points: `src/game/contracts.ts`, `src/game/match.ts`,
  `tests/test_match.mjs`.
- Depends on: WP-S1, for `match_statistics`.
- Acceptance criteria:
  - `PlayerMatchSummary` is `{ player_id, total_score, best_frame_score,
    longest_strike_streak }`.
  - The `match_complete` effect carries
    `summaries: readonly PlayerMatchSummary[]` in place of
    `best_scores: Readonly<Record<number, number>>`.
  - `complete_match` builds each summary through `match_statistics`, not by
    recomputing totals inline.
  - `match_stats.ts` also exports `fold_match_summaries(summaries):
    MatchRecordValues`, returning `{ top_score, best_frame_score,
    longest_strike_streak }` where the two bests are the maximum ACROSS players
    and `top_score` is the highest total. This is the value
    `record_completed_match` consumes, and it is what makes the multiplayer
    semantics above true in one testable place instead of in the app shell.
  - `tests/test_match.mjs` is updated to the new payload; no test asserts the
    summary array's length as a proxy for correctness.
- Evidence or review: updated `tests/test_match.mjs`, asserting summary content
  for a known score card rather than the payload's shape.
  `tests/test_match_stats.mjs` covers the fold with a two-player case where the
  top scorer does NOT own the best frame, proving the record keeps both.
- Obvious follow-ons: WP-U4 routes the folded values into the controller.

### Work package: WP-U0 add the shared stylesheet regions

- Owner: WS-U coder.
- Touch points: `src/style.css`.
- Depends on: none.
- Acceptance criteria:
  - New classes exist for the toast, the match summary panel, and the setup
    practice-record block, styled from the existing palette and following the
    guide's "Restraint creates emphasis" rule: no new saturated accent, no
    looping animation.
  - Toast motion is wrapped so a reduced-motion state renders the toast
    statically with identical text, per the guide's requirement that reduced
    motion retain the information the animation carried.
  - Existing `.best_score`, `.final_result`, and `.handoff_panel` regions are
    left in place; the summary panel extends `.final_result` rather than
    replacing it.
  - WP-U0 establishes the named regions and KEEPS ownership of them; it does not
    have to finalize every rule before markup exists. Its owner refines the
    regions while WP-U1 through WP-U3 render real content. The constraint being
    enforced is single-owner stylesheet editing, not frozen-styles-first, so
    normal component-driven visual iteration still works.
- Evidence or review: `npx prettier` and ESLint clean via
  `./check_codebase.sh`; visual confirmation deferred to WP-V1.
- Obvious follow-ons: unblocks WP-U1 through WP-U3.

### Work package: WP-U1 render the in-play toast

- Owner: WS-U coder.
- Touch points: `src/app/game.tsx`.
- Depends on: WP-S2, WP-S4, WP-U0, WP-U4 for the `previous_record` prop.
- Acceptance criteria:
  - On each `settled` transition the component calls `earned_moment` and, when a
    moment returns, shows a toast with `role="status"` that auto-dismisses after
    roughly 1.8 seconds.
  - The toast leads with the alley term in the overhead-monitor register --
    `TURKEY`, `FOUR-BAGGER`, `HIGH GAME`, `BEST FRAME` -- with at most one short
    supporting line beneath it. Run terms come from `strike_run_term` and record
    labels come from `scoreboard_labels`.
  - The toast never blocks input, never delays `schedule_result_advance`, and
    never takes focus. Aiming controls stay reachable while it is visible.
  - `data-earned-moment` on the `main.play_shell` element carries the current
    moment kind or an empty string, giving WP-V1 a stable hook.
  - The component owns the `high_game_already_fired` flag WP-S2 reads, resets it
    when a match starts, and passes it on every call.
  - The component also remembers which players received their one best-frame
    callout and clears that set when the match starts.
  - `earned_moment` is called AFTER the settled action has updated the score
    card, not before, so the resolved cumulative totals it compares against
    include the roll that just landed. Verify this against the existing
    `settled` handling in `src/app/game.tsx:239-258`, which already dispatches
    and then reads the returned `next` state; the moment check belongs on that
    same returned state. A focused case in `tests/test_earned_moments.mjs`
    covering the roll that resolves a pending bonus proves the toast fires on
    the crossing transition rather than one early or one late.
  - A new moment arriving while a toast is visible REPLACES it and restarts the
    dismiss timer. No queue: in a fast game a queued toast would describe a roll
    the player has already moved past.
  - Reduced motion changes the transition only. The toast keeps the same text
    and the same visible duration, so the information does not depend on the
    animation.
  - The dismiss timer is cleared in `onCleanup`, matching the existing
    `result_timer` and `preview_timer` handling.
  - The component receives the pre-match record through a new
    `previous_record()` prop rather than reading storage itself.
- Evidence or review: covered by WP-V1's browser spec.
- Obvious follow-ons: none.

### Work package: WP-U2 render the match summary panel

- Owner: WS-U coder A, the same owner as WP-U1. Both edit `src/app/game.tsx`
  and read the same match state; splitting them across two coders would
  conflict in one file.
- Touch points: `src/app/game.tsx`.
- Depends on: WP-U1 (same file, same owner, sequenced), WP-S3, WP-S4, WP-U0,
  WP-U4.
- Acceptance criteria:
  - The `final` phase renders the final score, the previous high game, the
    signed delta against it, the match's best frame with record context, and the
    longest strike run named through `strike_run_term` rather than as a bare
    count.
  - The literal text `Final score` remains inside a `role="status"` element.
    `tests/playwright/e2e/presentation_persistence.spec.ts:83` asserts it, and
    that assertion must keep passing unchanged.
  - With no previous record, the panel states this is a first result instead of
    printing a delta against zero.
  - The panel is a status region, not a modal: it does not trap focus and does
    not block the existing `New match` button.
- Evidence or review: covered by WP-V1's browser spec plus the unchanged
  existing spec.
- Obvious follow-ons: none.

### Work package: WP-U3 render the setup practice record

- Owner: WS-U coder.
- Touch points: `src/app/setup.tsx`.
- Depends on: WP-P2, WP-S4, WP-U0, WP-U4 for the `mode_record` accessor.
- Acceptance criteria:
  - The block shows all five statistics for the currently selected mode and
    bowls-per-frame combination, and updates when either selection changes.
  - Labels come from `scoreboard_labels`, so the block reads like an alley
    scoreboard (HIGH GAME, LAST 5 GAMES, BEST FRAME, BEST RUN, GAMES BOWLED)
    rather than like an application settings pane.
  - GAMES BOWLED renders `1+` rather than `1` for a record carried over from an
    older save, because that value is a proven floor and not a real count. The
    state is derivable with no extra schema: a record whose `recent_scores` is
    empty while `matches_played` is at least one can only have come from the V2
    or V3 migration, since every V4 match write unshifts a history entry. The
    marker disappears on the player's next completed game.
  - The existing line `Best for {mode_label}: {score}` is preserved verbatim,
    including its `-` placeholder when no record exists;
    `tests/playwright/e2e/presentation_persistence.spec.ts:85` asserts it.
  - Score history renders newest-first as plain readable text, not a chart.
  - With no record for the selected combination, the block reads as an
    invitation to a first game rather than a wall of zeros -- the guide names
    zero-state stat walls as a defect.
  - The block carries `data-practice-record` hooks for WP-V1.
- Evidence or review: covered by WP-V1's browser spec.
- Obvious follow-ons: none.

### Work package: WP-U4 route summaries through the app shell

- Owner: WS-U coder.
- Touch points: `src/app/app.tsx`.
- Depends on: WP-P2, WP-S3.
- Acceptance criteria:
  - `on_start` snapshots the `ModeRecord` for the chosen mode BEFORE the match
    begins and passes it to `Game` as `previous_record`, so the summary compares
    against what the player carried in rather than against the record their own
    match just rewrote.
  - `record_completed_scores` becomes `record_completed_match`, passing the
    `fold_match_summaries` result straight through. The app shell selects no
    player and needs no tiebreak; folding is WP-S3's job.
  - `matches_played` increments once per completed match, not once per player.
  - `Setup` receives a `mode_record` accessor in place of the current
    `best_score` accessor.
- Evidence or review: covered by WP-V1's browser spec.
- Obvious follow-ons: none.

### Work package: WP-V1 prove the loop in a browser

- Status: accepted. The full suite passed 33/33 and the focused post-assertion
  practice-record spec passed 2/2. Its one-time 1600 x 1000 visual review was
  accepted; disposable review captures were not retained in the repository.

- Owner: WS-V coder.
- Touch points: new
  `tests/playwright/e2e/practice_record.spec.ts`.
- Depends on: WP-U1, WP-U2, WP-U3, WP-U4.
- Acceptance criteria:
  - The spec follows
    [docs/PLAYWRIGHT_TEST_STYLE.md](../../PLAYWRIGHT_TEST_STYLE.md):
    a header comment naming its selector contract with `file:line` citations,
    `getByRole` and `getByLabel` first with `data-*` only for app state, and
    web-first `expect` waits with no fixed timeouts.
  - Seed a deliberately tiny previous high game and run `perfect_game`. Assert
    the first-frame HIGH GAME toast renders, then assert the end-of-match panel
    names the previous high game and delta. This proves the persistent browser
    seam without requiring a fake clock, fixed delay, or dismissal assertion.
  - Permanent coverage divides by cost: `tests/test_earned_moments.mjs` proves
    the priority and named-run decisions; the browser spec proves the shared
    toast seam and final best-frame context. Exact transient BEST FRAME DOM
    visibility is observed once in ordinary live play, not asserted through a
    new fast fixture, fake clock, fixed delay, screenshot, or timing gate.
  - It asserts the summary panel names the seeded previous high game, the delta,
    and the run term.
  - It returns to setup and asserts the practice-record block shows the updated
    values, then runs a second match and asserts the score history holds two
    entries. History records completed games, not distinct scores, so the same
    deterministic fixture may produce two identical entries and both must be
    kept.
  - A reduced-motion case confirms the toast text still renders.
  - The whole existing suite still passes; the two preserved literal strings and
    the changed miss mark are the specific regression risks.
  - The spec pins `viewport: { width: 1600, height: 1000 }`, matching every
    other spec in the suite. That is not a convenience choice: all thirteen
    existing Playwright specs pin the same size, and the accepted layout is
    specified against it (116 px top chrome, 352 px side panel, 1248 x 884 lane
    canvas). The game has one supported gameplay viewport, so capturing a
    narrower one would review a layout the project does not ship. Add viewports
    here only if the supported-size contract itself changes.
- Evidence or review: `./run_playwright_tests.sh` passes. Representative
  toast-and-summary captures may be taken during implementation under `/tmp`
  for disposable visual review; they are never committed, golden, pixel-tested,
  or required permanent-suite output.
- Obvious follow-ons: `./devel/capture_screenshots.sh --milestone` remains an
  existing one-time capture follow-on, not a product-correctness gate for these
  surfaces.

### Work package: WP-V2 write the changelog entry

- Status: accepted. Documentation review and `pytest tests/` (665 passed)
  accepted the entry.

- Owner: WS-V writer.
- Touch points: `docs/CHANGELOG.md`.
- Depends on: WP-V1, so the entry describes verified behavior.
- Acceptance criteria:
  - The entry lands under the current dated day block using the canonical
    subsection order from
    [docs/REPO_STYLE.md](../../REPO_STYLE.md).
  - It records the V4 schema bump and its migration behavior under
    "Behavior or Interface Changes", the new surfaces under "Additions and New
    Features", and the derive-do-not-track decision and the generalized
    strike definition under "Decisions and Failures".
  - It states plainly which gates were run and which were not, following the
    precedent set by the current top entry.
- Evidence or review: `pytest tests/` passes, including the markdown link check.
- Obvious follow-ons: rotate the changelog if it crosses roughly 1000 lines
  (`wc -l docs/CHANGELOG.md`), using `devel/rotate_changelog.py`.

### Work package: WP-V3 refresh the player-facing documentation

- Status: accepted. Documentation review and `pytest tests/` (665 passed)
  accepted the README and style-guide updates.

- Owner: WS-V writer.
- Touch points: `README.md`,
  `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md`.
- Depends on: WP-V1.
- Acceptance criteria:
  - The README describes practice records and earned-moment feedback in its
    feature text. The first paragraph stays pure prose under 250 characters per
    the GitHub About rule, and `tests/test_readme_first_paragraph.py` still
    passes.
  - The style guide's "Super Bowling worked example" section gains a short
    paragraph on how the practice record, earned feedback surfaces, and ordinary
    result text satisfy its own "Progress and reward signals" rules, so the
    guide's example stays truthful about the shipped game.
  - Every new local markdown link uses file-path link text and resolves from its
    containing file.
- Evidence or review: `pytest tests/` passes, covering markdown links, ASCII
  compliance, and the README first-paragraph check.
- Obvious follow-ons: none.

## Follow-up completion work packages

### F1 feedback visibility

- Owner: feedback coder. Status: complete.
- Touch points: `src/app/earned_moments.ts`, `src/app/game.tsx`,
  `src/game/match.ts`, `src/game/match_stats.ts`, and focused Node tests.
- Success condition: the first positive finalized frame or an improved frame
  record yields one BEST FRAME toast per player; a classic spare reports visible
  `Spare!`; and the final summary carries best-frame record context.
- Validation: TypeScript typecheck and focused Node tests passed; the permanent
  browser spec passed for the real two-roll visible HIGH GAME seam. F5 supplies
  one-time production-path visual proof for the exact BEST FRAME toast, without
  a transient timing assertion or a pixel-equivalence test.

### F2 compact supported setup

- Owner: UI stylesheet coder. Status: complete.
- Touch points: `src/style.css`.
- Success condition: Start Match stays visible and clickable for one and four
  players at 1600 x 1000 without hidden content; shorter screens can scroll.
- Validation: focused setup Playwright coverage and the full browser suite
  passed.

### F3 operational YA guide

- Owner: docs writer. Status: complete.
- Touch points: `docs/YOUNG_ADULT_VIBES_DESIGN_STYLE.md`.
- Success condition: the guide states the shipped trigger, surface, and learning
  contract for earned moments and ordinary results without aspirational claims.
- Validation: focused Markdown and ASCII checks plus `pytest tests/` (667
  passed).

### F4 gate-path integrity

- Owner: test-maintenance coder. Status: complete.
- Touch points: `tests/test_strike_matrix.mjs`.
- Success condition: the strike matrix reads the canonical archived baseline.
- Validation: focused Node test and `./check_codebase.sh` (181 Node tests)
  passed.

### F5 earned-moment documentation capture

- Owner: screenshot-docs web capture. Status: complete.
- Touch points: `README.md`, `devel/capture_screenshots.mjs`, and the existing
  tracked `docs/screenshots/thousand_pin_deck.png`.
- Success condition: the managed README screenshot block retains exactly two
  tracked embeds. Its refreshed 1,000-mode capture follows two real 990-pin
  worker rolls, visibly reads `BEST FRAME` / `New best frame: 526`, and keeps
  the lane and controls unobscured.
- Validation: `./devel/capture_screenshots.sh --documentation`; inspect PNG
  metadata (1600 x 1000, 232905 bytes), review it visually for legibility and
  lane-control clearance, and verify Markdown links (35 passed). This is
  one-time visual evidence, not a pixel-equivalence test.

## Acceptance criteria and gates

- Per-patch gate: `./check_codebase.sh` passes. It runs typecheck, ESLint at
  `--max-warnings 0`, the Prettier format check, and the Node unit tests. A
  format failure is fixed with `npx prettier --write '**/*.{ts,tsx,mts,cts,js,mjs,cjs}'`.
- Integration gate: `./run_playwright_tests.sh` passes with the new spec and
  every existing spec, and `pytest tests/` passes for the documentation edits.
- Independent review gate: a fresh reviewer subagent that implemented none of
  WS-U reads disposable implementation-review evidence, when captured, and
  answers the style guide's "Review design questions" list -- specifically
  whether the toast explains a state change or merely asks for attention,
  whether it obscures the lane or the aiming controls, and whether a player can
  reach another attempt quickly. Captures live outside the repository and are
  neither required test output nor a golden/pixel-equivalence gate. Human
  approval remains the final word but is not a milestone dependency.
- Failure semantics: a red per-patch gate blocks that patch only. A red
  integration gate blocks M4 close-out. A review rejection of a surface returns
  that surface's work package to WS-U and does not reopen WS-P or WS-S.
- Completion record: M1-M4 and F1-F5 are complete. `./check_codebase.sh`
  passed with 181 Node tests, `./run_playwright_tests.sh` passed 33/33 and
  exercised `run_web_server.sh`, focused practice-record browser coverage
  passed 2/2, and `pytest tests/` passed 667. The capture front door, capture
  harness ESLint, capture provenance, Markdown links (35 passed), and
  `git diff --check` also passed. Independent rereview accepted F1, F2, and F4;
  visual review accepted F5. Turkey and BEST FRAME transient observations remain
  one-time implementation checks because deterministic sequences can advance
  before a browser paints them.

## Test and verification strategy

Tests land in the tier that matches their cost, per
[docs/E2E_TESTS.md](../../E2E_TESTS.md) and
[docs/PYTEST_STYLE.md](../../PYTEST_STYLE.md).

- **Node unit tests** (`tests/test_*.mjs`, run by `./check_codebase.sh`) carry
  the correctness load. `test_match_stats.mjs`, `test_bowling_terms.mjs`, and
  `test_earned_moments.mjs` are new; `test_save_file.mjs`, `test_match.mjs`, and
  `test_score_display.mjs` are extended. Every input is an inline literal in the
  test file. Assertions target behavior -- a computed run, a migrated score, a
  chosen moment -- never a collection length used as a proxy for correctness, a
  required-key set, or a presentation constant.
- **The five-entry history cap IS tested.** It is a persistence contract: a
  reader relies on the bound, so it is asserted directly in
  `test_save_file.mjs`. The general rule against asserting tunable constants
  still holds for presentation values, which is a different thing from a schema
  invariant. This plan previously listed the cap on both sides; the contract
  reading wins.
- **Malformed-save coverage stays representative, not combinatorial.** Four
  cases establish the record-level normalization policy: an invalid mode record,
  an invalid history entry, an oversized history, and an invalid counter. The
  goal is to prove the recovery boundary, not to enumerate malformed JSON.
- **Playwright** (`tests/playwright/e2e/`, run by `./run_playwright_tests.sh`)
  carries durable browser integration: the shared toast seam, final summary
  including best-frame context, setup record, duplicate two-match history, and
  reduced-motion text. Pure Node logic covers the exact BEST FRAME decision;
  one ordinary live observation verifies its transient DOM surface. No new
  fixture, fake clock, fixed delay, screenshot, pixel, or dismissal assertion.
- **pytest** (`pytest tests/`) stays the thin cross-ecosystem hygiene lane:
  markdown links, ASCII compliance, README first paragraph. No new pytest is
  added by this plan; the TypeScript behavior belongs in the Node and browser
  tiers.
- **Not tested**: the exact toast duration and CSS values. These are
  presentation constants, and asserting them produces the brittle tests the
  style guide tells us to delete rather than write.

## Migration and compatibility policy

- The save key `super_bowling.save` is unchanged. Only the payload version moves.
- V3 to V4 is lossless for the one field V3 carried: a stored best score becomes
  `ModeRecord.best_score`.
- Everything else in a migrated record is honest about what V3 did not know.
  `recent_scores` starts EMPTY, because a best score is not a history and
  presenting it as the player's last game would be a fabricated result.
  `best_frame_score` and `best_strike_streak` start at zero for the same reason.
  `matches_played` starts at one, the provable floor: a stored best score means
  at least one match finished. A returning player therefore sees their high game
  preserved and their history start fresh, which is accurate rather than
  flattering.
- Because that count is a floor and not a real total, the setup block renders it
  as `1+` until the player finishes their next game. An empty `recent_scores`
  alongside a non-zero `matches_played` is the derivable signature of a migrated
  record, so no schema field is spent on tracking it.
- V2 keeps its existing per-pin-count mapping into the `${pin}:2` key shape
  before entering the V4 shape. V1 keeps yielding empty records: its scores
  predate the bowls-per-frame partition and are not comparable, which is the
  behavior already shipped.
- An unrecognized version, a non-object payload, or unparseable JSON yields a
  default V4 save, matching the existing `load_save` contract.
- No downgrade path is provided. A V4 save loaded by an older build falls
  through to that build's default, which is acceptable for a browser game with
  no version pinning.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Migration drops a player's stored best | High: destroys the trust the style guide's "Engineering rules for tone" section names explicitly | A V3 blob normalizes to an empty `mode_records` | WS-P coder | WP-P1 asserts the V3 lift with an inline literal before any other V4 work merges |
| Toast interrupts the play loop | High: directly violates "Respect player time" and "Feedback earns its space" | The toast blocks input, steals focus, or delays the result advance | WS-U coder | WP-U1 forbids focus capture and timer coupling; the independent review gate judges it in a real browser |
| Existing Playwright specs break on changed literals | Medium: a false regression signal that costs a debugging cycle | `Final score` or `Best for {mode}: {score}` is reworded during a redesign | WS-U coder | Both strings are named as acceptance criteria in WP-U2 and WP-U3 with their asserting line numbers |
| Strike streak disagrees with classic scoring | Medium: the displayed streak contradicts the score card the player is reading | The generalized first-bowl-clear rule diverges from `is_strike` at `B = 2` | WS-S coder A | WP-S1 asserts agreement with `is_strike` across every `B = 2` case; classic wins on conflict |
| Multi-player record semantics drift | Medium: "best frame" silently means "the winner's best frame" | An implementer folds by picking one player instead of taking a per-statistic maximum | WS-S coder A | `fold_match_summaries` is the single fold point, and its test uses a two-player case where the top scorer does not own the best frame |
| Vernacular is wrong or regional | Medium: a bowler reading a mislabeled rung loses trust in the whole surface | A rung is guessed rather than sourced, or "perfect game" prints on a 990-pin rack | WS-S coder B | WP-S4 cites its source in a module comment, and the rung table in this plan is the reviewed contract; perfect game is a separate ten-pin-classic predicate, never a ladder rung |
| Changing the miss mark breaks a mark assertion | Low: a false regression in the score strip | An existing spec asserts a literal `0` roll mark | WS-S coder B | WP-S4 updates `tests/test_score_display.mjs` in the same patch, and `./run_playwright_tests.sh` in the M3 gate catches any browser-side assertion |
| Scope creeps toward a stats dashboard | Medium: produces exactly the surface the Non-goals forbid | A reviewer asks for totals, rates, or a career screen | Plan manager | The Non-goals list is the standing answer; a new statistic needs a new plan |
| Plan and implementation drift | Low | Work packages land without their acceptance criteria checked | Plan manager | Each milestone's exit criteria name a runnable command, not a judgement |

## Documentation close-out requirements

- Active plan / progress tracker: WP-A0 owns creating it at execution start and
  keeping its status line current. At close-out, move the file to
  `docs/archive/` with `git mv` so history is preserved.
- `docs/CHANGELOG.md` entry: WP-V2, under the current dated day block, using the
  canonical subsection order.
- README and style guide: WP-V3.
- Archive / closure notes: record in the changelog whether the review gate
  accepted the toast on the first pass, record the resolved
  strike-run definition so a later reader knows why the generalized rule
  exists, and record the bagger-ladder source so the vernacular can be audited
  later rather than re-argued.

## Open questions and decisions needed

Nothing here blocks execution. Every item below can be answered after the plan
ships.

- Manager/subagent decision procedure:
  - Decision owner or dedicated class: the reviewer subagent from the review
    gate, reading WP-V1's screenshots.
  - Evidence and decision rule: whether the toast placement obscures the lane or
    the aiming controls at 1600 x 1000. If it does, WP-U1 moves it and the
    screenshots are recaptured. This is the only visual question the plan leaves
    to evidence; everything else is settled above.
- Closed, not open: the practice record stays on the setup screen only for this
  release. The toast and the summary already carry in-game feedback, and a
  persistent stat line beside the lane would spend the restraint this plan is
  built around. Adding one later is a product decision, not a leftover.
- Closed, not open: five is the shipped history length, and it is a tested
  persistence contract rather than an untested tuning value. Changing it is a
  later product decision.
- Non-blocking follow-up: whether a third moment kind is worth adding later --
  for example clearing a full 990-pin rack, which is a genuinely hard shot the
  guide's "mastery of a difficult shot" line would endorse. Out of scope here to
  keep the first release of this feature restrained.
- Non-blocking follow-up: split detection and the circled split mark. This is
  the most recognizable alley-scoresheet element this plan does not ship,
  because the scoring path carries pin counts and not pin identity. The worker
  snapshot already holds pin positions, so a later plan can widen `SettledRoll`
  to carry standing-pin identity and then add both detection and the mark. Two
  further alley staples ride on the same data: the standing-pin indicator
  graphic that alley monitors show between rolls, and the split-conversion
  statistic. Group them into one contract change rather than three.
- Non-blocking follow-up: whether to add a "clean game" marker, meaning no open
  frames. It needs no new data and is one derived boolean, but it is another
  statistic on a surface this plan is deliberately keeping small.
