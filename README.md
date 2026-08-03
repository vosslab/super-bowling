# Super Bowling

An original browser bowling game for friends sharing one keyboard, where technique-driven shots
curve through regulation-inspired lanes toward triangular racks from 10 to 990 pins.

[Play Super Bowling live](https://vosslab.github.io/super-bowling/)

<!-- screenshots:begin (managed by screenshot-docs) -->

![1,000-mode aiming view with the full 990-pin rack filling the lane and technique controls in the side panel](docs/screenshots/thousand_pin_deck.png)
![Four-player pass-the-keyboard handoff over a fresh ten-pin lane with technique controls in the side panel](docs/screenshots/pass_the_keyboard.png)
<!-- screenshots:end -->

## One keyboard, giant rack

This is bowling for the moment when ten pins feel a little too sensible. Pick an exact
rack scale, pass the keyboard between up to four people, and send a custom rolling
ball toward a deck with hundreds of individually countable pins. Its circular
silhouette stays familiar while the selected surface pattern visibly rolls.

- Choose the convenient 10, 20, 50, 100, 500, or 1,000 scale label; setup and the HUD show the
  actual complete-triangle total used for play and scoring.
- Every rack forms one centered triangular deck with a head pin and complete rows 1, 2, 3, and onward.
- The super lane and deck widen with the selected rack so its ball and pins remain recognizable
  at every count.
- Play a familiar ten-frame bowling match whose strike, spare, and bonus values scale
  with the selected rack.
- Share one browser and keyboard with one to four local hot-seat players.
- Give each player a recognizable ball with two colors, a pattern, and an optional
  two-character monogram.
- Keep the presentation original: a faux-3D lane, Canvas rendering, and synthesized
  sound built for a 16:10 landscape browser.
- Keep the next local session ready with recent-player restore, per-rack best scores, mute,
  and reduced-motion preferences.
- Build a practice record for each rack and bowls-per-frame choice: high game, last five scores,
  best frame, best named strike run, and games bowled stay with the mode that earned them.

| Scale label | Actual pins |
| ----------: | ----------: |
|          10 |          10 |
|          20 |          21 |
|          50 |          45 |
|         100 |         105 |
|         500 |         496 |
|       1,000 |         990 |

## Current playable lane

The shipped game starts a complete-triangle match with one to four named players. Setup keeps
each player's colors, pattern, and optional monogram in the same production ball renderer used on
the lane. The four pre-roll controls set power, start position, angle, and spin; the worker-backed
preview shows the same free path the roll will follow before its first pin contact. A focused
pass-the-keyboard card advances each hot-seat turn while the score strip and phase feedback stay
visible.

When a player earns it, the game calls out a new high game or a named strike run such as a
Double or Turkey without stopping the next turn. At match end, each player sees the final score,
the prior high game for that practice mode, the difference, and their best run before returning to
setup, where the updated record is ready for the next match.

## Quick start

Use Node.js with npm. The repository setup script installs the pinned browser-game
toolchain, and the web server builds then serves the same `dist/` artifact intended for
GitHub Pages.

```bash
./devel/setup_typescript.sh
./run_web_server.sh
```

Open the local URL printed by the server, choose a rack, add one to four players, and customize
their balls before starting the match.
Use Up/Down for power, Left/Right for start position, A/D for angle, Q/E for spin, and Space to
bowl. Technique is selected before release; the rolling ball has no steering control. The setup
and in-game controls keep Mute and Reduced motion choices visible.
Stop the server with `Ctrl-C`.
The preview session expires after 600 seconds; set `WEB_SERVER_MAX_LIFETIME_SECONDS` to a
positive whole-second value when a shorter or longer local session is useful.

## Controls and play

Every rack uses the same deliberately simple keyboard control scheme:

| Key          | Action                            |
| ------------ | --------------------------------- |
| Up / Down    | Set pre-roll power.               |
| Left / Right | Set pre-roll start position.      |
| A / D        | Set pre-roll angle.               |
| Q / E        | Set pre-roll spin.                |
| Space        | Bowl with the selected technique. |

The completed match follows classic strikes, spares, and tenth-frame bonus rolls.
The shared [docs/GAME_RULES.md](docs/GAME_RULES.md) contract generalizes the same rules to
every supported rack: a perfect game scores `30 * pin_count`.
Here `pin_count` is the displayed actual total, rather than the convenient scale label.
V4 local saves keep compatible V2 and V3 high scores with their matching practice mode. Older V1
saves keep player details and preferences but start fresh records because the rebuilt lane and
controls made those old scores incomparable.

## Verify and build

Run the repository front doors to check the TypeScript code, create the static Pages
artifact, and exercise the browser shell headlessly.

```bash
./check_codebase.sh
./build_github_pages.sh
./run_playwright_tests.sh --build
npm run benchmark
```

`./build_github_pages.sh` writes the deployable site to `dist/`. The Playwright suite uses
a 1600 x 1000 headless viewport, matching the game's 16:10 desktop target.
`npm run benchmark` generates a local 30-shot rack report at
`artifacts/benchmark/simulation_benchmark.json`; `artifacts/` stays ignored.

## GitHub Pages setup

The repository includes [deploy-pages.yml](deploy-pages.yml), a user-copyable root GitHub Actions
workflow. Copy it to `.github/workflows/deploy-pages.yml` in GitHub to refresh the Pages deploy.
The workflow checks the codebase, builds `dist/`, and deploys the uploaded Pages artifact.

## Documentation

- [docs/SOLID_MODEL.md](docs/SOLID_MODEL.md)
  - Solid reactivity boundaries for the UI, Canvas renderer, and simulation worker.
- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md)
  - Run and extend the headless browser checks.
- [docs/E2E_TESTS.md](docs/E2E_TESTS.md)
  - Choose the appropriate test home for browser and non-browser workflows.
- [docs/COLOR_CONTRAST_ACCESSIBILITY.md](docs/COLOR_CONTRAST_ACCESSIBILITY.md)
  - Readability guidance for the game's high-energy interface.
- [docs/GEOMETRY_MODEL.md](docs/GEOMETRY_MODEL.md)
  - Foot-based lane dimensions, fixed travel and gutters, and the shared preview boundary.
- [docs/GAME_RULES.md](docs/GAME_RULES.md)
  - Four-control technique play, rack cleanup, generalized scoring, and save migration.

## Roadmap status

The regulation-lane rebuild is delivered: fixed lane geometry, real worker previews, four
pre-roll controls, same-rack fallen-pin cleanup, and V4 practice-record migration are part of
the playable build. Retained front doors cover code checks, Pages builds, headless browser
journeys, and the simulation benchmark. The active plan records the current evidence, including
the final browser-run caveat; the README screenshots were visually inspected at the 1600 x 1000
target viewport.

The active plan is the source of truth for milestone status and evidence.
