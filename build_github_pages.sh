#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.
#
# Front door: run this directly as ./build_github_pages.sh. It is the
# interface for everyone, no npm knowledge required. The npm run build
# alias is an optional mirror that points right back at this script.
#
# Contract:
#   - Wipes dist/ from scratch.
#   - Type-checks via 'tsc --noEmit -p tsconfig.json'.
#   - Type-checks production source through tsconfig.json.
#   - Bundles src/main.ts through Solid's esbuild transform into dist/main.js.
#   - Bundles src/simulation/worker.ts into dist/simulation_worker.js.
#   - Copies static HTML and CSS with project-site-relative asset paths.
#   - Copies src/index.html and src/style.css into dist/.
#   - Writes dist/.nojekyll so GitHub Pages serves files starting with _.
#   - Asserts dist/index.html and dist/main.js exist before exiting.
#
# Hard rule: never produces single-file output. ESM only.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
node pipeline/build.mjs
