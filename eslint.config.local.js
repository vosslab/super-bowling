// eslint.config.local.js - consumer-owned ESLint overrides.
//
// Add repo-specific ESLint config objects here: extra browser-context globs,
// per-tool globals, or local rule tweaks. This file ships once via the noexist
// bucket and is never overwritten by propagation, so your edits survive. The
// canonical eslint.config.js imports and spreads this array AFTER its own config,
// so entries here refine or override the canonical rules.
//
// Example: give two named node tools browser globals for page.evaluate() use,
// without loosening no-undef across all tools.
//
//   import globals from "globals";
//   export default [
//     {
//       files: ["tools/scene_to_png.mjs", "tools/svg_picker/**"],
//       languageOptions: { globals: { ...globals.browser } },
//     },
//   ];
//
import globals from "globals";

// Production-browser probes intentionally run page.evaluate callbacks. Keep the
// browser globals scoped to those probes; Node-only diagnostics retain no-undef.
export default [
  // Benchmark and visual-probe output is local evidence, not source. This
  // repository-owned ignore belongs beside the other consumer-owned overrides.
  { ignores: ["artifacts/**"] },
  {
    files: [
      "devel/capture_camera_archetypes.mjs",
      "devel/measure_impact_window_distribution.mjs",
      "devel/verify_audio_cascade.mjs",
    ],
    languageOptions: { globals: { ...globals.browser } },
  },
];
