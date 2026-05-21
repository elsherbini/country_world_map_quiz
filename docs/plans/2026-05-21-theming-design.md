# Theming: Light / Dark / High-Contrast

**Date:** 2026-05-21

## Goal

Add a light mode and a high-contrast mode to the geography game, and raise
contrast in general on the maps — country borders and the land/sea boundary.

The app is currently a fixed dark theme: page UI uses hardcoded Tailwind
`gray-*` / `blue-*` classes, and the three canvas map components (`GameMap`,
`CitiesMap`, `MapAttackMap`) draw with hardcoded hex colors.

## Theme model

Two independent axes, persisted separately in `localStorage`:

- **`mode`** — `'light'` or `'dark'`
- **`highContrast`** — `boolean`

They combine into one of four resolved theme keys written to
`<html data-theme="…">`: `dark`, `light`, `dark-hc`, `light-hc`.
High contrast layers on top of whichever mode is active.

A new reactive module `src/lib/theme.ts` (a `.svelte.ts` file so it can hold
`$state`) owns this:

```ts
export const theme = $state({ mode: 'dark', highContrast: false });
```

- **On load:** read `theme-mode` / `theme-contrast` from `localStorage`. If
  `theme-mode` is absent (first visit), fall back to
  `window.matchMedia('(prefers-color-scheme: dark)')`. Once the user picks a
  mode, the stored value wins permanently — the app does not keep following the
  OS after that.
- **On change:** an `$effect` (or explicit setters) writes both keys to
  `localStorage` and sets `document.documentElement.dataset.theme` to the
  resolved key.
- The resolved key comes from a pure function `resolveTheme(mode, highContrast)`.

The `theme` object being reactive lets each map component run an `$effect` that
re-snapshots colors and redraws when the theme changes.

## CSS token system

All colors become semantic CSS custom properties, defined once per theme in
`app.css`:

```css
[data-theme="dark"]     { --canvas:#0b0f1a; --surface:#1e2636; --fg:#fff; --border:#5b6678; … }
[data-theme="light"]    { --canvas:#f4f5f7; --surface:#fff;    --fg:#10131a; --border:#9aa3b2; … }
[data-theme="dark-hc"]  { --canvas:#000;    --surface:#000;    --fg:#fff;  --border:#fff; … }
[data-theme="light-hc"] { --canvas:#fff;    --surface:#fff;    --fg:#000;  --border:#000; … }
```

**UI tokens:** `canvas`, `surface`, `surface-2`, `fg`, `muted`, `accent`,
`accent-fg`, `border`, `success`, `danger`, `warning`.

**Map tokens:** `map-land`, `map-land-border`, `map-sea`, `map-lake`,
`map-hit`, `map-miss`, `map-claimed`, `map-claimed-hover`, `map-hover`,
`map-hover-border`, `map-cursor`.

A Tailwind `@theme` block maps these to utilities so `bg-canvas`, `text-muted`,
`border-default`, `bg-accent` work in every theme — no `dark:` variants needed;
the same class adapts.

### The contrast bump

This lives in the base palettes. Current dark theme: land `#6b7280` on sea
`#111827`, borders `#374151` (barely visible). New dark theme:

- **Land/sea:** lighter land (`~#8b94a5`) against a deeper sea (`#0b0f1a`) —
  wider luminance gap.
- **Borders:** `map-land-border` jumps from `#374151` to `~#cbd2de` at
  `lineWidth` ~0.75 so country outlines actually read.

**High contrast** goes maximal: `dark-hc` = near-white land on pure black with
pure-white 1px+ borders; `light-hc` = inverse. Hit/miss/claimed stay saturated
green/red and keep a contrasting outline so they stay distinct from land in
every mode.

## Map component theming

The three canvas maps currently hardcode hex values in their draw functions.
They will instead pull from the CSS tokens for a single source of truth.

- **Reading colors:** a helper in `theme.ts` — `getMapColors()` — calls
  `getComputedStyle(document.documentElement)` once and returns a typed object
  (`{ land, sea, border, hit, miss, … }`). Each map caches this in a local
  `$state` variable rather than calling `getComputedStyle` per animation frame
  (the game map animates at 60fps).
- **Staying in sync:** each map adds an `$effect` depending on the reactive
  `theme` object. On change it re-runs `getMapColors()`, updates the cache, and
  calls `drawMap()`. `data-theme` is set on `<html>` synchronously before the
  effect runs, so `getComputedStyle` returns the new values.
- **Sea handling:** today the canvas `clearRect`s and the page background shows
  through as "sea." That coupling is kept deliberately — `--map-sea` equals
  `--canvas` per theme — and lakes are drawn explicitly with `--map-lake` (same
  value). No visual change there beyond the new values.
- **GameMap's SVG cursor:** the blue cursor circle uses hardcoded
  `rgba(59,130,246,…)`. It becomes `var(--map-cursor)` with `fill-opacity` for
  the translucent fill, so it themes via CSS for free.

`checkHit` logic and projection math are untouched — this is purely a
color-source swap.

## Theme controls & flash prevention

### Flash prevention

This is a prerendered static site, so the first paint happens before any Svelte
code runs. To avoid a dark→light flash, a tiny inline `<script>` goes in
`app.html`'s `<head>`:

```js
(function () {
  var m = localStorage.getItem('theme-mode');
  var hc = localStorage.getItem('theme-contrast') === 'true';
  if (!m) m = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = m + (hc ? '-hc' : '');
})();
```

It runs synchronously before paint. `theme.ts` then reads the same
`localStorage` keys and takes over reactively — no conflict, since both compute
the same resolved key.

### Control component

A new `ThemeControls.svelte`, rendered once in `+layout.svelte`, fixed to the
bottom-right corner (`fixed bottom-3 right-3 z-50`). It contains two small
buttons:

- **Mode toggle** — sun / moon icon, flips `light` ⇄ `dark`.
- **Contrast toggle** — a contrast icon, toggles `highContrast`, with a clear
  active state.

Both use semantic tokens (`bg-surface`, `border-default`, `text-fg`) so the
control itself themes correctly. It sits clear of the Toaster (top-center) and
the map stats bar. Over the map canvas it uses a solid `bg-surface` chip with a
border and slight shadow so it stays legible over any map colors.

Buttons get `aria-label` and `aria-pressed` so the toggles are accessible.

## File-by-file changes

**New files:**

- `src/lib/theme.ts` — reactive `theme` state, `resolveTheme()`,
  `applyTheme()`, `getMapColors()`.
- `src/lib/components/ThemeControls.svelte` — the corner control.

**Modified — infrastructure:**

- `src/app.html` — inline anti-flash script.
- `src/app.css` — four `[data-theme]` palette blocks + `@theme` token mapping.
- `src/routes/+layout.svelte` — mount `ThemeControls`, initialize `theme.ts`.

**Modified — UI token swap** (replace hardcoded `gray-*` / `blue-*` / `red-*`
etc. with semantic utilities):

- `src/routes/+page.svelte`
- `src/routes/manage/+page.svelte`
- `src/routes/cities/+page.svelte`
- `src/routes/map-attack/+page.svelte`

**Modified — map color source swap:**

- `src/lib/components/GameMap.svelte`
- `src/lib/components/CitiesMap.svelte`
- `src/lib/components/MapAttackMap.svelte`

Each gets a cached `getMapColors()` snapshot, a theme `$effect` + redraw, and
the SVG cursor (GameMap only) switched to `var(--map-cursor)`.

## Out of scope (YAGNI)

- No per-page theme overrides.
- No live system-preference following after the first choice.
- No separate colorblind palette.
- No animated theme transitions.
- No new test framework.

## Verification

1. `npm run check` — must pass clean (svelte-check).
2. `npm run dev` — manually walk all four pages in all four themes (`dark`,
   `light`, `dark-hc`, `light-hc`): UI legibility, map land/sea/border
   contrast, hit/miss/claimed colors, cursor.
3. Reload mid-theme — confirm no flash and the choice persists.
4. Clear `localStorage`, set OS to light, reload — confirm the first visit
   follows the OS preference.
