# Regions & Toast Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a region/category system to the manage page with toggle chips, and fix/enhance svelte-sonner toast notifications on the game page.

**Architecture:** Static region mapping in `countries.ts` (override map + continent fallback). Region enabled/disabled state stored in `GameData` in localStorage. Manage page gets toggle chips above the country list. Toast notifications get bug fix, skip button on miss, and repositioning.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind CSS v4, svelte-sonner

---

### Task 1: Add Region Type and Mapping to countries.ts

**Files:**
- Modify: `src/lib/data/countries.ts`

**Step 1: Add the Region type, labels, and getRegion function**

Add below the existing `getCountryList` function:

```typescript
export type Region =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'asia'
  | 'africa'
  | 'oceania'
  | 'small-islands'
  | 'city-states';

export const REGION_LABELS: Record<Region, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  'europe': 'Europe',
  'asia': 'Asia',
  'africa': 'Africa',
  'oceania': 'Oceania',
  'small-islands': 'Small Islands',
  'city-states': 'City-states'
};

export const ALL_REGIONS: Region[] = [
  'north-america',
  'south-america',
  'europe',
  'asia',
  'africa',
  'oceania',
  'small-islands',
  'city-states'
];

const REGION_OVERRIDES: Record<string, Region> = {
  // Caribbean large islands -> North America
  CUB: 'north-america',
  HTI: 'north-america',
  DOM: 'north-america',
  JAM: 'north-america',
  BHS: 'north-america',
  PRI: 'north-america',
  // European islands / microstates -> Europe
  AND: 'europe',
  LIE: 'europe',
  ISL: 'europe',
  CYP: 'europe',
  MLT: 'europe',
  // Asian islands -> Asia
  SGP: 'asia',
  BRN: 'asia',
  TLS: 'asia',
  // African islands -> Africa
  CPV: 'africa',
  // City-states
  VAT: 'city-states',
  MCO: 'city-states',
  SMR: 'city-states',
  HKG: 'city-states',
  MAC: 'city-states',
  // Small island nations (Oceania except AUS/NZL/PNG)
  VUT: 'small-islands',
  FSM: 'small-islands',
  MHL: 'small-islands',
  MNP: 'small-islands',
  GUM: 'small-islands',
  ASM: 'small-islands',
  TON: 'small-islands',
  WSM: 'small-islands',
  PLW: 'small-islands',
  NIU: 'small-islands',
  COK: 'small-islands',
  NRU: 'small-islands',
  KIR: 'small-islands',
  TUV: 'small-islands',
  PYF: 'small-islands',
  NCL: 'small-islands',
  WLF: 'small-islands',
  PCN: 'small-islands',
  NFK: 'small-islands',
  FJI: 'small-islands',
  SLB: 'small-islands',
  // Caribbean small islands
  VIR: 'small-islands',
  AIA: 'small-islands',
  CYM: 'small-islands',
  BMU: 'small-islands',
  VGB: 'small-islands',
  TCA: 'small-islands',
  MSR: 'small-islands',
  SPM: 'small-islands',
  MAF: 'small-islands',
  BLM: 'small-islands',
  ABW: 'small-islands',
  CUW: 'small-islands',
  SXM: 'small-islands',
  TTO: 'small-islands',
  BRB: 'small-islands',
  GRD: 'small-islands',
  VCT: 'small-islands',
  LCA: 'small-islands',
  KNA: 'small-islands',
  DMA: 'small-islands',
  ATG: 'small-islands',
  // Indian Ocean / Seven seas / Atlantic islands
  SGS: 'small-islands',
  IOT: 'small-islands',
  SHN: 'small-islands',
  SYC: 'small-islands',
  MUS: 'small-islands',
  MDV: 'small-islands',
  COM: 'small-islands',
  MYT: 'small-islands',
  ATF: 'small-islands',
  HMD: 'small-islands',
  STP: 'small-islands',
  FLK: 'small-islands',
  // European crown dependencies / territories
  FRO: 'small-islands',
  ALA: 'small-islands',
  JEY: 'small-islands',
  GGY: 'small-islands',
  IMN: 'small-islands',
  // Greenland
  GRL: 'small-islands',
  // Antarctica
  ATA: 'small-islands',
};

const CONTINENT_TO_REGION: Record<string, Region> = {
  'North America': 'north-america',
  'South America': 'south-america',
  'Europe': 'europe',
  'Asia': 'asia',
  'Africa': 'africa',
  'Oceania': 'oceania',
  'Seven seas (open ocean)': 'small-islands',
  'Antarctica': 'small-islands'
};

export function getRegion(code: string): Region {
  if (REGION_OVERRIDES[code]) return REGION_OVERRIDES[code];
  const feature = countries.features.find((f) => {
    const c = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
    return c === code;
  });
  if (!feature) return 'small-islands';
  return CONTINENT_TO_REGION[feature.properties.CONTINENT] ?? 'small-islands';
}
```

**Step 2: Update getCountryList to include region**

Change the return type and add region:

```typescript
export function getCountryList(): { name: string; code: string; region: Region }[] {
  return countries.features
    .map((f) => ({
      name: f.properties.NAME,
      code: f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3,
      region: getRegion(
        f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3
      )
    }))
    .filter((c) => c.code !== '-99')
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

**Step 3: Verify it compiles**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: No errors in `countries.ts`. There may be errors in downstream files because `getCountryList` return type changed — that's expected and will be fixed in the next tasks.

**Step 4: Commit**

```bash
git add src/lib/data/countries.ts
git commit -m "feat: add region type, labels, and getRegion mapping to countries.ts"
```

---

### Task 2: Add Region Support to game-state.ts

**Files:**
- Modify: `src/lib/game-state.ts`

**Step 1: Import Region type and update GameData interface**

At the top, update the import:

```typescript
import { getCountryList, getRegion, type Region, ALL_REGIONS } from '$lib/data/countries';
```

Update `GameData`:

```typescript
export interface GameData {
  countries: Record<string, CountryState>;
  regions: Record<Region, boolean>;
}
```

**Step 2: Add default regions helper and update loadGameData**

Add a helper function:

```typescript
function defaultRegions(): Record<Region, boolean> {
  return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
}
```

Update `loadGameData` to handle migration (existing localStorage data without `regions` field):

```typescript
export function loadGameData(): GameData {
  if (typeof window === 'undefined') return { countries: {}, regions: defaultRegions() };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { countries: {}, regions: defaultRegions() };
  try {
    const parsed = JSON.parse(raw);
    return {
      countries: parsed.countries ?? {},
      regions: parsed.regions ?? defaultRegions()
    };
  } catch {
    return { countries: {}, regions: defaultRegions() };
  }
}
```

**Step 3: Add toggleRegion function**

```typescript
export function toggleRegion(data: GameData, region: Region): void {
  data.regions[region] = !data.regions[region];
  saveGameData(data);
}
```

**Step 4: Update selectNextCountry to filter by region**

In `selectNextCountry`, update the `eligible` filter:

```typescript
const eligible = Object.entries(data.countries).filter(
  ([code, state]) =>
    !state.skipped &&
    state.bucket >= 1 &&
    state.bucket <= MAX_BUCKET &&
    data.regions[getRegion(code)]
);
```

**Step 5: Update ensureMinBucket1 to respect region filtering**

In `ensureMinBucket1`, update `bucket1Count` to only count countries in enabled regions, and only add unseen countries from enabled regions:

```typescript
function ensureMinBucket1(data: GameData): void {
  const allCountries = getCountryList();
  const bucket1Count = Object.entries(data.countries).filter(
    ([code, c]) => c.bucket === 1 && !c.skipped && data.regions[getRegion(code)]
  ).length;

  if (bucket1Count < MIN_BUCKET_1_COUNT) {
    const unseenCodes = allCountries
      .filter((c) => !data.countries[c.code] && data.regions[c.region])
      .map((c) => c.code);

    const needed = MIN_BUCKET_1_COUNT - bucket1Count;
    const toAdd = shuffle(unseenCodes).slice(0, needed);

    for (const code of toAdd) {
      data.countries[code] = { bucket: 1, stage: 0, skipped: false };
    }
  }
}
```

**Step 6: Update resetAllCountries to also reset regions**

```typescript
export function resetAllCountries(data: GameData): void {
  data.countries = {};
  data.regions = defaultRegions();
  saveGameData(data);
}
```

**Step 7: Verify it compiles**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -30`
Expected: No errors in `game-state.ts`. May still have downstream errors in Svelte files.

**Step 8: Commit**

```bash
git add src/lib/game-state.ts
git commit -m "feat: add region filtering to game state with localStorage migration"
```

---

### Task 3: Update Manage Page with Region Toggle Chips

**Files:**
- Modify: `src/routes/manage/+page.svelte`

**Step 1: Update imports and add region handling**

Update the script block to import region utilities and add region toggle handler:

```typescript
import { base } from '$app/paths';
import { getCountryList, ALL_REGIONS, REGION_LABELS, type Region } from '$lib/data/countries';
import {
  loadGameData,
  toggleSkip,
  toggleRegion,
  resetCountry,
  resetAllCountries,
  type GameData,
  type CountryState
} from '$lib/game-state';

const countryList = getCountryList();
let gameData = $state<GameData>(loadGameData());
```

Add the region toggle handler:

```typescript
function handleToggleRegion(region: Region) {
  toggleRegion(gameData, region);
  gameData = loadGameData();
}
```

**Step 2: Compute region counts**

Add a derived value for region counts:

```typescript
let regionCounts = $derived.by(() => {
  const counts: Record<Region, number> = {} as Record<Region, number>;
  for (const r of ALL_REGIONS) counts[r] = 0;
  for (const c of countryList) counts[c.region] += 1;
  return counts;
});
```

**Step 3: Update the grouped derived to include region**

Update the type and mapping in the `grouped` derived:

```typescript
let grouped = $derived.by(() => {
  const groups: Record<Status, { name: string; code: string; region: Region; bucket: number | null }[]> = {
    active: [],
    skipped: [],
    retired: [],
    unseen: []
  };
  for (const c of countryList) {
    const status = getStatus(c.code);
    groups[status].push({ ...c, bucket: getBucket(c.code) });
  }
  return groups;
});
```

**Step 4: Add region toggle chips to the template**

After the header `<div>` and before the `{#each}` loop, add:

```svelte
<div class="flex flex-wrap gap-2 mb-6">
  {#each ALL_REGIONS as region}
    <button
      onclick={() => handleToggleRegion(region)}
      class="text-sm px-3 py-1 rounded-full transition-colors {gameData.regions[region]
        ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
    >
      {REGION_LABELS[region]} ({regionCounts[region]})
    </button>
  {/each}
</div>
```

**Step 5: Add region badge and dimming to country rows**

Update each country row to show region and dim disabled regions. Replace the inner content of the `{#each items as item}` loop:

```svelte
{#each items as item}
  <div
    class="flex items-center justify-between px-3 py-2 bg-gray-800 rounded {gameData.regions[item.region]
      ? ''
      : 'opacity-40'}"
  >
    <div>
      <span>{item.name}</span>
      {#if item.bucket !== null}
        <span class="text-xs text-gray-500 ml-2">Bucket {item.bucket}</span>
      {/if}
      <span class="text-xs text-gray-600 ml-2">{REGION_LABELS[item.region]}</span>
    </div>
    <div class="flex gap-2">
      <button
        onclick={() => handleToggleSkip(item.code)}
        class="text-xs px-2 py-1 rounded {status === 'skipped'
          ? 'bg-green-700 hover:bg-green-600'
          : 'bg-yellow-700 hover:bg-yellow-600'}"
      >
        {status === 'skipped' ? 'Unskip' : 'Skip'}
      </button>
      {#if status !== 'unseen'}
        <button
          onclick={() => handleReset(item.code)}
          class="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
        >
          Reset
        </button>
      {/if}
    </div>
  </div>
{/each}
```

**Step 6: Verify it compiles**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: No errors.

**Step 7: Commit**

```bash
git add src/routes/manage/+page.svelte
git commit -m "feat: add region toggle chips and region badges to manage page"
```

---

### Task 4: Fix Toast Skip Button and Add Skip to Miss Toast

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Investigate and fix the skip button bug**

The current `onClick` handler in the success toast:

```typescript
onClick: () => {
  const data = loadGameData();
  toggleSkip(data, answeredCode);
}
```

This should work — it loads fresh data and saves. The likely issue is that the toast auto-dismisses in 4 seconds (default), and clicking the action button dismisses it immediately, but the click handler does fire. The user may not see confirmation that the skip happened.

Fix approach: After toggling skip, show a confirmation toast. Also increase the duration so the button is easier to click.

Extract a helper function for the skip action to reuse on both success and error toasts:

```typescript
function skipAction(code: string, name: string): { label: string; onClick: () => void } {
  return {
    label: 'Skip in future',
    onClick: () => {
      const data = loadGameData();
      toggleSkip(data, code);
      toast.info(`${name} will be skipped`);
    }
  };
}
```

**Step 2: Update success toast to use the helper**

```typescript
toast.success(`Correct! ${countryName}`, {
  duration: 5000,
  action: skipAction(answeredCode, countryName)
});
```

**Step 3: Update miss toast to include skip button**

```typescript
toast.error(`Missed! Click on ${countryName} to continue`, {
  duration: 10000,
  action: skipAction(answeredCode, countryName)
});
```

**Step 4: Verify it compiles**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "fix: toast skip button now shows confirmation, add skip to miss toast"
```

---

### Task 5: Center Toast Position

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Change toast position**

Change `position="top-right"` to `position="top-center"`:

```svelte
<Toaster position="top-center" richColors />
```

**Step 2: Verify it compiles**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "fix: center toast notifications instead of top-right"
```

---

### Task 6: Manual Testing and Final Verification

**Step 1: Run the full type check**

Run: `cd /Users/jelsherbini/dev/geography_game && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors.

**Step 2: Build the project**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run build`
Expected: Build succeeds.

**Step 3: Test in browser**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run dev`

Manual checks:
- [ ] Game page loads, country is prompted
- [ ] Correct guess: toast appears centered with "Skip in future" button
- [ ] Click "Skip in future" on correct toast: confirmation toast appears, country is skipped
- [ ] Wrong guess: toast appears centered with "Skip in future" button
- [ ] Navigate to /manage: region toggle chips appear at top
- [ ] Click a region chip: it toggles off (gray), countries in that region are dimmed
- [ ] Click it again: toggles back on
- [ ] Reload page: region preferences are preserved
- [ ] With a region disabled: game doesn't quiz countries from that region
- [ ] "Reset All" button resets region toggles back to all-enabled
- [ ] Each country row shows its region label

**Step 4: Commit any fixes if needed**
