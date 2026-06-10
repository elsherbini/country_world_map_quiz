# Flag Attack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Also use superpowers:svelte5-coding for Svelte 5 runes syntax.

**Goal:** Add a `/flag-attack` game mode identical to Map Attack, but the prompt is a country/US-state flag image (~100px) instead of the region's name.

**Architecture:** A new route `src/routes/flag-attack/+page.svelte` that copies Map Attack's game logic and reuses the existing `MapAttackMap.svelte` component unchanged. Regions are limited to 8 world-country regions + US states. Flags load from `flagcdn.com/<alpha-2>.svg`. A module-level `flagUrlByCode` map resolves each target code to a flag URL; targets without a resolvable flag are filtered out of the eligible pool.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind v4, existing D3 `MapAttackMap` component, flagcdn.com CDN.

**Note on testing:** This project has no unit-test runner. Verification per task = `npm run check` (must stay at 0 errors; 4 pre-existing benign `state_referenced_locally` warnings are expected) plus manual browser checks. All commands run from the worktree root: `/Users/jelsherbini/dev/geography_game/.worktrees/flag-attack`.

**Reference files (read before starting):**
- `src/routes/map-attack/+page.svelte` — the template to copy.
- `src/lib/components/MapAttackMap.svelte` — reused unchanged; note props `targetCode`, `claimedCountries`, `activeSubnationalIsoA2s`, `onCountryClick`, and methods `redraw()`, `flashWrong(code)`.
- `src/lib/data/countries.ts` — `getCountryList()`, `getSubdivisionList()`, `ALL_REGIONS`, `REGION_LABELS`, `SUBNATIONAL_PARENT_ISO_A2`, `countries` (GeoJSON), `Region` type.

---

### Task 1: Add a flag-URL helper to `countries.ts`

**Files:**
- Modify: `src/lib/data/countries.ts` (append near the other exports)

**Step 1: Add `FLAG_REGIONS` constant**

After the `ALL_REGIONS` export, add the limited region set for flag mode:

```ts
/** Regions available in Flag Attack: world countries + US states (for now). */
export const FLAG_REGIONS: Region[] = [
	'north-america',
	'south-america',
	'europe',
	'asia',
	'africa',
	'oceania',
	'small-islands',
	'city-states',
	'us-states'
];
```

**Step 2: Add `getFlagUrl` resolver**

Append a function that maps a target code (country ISO_A3 or subdivision `US-CA`) to a flagcdn URL, or `null` if none resolvable. Country alpha-2 comes from the GeoJSON feature (`ISO_A2_EH`, fallback `ISO_A2`); subdivision codes are already `US-CA` form.

```ts
/**
 * Resolve a target code to a flagcdn SVG URL.
 * - Subdivisions (e.g. "US-CA") -> https://flagcdn.com/us-ca.svg
 * - Countries (ISO_A3, e.g. "FRA") -> look up alpha-2 -> https://flagcdn.com/fr.svg
 * Returns null when no valid alpha-2 exists (e.g. Somaliland, N. Cyprus).
 */
export function getFlagUrl(code: string): string | null {
	if (code.includes('-')) {
		return `https://flagcdn.com/${code.toLowerCase()}.svg`;
	}
	const feature = countries.features.find((f) => {
		const c = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
		return c === code;
	});
	if (!feature) return null;
	const p = feature.properties as Record<string, unknown>;
	const a2raw = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
	const a2 = typeof a2raw === 'string' ? a2raw : '';
	if (!a2 || a2 === '-99') return null;
	return `https://flagcdn.com/${a2.toLowerCase()}.svg`;
}
```

Note: `CountryProperties` doesn't declare `ISO_A2`/`ISO_A2_EH`, but it has an index signature `[key: string]: unknown`, so the `as Record<string, unknown>` cast is for clarity/safety.

**Step 3: Verify**

Run: `npm run check`
Expected: 0 errors (4 pre-existing warnings unchanged).

**Step 4: Commit**

```bash
git add src/lib/data/countries.ts
git commit -m "Add FLAG_REGIONS and getFlagUrl helper for flag mode"
```

---

### Task 2: Create the `/flag-attack` route (game logic, name prompt first)

Create the page as a copy of map-attack but importing `FLAG_REGIONS` for the toggles and using a separate storage key. In this task the prompt still shows the **name** (we swap to the flag in Task 3) so we can verify the game logic in isolation.

**Files:**
- Create: `src/routes/flag-attack/+page.svelte`

**Step 1: Create the file**

Copy `src/routes/map-attack/+page.svelte` and apply these changes:

1. Imports — add `FLAG_REGIONS` and `getFlagUrl`:

```ts
import {
	getCountryList,
	getSubdivisionList,
	FLAG_REGIONS,
	REGION_LABELS,
	SUBNATIONAL_PARENT_ISO_A2,
	getFlagUrl,
	type Region
} from '$lib/data/countries';
```

2. Storage key:

```ts
const STORAGE_KEY = 'flag-attack-regions';
```

3. Region defaults/loops — replace **every** use of `ALL_REGIONS` with `FLAG_REGIONS` (there are several: `loadRegions` defaults x3, `regionCounts` init loop, `anyRegionSelected`, and the `{#each ALL_REGIONS as region}` in setup markup).

4. Eligible pool — filter out targets with no flag. In `startGame`, change:

```ts
eligibleCountries = allTargets
	.filter((c) => selectedRegions[c.region])
	.filter((c) => getFlagUrl(c.code) !== null)
	.map((c) => c.code);
```

5. Header copy: change `<h1>Map Attack</h1>` → `<h1>Flag Attack</h1>`, the setup `<p>` to "Select regions to include, then identify every country by its flag. You have 3 lives.", and the results "All {totalCountries} countries identified" stays fine.

6. Leave the HUD prompt as the name for now (`{currentTarget ? nameByCode[currentTarget] ?? currentTarget : ''}`) — swapped in Task 3.

**Step 2: Verify check**

Run: `npm run check`
Expected: 0 errors (warnings may now appear for the new file's benign `state_referenced_locally` — acceptable, matching map-attack's pattern).

**Step 3: Verify in browser**

Run dev server (if not already running): `npm run dev`
Visit `http://localhost:5173/flag-attack` (note: base path may apply — check the dev server output URL).
Confirm: setup shows only the 9 FLAG_REGIONS pills with counts; Start begins a game; clicking the correct country advances, wrong click flashes + costs a life; win/lose reach results.

**Step 4: Commit**

```bash
git add src/routes/flag-attack/+page.svelte
git commit -m "Add flag-attack route with limited regions (name prompt)"
```

---

### Task 3: Swap the name prompt for a floating flag card

**Files:**
- Modify: `src/routes/flag-attack/+page.svelte`

**Step 1: Add a derived flag URL**

In the game-state section, add:

```ts
let currentFlagUrl = $derived(currentTarget ? getFlagUrl(currentTarget) : null);
```

**Step 2: Remove the name from the top HUD bar**

In the `playing` phase, replace the `Click on: <span>...</span>` block (the `<div class="text-lg font-semibold">…</div>`) with a short static label so the bar still balances, e.g.:

```svelte
<div class="text-lg font-semibold text-muted">Find this flag</div>
```

(Keep the back link, counter, hearts, and ↻ button exactly as-is.)

**Step 3: Add the floating flag card over the map**

Inside the `playing` phase map container (`<div class="flex-1 relative overflow-hidden">`), add the card as a sibling of `<MapAttackMap>`:

```svelte
{#if currentFlagUrl}
	<div
		class="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface/95 rounded-xl
		       shadow-lg border border-edge p-3 pointer-events-none"
	>
		<img
			src={currentFlagUrl}
			alt="Flag to identify"
			class="h-[100px] w-auto block rounded-sm"
			loading="eager"
		/>
	</div>
{/if}
```

`pointer-events-none` ensures the card never intercepts map clicks. `min`-sizing isn't required since flag aspect ratios are bounded; if layout jump is noticeable, add `min-w-[150px]` to the card.

**Step 4: Verify check**

Run: `npm run check`
Expected: 0 errors.

**Step 5: Verify in browser**

Reload `/flag-attack`, start a game. Confirm: a ~100px flag appears in a card centered at the top of the map; it updates each target; clicking the matching country claims it; the card doesn't block clicks underneath. Try a game including **US States** and confirm state flags render and US subdivisions appear on the map.

**Step 6: Commit**

```bash
git add src/routes/flag-attack/+page.svelte
git commit -m "Show floating flag card instead of name prompt"
```

---

### Task 4: Add home-page link

**Files:**
- Modify: `src/routes/+page.svelte` (around line 133, next to the Map Attack link)

**Step 1: Add the link**

After the Map Attack `<a>`:

```svelte
<a href="{base}/flag-attack" class="text-sm text-muted hover:text-fg">Flag Attack</a>
```

**Step 2: Verify**

Run: `npm run check` → 0 errors.
In browser, load home page, click "Flag Attack" → routes to the flag game.

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "Link Flag Attack from home page"
```

---

### Task 5: Final verification & polish

**Step 1: Full check**

Run: `npm run check`
Expected: 0 errors; only the pre-existing benign warnings (+ any benign `state_referenced_locally` from the new page, consistent with map-attack).

**Step 2: Manual end-to-end pass**

- Setup persists region selection across reload (localStorage `flag-attack-regions`).
- Play a full quick game to a win (select one small region) and to a loss (3 wrong clicks).
- Confirm Change Regions (↻ and results button) returns to setup.
- Confirm an obscure-territory-heavy region (Small Islands) shows no broken/blank flags for claimable targets (unanswerable ones are pre-filtered).

**Step 3: Update MEMORY note (optional)**

If desired, note the new route in the project memory: two routes → now includes `/flag-attack`.

**Step 4: Final commit if any polish made**

```bash
git add -A
git commit -m "Polish flag-attack mode"
```

---

## Done criteria

- `/flag-attack` reachable from home page.
- Setup shows the 9 FLAG_REGIONS only, persisted separately from map-attack.
- Playing shows a ~100px flag card; gameplay matches map-attack exactly.
- US state flags work; unanswerable targets never appear.
- `npm run check` = 0 errors.
