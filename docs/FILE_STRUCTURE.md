# File structure

## Top-level layout

```text
super-bowling/
+- src/                 Browser application source
+- tests/               Node, Python hygiene, and Playwright checks
+- docs/                Product, engineering, and workflow documentation
+- pipeline/            Production bundling implementation
+- devel/               Developer setup, probes, and maintenance scripts
+- dist/                Generated GitHub Pages artifact
+- package.json         Node dependency and command manifest
+- build_github_pages.sh  Canonical production build front door
+- check_codebase.sh    Static-check and Node-test front door
+- run_web_server.sh    Build-and-serve local preview front door
+- run_playwright_tests.sh  Browser-test front door
+- deploy-pages.yml     Copyable GitHub Pages workflow
+- README.md            Project overview and first-success path
+- AGENTS.md            Repository guidance for coding agents
`- REPO_TYPE            Template routing marker
```

## Application source

- [../src/main.ts](../src/main.ts) mounts the browser application.
- [../src/app/](../src/app/) contains Solid components and browser orchestration. Key files are
  [../src/app/app.tsx](../src/app/app.tsx) for the screen boundary,
  [../src/app/setup.tsx](../src/app/setup.tsx) for match setup,
  [../src/app/game.tsx](../src/app/game.tsx) for active-play ownership,
  [../src/app/game_controls.tsx](../src/app/game_controls.tsx) for its view-only control deck,
  [../src/app/impact_presentation.ts](../src/app/impact_presentation.ts) for physical-to-perceptual
  cues, and
  [../src/app/simulation_client.ts](../src/app/simulation_client.ts) for worker communication.
- [../src/game/](../src/game/) contains pure match, scoring, aim, display, and player-stat logic.
- [../src/simulation/](../src/simulation/) contains the Rapier world, rack generation, physics
  activation, pin state, preview calculation, worker loop, typed protocol, and benchmarks.
  `impact_window.ts` aggregates real collision/fall windows; `world_contracts.ts`,
  `world_factories.ts`, and `world_snapshot.ts` keep world types, body factories, and serialization
  separately reviewable.
- [../src/render/](../src/render/) contains Canvas projection, interpolation, and the dynamic
  physical-shot camera. `camera.ts` follows the ball corridor before first contact, latches the
  real ball-pin impact centroid through the cascade, while `result_camera.ts` fits the settled
  frame around every visible fallen pin.
- [../src/audio/](../src/audio/) contains gesture-gated Web Audio playback, sample prefetch/decode,
  physics-time scheduling, bounded mix buses, compression, and procedural fallback voices.
  `audio_backend.ts` provides the browser-audio seam; `cascade_director.ts` turns ordered physical
  summaries into 50 ms hero, attack, and body choices; and `collision_render_contract.ts` shares
  sample-slice, pan, gain, and filtering instructions between production playback and evidence.
- [../src/designer/](../src/designer/) contains ball-design data and the designer fixture.
- [../src/save/](../src/save/) contains save-file types, normalization, migrations, and settings
  access.
- [../src/config/](../src/config/) centralizes supported pin counts plus lane, camera, physics, and
  benchmark configuration.
- [../src/assets/](../src/assets/) contains committed production assets. Its SVG artwork is copied
  to the production artifact, then [../src/render/game_assets.ts](../src/render/game_assets.ts)
  loads and rasterizes it once into reusable Canvas assets for the live draw loop.
  [../src/assets/audio/](../src/assets/audio/) contains six compact CC0 Ogg derivatives for rolling
  and physical impact layers. [../src/assets/audio/LICENSES.md](../src/assets/audio/LICENSES.md)
  records their provenance, license, derivative history, and SHA-256 values.
- [../src/style_setup.css](../src/style_setup.css) establishes CSS cascade layers and shared setup;
  [../src/style.css](../src/style.css) contains the browser game's remaining layout and presentation
  styles.
- [../src/index.html](../src/index.html), [../src/benchmark.html](../src/benchmark.html), and
  [../src/designer_fixture.html](../src/designer_fixture.html) are static HTML entry documents.

## Tests and evidence

- [../tests/](../tests/) contains permanent deterministic Node behavior tests importing TypeScript
  source through the `tsx` loader, plus Python checks for repository hygiene, source conventions,
  and documentation links. The audio set includes `test_cascade_director.mjs`, `test_audio.mjs`,
  `test_collision_audio.mjs`, `test_impact_presentation.mjs`, and
  `test_autonomous_completion_policy.mjs`. Run Python checks with the environment described in
  [PYTEST_STYLE.md](PYTEST_STYLE.md).
- [../tests/playwright/](../tests/playwright/) contains browser smoke tests and full interaction
  journeys; its `e2e/` subtree holds the full paths. `e2e/audio_cascade.spec.ts` instruments the
  live Web Audio graph during visible play to check overlapping source slices, signed spatial pans,
  the voice bound, and cleanup.
- [../playwright.config.ts](../playwright.config.ts) configures the browser runner and its local
  server boundary.
- [screenshots/](screenshots/) contains intentional documentation screenshots.

## Build, tooling, and generated files

- [../package.json](../package.json) and [../package-lock.json](../package-lock.json) define the
  pinned Node toolchain and commands.
- [../pipeline/build.mjs](../pipeline/build.mjs) is the source-level production build pipeline.
- [../devel/setup_typescript.sh](../devel/setup_typescript.sh) installs the local Node toolchain;
  [../devel/setup_playwright.sh](../devel/setup_playwright.sh) prepares browser-test prerequisites.
- [../devel/run_simulation_benchmark.mjs](../devel/run_simulation_benchmark.mjs) produces a local
  simulation benchmark report.
- [../devel/capture_screenshots.mjs](../devel/capture_screenshots.mjs) captures milestone and
  documentation evidence. It delegates maintained action-gallery assets to
  [../devel/capture_documentation_showcase.mjs](../devel/capture_documentation_showcase.mjs).
- [../devel/verify_audio_cascade.mjs](../devel/verify_audio_cascade.mjs) is the maintained,
  unattended audio-evidence harness behind `npm run verify:audio-cascade`. It combines Chromium
  `OfflineAudioContext` synthetic rendering with real-worker 990-pin and ten-pin capture, then
  emits WAV, WebM, spectrogram, and JSON reports under ignored
  `artifacts/audio-cascade/latest/`.
- [../devel/audio_cascade_evidence_contract.mjs](../devel/audio_cascade_evidence_contract.mjs)
  owns maintained audio-evidence calibration separately from permanent behavior tests.
- [../devel/capture_real_gameplay_audio.mjs](../devel/capture_real_gameplay_audio.mjs) records the
  post-master production A/V and capture-only telemetry used by the real-worker half of that
  harness. It is evidence infrastructure, not a production mixer or permanent browser test.
- [../devel/verify_autonomous_completion_policy.mjs](../devel/verify_autonomous_completion_policy.mjs)
  checks current terminal-plan language; its Node behavior coverage lives in
  [../tests/test_autonomous_completion_policy.mjs](../tests/test_autonomous_completion_policy.mjs).
- [../tools/](../tools/) holds focused maintenance and conversion utilities.
- `dist/` is regenerated by the build and is not source code. The recursive build copy places all
  committed [../src/assets/](../src/assets/) files, including audio, under `dist/assets/`.
- `node_modules/`, `test-results/`, `artifacts/`, and `tmp/` are local dependency, test,
  benchmark, or temporary outputs ignored by
  [../.gitignore](../.gitignore).

## Documentation map

- [../README.md](../README.md) provides the purpose, current playable lane, quick start, controls,
  and verification commands.
- [INSTALL.md](INSTALL.md) and [USAGE.md](USAGE.md) cover local setup, play, builds, checks, and
  alternate pages.
- [showcase/ARCADE_MOMENTS.md](showcase/ARCADE_MOMENTS.md) and
  [showcase/THOUSAND_PIN_ACTION.md](showcase/THOUSAND_PIN_ACTION.md) are the visual action-tour
  subpages. Their maintained images and GIF live in [screenshots/](screenshots/).
- [GAME_RULES.md](GAME_RULES.md), [FAQ.md](FAQ.md), and [COOKBOOK.md](COOKBOOK.md) explain rack
  scales, scoring, common questions, and playable session recipes.
- [SOLID_MODEL.md](SOLID_MODEL.md), [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md), and
  [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md) record application ownership, component boundaries, and
  lane, deck, gutter, pit, and preview geometry.
- [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md) records durable arcade-presentation
  observations and the project's original-design boundary; it has no dependency on local-only
  research media.
- [COLOR_CONTRAST_ACCESSIBILITY.md](COLOR_CONTRAST_ACCESSIBILITY.md),
  [ACCESSIBILITY.md](ACCESSIBILITY.md),
  [YOUNG_ADULT_VIBES_DESIGN_STYLE.md](YOUNG_ADULT_VIBES_DESIGN_STYLE.md),
  [FUN_VIBES_DESIGN_STYLE.md](FUN_VIBES_DESIGN_STYLE.md), and
  [PLAYFUL_TRAINING_GAME_STYLE.md](PLAYFUL_TRAINING_GAME_STYLE.md) document accessible and
  age-appropriate presentation guidance.
- [DEVELOPMENT.md](DEVELOPMENT.md), [PLAYWRIGHT_USAGE.md](PLAYWRIGHT_USAGE.md), and
  [E2E_TESTS.md](E2E_TESTS.md) describe development boundaries, browser tests, and end-to-end
  execution. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) provides failure recovery.
- [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md) records the autonomous completion-policy boundary for
  plans, fixtures, automated behavior tests, and independent-subagent review.
- [RELATED_PROJECTS.md](RELATED_PROJECTS.md) records confirmed dependencies and design references.
  [ROADMAP.md](ROADMAP.md) and [TODO.md](TODO.md) distinguish next priorities from small follow-ups.
- [NEWS.md](NEWS.md) and [RELEASE_HISTORY.md](RELEASE_HISTORY.md) summarize shipped releases.
  [CHANGELOG.md](CHANGELOG.md) remains the chronological record of changes.
- [AUTHORS.md](AUTHORS.md), [MARKDOWN_STYLE.md](MARKDOWN_STYLE.md), [PYTHON_STYLE.md](PYTHON_STYLE.md),
  [PYTEST_STYLE.md](PYTEST_STYLE.md), [PLAYWRIGHT_TEST_STYLE.md](PLAYWRIGHT_TEST_STYLE.md),
  [REPO_STYLE.md](REPO_STYLE.md), and [TYPESCRIPT_STYLE.md](TYPESCRIPT_STYLE.md) provide
  contributor and project conventions.
- [CLAUDE_HOOK_USAGE_GUIDE.md](CLAUDE_HOOK_USAGE_GUIDE.md) documents the optional local hook
  workflow. [active_plans/](active_plans/) holds current working plans, and [archive/](archive/)
  holds closed historical material.

## Where to add work

- Add a new visible game flow under [../src/app/](../src/app/) and keep its pure rules under
  [../src/game/](../src/game/).
- Add a physics or preview change under [../src/simulation/](../src/simulation/) with a matching
  protocol, Node, and benchmark update where the behavior crosses those boundaries.
- Add drawing changes under [../src/render/](../src/render/) and styles in
  [../src/style_setup.css](../src/style_setup.css) or [../src/style.css](../src/style.css); add committed visual source assets under
  [../src/assets/](../src/assets/).
- Add sound playback under [../src/audio/audio.ts](../src/audio/audio.ts), physical-to-audio mapping
  under [../src/app/impact_presentation.ts](../src/app/impact_presentation.ts), direction policy
  under [../src/audio/cascade_director.ts](../src/audio/cascade_director.ts), and shared live/offline
  rendering choices under [../src/audio/collision_render_contract.ts](../src/audio/collision_render_contract.ts).
  Add a permissively licensed committed clip under [../src/assets/audio/](../src/assets/audio/) with
  its matching provenance entry in [../src/assets/audio/LICENSES.md](../src/assets/audio/LICENSES.md).
- Add persistent data through [../src/save/](../src/save/) with explicit normalization and
  migration coverage.
- Add deterministic behavior checks in [../tests/](../tests/) and browser journeys in
  [../tests/playwright/](../tests/playwright/).
- Add durable reference documentation in [docs/](./) using an ALL_CAPS filename; add active planning
  material to the appropriate [active_plans/](active_plans/) subdirectory.
- Add a narrowly scoped developer script in [../devel/](../devel/) or [../tools/](../tools/),
  according to its purpose. Keep committed visual evidence reproducible through the capture front
  door instead of hand-copying screenshots.

## Known gaps

- Re-run `npm run verify:audio-cascade`, regenerate the terminal summary, and complete the planned
  independent evidence rereview before closing the current audio work. A passing real-worker report
  is present, but the last terminal closeout sequence was stopped before it finished.
- Exercise the 990-pin fixture on representative browsers, audio implementations, and real GPU
  hardware. Current Chromium evidence establishes the maintained automation path but does not cover
  every portable runtime combination.
