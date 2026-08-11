# Super Bowling

An original browser bowling game for friends sharing one keyboard, turning familiar ten-pin
technique into dramatic arcade action across triangular racks from 10 to 990 pins.

[Play Super Bowling live](https://vosslab.github.io/super-bowling/)

## Bowling without the hardware

Super Bowling combines the readability of Nintendo Wii-style screen bowling, without a motion
controller, with the camera drive and high-impact arcade energy of UNIS Lane Master, without a
physical ball, cabinet, or sensors. It is an original keyboard-and-pointer game: choose a line,
power, angle, and spin, watch the projected path, then commit to the roll.

The lane reacts to the shot. A release-driven camera advances toward the rack, the custom ball
rolls with visible depth and surface rotation, and physically simulated pins separate into
readable paths. Strikes and spares earn big, distinct lane celebrations while ordinary rolls keep
the next decision in view.

<!-- screenshots:begin (managed by screenshot-docs) -->

![A full-power ball opening the first collision wave through the center of the 990-pin rack](docs/screenshots/thousand_pin_impact_wave.png)
![Hundreds of individually simulated pins spreading into a deep 990-pin collision field](docs/screenshots/thousand_pin_cascade.png)
![A dimensional blue player ball with glossy lighting, recessed finger holes, surface pattern, and lane contact shadow during a normal ten-pin roll](docs/screenshots/classic_ball_in_motion.png)
![A lane-wide amber STRIKE payoff over a physically cleared ten-pin deck](docs/screenshots/classic_strike.png)
![A lane-wide cyan SPARE payoff over a clean second-roll pickup](docs/screenshots/classic_spare.png)
<!-- screenshots:end -->

See the complete [1,000-pin action tour](docs/showcase/THOUSAND_PIN_ACTION.md) and the
[arcade moments gallery](docs/showcase/ARCADE_MOMENTS.md) for current real-worker screenshots and
one short real-worker 105-pin animation.

## Make the shot yours

- Choose a 10, 20, 50, 100, 500, or 1,000 scale label; the setup and HUD always show the actual
  complete-triangle pin total used for play and scoring.
- Set power, release position, angle, and spin before the ball leaves your hand. A worker-backed
  preview shows the same pins-free path the live roll follows up to first contact.
- Pass one keyboard among one to four local players, each with a two-color ball, surface pattern,
  and optional two-character monogram.
- Play a familiar ten-frame match with classic strikes, spares, and bonus scoring, or choose one
  through five bowls per frame for a super-frame challenge.
- Keep a practice record for each rack and bowls-per-frame mode: high game, recent scores, best
  frame, longest named strike run, and games bowled.
- Use original dark-teal lane art, geometric controls, Canvas rendering, synthesized sound, and
  amber `STRIKE` or cyan `SPARE` result language.
- Keep the next local session ready with recent-player restore and saved presentation settings.

| Scale label | Actual pins |
| ----------: | ----------: |
|          10 |          10 |
|          20 |          21 |
|          50 |          45 |
|         100 |         105 |
|         500 |         496 |
|       1,000 |         990 |

## What a roll feels like

Aim before release rather than steering after it: move the start point, shape the launch angle
and hook, then press Space. The camera begins its push as the ball travels, holds the deck through
the collision, and resets before the next aim. Rapier physics keeps the contact and standing-pin
state authoritative; the renderer adds depth, shadows, brief motion emphasis, and original
celebration flare without changing the result.

The game targets a 16:10 landscape desktop browser experience; narrow layouts remain usable, but
the lane is designed to be seen wide.

## Quick start

Use a current Node.js installation with npm. The setup script installs the pinned browser-game
toolchain; the server builds and serves the same `dist/` artifact intended for GitHub Pages.

```bash
./devel/setup_typescript.sh
./run_web_server.sh
```

Open the local URL printed by the server. Choose a rack, add one to four players, customize their
balls, then start the match. Select a technique before release with the controls below; after the
roll begins, the ball cannot be steered. Stop the server with `Ctrl-C`.

The preview server expires after 600 seconds. Set `WEB_SERVER_MAX_LIFETIME_SECONDS` to a positive
whole-second value when a shorter or longer local session is useful.

## Controls and scoring

| Key          | Action                            |
| ------------ | --------------------------------- |
| Up / Down    | Set pre-roll power.               |
| Left / Right | Set pre-roll start position.      |
| A / D        | Set pre-roll angle.               |
| Q / E        | Set pre-roll spin.                |
| Space        | Bowl with the selected technique. |

Classic two-bowl frames use strikes, spares, and the standard tenth-frame bonus rolls. A classic
perfect game is `30 * actual_pin_count`, so the 1,000 scale's 990 physical pins matter more than
the convenient label. Super-frame mode scores actual pinfall and ends early when a rack clears;
[docs/GAME_RULES.md](docs/GAME_RULES.md) explains the full scoring and save-migration contract.

## Verify and build

Run the repository front doors to check TypeScript, create the Pages artifact, exercise browser
journeys, and measure simulation behavior.

```bash
./check_codebase.sh
./build_github_pages.sh
./run_playwright_tests.sh --build
npm run benchmark
```

`./build_github_pages.sh` writes the deployable site to `dist/`. The headless browser suite uses a
1600 x 1000 viewport, matching the primary desktop target. `npm run benchmark` writes a local
30-shot rack report to `artifacts/benchmark/simulation_benchmark.json`; `artifacts/` is ignored.

## Status and boundaries

The regulation-lane rebuild and the action presentation pass are shipped in the playable build:
worker-backed previews, four pre-roll controls, shot-driven deck framing, enhanced ball and pin
rendering, and strike/spare bursts all have code and browser coverage. The game has no account,
server-owned state, motion controller, physical-ball hardware, cabinet integration, tickets, or
prize mechanics. Its reference inspirations inform pacing and readability, not copied art,
branding, interface assets, or hardware behavior.

The repository includes [deploy-pages.yml](deploy-pages.yml), a copyable root GitHub Actions
workflow. Copy it to `.github/workflows/deploy-pages.yml` to build `dist/` and publish the Pages
artifact from GitHub.

## Documentation

Start here:

- [docs/USAGE.md](docs/USAGE.md) - Run a match, use controls, and understand local preferences.
- [docs/INSTALL.md](docs/INSTALL.md) - Install the browser-game toolchain and prepare a local run.
- [docs/GAME_RULES.md](docs/GAME_RULES.md) - Learn rack totals, scoring modes, controls, and saves.
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) - Review the lower-motion presentation contract.
- [docs/LANE_MASTER_VIDEO_FINDINGS.md](docs/LANE_MASTER_VIDEO_FINDINGS.md) - Read the durable
  design findings behind the game's original screen-bowling and arcade-action synthesis.
- [docs/showcase/THOUSAND_PIN_ACTION.md](docs/showcase/THOUSAND_PIN_ACTION.md) - Follow one
  full-power 990-pin roll from approach through its expanding physical cascade.
- [docs/showcase/ARCADE_MOMENTS.md](docs/showcase/ARCADE_MOMENTS.md) - See 105-pin action,
  classic result stingers, an earned record, and local multiplayer handoff.

Understand the implementation:

- [docs/CODE_ARCHITECTURE.md](docs/CODE_ARCHITECTURE.md) - Follow Solid UI, Canvas rendering, and
  simulation-worker responsibilities.
- [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md) - Find source, tests, build, and documentation
  homes.
- [docs/SOLID_MODEL.md](docs/SOLID_MODEL.md) - See the reactivity and worker-snapshot boundaries.
- [docs/GEOMETRY_MODEL.md](docs/GEOMETRY_MODEL.md) - Review lane dimensions, gutters, and the
  shared preview boundary.

Validate and evolve the project:

- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md) - Run and extend browser checks.
- [docs/E2E_TESTS.md](docs/E2E_TESTS.md) - Choose the appropriate test home for browser and
  non-browser workflows.
- [docs/COLOR_CONTRAST_ACCESSIBILITY.md](docs/COLOR_CONTRAST_ACCESSIBILITY.md) - Review contrast
  and high-energy interface readability.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - Read the chronological record of shipped changes.

## License

This project is available under the [MIT License](LICENSE.MIT.md).
