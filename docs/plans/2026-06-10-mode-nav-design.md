# Shared Mode Nav Strip — Design

**Date:** 2026-06-10

## Summary

Add a persistent top navigation strip to the three game modes (Map Attack,
Flag Attack, Cities) so players can switch modes from any screen — region
selection, in-game, and results — instead of only "← Back to Learning Mode".
Include a mid-game **Restart** button that returns to the mode's selection
screen.

## Nav contents

A shared `ModeNav` strip with five links:
- **Learning Mode** → `/`
- **Map Attack** → `/map-attack`
- **Flag Attack** → `/flag-attack`
- **Cities** → `/cities`
- **Manage Countries** → `/manage`

The current mode is highlighted. Styling matches the home page nav
(`bg-surface px-4 py-2`; links `text-sm text-muted hover:text-fg`; current
mode `text-fg font-semibold`).

## Component

`src/lib/components/ModeNav.svelte`
- Props:
  - `current: 'learning' | 'map-attack' | 'flag-attack' | 'cities' | 'manage'`
    — which link to highlight.
  - `onRestart?: () => void` — optional. When provided, the strip shows a
    "↻ Restart" button (right-aligned); when absent, no button.
- Uses `base` from `$app/paths` for links.

## Restart behavior

Each page already has `changeRegions()` (map/flag) or `changeCities()` (cities)
that sets `phase = 'setup'`. The page passes
`onRestart={phase !== 'setup' ? changeRegions : undefined}` so Restart appears
only mid-game (playing/results) and returns the player to that mode's selection
screen with current choices intact, ready to adjust and start again. No Restart
on the setup screen.

## Per-mode integration (map-attack, flag-attack, cities)

The strip is rendered in every phase; the standalone "← Back to Learning Mode"
links are removed (the strip's Learning Mode link replaces them). Mode `<h1>`
titles stay in the setup card; cities keeps its `(?)` About button.

- **Setup phase:** restructure the centered card layout
  (`min-h-screen flex items-center justify-center`) to
  `min-h-screen flex flex-col` → `<ModeNav current=… />` at top, then a
  `flex-1 flex items-center justify-center` wrapper around the existing card.
  Remove the card header's back link.
- **Playing phase:** `flex flex-col h-screen` → insert `<ModeNav current=…
  onRestart={changeX} />` as the first child, above the existing game HUD.
  Remove the HUD's back link; keep prompt / counter / lives / existing controls.
- **Results phase:** add the strip at top, above the map + overlay. Because the
  overlay (`absolute inset-0`) covers only the map area, the strip stays visible
  and clickable. Keep the overlay's Play Again / Change / Back buttons.

`current` = `'map-attack'`, `'flag-attack'`, `'cities'` respectively.

## Out of scope

- Home/learning page and `/manage` keep their existing headers (home already
  has these links; neither is a phased game mode).
- No data/logic/state changes — purely navigation/layout. Restart reuses the
  existing setup-phase transition.

## Verification

`npm run check` (0 errors), then drive the app in the browser:
- Strip shows on all three modes across setup, playing, and results.
- Each screen highlights the correct mode.
- Every link navigates correctly.
- Restart returns to setup mid-game; hidden on the setup screen.
- The results overlay does not cover the strip.
