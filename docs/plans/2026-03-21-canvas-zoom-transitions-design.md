# Canvas Rendering with Smooth Zoom Transitions

## Goal

Replace the SVG-based map with canvas rendering and smooth animated transitions between zoom levels. Upgrade map data from 110m to 50m resolution.

## Architecture

### Layered rendering

- `<canvas>` — all map rendering (country paths, click result circles, country highlights)
- `<svg>` overlay — pointer cursor circle only (lightweight, no map redraws)
- `<div>` overlay — captures mouse/click events

### Canvas draw triggers

- Zoom transition animation frames (~500ms)
- Click result (once)
- Window resize

## Zoom Transition Flow

1. User clicks → canvas draws click circle at `[lon, lat]`, highlights country green/red, toast appears
2. Next question prompt updates immediately at top
3. 1 second delay (user sees their answer)
4. 500ms smooth animation — projection params interpolate from current to next view
5. Previous click circle stays anchored to geographic position during animation
6. Animation completes → clickable again, previous click circle clears, cursor reappears

## Animation

Use `requestAnimationFrame` with `d3.interpolate` on projection parameters (scale, rotate, translate). Eased with cubic in-out. On each frame: interpolate params, rebuild projection, clear canvas, redraw all paths + click circle.

Projection stays `geoNaturalEarth1` throughout. World view uses `fitExtent`, zoomed views use `.rotate()` / `.scale()` / `.translate()` / `.clipExtent()`.

## Data

Replace Natural Earth 110m with 50m (`ne_50m_admin_0_countries.geojson`, ~2.5MB). Typed accessor module unchanged.

## Zoom Stages

| Stage | View | Area | degExtent |
|-------|------|------|-----------|
| 0 | World | Full globe | fitExtent |
| 1 | Regional | ~4M km² (2000x2000km) | ~18° |
| 2 | Local | ~400k km² (630x630km) | ~5.7° |
| 3 | Random | Pick from 0, 1, or 2 | varies |

## Click Circle Storage

Store `{ lonLat: [number, number], hit: boolean }` in geographic coordinates. On each canvas draw, project to pixels via `projection(lonLat)`.

## Component State

- `projParams: { scale, rotate, translate, clipExtent }` — current projection parameters
- `targetParams` — animation target
- `animating: boolean` — blocks clicks during transitions
- `clickGeo: { lonLat, hit } | null` — geographic click result
- `highlightCode / highlightHit` — country highlight state

## Files Modified

- `src/lib/data/countries.json` — replace with 50m data
- `src/lib/components/GameMap.svelte` — rewrite to canvas + SVG overlay
- `src/routes/+page.svelte` — add 1s delay before triggering zoom transition
