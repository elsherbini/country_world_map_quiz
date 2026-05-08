# Subnational Regions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add states/provinces for USA, China, India, and Canada as playable targets in both Map Attack and the main learning game.

**Architecture:** Download Natural Earth 10m admin-1 GeoJSON, extract features for 4 countries via a Node script, add 4 new region types, update both map components to render subdivision boundaries and resolve hover/click to subdivision level, update all pages to include subdivisions in target pools.

**Tech Stack:** SvelteKit, Svelte 5 runes, D3.js, Tailwind CSS, Node.js (extraction script)

---

### Task 1: Download Natural Earth admin-1 data and create extraction script

**Files:**
- Create: `scripts/extract-subdivisions.js`
- Create: `src/lib/data/subdivisions.json` (generated output)

**Step 1: Download the Natural Earth 10m admin-1 GeoJSON**

The file is at: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson

Download it to a temp location:

```bash
cd /Users/jelsherbini/dev/geography_game
mkdir -p scripts
curl -L -o /tmp/ne_10m_admin_1_states_provinces.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
```

This file is ~25MB. We only need features for US, CN, IN, CA.

**Step 2: Create the extraction script**

Create `scripts/extract-subdivisions.js`:

```javascript
#!/usr/bin/env node

// Extract subdivision features for target countries from Natural Earth admin-1 GeoJSON.
// Usage: node scripts/extract-subdivisions.js <input.geojson> <output.json>
//
// To add more countries later, add their ISO alpha-2 codes to TARGET_COUNTRIES.

import { readFileSync, writeFileSync } from 'fs';

const TARGET_COUNTRIES = ['US', 'CN', 'IN', 'CA'];

const inputPath = process.argv[2] || '/tmp/ne_10m_admin_1_states_provinces.geojson';
const outputPath = process.argv[3] || 'src/lib/data/subdivisions.json';

console.log(`Reading ${inputPath}...`);
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));

const filtered = data.features.filter((f) => {
  const iso_a2 = f.properties.iso_a2;
  return TARGET_COUNTRIES.includes(iso_a2);
});

// Strip unnecessary properties to reduce file size — keep only what we need
const stripped = filtered.map((f) => ({
  type: 'Feature',
  properties: {
    name: f.properties.name,
    iso_3166_2: f.properties.iso_3166_2,
    iso_a2: f.properties.iso_a2,
    admin: f.properties.admin,
    type_en: f.properties.type_en
  },
  geometry: f.geometry
}));

const output = {
  type: 'FeatureCollection',
  features: stripped
};

const json = JSON.stringify(output);
writeFileSync(outputPath, json);

console.log(`Wrote ${stripped.length} features to ${outputPath}`);
console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

// Print summary by country
for (const code of TARGET_COUNTRIES) {
  const count = stripped.filter((f) => f.properties.iso_a2 === code).length;
  console.log(`  ${code}: ${count} subdivisions`);
}
```

**Step 3: Run the extraction**

```bash
node scripts/extract-subdivisions.js
```

Expected output: something like 130+ features extracted for US, CN, IN, CA, file size ~2-4MB.

**Step 4: Verify the output is valid JSON and has expected structure**

```bash
node -e "const d = require('./src/lib/data/subdivisions.json'); console.log(d.features.length, 'features'); console.log(d.features[0].properties);"
```

Expected: Feature count and properties with name, iso_3166_2, iso_a2, admin, type_en fields.

**Step 5: Clean up the downloaded file**

```bash
rm /tmp/ne_10m_admin_1_states_provinces.geojson
```

**Step 6: Commit**

```bash
git add scripts/extract-subdivisions.js src/lib/data/subdivisions.json
git commit -m "feat: add subdivision GeoJSON data for US, CN, IN, CA"
```

---

### Task 2: Create subdivisions.ts data module

**Files:**
- Create: `src/lib/data/subdivisions.ts`

**Step 1: Create the module**

Create `src/lib/data/subdivisions.ts`:

```typescript
import subdivisionsGeoJSON from './subdivisions.json';
import type { FeatureCollection, Geometry } from 'geojson';

export interface SubdivisionProperties {
	name: string;
	iso_3166_2: string;
	iso_a2: string;
	admin: string;
	type_en: string;
	[key: string]: unknown;
}

export type SubdivisionsFC = FeatureCollection<Geometry, SubdivisionProperties>;

export const subdivisions: SubdivisionsFC = subdivisionsGeoJSON as unknown as SubdivisionsFC;

/** Get all subdivision features for a given parent country ISO alpha-2 code */
export function getSubdivisionFeatures(parentIsoA2: string) {
	return subdivisions.features.filter((f) => f.properties.iso_a2 === parentIsoA2);
}

/** Check if a code is a subdivision code (contains a hyphen, e.g. "US-TX") */
export function isSubdivisionCode(code: string): boolean {
	return code.includes('-');
}
```

**Step 2: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 3: Commit**

```bash
git add src/lib/data/subdivisions.ts
git commit -m "feat: add subdivisions data module with typed exports"
```

---

### Task 3: Update region system in countries.ts

**Files:**
- Modify: `src/lib/data/countries.ts`

**Step 1: Add 4 new subnational regions and remove REGION_COLORS**

Update the `Region` type to add the 4 new regions:

```typescript
export type Region =
	| 'north-america'
	| 'south-america'
	| 'europe'
	| 'asia'
	| 'africa'
	| 'oceania'
	| 'small-islands'
	| 'city-states'
	| 'us-states'
	| 'china-provinces'
	| 'india-states'
	| 'canada-provinces';
```

Update `REGION_LABELS` to add the new entries:

```typescript
export const REGION_LABELS: Record<Region, string> = {
	'north-america': 'North America',
	'south-america': 'South America',
	europe: 'Europe',
	asia: 'Asia',
	africa: 'Africa',
	oceania: 'Oceania',
	'small-islands': 'Small Islands',
	'city-states': 'City-states',
	'us-states': 'US States',
	'china-provinces': 'Chinese Provinces',
	'india-states': 'Indian States',
	'canada-provinces': 'Canadian Provinces'
};
```

**Remove** the entire `REGION_COLORS` export (lines 52-61).

Update `ALL_REGIONS` to include the new regions:

```typescript
export const ALL_REGIONS: Region[] = [
	'north-america',
	'south-america',
	'europe',
	'asia',
	'africa',
	'oceania',
	'small-islands',
	'city-states',
	'us-states',
	'china-provinces',
	'india-states',
	'canada-provinces'
];
```

**Step 2: Add subdivision region mapping and helper**

Add these after the `getRegion` function:

```typescript
/** Maps subnational region to parent country ISO alpha-2 code */
export const SUBNATIONAL_PARENT_ISO_A2: Partial<Record<Region, string>> = {
	'us-states': 'US',
	'china-provinces': 'CN',
	'india-states': 'IN',
	'canada-provinces': 'CA'
};

/** Maps parent country ISO alpha-2 code to subnational region */
const ISO_A2_TO_SUBNATIONAL_REGION: Record<string, Region> = {
	US: 'us-states',
	CN: 'china-provinces',
	IN: 'india-states',
	CA: 'canada-provinces'
};

/** All subnational region keys */
export const SUBNATIONAL_REGIONS: Region[] = [
	'us-states',
	'china-provinces',
	'india-states',
	'canada-provinces'
];

/** Get subnational region for a subdivision by its parent country ISO alpha-2 code */
export function getSubnationalRegion(isoA2: string): Region | undefined {
	return ISO_A2_TO_SUBNATIONAL_REGION[isoA2];
}
```

**Step 3: Add getSubdivisionList function**

Add this function (imports `subdivisions` from `./subdivisions`):

Add to the top imports:

```typescript
import { subdivisions } from './subdivisions';
```

Then add the function:

```typescript
export function getSubdivisionList(): { name: string; code: string; region: Region; parentCountryCode: string }[] {
	return subdivisions.features
		.map((f) => {
			const region = getSubnationalRegion(f.properties.iso_a2);
			if (!region) return null;
			// Find parent country's ISO_A3 code
			const parentFeature = countries.features.find((c) => {
				const props = c.properties as Record<string, unknown>;
				return props.ISO_A2 === f.properties.iso_a2 || props.ISO_A2_EH === f.properties.iso_a2;
			});
			const parentCode = parentFeature
				? (parentFeature.properties.ISO_A3_EH !== '-99' ? parentFeature.properties.ISO_A3_EH : parentFeature.properties.ISO_A3)
				: f.properties.iso_a2;
			return {
				name: f.properties.name,
				code: f.properties.iso_3166_2,
				region,
				parentCountryCode: parentCode
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}
```

**Important note:** The parent country ISO_A3 lookup via ISO_A2 may not work if the countries.json doesn't have an `ISO_A2` property. In that case, use a hardcoded mapping:

```typescript
const ISO_A2_TO_A3: Record<string, string> = {
	US: 'USA',
	CN: 'CHN',
	IN: 'IND',
	CA: 'CAN'
};
```

And simplify to:

```typescript
parentCountryCode: ISO_A2_TO_A3[f.properties.iso_a2] ?? f.properties.iso_a2
```

**Step 4: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 5: Commit**

```bash
git add src/lib/data/countries.ts
git commit -m "feat: add subnational regions and remove REGION_COLORS"
```

---

### Task 4: Update game-state.ts for subnational defaults

**Files:**
- Modify: `src/lib/game-state.ts`

**Step 1: Update defaultRegions to set subnational regions to false**

The current `defaultRegions()` sets all regions to `true`. Update it so the 4 subnational regions default to `false`:

```typescript
import { getCountryList, getSubdivisionList, getRegion, type Region, ALL_REGIONS, SUBNATIONAL_REGIONS } from '$lib/data/countries';
```

```typescript
function defaultRegions(): Record<Region, boolean> {
	return Object.fromEntries(
		ALL_REGIONS.map((r) => [r, !SUBNATIONAL_REGIONS.includes(r)])
	) as Record<Region, boolean>;
}
```

**Step 2: Update ensureMinBucket1 to include subdivisions**

The `ensureMinBucket1` function currently calls `getCountryList()` to find unseen codes. It needs to also include subdivisions. Update the function:

```typescript
function ensureMinBucket1(data: GameData): void {
	const allTargets = [
		...getCountryList(),
		...getSubdivisionList()
	];
	const bucket1Count = Object.entries(data.countries).filter(
		([code, c]) => c.bucket === 1 && !c.skipped && data.regions[getRegionForCode(code)]
	).length;

	if (bucket1Count < MIN_BUCKET_1_COUNT) {
		const unseenCodes = allTargets
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

We need a helper `getRegionForCode` that works for both country codes and subdivision codes. Add:

```typescript
import { isSubdivisionCode } from '$lib/data/subdivisions';
```

```typescript
function getRegionForCode(code: string): Region {
	if (isSubdivisionCode(code)) {
		const isoA2 = code.split('-')[0];
		return getSubnationalRegion(isoA2) ?? 'small-islands';
	}
	return getRegion(code);
}
```

Update the import to include `getSubnationalRegion`:

```typescript
import { getCountryList, getSubdivisionList, getRegion, getSubnationalRegion, type Region, ALL_REGIONS, SUBNATIONAL_REGIONS } from '$lib/data/countries';
```

**Step 3: Update selectNextCountry to use getRegionForCode**

In `selectNextCountry`, replace `data.regions[getRegion(code)]` with `data.regions[getRegionForCode(code)]`:

```typescript
const eligible = Object.entries(data.countries).filter(
	([code, state]) =>
		!state.skipped &&
		state.bucket >= 1 &&
		state.bucket <= MAX_BUCKET &&
		data.regions[getRegionForCode(code)]
);
```

**Step 4: Handle localStorage migration**

Existing users have a `regions` object without the new 4 keys. In `loadGameData`, ensure missing region keys are added with their defaults:

In the `loadGameData` function, after parsing, merge in any missing region keys:

```typescript
export function loadGameData(): GameData {
	if (typeof window === 'undefined') return { countries: {}, regions: defaultRegions() };
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return { countries: {}, regions: defaultRegions() };
	try {
		const parsed = JSON.parse(raw);
		// Merge defaults for any new regions missing from saved data
		const defaults = defaultRegions();
		const regions = { ...defaults, ...(parsed.regions ?? {}) };
		return {
			countries: parsed.countries ?? {},
			regions
		};
	} catch {
		return { countries: {}, regions: defaultRegions() };
	}
}
```

**Step 5: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 6: Commit**

```bash
git add src/lib/game-state.ts
git commit -m "feat: update game state for subnational regions with migration"
```

---

### Task 5: Update MapAttackMap.svelte for subdivisions

**Files:**
- Modify: `src/lib/components/MapAttackMap.svelte`

This is the largest task. The map needs to:
1. Draw subdivision boundaries on top of country polygons
2. Resolve hover to subdivision level
3. Use single green for claimed fills instead of REGION_COLORS
4. Handle click resolution (country-level vs subdivision-level targets)

**Step 1: Update imports and props**

Replace the imports:

```typescript
import {
	countries,
	type CountryProperties,
} from '$lib/data/countries';
import { subdivisions, type SubdivisionProperties, isSubdivisionCode } from '$lib/data/subdivisions';
```

Add a new prop for which subnational regions are active:

```typescript
let {
	targetCode = '',
	claimedCountries = new Set<string>(),
	activeSubnationalIsoA2s = [] as string[],
	onCountryClick
}: {
	targetCode?: string;
	claimedCountries?: Set<string>;
	activeSubnationalIsoA2s?: string[];
	onCountryClick?: (code: string) => void;
} = $props();
```

`activeSubnationalIsoA2s` is the list of parent ISO alpha-2 codes for active subnational regions (e.g. `['US', 'CN']`). The parent page computes this from the selected regions.

**Step 2: Update getFillColor to use single green**

```typescript
const CLAIMED_COLOR = '#4ade80';

function getFillColor(code: string): string {
	if (flashCode === code) return '#ef4444';
	if (claimedCountries.has(code)) {
		if (hoveredCode === code) return '#86efac'; // lighter green
		return CLAIMED_COLOR;
	}
	if (hoveredCode === code) return '#d1d5db';
	return '#9ca3af';
}
```

Remove the `lightenColor` function and the `REGION_COLORS` import.

**Step 3: Update drawMap to render subdivisions**

After drawing all country polygons, add a second pass for subdivision boundaries:

```typescript
function drawMap() {
	const ctx = canvasEl?.getContext('2d');
	if (!ctx) return;

	const proj = getTransformedProjection();
	const pathGen = d3.geoPath().projection(proj).context(ctx);

	ctx.clearRect(0, 0, width, height);

	// Pass 1: Draw country polygons
	for (const feature of countries.features) {
		const code = getCodeForFeature(feature);
		ctx.beginPath();
		pathGen(feature);
		ctx.fillStyle = getFillColor(code);
		ctx.fill();
		ctx.strokeStyle = getStrokeColor(code);
		ctx.lineWidth = getStrokeWidth(code);
		ctx.stroke();
	}

	// Pass 2: Draw subdivision boundaries on top
	if (activeSubnationalIsoA2s.length > 0) {
		for (const feature of subdivisions.features) {
			if (!activeSubnationalIsoA2s.includes(feature.properties.iso_a2)) continue;
			const code = feature.properties.iso_3166_2;
			ctx.beginPath();
			pathGen(feature);

			// If this subdivision is claimed or hovered, fill it
			if (claimedCountries.has(code) || hoveredCode === code || flashCode === code) {
				ctx.fillStyle = getFillColor(code);
				ctx.fill();
			}

			// Always draw subdivision borders (subtle)
			ctx.strokeStyle = '#6b7280';
			ctx.lineWidth = 0.3;
			ctx.stroke();
		}
	}
}
```

**Step 4: Update findCountryAtPoint for subdivision resolution**

Rename to `findTargetAtPoint` and check subdivisions first (most specific), then countries:

```typescript
function findTargetAtPoint(x: number, y: number): string | null {
	const proj = getTransformedProjection();
	const lonLat = proj.invert?.([x, y]);
	if (!lonLat) return null;

	// Check subdivisions first (most specific)
	if (activeSubnationalIsoA2s.length > 0) {
		for (const feature of subdivisions.features) {
			if (!activeSubnationalIsoA2s.includes(feature.properties.iso_a2)) continue;
			if (d3.geoContains(feature, lonLat)) {
				return feature.properties.iso_3166_2;
			}
		}
	}

	// Fall back to country level
	for (const feature of countries.features) {
		if (d3.geoContains(feature, lonLat)) {
			return getCodeForFeature(feature);
		}
	}
	return null;
}
```

**Step 5: Update handleMouseMove, handleClick to use findTargetAtPoint**

Replace all calls to `findCountryAtPoint` with `findTargetAtPoint`.

**Step 6: Update handleClick for country-level vs subdivision-level targets**

The click handler needs to account for the fact that if the target is "USA" (country), clicking on any state within the USA should count. If the target is "US-TX", only clicking Texas counts.

Update handleClick:

```typescript
function handleClick(e: MouseEvent) {
	if (clickBlocked) return;

	const rect = containerEl.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;
	const code = findTargetAtPoint(x, y);

	if (!code) return; // clicked ocean
	if (claimedCountries.has(code)) return; // already claimed

	// If clicked code is a subdivision but target is the parent country,
	// resolve to the country level
	if (isSubdivisionCode(code) && !isSubdivisionCode(targetCode)) {
		const parentIsoA2 = code.split('-')[0];
		// Find the parent country code
		const parentCountryCode = findCountryCodeAtPoint(x, y);
		if (parentCountryCode && parentCountryCode === targetCode) {
			onCountryClick?.(targetCode);
			return;
		}
		if (parentCountryCode && !claimedCountries.has(parentCountryCode)) {
			onCountryClick?.(parentCountryCode);
			return;
		}
	}

	onCountryClick?.(code);
}
```

Add a helper that only checks country-level:

```typescript
function findCountryCodeAtPoint(x: number, y: number): string | null {
	const proj = getTransformedProjection();
	const lonLat = proj.invert?.([x, y]);
	if (!lonLat) return null;
	for (const feature of countries.features) {
		if (d3.geoContains(feature, lonLat)) {
			return getCodeForFeature(feature);
		}
	}
	return null;
}
```

**Step 7: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 8: Commit**

```bash
git add src/lib/components/MapAttackMap.svelte
git commit -m "feat: update MapAttackMap for subdivision rendering and hit detection"
```

---

### Task 6: Update /map-attack page for subdivisions

**Files:**
- Modify: `src/routes/map-attack/+page.svelte`

**Step 1: Update imports — remove REGION_COLORS, add subdivision helpers**

```typescript
import {
	getCountryList,
	getSubdivisionList,
	ALL_REGIONS,
	REGION_LABELS,
	SUBNATIONAL_PARENT_ISO_A2,
	type Region
} from '$lib/data/countries';
```

**Step 2: Update countryList and nameByCode to include subdivisions**

```typescript
const countryList = getCountryList();
const subdivisionList = getSubdivisionList();
const allTargets = [...countryList, ...subdivisionList];
const nameByCode = Object.fromEntries(allTargets.map((c) => [c.code, c.name]));
```

**Step 3: Compute activeSubnationalIsoA2s from selected regions**

```typescript
let activeSubnationalIsoA2s = $derived(
	Object.entries(SUBNATIONAL_PARENT_ISO_A2)
		.filter(([region]) => selectedRegions[region as Region])
		.map(([, isoA2]) => isoA2 as string)
);
```

**Step 4: Update regionCounts to include subdivisions**

```typescript
let regionCounts = $derived.by(() => {
	const counts: Record<Region, number> = {} as Record<Region, number>;
	for (const r of ALL_REGIONS) counts[r] = 0;
	for (const c of countryList) counts[c.region] += 1;
	for (const s of subdivisionList) counts[s.region] += 1;
	return counts;
});
```

**Step 5: Update startGame to use allTargets**

```typescript
function startGame() {
	eligibleCountries = allTargets
		.filter((c) => selectedRegions[c.region])
		.map((c) => c.code);
	remainingCountries = shuffle([...eligibleCountries]);
	claimedCountries = new Set();
	lives = MAX_LIVES;
	won = false;
	currentTarget = remainingCountries.pop() ?? null;
	phase = 'playing';
}
```

**Step 6: Update chip styling to use single accent color**

Replace the region chip style that uses `REGION_COLORS[region]` with a single blue accent:

```svelte
<button
	onclick={() => toggleRegion(region)}
	class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
		{selectedRegions[region]
			? 'bg-blue-600 border-blue-600 text-white'
			: 'bg-transparent border-gray-600 text-gray-400'}"
>
	{REGION_LABELS[region]} ({regionCounts[region]})
</button>
```

Remove the `style` attribute entirely — use Tailwind classes instead.

**Step 7: Pass activeSubnationalIsoA2s to MapAttackMap**

In the playing and results phases, pass the new prop:

```svelte
<MapAttackMap
	bind:this={mapComponent}
	targetCode={currentTarget ?? ''}
	{claimedCountries}
	{activeSubnationalIsoA2s}
	onCountryClick={handleCountryClick}
/>
```

And in the results phase:

```svelte
<MapAttackMap
	targetCode=""
	{claimedCountries}
	{activeSubnationalIsoA2s}
/>
```

**Step 8: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 9: Commit**

```bash
git add src/routes/map-attack/+page.svelte
git commit -m "feat: update map-attack page for subdivisions and single accent color"
```

---

### Task 7: Update GameMap.svelte for subdivisions in learning mode

**Files:**
- Modify: `src/lib/components/GameMap.svelte`

**Step 1: Add subdivision imports and props**

Add imports:

```typescript
import { subdivisions, type SubdivisionProperties, isSubdivisionCode } from '$lib/data/subdivisions';
```

Add a new prop:

```typescript
let {
	zoomStage = 0,
	targetCode = '',
	activeSubnationalIsoA2s = [] as string[],
	onClickResult,
	onRetryComplete
}: {
	zoomStage?: number;
	targetCode?: string;
	activeSubnationalIsoA2s?: string[];
	onClickResult?: (hit: boolean) => void;
	onRetryComplete?: () => void;
} = $props();
```

**Step 2: Update computeParams to handle subdivision targets**

When the target is a subdivision code (contains `-`), look up the feature from `subdivisions` instead of `countries`:

Add a helper to find the target feature regardless of type:

```typescript
function findTargetFeature(code: string) {
	if (isSubdivisionCode(code)) {
		return subdivisions.features.find((f) => f.properties.iso_3166_2 === code);
	}
	return countries.features.find((f) => getCodeForFeature(f) === code);
}
```

In `computeParams`, replace:
```typescript
const targetFeature = countries.features.find((f) => getCodeForFeature(f) === code);
```
with:
```typescript
const targetFeature = findTargetFeature(code);
```

Also update the `checkHit` function similarly:
```typescript
const targetFeature = findTargetFeature(targetCode);
```

And in `handleClick` where it does `countries.features.find(...)` for the retry mode, also use `findTargetFeature`.

**Step 3: Add subdivision zoom stage**

For subdivisions, the zoom should be tighter. Add a zoom stage helper that accounts for smaller entities. In `computeParams`, when computing `kmExtent` for stages, if the target is a subdivision, use smaller extents:

```typescript
if (isSubdivisionCode(code)) {
	// Tighter zoom for subdivisions
	kmExtent = stage === 0 ? 2000 : stage === 1 ? 630 : 200;
} else {
	kmExtent = stage === 1 ? 2000 : 630;
}
```

**Step 4: Update drawMap to render subdivision boundaries**

After the main country drawing loop, add subdivision drawing:

```typescript
// Draw subdivision boundaries on top
if (activeSubnationalIsoA2s.length > 0) {
	for (const feature of subdivisions.features) {
		if (!activeSubnationalIsoA2s.includes(feature.properties.iso_a2)) continue;
		ctx.beginPath();
		pathGen(feature);
		const code = feature.properties.iso_3166_2;
		if (highlightCode === code) {
			ctx.fillStyle = highlightHit ? '#22c55e' : '#ef4444';
			ctx.fill();
		}
		ctx.strokeStyle = '#6b7280';
		ctx.lineWidth = 0.3;
		ctx.stroke();
	}
}
```

**Step 5: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 6: Commit**

```bash
git add src/lib/components/GameMap.svelte
git commit -m "feat: update GameMap for subdivision rendering and hit detection"
```

---

### Task 8: Update main game page for subdivisions

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Update imports and data**

Add subdivision list to the name lookup:

```typescript
import { getCountryList, getSubdivisionList, SUBNATIONAL_PARENT_ISO_A2, type Region } from '$lib/data/countries';

const countryList = getCountryList();
const subdivisionList = getSubdivisionList();
const allTargets = [...countryList, ...subdivisionList];
const nameByCode = Object.fromEntries(allTargets.map((c) => [c.code, c.name]));
```

**Step 2: Compute activeSubnationalIsoA2s from game data regions**

```typescript
let activeSubnationalIsoA2s = $derived(
	Object.entries(SUBNATIONAL_PARENT_ISO_A2)
		.filter(([region]) => gameData.regions[region as Region])
		.map(([, isoA2]) => isoA2 as string)
);
```

**Step 3: Pass to GameMap**

```svelte
<GameMap
	bind:this={mapComponent}
	{zoomStage}
	targetCode={currentCode ?? ''}
	{activeSubnationalIsoA2s}
	onClickResult={handleClickResult}
	onRetryComplete={handleRetryComplete}
/>
```

**Step 4: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: pass subdivision data to GameMap in learning mode"
```

---

### Task 9: Update /manage page to show subdivisions

**Files:**
- Modify: `src/routes/manage/+page.svelte`

**Step 1: Update to include subdivisions in the list**

```typescript
import { getCountryList, getSubdivisionList, ALL_REGIONS, REGION_LABELS, type Region } from '$lib/data/countries';

const countryList = getCountryList();
const subdivisionList = getSubdivisionList();
const allTargets = [...countryList, ...subdivisionList];
```

**Step 2: Update regionCounts to include subdivisions**

```typescript
let regionCounts = $derived.by(() => {
	const counts: Record<Region, number> = {} as Record<Region, number>;
	for (const r of ALL_REGIONS) counts[r] = 0;
	for (const c of allTargets) counts[c.region] += 1;
	return counts;
});
```

**Step 3: Update grouped to use allTargets**

Replace `countryList` with `allTargets` in the grouped derivation:

```typescript
for (const c of allTargets) {
	const status = getStatus(c.code);
	groups[status].push({ ...c, bucket: getBucket(c.code) });
}
```

**Step 4: Verify build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

**Step 5: Commit**

```bash
git add src/routes/manage/+page.svelte
git commit -m "feat: show subdivisions in manage page"
```

---

### Task 10: Final verification and build

**Step 1: Run type check**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run check
```

Expected: 0 errors

**Step 2: Run production build**

```bash
cd /Users/jelsherbini/dev/geography_game && npm run build
```

Expected: Clean build

**Step 3: Test manually with dev server**

```bash
npm run dev
```

Test:
1. /manage — verify new region chips appear for US States, Chinese Provinces, Indian States, Canadian Provinces with correct counts
2. /map-attack — toggle subnational regions, verify subdivision boundaries appear on map, verify clicking states works
3. Main game — toggle on a subnational region in /manage, verify subdivisions appear in the game

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address subnational regions testing issues"
```
