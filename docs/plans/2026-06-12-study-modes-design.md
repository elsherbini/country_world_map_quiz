# Study Modes (in-app learning) — Design

**Date:** 2026-06-12

## Summary

Add a **Study** phase to Map Attack, Flag Attack, and Cities so you can learn
the material directly in the app instead of cross-referencing a list in another
browser tab. Study uses the *same* region / population selection as the game,
lets you freely explore the map (hover/tap to reveal names, flags, populations),
and — for flags — shows every flag in your selection in a scrollable, searchable
browser. From study you can jump straight into the quiz with one click.

Named "Study" (not "learning mode") because the home route `/` already owns the
"Learning Mode" label in `ModeNav`.

## Goals

- Zero new selection UI: study reads the exact same persisted settings
  (regions, specific countries, population cutoffs, capitals) as the game.
- Tight study → quiz loop: one button to start the game with the same pool.
- Touch-friendly: everything reachable by tap (hover is an enhancement).
- Reuse the existing canvas map components with minimal, additive props.

## Options considered

- **Separate `/learn` routes** — rejected: duplicates the settings state and
  localStorage plumbing; a phase inside each page shares it for free.
- **Country name labels drawn on the Map Attack map** — rejected for v1:
  centroid labels on odd polygons (Norway, Chile, archipelagos) look wrong
  without polylabel-style placement; hover/tap reveal covers the need.
- **Flag-only flashcard deck** — rejected: the home route already does
  spaced-repetition flashcards; the gap is *browse/explore*, not another quiz.
- **City labels** — accepted (unlike country labels) because cities are points:
  label placement is trivial and population gives a natural priority order.

## Architecture

### Phase model (all three pages)

`Phase` gains a value: `'setup' | 'study' | 'playing' | 'results'`.

- Setup: a secondary **Study** button next to **Start** (same enabled-guard).
- Study screen: `ModeNav` (Restart → setup) + slim HUD with a hint, the pool
  count, and a **Start quiz** button that calls the existing `startGame()`.
- The map fills the rest of the screen as in playing phase.

### `MapAttackMap.svelte` (used by Map Attack + Flag Attack)

Additive props:

- `studyMode?: boolean` — when true, the click handler skips the
  resolve-subdivision-to-country branch (so clicking California pins
  "California", not "United States") and never consults `claimedCountries`.
- `onCountryHover?: (code: string | null, x: number, y: number) => void` —
  fired on every mousemove (container-relative coords) and with `null` on
  mouseleave. Pages use it to render a cursor-following tooltip.

Everything else (hover highlight, zoom, theming) already works untouched.

### `CitiesMap.svelte`

Additive props:

- `onCityHover?: (key: string | null, x: number, y: number) => void` — same
  contract as above.
- `showLabels?: boolean` — draws a label pass after the dots:
  eligible cities sorted by population desc (memoized `$derived`), skip
  off-screen points, greedy screen-space collision (measureText box, skip on
  overlap). Big cities label at world zoom; zooming in spreads the points so
  more labels fit. Text drawn with a `colors.sea` halo (strokeText) under a
  `colors.hoverBorder` fill for readability on land.

### New component: `FlagBrowser.svelte`

Full-screen modal (pattern copied from the cities About overlay):

- Props: `targets: { code; name; region }[]` (already filtered to selected
  regions + resolvable flag URL), `onClose`.
- Groups by region in `FLAG_REGIONS` order with sticky-ish headers and counts.
- Grid `repeat(auto-fill, minmax(150px, 1fr))`; each cell = lazy-loaded
  flagcdn SVG (fixed-height cell, object-contain) + name underneath.
- Search input filters by name across all groups.
- Clicking a flag opens the enlarge overlay (same pattern as the playing-phase
  flag zoom) with the name as caption — Escape / backdrop closes.

### Per-page study content

- **Map Attack**: tooltip = name. Pinned card (tap or click): name, region
  label, flag image via `getFlagUrl` when resolvable.
- **Flag Attack**: same map + tooltip; pinned card leads with a large flag,
  name underneath. HUD gains **All flags** (opens `FlagBrowser`); setup screen
  also gets a **Browse flags** text button. Pool = same filter as
  `startGame()` (selected regions ∩ has flag URL).
- **Cities**: tooltip = name + country + formatted population + ★ for
  capitals. Pinned card on click shows the same. HUD gains a **Names** toggle
  bound to `showLabels` (default on in study).

### Tooltip rendering

Pages own the tooltip: an absolutely-positioned, `pointer-events-none` div
inside the map container, offset from the cursor and clamped to the container
width, hidden when code/key is null. (Inline per page; content differs.)

## Edge cases

- Subdivision codes in study clicks: handled by `studyMode` skipping the
  country-resolution branch in `MapAttackMap.handleClick`.
- Flagless targets (Somaliland, N. Cyprus): excluded from the Flag Attack
  study pool exactly like the game pool; Map Attack pins just omit the flag.
- Touch: no hover events → tooltip simply never shows; tap-to-pin covers it.
- Theme switches mid-study: label colors come from the existing `colors`
  snapshot effect, so the label pass redraws correctly.

## Testing / verification

Manual via dev server: study button on each setup screen; hover tooltips and
tap-pinned cards on all three maps (incl. a US state with `us-states` on);
flag browser grouping/search/enlarge; city labels densifying on zoom;
Start quiz launches the game with the same pool; `npm run check` and
`npm run build` stay clean.
