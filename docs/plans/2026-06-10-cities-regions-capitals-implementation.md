# Cities Regions/Capitals/Top-N Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this task-by-task. Use superpowers:svelte5-coding for Svelte 5 runes.

**Goal:** Replace the Cities game's continent+tier selection with: unified regions (same as Map Attack), a searchable country multiselect, a Capitals toggle, and global Top-N-per-country + population cutoff — backed by a regenerated 500k-floor WUP dataset that carries ISO codes and a capital flag.

**Architecture:** Extend the existing Python WUP pipeline to emit a richer `cities.json` (ISO_A3 `code`, `isCapital`, 500k floor + always-include rules). `cities.ts` resolves each city's region at runtime via the existing `getRegion(code)`. The cities page is rewritten around the new settings model; `CitiesMap` is nearly unchanged (it only reads name/country/lat/lon).

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind v4, D3 canvas map, Python (openpyxl) build script, GHS-WUP-MTUC R2025A data.

**Verification note:** No unit-test runner. Per-task verification = `npm run check` (0 errors; 4 pre-existing benign `state_referenced_locally` warnings in `src/routes/+page.svelte` are expected) + data assertions + browser. All commands run from the worktree root: `/Users/jelsherbini/dev/geography_game/.worktrees/cities-regions`.

**Read before starting:**
- `scripts/extract-cities-wup.py` — current pipeline (threshold 2M, emits name/country/population/continent/tier/lat/lon).
- `src/lib/data/cities.ts` — types & accessors to change.
- `src/lib/data/countries.ts` — `getRegion(code)`, `ALL_REGIONS`, `REGION_LABELS`, `Region`, `SUBNATIONAL_REGIONS`. Region resolution must reuse `getRegion`.
- `src/routes/cities/+page.svelte` — page to rewrite.
- `src/lib/components/CitiesMap.svelte` — reads `cities` (name/country/lat/lon) + `cityKey`; iterates `eligibleCityKeys`.

---

### Task 1: Acquire the GHS-WUP source and inspect its schema

**Goal:** Get the xlsx and learn its exact columns (does it carry an ISO code? a capital flag?). No code commit — this is investigation feeding Task 2.

**Step 1:** Download + unzip the statistics file referenced in the script header:
```bash
cd /tmp
curl -L -o ghswup.zip "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_WUP_MTUC_GLOBE_R2025A/V1-1/GHS_WUP_MTUC_GLOBE_R2025A_V1_1_statistics.zip"
unzip -o ghswup.zip -d ghswup
find /tmp/ghswup -iname "*.xlsx"
```
If the URL fails (link rot), STOP and report — ask the user for a local path to the GHS-WUP-MTUC R2025A statistics xlsx.

**Step 2:** Print the `UC_STATS` header and 3 sample rows for the year 2025:
```bash
python3 - <<'PY'
import openpyxl, glob
path = glob.glob('/tmp/ghswup/**/*.xlsx', recursive=True)[0]
wb = openpyxl.load_workbook(path, read_only=True)
print("sheets:", wb.sheetnames)
ws = wb["UC_STATS"]; rows = ws.iter_rows(values_only=True)
header = next(rows); print("columns:", list(header))
for i, r in enumerate(rows):
    if i > 4: break
    print(dict(zip(header, r)))
PY
```

**Step 3: Report** the full column list and whether any column looks like an ISO country code (e.g. `ISO3`, `CTR_MN_ISO`, `GADM`) or a capital indicator. Note the xlsx path for Task 2. **Do not commit.**

---

### Task 2: Regenerate `cities.json` with the new schema (500k floor, codes, capitals)

**Files:**
- Modify: `scripts/extract-cities-wup.py`
- Regenerate: `src/lib/data/cities.json`

**Step 1:** Edit `scripts/extract-cities-wup.py`:

- Change `POP_THRESHOLD = 2_000_000` → `POP_THRESHOLD = 500_000`.
- **Capital flag (native).** Task 1 confirmed `UC_STATS` has a `CapitalFlag` column (0/1; 199 capitals in 2025). Read `isCapital = bool(row[col["CapitalFlag"]])` directly. **No curated capital list is needed.**
- **Country code via M49 → ISO_A3 join.** Task 1 confirmed there is NO ISO column — only `UNLocID` (UN **M49 numeric** code) and `UNLocName`. M49 numeric == ISO 3166-1 numeric, and `src/lib/data/countries.json` already carries numeric codes (`ISO_N3_EH`, fallback `ISO_N3`). So in the script: read `countries.json`, build a map `m49(int) → ISO_A3` from each feature's `ISO_N3_EH` (unless `-99`, else `ISO_N3`) → `ISO_A3_EH` (unless `-99`, else `ISO_A3`). Then `code = M49_TO_ISO3[int(row[col["UNLocID"]])]`. The script must **collect every `UNLocID`/`UNLocName` with no ISO_A3 match and `raise SystemExit` listing them** (loud failure) so we can add a small manual override map for any unmatched M49 codes. (M49 separates territories from parents, e.g. French Polynesia 258 → PYF — which is correct, since `getRegion('PYF')` → `small-islands`.)
- Keep `COUNTRY_MAP` only for the human-readable `country` display name (UNLocName → common English).
- **Always-include rules.** Build the output as the union of, per the 2025 rows that resolved to a code:
  1. every city with `POP >= 500_000`;
  2. each country's single most-populous city (any size);
  3. every city with `CapitalFlag == 1` (any size).
  Dedupe by (code, name).
- Drop `continent` and `populationTier`; the new per-row output object is:
  ```python
  {
    "name": english_name(row[col["UCname"]]),
    "country": country,           # common English name (via COUNTRY_MAP)
    "code": iso3,                 # ISO_A3
    "population": int(round(pop)),
    "isCapital": is_capital,      # bool
    "lat": round(row[col["Lat"]], 4),
    "lon": round(row[col["Lon"]], 4),
  }
  ```
- Remove the now-unused `tier_for` and `COUNTRY_CONTINENT` (continent is no longer emitted; region is resolved at runtime). Keep `COUNTRY_MAP` and `english_name`.
- At the end, print summary stats: total cities, distinct countries, # capitals flagged, min/max population.

**Step 2:** Run it (xlsx path from Task 1: `/tmp/ghswup/GHS_WUP_MTUC_MT_GLOBE_R2025A_v1_1.xlsx`):
```bash
python3 scripts/extract-cities-wup.py /tmp/ghswup/GHS_WUP_MTUC_MT_GLOBE_R2025A_v1_1.xlsx
```
Expected: writes `src/lib/data/cities.json`; prints sane stats (e.g. low-thousands of cities, ~150+ countries, ~190 capitals, minPop reflects always-include rule ≤ 500k). If the script raises SystemExit on unmatched M49 codes, add a small manual `M49_OVERRIDE` dict (M49 int → ISO_A3) for those and re-run. If a country is genuinely absent from `countries.json` and has no sensible ISO_A3, drop its rows (and note it).

**Step 3: Data assertions** (sanity, not committed):
```bash
node -e "const c=require('./src/lib/data/cities.json');
const codes=new Set(c.map(x=>x.code));
console.log('cities',c.length,'countries',codes.size,'capitals',c.filter(x=>x.isCapital).length,'minPop',Math.min(...c.map(x=>x.population)),'maxPop',Math.max(...c.map(x=>x.population)));
console.log('missing code:', c.filter(x=>!x.code).length);
console.log('sample', JSON.stringify(c[0]));"
```
Expected: 0 missing codes; capitals count near ~190.

**Step 4: Commit**
```bash
git add scripts/extract-cities-wup.py src/lib/data/cities.json
git commit -m "Regenerate cities.json: 500k floor, ISO codes, capital flag"
```

---

### Task 3: Update `cities.ts` types, exports, and region resolution

**Files:**
- Modify: `src/lib/data/cities.ts`

**Step 1:** Rewrite to the new model. Replace the file's type/exports with:

```ts
import citiesData from './cities.json';
import { getRegion, REGION_LABELS, type Region } from './countries';

export interface CityData {
	name: string;
	country: string;
	code: string;       // ISO_A3
	population: number;
	isCapital: boolean;
	lat: number;
	lon: number;
}

export const cities: CityData[] = citiesData as unknown as CityData[];

/** Regions available in Cities mode: the 8 non-subnational world regions. */
export const CITY_REGIONS: Region[] = [
	'north-america', 'south-america', 'europe', 'asia',
	'africa', 'oceania', 'small-islands', 'city-states'
];

export { REGION_LABELS };

export function cityKey(name: string, country: string): string {
	return `${name}::${country}`;
}

export interface CityEntry {
	name: string;
	country: string;
	code: string;
	key: string;
	region: Region;
	population: number;
	isCapital: boolean;
	lat: number;
	lon: number;
}

export function getCityList(): CityEntry[] {
	return cities.map((c) => ({
		name: c.name,
		country: c.country,
		code: c.code,
		key: cityKey(c.name, c.country),
		region: getRegion(c.code),
		population: c.population,
		isCapital: c.isCapital,
		lat: c.lat,
		lon: c.lon
	}));
}

/** Distinct countries present in the dataset, with code + region, sorted by name. */
export function getCityCountries(): { code: string; name: string; region: Region }[] {
	const seen = new Map<string, { code: string; name: string; region: Region }>();
	for (const c of cities) {
		if (!seen.has(c.code)) seen.set(c.code, { code: c.code, name: c.country, region: getRegion(c.code) });
	}
	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Find cities with duplicate names in a given set of city keys */
export function findDuplicateNames(cityKeys: Set<string>, allCities: CityEntry[]): Set<string> {
	const active = allCities.filter((c) => cityKeys.has(c.key));
	const counts: Record<string, number> = {};
	for (const c of active) counts[c.name] = (counts[c.name] || 0) + 1;
	const dupes = new Set<string>();
	for (const [name, n] of Object.entries(counts)) if (n > 1) dupes.add(name);
	return dupes;
}
```

Remove all old exports (`CityContinent`, `CITY_CONTINENTS`, `PopulationTier`, `POPULATION_TIERS`, `POPULATION_TIER_LABELS`, `CONTINENT_COLORS`).

**Step 2: Verify** `npm run check`. This WILL surface errors in `src/routes/cities/+page.svelte` (it still imports the removed symbols) — that's expected and fixed in Task 4. Confirm there are no errors originating in `cities.ts` itself or `CitiesMap.svelte`. (CitiesMap only uses `cities`/`cityKey`, which still exist.)

**Step 3: Commit**
```bash
git add src/lib/data/cities.ts
git commit -m "cities.ts: ISO-code + region model, drop continent/tier"
```
(The page won't typecheck until Task 4 — acceptable mid-sequence; note it in the commit body if desired.)

---

### Task 4: Rewrite the cities page (settings, setup UI, eligible-set logic)

**Files:**
- Modify: `src/routes/cities/+page.svelte`

**Step 1 — `<script>` changes.**

Replace the imports:
```ts
import {
	getCityList,
	getCityCountries,
	findDuplicateNames,
	CITY_REGIONS,
	REGION_LABELS,
	type CityEntry
} from '$lib/data/cities';
import { type Region } from '$lib/data/countries';
```

Bump the storage key and settings model:
```ts
const STORAGE_KEY = 'cities-game-settings-v2';
```

Add derived data near the top (after `allCities`):
```ts
const allCities = getCityList();
const nameByKey = Object.fromEntries(allCities.map((c) => [c.key, c]));
const allCountries = getCityCountries();
const countryNameByCode = Object.fromEntries(allCountries.map((c) => [c.code, c.name]));

// cities grouped by country code, sorted by population desc (built once)
const citiesByCode = new Map<string, CityEntry[]>();
for (const c of allCities) {
	const arr = citiesByCode.get(c.code) ?? [];
	arr.push(c);
	citiesByCode.set(c.code, arr);
}
for (const arr of citiesByCode.values()) arr.sort((a, b) => b.population - a.population);
```

New settings interface + defaults + load/save:
```ts
interface CitySettings {
	regions: Record<Region, boolean>;
	countries: string[];   // ISO codes (additive to regions)
	capitals: boolean;
	topN: number;
	cutoff: number;
	showCountry: boolean;
}

function defaultSettings(): CitySettings {
	return {
		regions: Object.fromEntries(CITY_REGIONS.map((r) => [r, true])) as Record<Region, boolean>,
		countries: [],
		capitals: false,
		topN: 5,
		cutoff: 1_000_000,
		showCountry: true
	};
}

function loadSettings(): CitySettings {
	if (typeof window === 'undefined') return defaultSettings();
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return defaultSettings();
	try {
		const p = JSON.parse(raw); const d = defaultSettings();
		return {
			regions: { ...d.regions, ...p.regions },
			countries: Array.isArray(p.countries) ? p.countries : d.countries,
			capitals: p.capitals ?? d.capitals,
			topN: p.topN ?? d.topN,
			cutoff: p.cutoff ?? d.cutoff,
			showCountry: p.showCountry ?? d.showCountry
		};
	} catch { return defaultSettings(); }
}

let settings = $state<CitySettings>(loadSettings());
function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
```

Replace `toggleContinent`/`toggleTier` with:
```ts
function toggleRegion(r: Region) { settings.regions[r] = !settings.regions[r]; saveSettings(); }
function toggleCountry(code: string) {
	const i = settings.countries.indexOf(code);
	if (i >= 0) settings.countries.splice(i, 1); else settings.countries.push(code);
	saveSettings();
}
function toggleCapitals() { settings.capitals = !settings.capitals; saveSettings(); }
function toggleShowCountry() { settings.showCountry = !settings.showCountry; saveSettings(); }
function setTopN(n: number) { settings.topN = Math.max(1, Math.min(25, Math.floor(n) || 1)); saveSettings(); }
function setCutoff(n: number) { settings.cutoff = Math.max(500_000, Math.floor(n) || 500_000); saveSettings(); }
```

The eligible-set logic (the heart of the feature) — replace `eligibleCities`/`continentCounts`/`tierCounts`/`anySelected`:
```ts
let inPlayCodes = $derived.by(() => {
	const set = new Set<string>();
	for (const c of allCountries) {
		if (settings.regions[c.region] || settings.countries.includes(c.code)) set.add(c.code);
	}
	return set;
});

let eligibleCities = $derived.by(() => {
	const out: CityEntry[] = [];
	for (const code of inPlayCodes) {
		const list = citiesByCode.get(code) ?? [];
		list.forEach((city, idx) => {
			const include =
				idx === 0 ||
				(idx < settings.topN && city.population > settings.cutoff) ||
				(settings.capitals && city.isCapital);
			if (include) out.push(city);
		});
	}
	return out;
});

let regionCounts = $derived.by(() => {
	const counts = Object.fromEntries(CITY_REGIONS.map((r) => [r, 0])) as Record<Region, number>;
	for (const c of eligibleCities) if (c.region in counts) counts[c.region] += 1;
	return counts;
});

let anySelected = $derived(eligibleCities.length > 0);
```

Country search state (for the multiselect):
```ts
let countryQuery = $state('');
let filteredCountries = $derived(
	countryQuery.trim()
		? allCountries.filter((c) => c.name.toLowerCase().includes(countryQuery.trim().toLowerCase()))
		: allCountries
);
```

`startGame` now uses the derived eligible set:
```ts
function startGame() {
	gameCities = eligibleCities.map((c) => c.key);
	eligibleCityKeys = new Set(gameCities);
	duplicateNames = findDuplicateNames(eligibleCityKeys, allCities);
	remainingCities = shuffle([...gameCities]);
	claimedCities = new Set();
	lives = MAX_LIVES;
	won = false;
	currentTarget = remainingCities.pop() ?? null;
	phase = 'playing';
}
```

Leave `pickNextTarget`, `handleCityClick`, `getTargetDisplay`, `playAgain`, `changeCities`, `shuffle`, `formatPopulation` unchanged. (`getTargetDisplay` reads `settings.showCountry` — still valid.)

**Step 2 — setup markup.** Replace the Continents + Population blocks (current lines ~286–331) with: region pills, the country multiselect, capitals + show-country toggles, N + cutoff inputs, and the live summary. Use existing pill/toggle classes for consistency:

```svelte
<p class="text-muted mb-4">Pick regions and/or specific countries, then identify every city. You have 3 lives.</p>

<!-- Regions -->
<h2 class="text-sm font-semibold text-muted mb-2">Regions</h2>
<div class="flex flex-wrap gap-2 mb-4">
  {#each CITY_REGIONS as region}
    <button
      onclick={() => toggleRegion(region)}
      class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
        {settings.regions[region] ? 'bg-accent border-accent text-accent-fg' : 'bg-transparent border-edge text-muted'}"
    >{REGION_LABELS[region]} ({regionCounts[region]})</button>
  {/each}
</div>

<!-- Country multiselect -->
<h2 class="text-sm font-semibold text-muted mb-2">Specific countries (optional)</h2>
{#if settings.countries.length}
  <div class="flex flex-wrap gap-1.5 mb-2">
    {#each settings.countries as code}
      <span class="text-xs px-2 py-1 rounded-full bg-accent text-accent-fg flex items-center gap-1">
        {countryNameByCode[code] ?? code}
        <button onclick={() => toggleCountry(code)} aria-label="Remove {countryNameByCode[code] ?? code}" class="leading-none">×</button>
      </span>
    {/each}
  </div>
{/if}
<input
  type="text"
  bind:value={countryQuery}
  placeholder="Search countries…"
  class="w-full px-3 py-2 rounded-lg bg-raised text-fg border border-edge mb-2 text-sm"
/>
{#if countryQuery.trim()}
  <div class="max-h-40 overflow-y-auto border border-edge rounded-lg mb-4">
    {#each filteredCountries.slice(0, 60) as c}
      <button
        onclick={() => toggleCountry(c.code)}
        class="w-full text-left px-3 py-1.5 text-sm hover:bg-raised-hover flex items-center justify-between
          {settings.countries.includes(c.code) ? 'text-accent' : 'text-fg'}"
      >
        <span>{c.name}</span>
        {#if settings.countries.includes(c.code)}<span>✓</span>{/if}
      </button>
    {:else}
      <p class="px-3 py-2 text-sm text-muted">No matches</p>
    {/each}
  </div>
{:else}
  <div class="mb-4"></div>
{/if}

<!-- Capitals + top-N + cutoff -->
<div class="space-y-3 mb-4">
  <button
    onclick={toggleCapitals}
    class="text-sm px-3 py-1.5 rounded-lg transition-colors {settings.capitals ? 'bg-accent text-accent-fg' : 'bg-raised hover:bg-raised-hover'}"
  >Capitals: {settings.capitals ? 'On' : 'Off'}</button>

  <div class="flex items-center gap-3 text-sm">
    <label class="text-muted" for="topN">Top cities per country</label>
    <input id="topN" type="number" min="1" max="25" value={settings.topN}
      oninput={(e) => setTopN(+e.currentTarget.value)}
      class="w-20 px-2 py-1 rounded bg-raised border border-edge text-fg" />
  </div>

  <div class="flex items-center gap-3 text-sm">
    <label class="text-muted" for="cutoff">Population cutoff for #2+</label>
    <input id="cutoff" type="number" min="500000" step="100000" value={settings.cutoff}
      oninput={(e) => setCutoff(+e.currentTarget.value)}
      class="w-32 px-2 py-1 rounded bg-raised border border-edge text-fg" />
  </div>

  <button
    onclick={toggleShowCountry}
    class="text-sm px-3 py-1.5 rounded-lg transition-colors bg-raised hover:bg-raised-hover"
  >Country label: {settings.showCountry ? 'On' : 'Off'}</button>
</div>

<p class="text-muted text-sm mb-4">{eligibleCities.length} cities across {inPlayCodes.size} countries</p>
```

Keep the existing Start button block (it uses `anySelected`), the HUD, results overlay, and About panel. Update the setup intro `<p>` (done above) and the About panel's "at least 2 million" line to reflect the 500k floor + capitals (see Task 5).

**Step 3: Verify** `npm run check` → 0 errors (benign warnings OK). Fix any leftover references to removed symbols.

**Step 4: Commit**
```bash
git add src/routes/cities/+page.svelte
git commit -m "Cities page: regions + country select + capitals + top-N/cutoff"
```

---

### Task 5: About-panel copy + map dot density

**Files:**
- Modify: `src/routes/cities/+page.svelte` (About panel text)
- Modify: `src/lib/components/CitiesMap.svelte` (dot radius, if needed)

**Step 1:** In the About panel, update the inclusion sentence (~line 233–235) from "at least 2 million" to reflect the new rule, e.g.: "Cities are included down to 500,000; each country always contributes its largest city, and national capitals can be added regardless of size." Keep the methodology paragraphs.

**Step 2:** With many more dots, the fixed `radius = 8` / 20px hit-radius in `CitiesMap.svelte` may overlap at low zoom. Lower the draw radius (e.g. `5`) and the hit threshold (e.g. `< 14`) so dense regions are usable. This is a small tuning change — verify by eye in the browser (Task 6). If density looks fine at radius 8, leave it and note so.

**Step 3: Verify** `npm run check` → 0 errors.

**Step 4: Commit**
```bash
git add src/routes/cities/+page.svelte src/lib/components/CitiesMap.svelte
git commit -m "Cities: update About copy and tune dot density"
```

---

### Task 6: Final verification

**Step 1:** `npm run check` → 0 errors; only the 4 pre-existing benign warnings.

**Step 2 — browser (drive the running app):** start dev, go to `/cities`:
- Setup shows 8 region pills (with counts), a country search that filters + adds chips, Capitals toggle, Top-N + cutoff inputs, country-label toggle, and the live "N cities across M countries" summary.
- **Spot-check the core scenario:** deselect all regions; search and add **Cambodia** with topN=2, cutoff=1,000,000 → eligible includes Phnom Penh (+ its #2 only if >1M). Add **China** with topN=20 → China contributes up to 20 cities (#2+ only if >1M) while Cambodia stays at its top 1–2. Toggling **Capitals** adds capitals of in-play countries.
- Start a game: map renders dots at the new density; clicking the named city claims it and advances; wrong click flashes + costs a life; win/lose reach results.
- Reload setup → settings persisted under `cities-game-settings-v2`.

**Step 3:** Note any findings. If dot density is unusable, revisit Task 5 Step 2.

---

## Done criteria

- `cities.json` regenerated: 500k floor, every row has `code` + `isCapital`, capitals matched (~190), always-include rules satisfied.
- `cities.ts` resolves region via `getRegion`; no continent/tier exports remain.
- Cities setup uses unified regions + searchable country multiselect + Capitals + global Top-N/cutoff; persisted to a new key.
- Eligible-set logic implements: always #1 per country; #2…N only if pop > cutoff; capitals included when toggled; country-select additive to regions.
- `npm run check` = 0 errors; gameplay verified in browser including the Cambodia-vs-China scenario.
