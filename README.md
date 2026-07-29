# Super Bowling

An original browser bowling game for friends sharing one keyboard, with
front-facing arcade lanes and racks that grow from ten real pins to one thousand.

> **Playable now:** choose 10, 20, 50, 100, 500, or 1,000 pins for a complete one-to-four-player
> keyboard match with worker physics, Canvas rendering, generalized scoring, and custom balls.

<!-- screenshots:begin (managed by screenshot-docs) -->
![1,000-pin deck camera view after the ball crosses the lane trigger](docs/screenshots/thousand_pin_deck.png)
![Four-player pass-the-keyboard handoff focused on Bea's next turn](docs/screenshots/pass_the_keyboard.png)
<!-- screenshots:end -->

## One keyboard, giant rack

This is bowling for the moment when ten pins feel a little too sensible. Pick an exact
rack size, pass the keyboard between up to four people, and send a custom rolling
cylinder-looking ball toward a deck that can hold 1,000 individually countable pins.

- Choose exact racks of 10, 20, 50, 100, 500, or 1,000 pins.
- Play a familiar ten-frame bowling match whose strike, spare, and bonus values scale
  with the selected rack.
- Share one browser and keyboard with one to four local hot-seat players.
- Give each player a recognizable ball with two colors, a pattern, and an optional
  two-character monogram.
- Keep the presentation original: a faux-3D lane, Canvas rendering, and synthesized
  sound built for a 16:10 landscape browser.
- Keep the next local session ready with recent-player restore, per-rack best scores, mute,
  and reduced-motion preferences.

## Current playable lane

The shipped game starts an exact selected-rack match with one to four named players. Setup keeps
each player's colors, pattern, and optional monogram in the same production ball renderer used on
the lane. A focused pass-the-keyboard card advances each hot-seat turn, while the full score strip,
original pin and cylinder-ball art, worker-backed rolls, and phase feedback stay visible.

## Quick start

Use Node.js with npm. The repository setup script installs the pinned browser-game
toolchain, and the web server builds then serves the same `dist/` artifact intended for
GitHub Pages.

```bash
devel/setup_typescript.sh
./run_web_server.sh
```

Open the local URL printed by the server, choose a rack, add one to four players, and customize
their balls before starting the match.
Use arrow keys to set aim and power, press Space to bowl, and use Left/Right while rolling to
guide the ball. The setup and in-game controls keep Mute and Reduced motion choices visible.
Stop the server with `Ctrl-C`.

## Controls and play

Every rack uses the same deliberately simple keyboard control scheme:

| Key          | Action                                                   |
| ------------ | -------------------------------------------------------- |
| Left / Right | Aim before launch; guide the ball gently while it rolls. |
| Up / Down    | Set bowling power before launch.                         |
| Space        | Bowl.                                                    |

The completed match follows classic strikes, spares, and tenth-frame bonus rolls.
The shared [docs/GAME_RULES.md](docs/GAME_RULES.md) contract generalizes the same rules to
every supported rack: a perfect game scores `30 * pin_count`.

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
`npm run benchmark` writes the retained 30-shot rack report to
`artifacts/benchmark/simulation_benchmark.json`.

## GitHub Pages setup

The repository includes [deploy-pages.yml](deploy-pages.yml), a copy-ready GitHub Actions
workflow seed. Copy it to `.github/workflows/deploy-pages.yml` in GitHub, enable Pages for
the repository, and use the resulting deployment URL. The workflow sets up dependencies,
checks the codebase, builds `dist/`, and deploys the uploaded Pages artifact. A public demo
URL is not confirmed yet.

## Documentation

- [docs/active_plans/active/super_bowling_v1.md](docs/active_plans/active/super_bowling_v1.md)
  - Product decisions, milestone ownership, and acceptance evidence.
- [docs/SOLID_MODEL.md](docs/SOLID_MODEL.md)
  - Solid reactivity boundaries for the UI, Canvas renderer, and simulation worker.
- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md)
  - Run and extend the headless browser checks.
- [docs/E2E_TESTS.md](docs/E2E_TESTS.md)
  - Choose the appropriate test home for browser and non-browser workflows.
- [docs/COLOR_CONTRAST_ACCESSIBILITY.md](docs/COLOR_CONTRAST_ACCESSIBILITY.md)
  - Readability guidance for the game's high-energy interface.

## Roadmap status

M1 establishes the Solid shell, strict TypeScript contracts, worker entry, static build, and
headless browser proof. M2 adds the retained simulation benchmark for every supported rack.
M3 through M5 deliver complete six-rack, local hot-seat, and custom-ball play. M6 now adds bounded
synthesized audio, recent-match and per-rack score persistence, stable lane/deck camera framing,
and reduced-motion controls before release validation.

The active plan is the source of truth for the exact milestone sequence and evidence.
