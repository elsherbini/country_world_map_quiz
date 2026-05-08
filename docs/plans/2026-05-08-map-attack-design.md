# Map Attack Mode — Design

## Overview

A new game mode where players must identify every country in their selected regions by clicking directly on them on the map. Session-based challenge with 3 lives — no persistent progress between runs.

## Game Flow

**Route:** `/map-attack`

### Pre-game Screen
- Region selection chips (same 8 regions as /manage) with country counts per region
- Region colors used as chip active-state backgrounds
- At least one region must be selected to enable Start button
- Region selection persisted in localStorage under `'map-attack-regions'` key (separate from learning mode)

### Run Flow
1. Player clicks Start → map renders full world view
2. Game picks a random country from selected regions, displays prompt
3. Player zooms/pans freely, hovers to see country highlighting, clicks to answer
4. **Correct:** Country fills with its region color, progress increments, next random country picked from remaining
5. **Wrong:** Clicked country flashes red briefly, player loses a life, same country prompted again
6. **Win:** All countries in selected regions identified → victory screen
7. **Lose:** 3 lives lost → game over screen

### Results Screen
- Countries cleared / total count
- Map stays visible in background showing progress
- "Play Again" button (same regions, fresh run)
- "Change Regions" button (back to pre-game)
- Link back to main game

## Map Interaction

### Zoom/Pan
- D3 `d3.zoom()` behavior attached to the canvas
- Scroll wheel to zoom in/out, click-and-drag to pan
- Pinch-to-zoom on touch devices
- Zoom limits: min = full world view, max ≈ 630km extent (current stage 2)
- Smooth animated transitions via D3 zoom transform

### Hover Highlighting
- `d3.geoContains()` on mouse move to detect country under cursor
- Unclaimed country: brightened fill + thicker border
- Claimed country: subtle highlight effect (not a clickable target)
- Cursor changes to pointer when hovering unclaimed country

### Click Handling
- Clicks on claimed countries: ignored (no penalty)
- Clicks on ocean/empty space: ignored (no penalty)
- Only clicks on unclaimed countries count as answer attempts
- Clicks blocked during red flash animation (~500ms)

## Visual Design

### Map Rendering (per frame)
- Default countries: light gray fill, thin border
- Claimed countries: region-colored fill, thin border
- Hovered unclaimed country: brightened fill + thicker border
- Wrong answer: brief red flash on clicked country

### Region Colors (Tailwind 400-level)

| Region | Color | Hex |
|--------|-------|-----|
| North America | Teal | `#2dd4bf` |
| South America | Amber | `#fbbf24` |
| Europe | Blue | `#60a5fa` |
| Asia | Rose | `#fb7185` |
| Africa | Green | `#4ade80` |
| Oceania | Purple | `#c084fc` |
| Small Islands | Cyan | `#22d3ee` |
| City States | Orange | `#fb923c` |

### HUD (Top Bar)
- Dark semi-transparent background floating over map
- Left: prompt text ("Click on: **France**")
- Center: progress counter ("12 / 47")
- Right: 3 heart icons (red = remaining, gray outline = lost)

### Pre-game Screen
- Centered card layout
- Region chips with region colors and country counts

### Results Screen
- Centered card overlay on top of final map state
- Win: congratulatory message + stats
- Lose: "Game Over" + stats

## Architecture

### New Files
- `src/routes/map-attack/+page.svelte` — Pre-game setup, run, and results screens (state-driven view switching)
- `src/lib/components/MapAttackMap.svelte` — Map component with D3 zoom, hover detection, click-to-answer

### Shared Code (no changes)
- `src/lib/data/countries.ts` — `getCountryList()`, `getRegion()`, region types
- `src/lib/data/countries.json` — GeoJSON data
- `src/routes/+layout.svelte` — Layout with Toaster

### State Management
- All Map Attack state lives in `+page.svelte` — no new store file
- Run state: `phase` (`'setup' | 'playing' | 'results'`), `lives`, `claimedCountries` (Set of ISO codes), `currentTarget` (ISO code), `selectedRegions`
- Completely independent from learning mode's `game-state.ts`

### Navigation Changes
- Add Map Attack link to `src/routes/+page.svelte`
- Add Map Attack link to `src/routes/manage/+page.svelte`
