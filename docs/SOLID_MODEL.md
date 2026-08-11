# Solid model

## Application boundary

Super Bowling is a static client application. The browser hosts the Solid UI,
Canvas renderer, local storage, Web Audio calls, and simulation worker. The
site has no server-owned state and no network data boundary.

## Reactivity map

App owns scalar saved settings and active-screen signals. Setup owns a local
draft signal initialized from the saved recent setup. Game owns scalar match,
asset, renderer observation, and centered-shot camera signals. The worker
snapshot stream remains an explicit boundary; Canvas receives immutable snapshot
data and camera states rather than a reactive physics world.

## Component structure

`src/main.ts` mounts `App` into `#app`. `src/app/app.tsx` owns the application
screen boundary, saved settings, and the transition between setup and play.
`src/app/setup.tsx` owns the editable one-to-four-player draft, rack selection,
preference controls, and static previews that call the production ball renderer.
`src/app/game.tsx` owns the active match lifecycle, keyboard input, worker-client
subscription, hot-seat handoff, audio lifecycle, and game-facing save updates.
Canvas drawing remains in `src/render/`; JSX presents controls and accessible
match state rather than duplicating rendering logic.

## Second-roll readiness flow

The reducer separates a scored partial roll from the next aiming state with a
`sweeping` phase. It emits `prepare_next_roll`; the worker sweeps fallen pins,
resets the ball, publishes the prepared snapshot, and then emits
`sweep_complete`. Only that acknowledgement enables aiming controls. This
keeps the visible second-roll ball and guide aligned with the physical rack.

Aim previews carry monotonically increasing request IDs. Game accepts a preview
only when its ID matches the newest request for the active rack and aiming
phase. A late worker response therefore cannot replace the player's newer
guide.

Camera progress comes from the interpolated physical ball `y`, not from a timer
or a render-only animation. It is monotonic during the roll, resets before a
fresh or swept roll is enabled, and is held for the result. The release-driven
camera is the normal presentation model. The current renderer receives the
saved lower-motion preference as a presentation adaptation; it does not alter
the worker, reducer, scoring, or collision contracts described here. See
[ACCESSIBILITY.md](ACCESSIBILITY.md).

## Lifecycle model

Components run once to establish reactive dependencies. Canvas, worker, and
browser-audio setup belong in `onMount`, and their cleanup belongs in
`onCleanup`. App owns normalized saved settings; setup persists the selected
recent match, and Game persists completed best scores and explicit preference
changes. Components read reactive props at use sites. Dynamic identity-keyed
lists use `<For>`; position-keyed static slots use `<Index>`.

## Naming convention

Files, runtime identifiers, protocol fields, CSS classes, and configuration
keys use snake_case. PascalCase names identify TypeScript types and Solid
components.
