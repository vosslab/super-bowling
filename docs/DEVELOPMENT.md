# Development

This guide covers contributor workflows for Super Bowling. It complements
[INSTALL.md](INSTALL.md), which prepares a checkout, and [USAGE.md](USAGE.md),
which explains how to play the game.

## Change boundaries

- Edit game code in `src/`; treat `dist/` as generated GitHub Pages output.
- Keep Solid UI state in the app layer, Canvas drawing in `src/render/`, and
  authoritative physics in the simulation worker. The boundary is defined in
  [SOLID_MODEL.md](SOLID_MODEL.md).
- Use small, typed modules and explicit data flow. Follow
  [TYPESCRIPT_STYLE.md](TYPESCRIPT_STYLE.md) for strict TypeScript and local
  ESLint override rules.
- Keep player-visible mechanics consistent with [GAME_RULES.md](GAME_RULES.md)
  and lane dimensions consistent with [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md).

## Daily workflow

From the repository root, make a focused source change and run the fast gate:

```bash
./check_codebase.sh
```

The gate type-checks production and test TypeScript, runs ESLint and Prettier,
and executes the Node unit suite. Use the named shell scripts as the canonical
front doors; `npm run check`, `npm run build`, and `npm run test:playwright`
are equivalent convenience aliases.

Build and inspect the same artifact shipped to GitHub Pages:

```bash
./build_github_pages.sh
./run_web_server.sh
```

The preview chooses a fresh port by default and stops with `Ctrl-C`. It serves
only `dist/`, so it exposes build and asset-path problems that source-only
inspection can miss.

## Choose a test tier

| Change scope | Required evidence |
| --- | --- |
| Pure game, scoring, rendering, or simulation behavior | Add or update a deterministic `tests/test_*.mjs` test, then run `./check_codebase.sh`. |
| Browser-visible journey, layout, or interaction | Add or update a Playwright `.spec.ts` test under `tests/playwright/`, then run `./run_playwright_tests.sh --build`. |
| Repository docs, local links, or file hygiene | Run `source source_me.sh && python3 -m pytest tests/`. |
| Maintained screenshots or GIFs | Run `./devel/capture_screenshots.sh --documentation` against a fresh production build, then inspect the committed assets at original resolution. |
| Physics scale or settlement performance | Run `npm run benchmark`; inspect the ignored JSON report under `artifacts/benchmark/`. |

Use behavior-based assertions, real visible interactions, and readiness waits
in browser tests. [PLAYWRIGHT_TEST_STYLE.md](PLAYWRIGHT_TEST_STYLE.md) and
[PLAYWRIGHT_USAGE.md](PLAYWRIGHT_USAGE.md) define the authoring and execution
conventions. [E2E_TESTS.md](E2E_TESTS.md) defines the boundary between browser
tests, fast checks, and slower non-browser orchestration.

## Visual changes

For a camera, animation, canvas, or layout change, inspect the built game and
run the browser suite. Capture maintained evidence when a visual review is
needed:

```bash
./devel/capture_screenshots.sh --milestone
```

This builds `dist/` and writes temporary review evidence to `artifacts/`.
Capture success proves the production path completed; visual acceptance still
requires reviewing the rendered frames at their original resolution.

The documentation capture front door also rebuilds the action-gallery assets:

```bash
./devel/capture_screenshots.sh --documentation
```

It follows real browser rolls, writes the maintained PNGs and short GIF below
`docs/screenshots/`, and checks a readable lower-motion 105-pin cascade. The
gallery pages [showcase/THOUSAND_PIN_ACTION.md](showcase/THOUSAND_PIN_ACTION.md)
and [showcase/ARCADE_MOMENTS.md](showcase/ARCADE_MOMENTS.md) consume those
assets. Treat the normal-motion capture as the creative source of truth;
lower motion is a separate presentation check, not the camera or effects design
target.

## Before handoff

- Run the narrowest relevant checks first, then the required browser and
  visual gates for player-visible changes.
- Build `dist/` before a Pages handoff; never edit generated files directly.
- Record user-visible repository changes in `docs/CHANGELOG.md` for human
  review.
- Leave ignored diagnostics, benchmark reports, and capture artifacts out of
  source changes unless a task explicitly promotes them to maintained assets.
