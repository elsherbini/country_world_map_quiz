# Regions & Toast Fixes Design

## Overview

Two related improvements to the geography game:
1. Add a region/category system to the manage page so users can include/exclude groups of countries
2. Fix and enhance the svelte-sonner toast notifications on the game page

## Region System

### Categories

Each country belongs to exactly one category. Eight categories total:

| Category | Key | Criteria |
|---|---|---|
| North America | `north-america` | Continent = North America. Includes Cuba, Haiti, DR, Jamaica, Bahamas, Puerto Rico. |
| South America | `south-america` | Continent = South America (minus Falkland Is. which goes to Small islands) |
| Europe | `europe` | Continent = Europe. Includes Andorra, Liechtenstein, Iceland, Cyprus, Malta. |
| Asia | `asia` | Continent = Asia. Includes Singapore, Brunei, Timor-Leste, Palestine. Excludes Hong Kong and Macao (City-states). |
| Africa | `africa` | Continent = Africa. Includes Cabo Verde, W. Sahara, Madagascar. |
| Oceania | `oceania` | Australia, New Zealand, Papua New Guinea only. |
| Small island nations | `small-islands` | All remaining island countries and territories (Caribbean small islands, Pacific islands, Indian Ocean islands, Atlantic islands, European crown dependencies, uninhabited territories). |
| City-states | `city-states` | Vatican, Monaco, San Marino, Hong Kong, Macao. |

### Override Logic

Countries are categorized by:
1. Check a hand-curated overrides map (ISO A3 code → region)
2. Fall back to continent field in GeoJSON data

Overrides needed for:
- **→ `north-america`**: CUB, HTI, DOM, JAM, BHS, PRI
- **→ `europe`**: AND, LIE, ISL, CYP, MLT
- **→ `asia`**: SGP, BRN, TLS
- **→ `africa`**: CPV
- **→ `city-states`**: VAT, MCO, SMR, HKG, MAC
- **→ `small-islands`**: All remaining Oceania (except AUS, NZL, PNG), all "Seven seas" countries, Antarctica, plus the territories/dependencies that are currently categorized under other continents (FLK, GRL, FRO, ALA, JEY, GGY, IMN, etc.)

Everything not in overrides uses its Natural Earth CONTINENT field mapped to the region key.

### Data Model

```typescript
type Region = 'north-america' | 'south-america' | 'europe' | 'asia' | 'africa' | 'oceania' | 'small-islands' | 'city-states';

const REGION_LABELS: Record<Region, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  'europe': 'Europe',
  'asia': 'Asia',
  'africa': 'Africa',
  'oceania': 'Oceania',
  'small-islands': 'Small Islands',
  'city-states': 'City-states',
};
```

### GameData Changes

Add `regions` field to `GameData`:

```typescript
interface GameData {
  countries: Record<string, CountryState>;
  regions: Record<Region, boolean>; // true = enabled
}
```

Migration: if `regions` field is missing when loading from localStorage, default all to `true`.

### Game Logic Changes

`selectNextCountry()` filters out countries whose region is disabled, in addition to existing `skipped` check.

### New Functions

- `toggleRegion(data: GameData, region: Region): void` — flips the boolean and saves
- `getRegion(code: string): Region` — returns the region for a country code

### `getCountryList()` Changes

Returns `{ name: string; code: string; region: Region }[]` (adding region to existing return type).

## Manage Page UI

### Region Toggle Chips

A horizontal row of clickable chips/pills below the header, above the country list.

Each chip displays: `{Region Label} ({count})`

- **Enabled state**: Solid blue/primary background, white text
- **Disabled state**: Gray/dim background, muted text
- Clicking toggles the region on/off
- Changes are immediately persisted to localStorage

### Country List Updates

- Each country row now shows its region as a small tag/badge
- Countries in disabled regions appear visually dimmed
- The existing status grouping (active, skipped, retired, unseen) remains

## Toast Fixes

### 1. Fix Skip Button Bug

The success toast "Skip in future" action button doesn't work. The handler:

```typescript
onClick: () => {
  const data = loadGameData();
  toggleSkip(data, answeredCode);
}
```

This looks correct — loads fresh data, toggles skip, saves. Need to investigate if svelte-sonner's action callback has a known issue (e.g., the toast dismisses before the click registers, or the callback scope is lost). May need to restructure as a custom toast component or use a different callback pattern.

### 2. Add Skip Button to Miss Toast

Add the same "Skip in future" action to `toast.error()` for wrong guesses.

### 3. Center Toasts

Change `<Toaster position="top-right">` to `position="top-center"` in `+layout.svelte`.

## Files Changed

| File | Change |
|---|---|
| `src/lib/data/countries.ts` | Add Region type, getRegion(), update getCountryList() |
| `src/lib/game-state.ts` | Add regions to GameData, toggleRegion(), update selectNextCountry(), migration |
| `src/routes/manage/+page.svelte` | Add region toggle chips, show region badges on countries |
| `src/routes/+page.svelte` | Fix skip button, add skip to miss toast |
| `src/routes/+layout.svelte` | Change toast position to top-center |
