# Cities Mode: Unified Regions, Capitals & Top-N-per-Country — Design

**Date:** 2026-06-10

## Summary

Rework the Cities game's selection model. Replace the population-tier filter
with:

1. **Region toggles** using the *same regions as Map Attack / Learning mode*
   (the unified `Region` type in `countries.ts`), not the old 6 continents.
2. A **searchable country multiselect** (additive to regions) for diving deep
   into individual countries.
3. A **Capitals toggle** — include every in-play country's capital regardless
   of population.
4. **Top-N per country + population cutoff** (global): each in-play country
   always contributes its most-populous city; cities ranked #2…N are included
   only if their population exceeds the cutoff.

This lets a player learn the 2 biggest cities of Cambodia while separately
diving into the top 20 cities of China — without flooding the game with 20
Chinese cities when they only wanted Cambodia's top 2.

## Goals

- Same region taxonomy across all modes.
- Per-country "importance" selection driven by real population data.
- Self-contained/static (data bundled), built from the existing WUP pipeline.

## Non-goals (YAGNI for v1)

- Per-country N/cutoff (global only; dive deep by selecting a single country).
- Backfilling micro-capitals below GHS coverage (~50k).
- Color-by-region map theming unless trivially consistent with Map Attack.

## Data

### Source

`cities.json` is already generated from **GHS-WUP-MTUC R2025A** (UN WUP 2025 +
EU JRC Global Human Settlement Layer) via `scripts/extract-cities-wup.py`. The
source `UC_STATS` sheet provides `POP`, `UNLocName` (country), `UCname` (city),
and **`Lat`/`Lon`**. WUP 2025 covers urban centres down to ~50k, so a 500k floor
is well within range; the current 246-city file is just the result of
`POP_THRESHOLD = 2_000_000`.

The xlsx is not in the repo. The build will download it from the JRC URL in the
script header (fall back to asking the user for a local copy if download fails).

### Pipeline changes (`scripts/extract-cities-wup.py`)

- Lower `POP_THRESHOLD` to **500,000**.
- Emit a per-city **`code`** (ISO_A3). Use a `country → ISO_A3` map (extend the
  existing `COUNTRY_MAP`); if the GHS sheet exposes an ISO column, prefer it.
- Emit **`isCapital`** boolean from a curated **`country → capital city name`**
  list (~195 entries) matched against GHS rows at build time.
- **Always-include rules baked into the bundle** so runtime rules always have
  data. Emitted set =
  `(all cities ≥500k) ∪ (each country's single most-populous city, any size) ∪
   (every curated capital found in GHS, any size)`.
- **Fail loudly** on any unmapped country or any curated capital not matched in
  GHS, rather than silently dropping data.
- Drop `continent` and `populationTier` from output.

### New per-city schema

```ts
interface CityData {
  name: string;
  country: string;   // common English name
  code: string;      // ISO_A3, for region resolution
  population: number;
  isCapital: boolean;
  lat: number;
  lon: number;
}
```

`region` is derived at runtime via `getRegion(code)` — not stored.

Estimated bundle: low-thousands of cities, a few hundred KB to ~1MB.

## Region model (`src/lib/data/cities.ts`)

- Remove `CityContinent`, `CITY_CONTINENTS`, `CONTINENT_COLORS`,
  `POPULATION_TIERS`, `POPULATION_TIER_LABELS`.
- Region toggles = the 8 non-subnational regions from `ALL_REGIONS`:
  `north-america, south-america, europe, asia, africa, oceania, small-islands,
  city-states`. Reuse `REGION_LABELS`.
- `getCityList()` resolves each city's `code` to a region via the existing
  `getRegion(code)` (same logic as Map Attack). Unresolved codes fall back to
  `small-islands` (already `getRegion`'s behavior); the build surfaces these so
  the country→code map can be fixed.
- `CityEntry` gains `code`, `region: Region`, `isCapital: boolean`; loses
  `continent`, `populationTier`.
- Map dot styling: match Map Attack's approach (uniform or region palette) for
  cross-mode consistency.

## Setup UI (`src/routes/cities/+page.svelte`)

Four controls:

1. **Region toggles** — 8 region pills (existing pill style) with live eligible
   counts under current settings.
2. **Country multiselect (searchable)** — text input filters all dataset
   countries; selections shown as removable chips. No new dependency (input +
   filtered checkbox list + chips). **Additive** to region toggles (union).
3. **Capitals toggle** — on/off.
4. **Top-N + cutoff** (global):
   - **N**: number stepper, default **5**, range 1–25.
   - **Cutoff**: minimum = 500k floor, default **1,000,000**. Number input or
     slider with a readable "> 1,000,000" label.

Keep the existing **"show country name"** toggle (more duplicate names at 500k).

A live summary ("Playing N cities across M countries") before Start.

**Persistence:** new settings shape
`{ regions: Record<Region,bool>, countries: string[] /*ISO*/, capitals: bool,
  topN: number, cutoff: number, showCountry: bool }`. Bump the localStorage key
(or add a version); ignore stale tier-based settings and load defaults.

## Eligible-set computation

A `$derived` from settings:

1. **In-play countries** = (countries whose region is toggled) ∪ (selected
   countries).
2. For each in-play country, cities sorted by population desc:
   - always include rank #1;
   - include ranks #2…N where `population > cutoff`.
3. If **capitals** on, add each in-play country's `isCapital` city.
4. Union; dedupe by `cityKey`.

## Game flow

Unchanged from current cities mode: shuffle eligible cities, 3 lives,
click-the-city, correct claims + advances, wrong flashes + costs a life, win
when all claimed. `findDuplicateNames` still decides whether to show country.

## Edge cases

- No selection → Start disabled (existing `anySelected` pattern).
- Capital missing from dataset (sub-coverage micro-capital) → silently absent;
  note in an About tooltip.
- N=1 → only each country's top city (cutoff irrelevant).
- Cutoff above a country's #2 city → that country contributes only #1 (+capital
  if toggled).
- Stale localStorage → ignored, defaults loaded.

## Verification

- Build: regenerate `cities.json`; assert counts (cities, countries, capitals
  flagged, min/max pop), no unmapped countries, no unmatched capitals.
- `npm run check` → 0 errors.
- Browser (drive the running app): region toggles + country search + capitals +
  N/cutoff produce expected eligible sets (spot-check Cambodia-top-2 vs
  China-top-20), map dots render at new density, claim/miss/win flow intact.
