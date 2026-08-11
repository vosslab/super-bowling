# Install

Installing Super Bowling prepares the local browser-game toolchain so the static site can be
built, checked, and served from this checkout.

## Requirements

- A checkout of this repository with [package.json](../package.json) and
  [package-lock.json](../package-lock.json).
- Node.js and npm on the command line. The setup script stops with a clear error when npm is
  unavailable.
- Python 3 for the local preview server. [run_web_server.sh](../run_web_server.sh) serves the
  built `dist/` directory through Python's standard HTTP server.
- A modern desktop browser for play. The interface is designed for a 16:10 landscape viewport.

## Install steps

From the repository root, install the npm dependencies declared in
[package.json](../package.json):

```bash
./devel/setup_typescript.sh
```

The setup command runs `npm install`. Run it again after pulling changes that update the package
manifest or lockfile.

## Verify install

Run the maintained code gate:

```bash
npm run check
```

This verifies TypeScript source and test type checks, ESLint, Prettier formatting, and the Node
test suite. It does not build the deployable site; use `npm run build` when a `dist/` artifact is
needed.

## Optional browser tests

Install Playwright's Chromium and Firefox browsers before running the browser suite:

```bash
./devel/setup_playwright.sh
```

Then run `npm run test:playwright -- --build`. See
[PLAYWRIGHT_USAGE.md](PLAYWRIGHT_USAGE.md) for the browser-test workflow.

## Verified toolchain

This repository does not declare a lowest supported Node.js or browser version. Do not infer a
compatibility promise from transitive dependency metadata. The current checkout was verified with
Node.js `v26.7.0`, npm `11.19.0`, Playwright `1.62.0`, Playwright Chromium `151.0.7922.34`, and
Playwright Firefox `153.0`. These are a tested-environment record, not an oldest-supported-version
claim.

To verify the toolchain in a checkout, run:

```bash
node --version
npm --version
npx playwright --version
npm run check
npm run test:playwright -- --build
```

Playwright downloads the browser revisions pinned by its installed package. Run
`./devel/setup_playwright.sh` again when dependencies change or the browser executable is missing.
