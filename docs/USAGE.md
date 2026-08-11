# Usage

Super Bowling is a local, shared-keyboard browser game. Build and serve the same static `dist/`
artifact used for GitHub Pages, then set up a rack and take turns on one keyboard.

## Quick start

After completing [INSTALL.md](INSTALL.md), start the local preview:

```bash
./run_web_server.sh
```

Open the printed local URL. Choose a rack, add one to four players, customize their balls, and
start the match. Stop the preview with `Ctrl-C`.

The preview builds `dist/` before serving it and normally ends after 600 seconds. Set a positive
whole-second lifetime when a longer local session is useful:

```bash
WEB_SERVER_MAX_LIFETIME_SECONDS=1200 ./run_web_server.sh
```

## Bowling controls

Set technique before release; the ball cannot be steered after it starts rolling.

| Key | Action |
| --- | --- |
| Up / Down | Set pre-roll power. |
| Left / Right | Set pre-roll starting position. |
| A / D | Set pre-roll angle. |
| Q / E | Set pre-roll spin. |
| Space | Bowl with the selected technique. |

The game supports the 10, 20, 50, 100, 500, and 1,000 scale labels. Each label maps to a complete
triangular rack; [GAME_RULES.md](GAME_RULES.md) defines the actual pin counts, scoring, and
frame rules.

## Build and checks

Create the production GitHub Pages artifact:

```bash
npm run build
```

Run the normal source-quality gate:

```bash
npm run check
```

Run the thirty-shot simulation benchmark. It writes a local, ignored report to
`artifacts/benchmark/simulation_benchmark.json`:

```bash
npm run benchmark
```

Run the Playwright browser suite, rebuilding the site first:

```bash
npm run test:playwright -- --build
```

## Alternate pages

The production build includes two developer diagnostic pages. They are not part of ordinary game
setup, but they are supported local workflows. Start a predictable local preview:

```bash
PORT=8123 ./run_web_server.sh
```

Then open either route in the built artifact:

- `http://localhost:8123/benchmark.html` checks renderer work against the benchmark fixture.
- `http://localhost:8123/designer_fixture.html` shows the ball-designer fixture used by browser
  tests.

Use `Ctrl-C` to stop the preview. The build contract and produced files are defined by
[pipeline/build.mjs](../pipeline/build.mjs).
