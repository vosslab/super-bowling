# Troubleshooting

Use this guide when a local preview, verification command, or browser asset does not start as
expected. The repository front-door scripts print a specific error before they exit.

## Install dependencies

If a check or Playwright command reports that `node`, `npm`, or `node_modules` is missing, install
the project dependencies from the repository root.

```bash
./devel/setup_typescript.sh
```

- The setup script reports a missing `npm` command and then stops; install Node.js before retrying.
- `./run_web_server.sh` performs this setup automatically when `node_modules/` is absent.
- Run `./devel/setup_playwright.sh` after the npm setup when Playwright reports that its browsers
  are unavailable.

## Preview timeout

`./run_web_server.sh` ends a preview after 600 seconds so an interrupted session cannot leave its
local server running. The script prints the configured limit and exits with status 124 when that
happens.

Start a longer local session by setting a positive whole-second value:

```bash
WEB_SERVER_MAX_LIFETIME_SECONDS=1800 ./run_web_server.sh
```

Use `Ctrl-C` to stop an active preview normally. If the variable is zero, negative, or contains
other text, correct it to a positive integer and run the command again.

## Browser test setup

Use the repository runner for browser tests. It starts its own preview server and rebuilds `dist/`
when the expected app files are absent.

```bash
./run_playwright_tests.sh --build
```

- If the runner says `node_modules/ missing`, run `./devel/setup_typescript.sh`.
- If Playwright cannot find a browser executable, run `./devel/setup_playwright.sh`.
- A recorded macOS sandbox run could not register Chromium's Mach port. Run the unchanged browser
  command from a regular local terminal rather than that restricted sandbox.

## Missing lane art

The lane shows an on-screen message such as `Could not load renderer asset: ./assets/ball_surface.svg`
when an image needed by the Canvas renderer fails to load.

- Rebuild the published artifact with `./build_github_pages.sh`.
- Start the site with `./run_web_server.sh`, which serves `dist/` rather than the repository root.
- In browser developer tools, confirm that the asset named in the message is present under
  `dist/assets/` and that its request succeeds.

## Canvas unavailable

The game stops with `Canvas rendering is unavailable in this browser.` when its lane cannot obtain
a 2D canvas context. Open the local preview in a current desktop browser with JavaScript and Canvas
enabled, then retry the game.

## Verification failures

Run the front-door command that matches the failed stage. Each command preserves the underlying
tool output so the first failing check remains visible.

```bash
./check_codebase.sh
./build_github_pages.sh
./run_playwright_tests.sh --build
npm run benchmark
```

`./check_codebase.sh` does not build the site or run Playwright. `./run_playwright_tests.sh` owns
the browser-test server; do not start a separate preview server for that command.
