# TypeScript app quickstart

## What this repo is

This is a TypeScript browser app. You write code in `src/`, bundle it into
`dist/`, and ship `dist/` to GitHub Pages. A small set of named shell scripts
is the whole interface: drive the repo through them and you never need to open
`package.json`. The npm aliases (`npm run build`, `serve`, `check`, `clean`,
`test:playwright`) mirror the scripts one to one as an optional convenience.

## Front door shell scripts

| Script                      | What it does                                               |
| --------------------------- | ---------------------------------------------------------- |
| `./check_codebase.sh`       | Fast gate: typecheck, lint, format check, Node unit tests. |
| `./build_github_pages.sh`   | Bundle `src/` into `dist/` (the Pages artifact).           |
| `./run_web_server.sh`       | Build `dist/`, serve a local preview on a random port.     |
| `./run_playwright_tests.sh` | Run browser tests; builds `dist/` as needed.               |
| `./dist_clean.sh`           | Wipe `dist/`.                                              |

Run `./check_codebase.sh --help` for usage. `./run_web_server.sh` picks a
random port each run so the browser cache stays fresh; set `PORT` to override.
Its 600-second session bound releases the port after an interrupted local run;
set `WEB_SERVER_MAX_LIFETIME_SECONDS` to a positive whole-second override.
`./run_playwright_tests.sh` lets Playwright's own `webServer` config start the
test server, and accepts `--build` to force a rebuild first.

## Deterministic strike matrix

Use the persistent strike probe to test one legal launch setting against all
six supported menu modes and their actual complete triangular racks, without
random variation:

```bash
npm run strike-matrix -- --power 16 --start-position 0 --angle 0 --spin 0
```

The probe has no stochastic or seeded variability: it advances the production
simulation with its fixed timestep. The report lists each menu label, actual
triangular rack total, pin accounting, settlement status, and simulated time.
Every sample must settle with conserved pins; add `--require-all-strikes` only
when the setting must strike every rack, which makes a non-strike exit nonzero.
Without that strict flag, a non-strike is useful tuning evidence rather than an
automatic release failure. Run `npm run strike-matrix -- --help` for the
complete argument list.

## Repo layout you edit

- `src/main.ts` is the entry point (use `src/main.tsx` for JSX or Solid).
- `src/index.html` is the page shell that loads `dist/main.js`.
- `src/style.css` holds the styles, copied into `dist/` at build time.
- `dist/` is the generated bundle; treat it as build output, not source.
- `tests/` holds every test tier described below.

## Test tiers and homes

The repo has four test tiers. Pick the home by what you are testing.

- Fast pytest hygiene under `tests/` covers markdown links, ASCII compliance,
  and file naming. These are cross-ecosystem checks, not the TypeScript
  toolchain. Run them with `pytest tests/`. One guard, the test naming check,
  enforces test file naming under `tests/e2e/` and `tests/playwright/`.
- Node unit tests live in `tests/test_*.mjs`. Add one by dropping a
  `test_<name>.mjs` into `tests/`; `./check_codebase.sh` picks it up
  automatically through `node --import tsx --test 'tests/test_*.mjs'`.
- Browser tests live under `tests/playwright/`. Run them with
  `./run_playwright_tests.sh`. See `docs/PLAYWRIGHT_USAGE.md` for the browser
  test conventions.
- Whole-system E2E lives under `tests/e2e/` and runs directly, excluded from
  pytest. See `E2E_TESTS.md` for the non-browser E2E conventions.

## Daily run order

A typical edit loop runs the tiers in this order:

- Edit files under `src/`.
- Run `./check_codebase.sh` for the fast gate.
- Run `./run_web_server.sh` and eyeball the app in a browser.
- Run `./run_playwright_tests.sh` to confirm browser behavior.

## Visual capture and review

Use the maintained capture wrapper for browser evidence. It builds the shipped
app and writes ignored artifacts rather than treating an ad hoc screenshot as
proof:

```bash
./devel/capture_screenshots.sh --camera-bakeoff
./devel/capture_screenshots.sh --milestone
```

`--camera-bakeoff` captures the `dense`, `balanced`, and `open` 105-pin
compositions. Their 3%, 6%, and 10% row-reveal PNGs and JSON diagnostics make
the projection choice measurable. `--milestone` captures the maintained
1600 x 1000 mode/state set and writes its manifest and diagnostics under
`artifacts/milestone/`.

Review nine states: 10-, 105-, and 990-pin aiming, mid-roll, and partial-rack
or settled play. Capture completion proves that the production path emitted the
named evidence; independent original-resolution visual judgment decides whether
the composition, containment, scale, and pin orientation are acceptable. Run
`./run_playwright_tests.sh` after a visual or layout change as the required
browser regression gate.

## Ship to GitHub Pages

- Run `./build_github_pages.sh` to emit `dist/`, including `dist/.nojekyll` so
  Pages serves files whose names start with an underscore.
- Deploy runs as a GitHub Action from `dist/`. The seed workflow ships as a
  root-level `deploy-pages.yml`; move it into your repository workflows
  directory to activate it.
- Once the site is live, link `https://<owner>.github.io/<repo>/` near the top
  of `README.md` so readers can open the app in one click.

## Common first run failures

- `npx tsc -p tsconfig.lint.json` exits with TS18003 when `tests/` and `tools/`
  contain no `.ts` files. Seed a small `.ts` stub or narrow the include list in
  the consumer-owned `tsconfig.lint.json`.
- Playwright needs `dist/` built before it serves the app. The runner
  auto-builds when `dist/` is missing, or pass `--build` to force a rebuild.
- A fresh `npm install` must run esbuild's postinstall step. The `allowScripts`
  block in `package.json` already permits it, so let the install complete.

## Where to add tests

Keep the TypeScript toolchain checks (typecheck, lint, format, Node tests)
inside `./check_codebase.sh`, and keep the pytest tier under `tests/` thin and
cross-ecosystem. That split keeps each ecosystem verified by its own tools.

## Where to read more

For build-system, dependency, and style conventions in depth, see
[../docs/TYPESCRIPT_STYLE.md](../docs/TYPESCRIPT_STYLE.md).
