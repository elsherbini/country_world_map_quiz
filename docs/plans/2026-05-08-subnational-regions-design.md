# Subnational Regions — Design

## Overview

Add states/provinces for USA, China, India, and Canada as playable targets in both Map Attack and the main learning game. Each country's subdivisions are a new region category, toggled off by default in the main game.

## Data

**GeoJSON source:** Natural Earth 10m Admin 1 – States, Provinces. Download the full file, extract features for USA, China, India, and Canada into a single `subdivisions.json` file (~2-3MB).

**Feature properties used from Natural Earth admin-1:**
- `name` — Display name (e.g. "Texas", "Ontario")
- `iso_3166_2` — ISO code (e.g. "US-TX", "CA-ON")
- `admin` — Parent country name
- `iso_a2` — Parent country ISO alpha-2 (e.g. "US", "CN", "IN", "CA")
- Geometry polygons for rendering and hit detection

**New data file:** `src/lib/data/subdivisions.json`

**Extraction script:** `scripts/extract-subdivisions.js` — Node script that reads the full Natural Earth admin-1 GeoJSON and filters to target country codes. Checked into repo for easy future additions.

**Code identifiers:** ISO 3166-2 codes (e.g. `US-TX`, `CN-BJ`, `IN-MH`, `CA-ON`). No collisions with existing ISO 3166-1 alpha-3 country codes.

## Region System Changes

**New regions:**
- `'us-states'`
- `'china-provinces'`
- `'india-states'`
- `'canada-provinces'`

Added to `Region` type, `ALL_REGIONS`, `REGION_LABELS`.

**REGION_COLORS removed.** All claimed fills in Map Attack use a single green (`#4ade80`). Setup screen chips use a single accent color for active state.

**Subdivision counts:**
- US States: ~51 (50 states + DC)
- Canadian Provinces: ~13 (10 provinces + 3 territories)
- Chinese Provinces: ~34
- Indian States: ~36
- Total: ~134 new targets

**Default state:** All four subnational regions default to `false` (toggled off) in the main game. In Map Attack, they follow user selection.

**Mapping subdivisions to parent countries:** A lookup from region to parent country code (e.g. `'us-states' → 'USA'`). Needed for rendering — determines which country polygon gets subnational overlays.

## Rendering & Hit Detection

**Subdivision boundaries** are drawn as subtle inner lines on top of the parent country polygon whenever any subnational region is toggled on.

**Map rendering order (per frame):**
1. Draw all country polygons (same as now)
2. Draw subdivision polygons on top with thinner, lighter borders

**Hit detection depends on the current target:**
- **Target is a country (e.g. "United States"):** `d3.geoContains()` against the country polygon. Subdivision lines are cosmetic.
- **Target is a subdivision (e.g. "Texas"):** `d3.geoContains()` against the subdivision polygon. Clicking a different state within the same country is a wrong answer.

**Map Attack hover:** Resolves to the most specific level. If subdivisions are loaded for a country, hovering highlights individual states, not the whole country.

**Learning mode zoom stages:** Subdivisions are smaller than countries, so add tighter zoom (~200km extent) for subdivision targets.

## Architecture Changes

### New Files
- `src/lib/data/subdivisions.json` — Extracted GeoJSON for USA, China, India, Canada
- `src/lib/data/subdivisions.ts` — Import, type, and export the subdivisions FeatureCollection. Helper to get features by parent country code.
- `scripts/extract-subdivisions.js` — Extraction script

### Modified Files

**`src/lib/data/countries.ts`:**
- Add 4 new regions to `Region` type, `ALL_REGIONS`, `REGION_LABELS`
- Remove `REGION_COLORS`
- Add `getSubdivisionList()` returning `{ name, code, region, parentCountryCode }[]`
- Add `SUBDIVISION_PARENT_CODES` mapping

**`src/lib/components/MapAttackMap.svelte`:**
- Draw subdivision boundaries on top of country polygons
- Hover resolves to subdivision level when applicable
- Claimed fill changed to single green (`#4ade80`)
- Remove `REGION_COLORS` usage

**`src/lib/components/GameMap.svelte`:**
- Draw subdivision boundaries when subnational regions active
- Adjust zoom stages for subdivision targets (tighter zoom ~200km)

**`src/routes/map-attack/+page.svelte`:**
- Merge country + subdivision lists for target pool
- Hit detection branches on country vs subdivision target
- Chip styling uses single accent color instead of per-region colors

**`src/routes/+page.svelte`:**
- Pass subdivision data to GameMap when subnational regions active

**`src/routes/manage/+page.svelte`:**
- Show subdivisions grouped under their subnational region
- Same skip/reset controls

**`src/lib/game-state.ts`:**
- No structural changes. Subdivision codes (e.g. `US-TX`) go in same `countries` record
- Default subnational regions to `false`
