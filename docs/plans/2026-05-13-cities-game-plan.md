# Cities Game Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/cities` route that quizzes players on world cities (1M+ population) with Map Attack-style gameplay, continent/population filters, and a dot/boundary rendering toggle.

**Architecture:** Build-time Node script parses wiki markup + GeoJSON to produce `cities.json`. New `cities.ts` data module provides types and helpers. New `CitiesMap.svelte` canvas component renders city dots or polygons over country outlines. New `/cities` page manages setup/playing/results phases.

**Tech Stack:** SvelteKit, Svelte 5 runes, D3.js (geoNaturalEarth1, zoom, geoContains, geoCentroid), Canvas API, Node.js (build script)

---

### Task 1: Build-time extraction script

**Files:**
- Create: `scripts/extract-cities.js`
- Read: `docs/cities.md`
- Input: GeoJSON downloaded to `/tmp/geojson-world-cities/cities.geojson` (gitignored)
- Output: `src/lib/data/cities.json`

**Step 1: Download the cities GeoJSON**

The raw file from GitHub. Save to `/tmp/` so it's not committed.

```bash
curl -L -o /tmp/cities.geojson "https://raw.githubusercontent.com/drei01/geojson-world-cities/master/cities.geojson"
```

Note: This file is large (~200MB). Only needs to be downloaded once.

**Step 2: Write the extraction script**

Create `scripts/extract-cities.js`:

```javascript
#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const citiesMdPath = resolve(__dirname, '../docs/cities.md');
const geojsonPath = process.argv[2] || '/tmp/cities.geojson';
const outputPath = resolve(__dirname, '../src/lib/data/cities.json');

// --- Parse cities.md ---
// Format per city (7-line block):
// |-
// |''[[CityName]]'' or |[[CityName|DisplayName]] etc.
// |{{Flagu|Country}}
// | align="right" |1,234,567
// |Continent
// |Year<refs>
// |City definition

console.log('Parsing cities.md...');
const md = readFileSync(citiesMdPath, 'utf-8');
const lines = md.split('\n');

const cities = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() !== '|-') continue;

  // City name line
  const nameLine = lines[i + 1];
  if (!nameLine || !nameLine.startsWith('|')) continue;

  // Country line
  const countryLine = lines[i + 2];
  if (!countryLine) continue;

  // Population line
  const popLine = lines[i + 3];
  if (!popLine) continue;

  // Continent line
  const continentLine = lines[i + 4];
  if (!continentLine) continue;

  // Extract city name: strip wiki markup
  // Patterns: |''[[Name]]'', |'''[[Name]]''', |'''''[[Name]]''''', |[[Name|Display]]
  let cityName = nameLine.replace(/^\|/, '').trim();
  cityName = cityName.replace(/'{2,5}/g, ''); // strip bold/italic markers
  const linkMatch = cityName.match(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/);
  if (linkMatch) {
    cityName = linkMatch[2] || linkMatch[1]; // prefer display name
    // Strip any remaining wiki markup from display name
    cityName = cityName.replace(/'{2,5}/g, '').trim();
  }
  // Remove state/qualifier from link target (e.g., "Jacksonville, Florida" -> use display "Jacksonville")
  // Already handled by preferring display name above

  // Extract country: {{Flagu|Country}} or {{flagu|Country}}
  const countryMatch = countryLine.match(/\{\{[Ff]lagu?\|([^}]+)\}\}/);
  const country = countryMatch ? countryMatch[1] : '';

  // Extract population: | align="right" |1,234,567
  // Also handle: | align="right"|1,234,567 (no space before number)
  const popMatch = popLine.match(/align="right"\s*\|?\s*([\d,]+)/);
  const population = popMatch ? parseInt(popMatch[1].replace(/,/g, ''), 10) : 0;

  // Extract continent
  let continent = continentLine.replace(/^\|/, '').trim();
  // Handle "Asia/Europe" -> "Europe" (Istanbul)
  if (continent === 'Asia/Europe') continent = 'Europe';

  // Only include valid continents
  const validContinents = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'];
  if (!validContinents.includes(continent)) continue;
  if (population < 1000000) continue;
  if (!cityName || !country) continue;

  cities.push({ name: cityName, country, population, continent });
}

console.log(`Parsed ${cities.length} cities from cities.md`);

// --- Assign population tiers ---
function getTier(pop) {
  if (pop >= 10000000) return '>10M';
  if (pop >= 5000000) return '10-5M';
  if (pop >= 2500000) return '5M-2.5M';
  return '2.5M-1M';
}

// --- Load GeoJSON ---
console.log(`Loading GeoJSON from ${geojsonPath}...`);
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
console.log(`Loaded ${geojson.features.length} city features from GeoJSON`);

// Build name lookup (name -> array of features, since names can duplicate)
const geoByName = {};
for (const feature of geojson.features) {
  const name = feature.properties.NAME;
  if (!geoByName[name]) geoByName[name] = [];
  geoByName[name].push(feature);
}

// --- Compute centroid from polygon ---
function computeCentroid(geometry) {
  // Simple centroid: average of all coordinates
  let coords = [];
  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0]; // outer ring
  } else if (geometry.type === 'MultiPolygon') {
    // Use largest polygon
    let maxLen = 0;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) {
        maxLen = poly[0].length;
        coords = poly[0];
      }
    }
  }
  if (coords.length === 0) return null;
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

// --- Match and build output ---
const matched = [];
const unmatched = [];

// Known name mappings: cities.md name -> GeoJSON NAME
const NAME_OVERRIDES = {
  // Add mappings here for cities that don't match by name
  // 'cities.md name': 'GeoJSON NAME',
};

for (const city of cities) {
  const geoName = NAME_OVERRIDES[city.name] || city.name;
  const candidates = geoByName[geoName];

  let feature = null;
  if (candidates && candidates.length === 1) {
    feature = candidates[0];
  } else if (candidates && candidates.length > 1) {
    // Multiple matches — pick by rough geographic proximity
    // For now, just pick the first one (we'll refine with manual overrides)
    feature = candidates[0];
    console.warn(`  Multiple GeoJSON matches for "${city.name}" (${candidates.length}) — using first`);
  }

  if (!feature) {
    unmatched.push(city);
    continue;
  }

  const centroid = computeCentroid(feature.geometry);
  if (!centroid) {
    unmatched.push(city);
    continue;
  }

  matched.push({
    type: 'Feature',
    properties: {
      name: city.name,
      country: city.country,
      population: city.population,
      continent: city.continent,
      populationTier: getTier(city.population),
      lat: centroid[1],
      lon: centroid[0]
    },
    geometry: feature.geometry
  });
}

console.log(`\nMatched: ${matched.length} cities`);
if (unmatched.length > 0) {
  console.warn(`\nUnmatched (${unmatched.length}):`);
  for (const c of unmatched) {
    console.warn(`  ${c.name} (${c.country}, pop ${c.population.toLocaleString()})`);
  }
}

// --- Write output ---
const output = { type: 'FeatureCollection', features: matched };
const json = JSON.stringify(output);
writeFileSync(outputPath, json);

console.log(`\nWrote ${matched.length} features to ${outputPath}`);
console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

// Stats by tier
for (const tier of ['>10M', '10-5M', '5M-2.5M', '2.5M-1M']) {
  const count = matched.filter(f => f.properties.populationTier === tier).length;
  console.log(`  ${tier}: ${count} cities`);
}

// Stats by continent
for (const cont of ['Asia', 'Africa', 'Europe', 'North America', 'South America', 'Oceania']) {
  const count = matched.filter(f => f.properties.continent === cont).length;
  console.log(`  ${cont}: ${count} cities`);
}
```

**Step 3: Run the script and review results**

```bash
node scripts/extract-cities.js /tmp/cities.geojson
```

Expected: Console output showing matched/unmatched cities, file size, breakdown by tier and continent.

**Step 4: Fix unmatched cities**

Review the "Unmatched" output. Add entries to the `NAME_OVERRIDES` object for cities whose GeoJSON name differs from the cities.md name. Re-run until satisfied with coverage.

**Step 5: Commit**

```bash
git add scripts/extract-cities.js src/lib/data/cities.json
git commit -m "feat: add cities extraction script and cities.json data"
```

---

### Task 2: Cities data module

**Files:**
- Create: `src/lib/data/cities.ts`

**Step 1: Create the data module**

Create `src/lib/data/cities.ts`:

```typescript
import citiesGeoJSON from './cities.json';
import type { FeatureCollection, Geometry } from 'geojson';

export type CityContinent = 'North America' | 'South America' | 'Europe' | 'Asia' | 'Africa' | 'Oceania';
export type PopulationTier = '>10M' | '10-5M' | '5M-2.5M' | '2.5M-1M';

export interface CityProperties {
	name: string;
	country: string;
	population: number;
	continent: CityContinent;
	populationTier: PopulationTier;
	lat: number;
	lon: number;
	[key: string]: unknown;
}

export type CitiesFC = FeatureCollection<Geometry, CityProperties>;

export const cities: CitiesFC = citiesGeoJSON as unknown as CitiesFC;

export const CITY_CONTINENTS: CityContinent[] = [
	'North America',
	'South America',
	'Europe',
	'Asia',
	'Africa',
	'Oceania'
];

export const POPULATION_TIERS: PopulationTier[] = ['>10M', '10-5M', '5M-2.5M', '2.5M-1M'];

export const POPULATION_TIER_LABELS: Record<PopulationTier, string> = {
	'>10M': '>10M',
	'10-5M': '10-5M',
	'5M-2.5M': '5M-2.5M',
	'2.5M-1M': '2.5M-1M'
};

export const CONTINENT_COLORS: Record<CityContinent, string> = {
	'North America': '#2dd4bf', // teal
	'South America': '#fbbf24', // amber
	'Europe': '#60a5fa',        // blue
	'Asia': '#fb7185',          // rose
	'Africa': '#4ade80',        // green
	'Oceania': '#c084fc'        // purple
};

/** Unique key for a city (name + country to handle duplicates) */
export function cityKey(name: string, country: string): string {
	return `${name}::${country}`;
}

export interface CityEntry {
	name: string;
	country: string;
	key: string;
	population: number;
	continent: CityContinent;
	populationTier: PopulationTier;
	lat: number;
	lon: number;
}

export function getCityList(): CityEntry[] {
	return cities.features.map((f) => ({
		name: f.properties.name,
		country: f.properties.country,
		key: cityKey(f.properties.name, f.properties.country),
		population: f.properties.population,
		continent: f.properties.continent as CityContinent,
		populationTier: f.properties.populationTier as PopulationTier,
		lat: f.properties.lat,
		lon: f.properties.lon
	}));
}

/** Find cities with duplicate names in a given set of city keys */
export function findDuplicateNames(cityKeys: Set<string>, allCities: CityEntry[]): Set<string> {
	const activeCities = allCities.filter((c) => cityKeys.has(c.key));
	const nameCounts: Record<string, number> = {};
	for (const c of activeCities) {
		nameCounts[c.name] = (nameCounts[c.name] || 0) + 1;
	}
	const dupes = new Set<string>();
	for (const [name, count] of Object.entries(nameCounts)) {
		if (count > 1) dupes.add(name);
	}
	return dupes;
}
```

**Step 2: Verify it compiles**

```bash
npm run check
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/lib/data/cities.ts
git commit -m "feat: add cities data module with types and helpers"
```

---

### Task 3: CitiesMap component

**Files:**
- Create: `src/lib/components/CitiesMap.svelte`
- Reference: `src/lib/components/MapAttackMap.svelte` (structural pattern)

**Step 1: Create CitiesMap.svelte**

Create `src/lib/components/CitiesMap.svelte`. This closely follows the MapAttackMap pattern but renders cities (dots or polygons) over country context borders.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { countries } from '$lib/data/countries';
  import { cities, CONTINENT_COLORS, cityKey, type CityContinent, type CitiesFC } from '$lib/data/cities';
  import { lakes } from '$lib/data/lakes';
  import type { Feature, Geometry } from 'geojson';

  let {
    targetCity = '',
    claimedCities = new Set<string>(),
    renderMode = 'dots' as 'dots' | 'boundaries',
    eligibleCityKeys = new Set<string>(),
    onCityClick
  }: {
    targetCity?: string;
    claimedCities?: Set<string>;
    renderMode?: 'dots' | 'boundaries';
    eligibleCityKeys?: Set<string>;
    onCityClick?: (key: string) => void;
  } = $props();

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let width = $state(960);
  let height = $state(500);
  let hoveredKey = $state<string | null>(null);
  let flashKey = $state<string | null>(null);
  let clickBlocked = $state(false);

  let currentTransform = $state(d3.zoomIdentity);
  let zoomBehavior: d3.ZoomBehavior<HTMLCanvasElement, unknown>;

  // Build lookup: cityKey -> feature
  const featureByKey: Record<string, Feature<Geometry, any>> = {};
  for (const f of cities.features) {
    featureByKey[cityKey(f.properties.name, f.properties.country)] = f;
  }

  function buildProjection(): d3.GeoProjection {
    return d3.geoNaturalEarth1().fitExtent(
      [[10, 10], [width - 10, height - 10]],
      countries
    );
  }

  function getTransformedProjection(): d3.GeoProjection {
    const base = buildProjection();
    const baseScale = base.scale();
    const baseTranslate = base.translate();
    return d3.geoNaturalEarth1()
      .scale(baseScale * currentTransform.k)
      .translate([
        currentTransform.x + baseTranslate[0] * currentTransform.k,
        currentTransform.y + baseTranslate[1] * currentTransform.k
      ]);
  }

  function getCityFill(key: string): string {
    if (flashKey === key) return '#ef4444';
    const feature = featureByKey[key];
    if (!feature) return '#9ca3af';
    const continent = feature.properties.continent as CityContinent;
    if (claimedCities.has(key)) {
      if (hoveredKey === key) {
        // Brighten claimed color
        return d3.color(CONTINENT_COLORS[continent])?.brighter(0.5)?.formatHex() ?? CONTINENT_COLORS[continent];
      }
      return CONTINENT_COLORS[continent];
    }
    if (hoveredKey === key) return '#d1d5db'; // gray-300
    return '#9ca3af'; // gray-400
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    // Pass 1: Country borders (context only — unfilled, light gray)
    for (const feature of countries.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = '#1f2937'; // gray-800 (subtle land fill)
      ctx.fill();
      ctx.strokeStyle = '#374151'; // gray-700
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Pass 2: Lakes
    for (const feature of lakes.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = '#111827'; // gray-900 (matches background)
      ctx.fill();
    }

    // Pass 3: Cities (only eligible ones)
    for (const feature of cities.features) {
      const key = cityKey(feature.properties.name, feature.properties.country);
      if (!eligibleCityKeys.has(key)) continue;

      const fill = getCityFill(key);

      if (renderMode === 'boundaries') {
        ctx.beginPath();
        pathGen(feature);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = hoveredKey === key ? '#f3f4f6' : '#6b7280';
        ctx.lineWidth = hoveredKey === key ? 1.5 : 0.5;
        ctx.stroke();
      } else {
        // Dot mode
        const projected = proj([feature.properties.lon, feature.properties.lat]);
        if (!projected) continue;
        const [px, py] = projected;
        const radius = 8;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = hoveredKey === key ? '#f3f4f6' : '#374151';
        ctx.lineWidth = hoveredKey === key ? 2 : 1;
        ctx.stroke();
      }
    }
  }

  function findCityAtPoint(x: number, y: number): string | null {
    const proj = getTransformedProjection();

    if (renderMode === 'dots') {
      // Check distance from each city centroid (in screen space)
      let closest: string | null = null;
      let closestDist = Infinity;
      for (const feature of cities.features) {
        const key = cityKey(feature.properties.name, feature.properties.country);
        if (!eligibleCityKeys.has(key)) continue;
        const projected = proj([feature.properties.lon, feature.properties.lat]);
        if (!projected) continue;
        const dx = projected[0] - x;
        const dy = projected[1] - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20 && dist < closestDist) {
          closestDist = dist;
          closest = key;
        }
      }
      return closest;
    } else {
      // Boundary mode: check geoContains
      const lonLat = proj.invert?.([x, y]);
      if (!lonLat) return null;

      for (const feature of cities.features) {
        const key = cityKey(feature.properties.name, feature.properties.country);
        if (!eligibleCityKeys.has(key)) continue;
        if (d3.geoContains(feature, lonLat)) return key;
      }

      // Fallback: 20px radius from centroid
      let closest: string | null = null;
      let closestDist = Infinity;
      for (const feature of cities.features) {
        const key = cityKey(feature.properties.name, feature.properties.country);
        if (!eligibleCityKeys.has(key)) continue;
        const projected = proj([feature.properties.lon, feature.properties.lat]);
        if (!projected) continue;
        const dx = projected[0] - x;
        const dy = projected[1] - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20 && dist < closestDist) {
          closestDist = dist;
          closest = key;
        }
      }
      return closest;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const key = findCityAtPoint(x, y);
    if (key !== hoveredKey) {
      hoveredKey = key;
      drawMap();
    }
  }

  function handleMouseLeave() {
    if (hoveredKey !== null) {
      hoveredKey = null;
      drawMap();
    }
  }

  function handleClick(e: MouseEvent) {
    if (clickBlocked) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const key = findCityAtPoint(x, y);
    if (!key) return;
    if (claimedCities.has(key)) return;
    onCityClick?.(key);
  }

  let flashTimeout: ReturnType<typeof setTimeout>;

  export function flashWrong(key: string) {
    clearTimeout(flashTimeout);
    flashKey = key;
    clickBlocked = true;
    drawMap();
    flashTimeout = setTimeout(() => {
      flashKey = null;
      clickBlocked = false;
      drawMap();
    }, 500);
  }

  export function redraw() {
    drawMap();
  }

  onMount(() => {
    const baseProjection = buildProjection();
    const baseScale = baseProjection.scale();

    // Max zoom: high enough to see individual cities
    const maxK = (width / ((200 / 111) * (Math.PI / 180)) / 2) / baseScale;

    zoomBehavior = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, maxK])
      .on('zoom', (event) => {
        currentTransform = event.transform;
        drawMap();
      });

    d3.select(canvasEl).call(zoomBehavior);
    d3.select(canvasEl).on('dblclick.zoom', null);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        canvasEl.width = width;
        canvasEl.height = height;
        requestAnimationFrame(() => drawMap());
      }
    });
    observer.observe(containerEl);

    return () => {
      observer.disconnect();
      clearTimeout(flashTimeout);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  class="w-full h-full relative"
  style="cursor: {hoveredKey && !claimedCities.has(hoveredKey) ? 'pointer' : 'grab'}"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onclick={handleClick}
>
  <canvas
    bind:this={canvasEl}
    {width}
    {height}
    class="absolute inset-0"
  ></canvas>
</div>
```

**Step 2: Verify it compiles**

```bash
npm run check
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/lib/components/CitiesMap.svelte
git commit -m "feat: add CitiesMap component with dot/boundary rendering"
```

---

### Task 4: Cities page with setup phase

**Files:**
- Create: `src/routes/cities/+page.svelte`

**Step 1: Create the cities page**

Create `src/routes/cities/+page.svelte`:

```svelte
<script lang="ts">
  import { base } from '$app/paths';
  import CitiesMap from '$lib/components/CitiesMap.svelte';
  import {
    getCityList,
    findDuplicateNames,
    CITY_CONTINENTS,
    POPULATION_TIERS,
    POPULATION_TIER_LABELS,
    type CityContinent,
    type PopulationTier,
    type CityEntry
  } from '$lib/data/cities';

  const STORAGE_KEY = 'cities-game-settings';
  const MAX_LIVES = 3;

  const allCities = getCityList();
  const nameByKey = Object.fromEntries(allCities.map((c) => [c.key, c]));

  // --- State ---
  type Phase = 'setup' | 'playing' | 'results';
  let phase = $state<Phase>('setup');

  // Settings (persisted)
  interface CitySettings {
    continents: Record<CityContinent, boolean>;
    tiers: Record<PopulationTier, boolean>;
    renderMode: 'dots' | 'boundaries';
    showCountry: boolean;
  }

  function loadSettings(): CitySettings {
    if (typeof window === 'undefined') return defaultSettings();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    try {
      return JSON.parse(raw);
    } catch {
      return defaultSettings();
    }
  }

  function defaultSettings(): CitySettings {
    return {
      continents: Object.fromEntries(CITY_CONTINENTS.map((c) => [c, true])) as Record<CityContinent, boolean>,
      tiers: Object.fromEntries(POPULATION_TIERS.map((t) => [t, true])) as Record<PopulationTier, boolean>,
      renderMode: 'dots',
      showCountry: true
    };
  }

  let settings = $state<CitySettings>(loadSettings());

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function toggleContinent(c: CityContinent) {
    settings.continents[c] = !settings.continents[c];
    saveSettings();
  }

  function toggleTier(t: PopulationTier) {
    settings.tiers[t] = !settings.tiers[t];
    saveSettings();
  }

  function toggleRenderMode() {
    settings.renderMode = settings.renderMode === 'dots' ? 'boundaries' : 'dots';
    saveSettings();
  }

  function toggleShowCountry() {
    settings.showCountry = !settings.showCountry;
    saveSettings();
  }

  // --- Filtered city counts ---
  let eligibleCities = $derived(
    allCities.filter(
      (c) => settings.continents[c.continent] && settings.tiers[c.populationTier]
    )
  );

  // Cross-filtered counts: continent counts filtered by selected tiers
  let continentCounts = $derived.by(() => {
    const counts: Record<CityContinent, number> = {} as Record<CityContinent, number>;
    for (const c of CITY_CONTINENTS) counts[c] = 0;
    for (const city of allCities) {
      if (settings.tiers[city.populationTier]) {
        counts[city.continent] += 1;
      }
    }
    return counts;
  });

  // Cross-filtered counts: tier counts filtered by selected continents
  let tierCounts = $derived.by(() => {
    const counts: Record<PopulationTier, number> = {} as Record<PopulationTier, number>;
    for (const t of POPULATION_TIERS) counts[t] = 0;
    for (const city of allCities) {
      if (settings.continents[city.continent]) {
        counts[city.populationTier] += 1;
      }
    }
    return counts;
  });

  let anySelected = $derived(eligibleCities.length > 0);

  // --- Game state ---
  let lives = $state(MAX_LIVES);
  let claimedCities = $state(new Set<string>());
  let currentTarget = $state<string | null>(null);
  let won = $state(false);
  let gameCities = $state<string[]>([]);
  let remainingCities: string[] = [];
  let eligibleCityKeys = $state(new Set<string>());
  let duplicateNames = $state(new Set<string>());

  let mapComponent = $state<ReturnType<typeof CitiesMap>>();

  let totalCities = $derived(gameCities.length);
  let claimedCount = $derived(claimedCities.size);

  function formatPopulation(pop: number): string {
    return pop.toLocaleString();
  }

  function getTargetDisplay(): string {
    if (!currentTarget) return '';
    const city = nameByKey[currentTarget];
    if (!city) return currentTarget;
    let display = `${city.name} ${formatPopulation(city.population)}`;
    if (settings.showCountry || duplicateNames.has(city.name)) {
      display = `${city.name}, ${city.country} ${formatPopulation(city.population)}`;
    }
    return display;
  }

  function startGame() {
    const eligible = allCities.filter(
      (c) => settings.continents[c.continent] && settings.tiers[c.populationTier]
    );
    gameCities = eligible.map((c) => c.key);
    eligibleCityKeys = new Set(gameCities);
    duplicateNames = findDuplicateNames(eligibleCityKeys, allCities);
    remainingCities = shuffle([...gameCities]);
    claimedCities = new Set();
    lives = MAX_LIVES;
    won = false;
    currentTarget = remainingCities.pop() ?? null;
    phase = 'playing';
  }

  function pickNextTarget() {
    if (remainingCities.length === 0) {
      won = true;
      phase = 'results';
      return;
    }
    currentTarget = remainingCities.pop() ?? null;
  }

  function handleCityClick(key: string) {
    if (!currentTarget) return;

    if (key === currentTarget) {
      claimedCities = new Set([...claimedCities, key]);
      mapComponent?.redraw();
      pickNextTarget();
    } else {
      lives -= 1;
      mapComponent?.flashWrong(key);
      if (lives <= 0) {
        setTimeout(() => {
          won = false;
          phase = 'results';
        }, 600);
      } else {
        const insertIdx = Math.floor(Math.random() * remainingCities.length);
        remainingCities.splice(insertIdx, 0, currentTarget!);
        pickNextTarget();
      }
    }
  }

  function playAgain() {
    startGame();
  }

  function changeCities() {
    phase = 'setup';
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
</script>

{#if phase === 'setup'}
  <div class="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
    <div class="max-w-md w-full">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Cities</h1>
        <a href="{base}/" class="text-sm text-gray-400 hover:text-white">Back to Game</a>
      </div>

      <p class="text-gray-400 mb-4">Select continents and population ranges, then identify every city. You have 3 lives.</p>

      <!-- Continent filter -->
      <h2 class="text-sm font-semibold text-gray-400 mb-2">Continents</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each CITY_CONTINENTS as continent}
          <button
            onclick={() => toggleContinent(continent)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {settings.continents[continent]
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-gray-600 text-gray-400'}"
          >
            {continent} ({continentCounts[continent]})
          </button>
        {/each}
      </div>

      <!-- Population filter -->
      <h2 class="text-sm font-semibold text-gray-400 mb-2">Population</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each POPULATION_TIERS as tier}
          <button
            onclick={() => toggleTier(tier)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {settings.tiers[tier]
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-gray-600 text-gray-400'}"
          >
            {POPULATION_TIER_LABELS[tier]} ({tierCounts[tier]})
          </button>
        {/each}
      </div>

      <!-- Toggles -->
      <div class="flex gap-4 mb-4">
        <button
          onclick={toggleRenderMode}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors bg-gray-700 hover:bg-gray-600"
        >
          Mode: {settings.renderMode === 'dots' ? 'Dots' : 'Boundaries'}
        </button>
        <button
          onclick={toggleShowCountry}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors bg-gray-700 hover:bg-gray-600"
        >
          Country: {settings.showCountry ? 'On' : 'Off'}
        </button>
      </div>

      <!-- Total count -->
      <p class="text-gray-400 text-sm mb-4">{eligibleCities.length} cities selected</p>

      <button
        onclick={startGame}
        disabled={!anySelected}
        class="w-full py-3 rounded-lg font-semibold text-lg transition-colors {anySelected
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
      >
        Start
      </button>
    </div>
  </div>

{:else if phase === 'playing'}
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <!-- HUD -->
    <div class="flex items-center justify-between px-4 py-2 bg-black/60 z-10">
      <div class="text-lg font-semibold">
        Click on: <span class="text-blue-400">{getTargetDisplay()}</span>
      </div>
      <div class="text-sm text-gray-300">
        {claimedCount} / {totalCities}
      </div>
      <div class="flex gap-1">
        {#each Array(MAX_LIVES) as _, i}
          <span class="text-xl">{i < lives ? '❤️' : '🩶'}</span>
        {/each}
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <CitiesMap
        bind:this={mapComponent}
        targetCity={currentTarget ?? ''}
        {claimedCities}
        renderMode={settings.renderMode}
        {eligibleCityKeys}
        onCityClick={handleCityClick}
      />
    </div>
  </div>

{:else}
  <!-- Results overlay on top of map -->
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <div class="flex-1 relative overflow-hidden">
      <CitiesMap
        targetCity=""
        {claimedCities}
        renderMode={settings.renderMode}
        {eligibleCityKeys}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-gray-400 mb-6">All {totalCities} cities identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-gray-400 mb-6">{claimedCount} / {totalCities} cities identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeCities}
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600"
            >
              Change Cities
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 block text-center"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
```

**Step 2: Verify it compiles**

```bash
npm run check
```

**Step 3: Commit**

```bash
git add src/routes/cities/+page.svelte
git commit -m "feat: add cities page with setup, playing, and results phases"
```

---

### Task 5: Add navigation link

**Files:**
- Modify: `src/routes/+page.svelte` (line 105, add Cities link alongside Map Attack)

**Step 1: Add the link**

In `src/routes/+page.svelte`, find the nav section (line 104-107) and add a Cities link:

```svelte
<!-- Current (line 104-107): -->
<div class="flex gap-4">
  <a href="{base}/map-attack" class="text-sm text-gray-400 hover:text-white">Map Attack</a>
  <a href="{base}/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
</div>

<!-- Change to: -->
<div class="flex gap-4">
  <a href="{base}/map-attack" class="text-sm text-gray-400 hover:text-white">Map Attack</a>
  <a href="{base}/cities" class="text-sm text-gray-400 hover:text-white">Cities</a>
  <a href="{base}/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
</div>
```

**Step 2: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add Cities link to home page navigation"
```

---

### Task 6: Manual testing and polish

**Step 1: Run dev server**

```bash
npm run dev
```

**Step 2: Test the setup phase**

1. Navigate to `/cities`
2. Verify continent chips show with correct counts
3. Verify population tier chips show with correct counts
4. Toggle continents/tiers and verify counts update (cross-filtering)
5. Toggle render mode between Dots and Boundaries
6. Toggle show country on/off
7. Verify "X cities selected" updates
8. Verify Start button disables when no cities match
9. Refresh page — verify settings persist in localStorage

**Step 3: Test gameplay**

1. Select a small set (e.g., just >10M) and start
2. Verify HUD shows city name + population (+ country if toggle on)
3. Zoom in and click on the correct city — verify it fills with continent color
4. Click wrong city — verify red flash, life lost
5. Lose all 3 lives — verify results screen
6. Win by finding all cities — verify win screen
7. Test "Play Again", "Change Cities", "Back to Home" buttons

**Step 4: Test both render modes**

1. Play with Dots mode — verify circles appear and click detection works
2. Play with Boundaries mode — verify polygons render and click detection works
3. Verify hover highlighting works in both modes

**Step 5: Fix any issues found during testing**

Address visual polish, click detection tuning, or data issues as needed.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish cities game after manual testing"
```

---

### Task 7: Build verification

**Step 1: Run type check**

```bash
npm run check
```

Expected: No errors.

**Step 2: Run production build**

```bash
npm run build
```

Expected: Successful build. Note the output size — `cities.json` will increase the bundle.

**Step 3: Preview production build**

```bash
npm run preview
```

Navigate to `/cities` and verify it works in the production build.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final build verification for cities game mode"
```
