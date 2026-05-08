# Map Attack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Map Attack" game mode where players identify every country in selected regions by clicking directly on a zoomable/pannable map, with 3 lives.

**Architecture:** Two new files — a page component (`/map-attack`) with three phases (setup, playing, results) and a dedicated map component (`MapAttackMap.svelte`) using D3 zoom for free-form interaction. Completely independent from the existing learning mode. Reuses shared country data and region types.

**Tech Stack:** SvelteKit, Svelte 5 runes, D3.js (geoNaturalEarth1 projection + d3.zoom), Tailwind CSS, svelte-sonner for toasts.

---

### Task 1: Add region color constants to countries.ts

**Files:**
- Modify: `src/lib/data/countries.ts`

**Step 1: Add the REGION_COLORS export**

Add this after the `REGION_LABELS` export (around line 50):

```typescript
export const REGION_COLORS: Record<Region, string> = {
	'north-america': '#2dd4bf',
	'south-america': '#fbbf24',
	europe: '#60a5fa',
	asia: '#fb7185',
	africa: '#4ade80',
	oceania: '#c084fc',
	'small-islands': '#22d3ee',
	'city-states': '#fb923c'
};
```

**Step 2: Verify the app still builds**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/data/countries.ts
git commit -m "feat: add REGION_COLORS constant for map attack mode"
```

---

### Task 2: Create MapAttackMap.svelte — canvas rendering with D3 zoom

**Files:**
- Create: `src/lib/components/MapAttackMap.svelte`

This is the core map component. It handles: canvas rendering, D3 zoom/pan, hover detection, click handling, and visual states (claimed, highlighted, flash). This is the largest task.

**Step 1: Create the component with full implementation**

Create `src/lib/components/MapAttackMap.svelte` with the following:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import {
    countries,
    type CountryProperties,
    getRegion,
    REGION_COLORS
  } from '$lib/data/countries';
  import type { Feature, Geometry } from 'geojson';

  let {
    targetCode = '',
    claimedCountries = new Set<string>(),
    onCountryClick
  }: {
    targetCode?: string;
    claimedCountries?: Set<string>;
    onCountryClick?: (code: string) => void;
  } = $props();

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let width = $state(960);
  let height = $state(500);
  let hoveredCode = $state<string | null>(null);
  let flashCode = $state<string | null>(null);
  let clickBlocked = $state(false);

  // D3 zoom state
  let currentTransform = $state(d3.zoomIdentity);
  let zoomBehavior: d3.ZoomBehavior<HTMLCanvasElement, unknown>;

  function getCodeForFeature(f: Feature<Geometry, CountryProperties>): string {
    return f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
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

  function getFillColor(code: string): string {
    if (flashCode === code) return '#ef4444';
    if (claimedCountries.has(code)) return REGION_COLORS[getRegion(code)];
    if (hoveredCode === code) return '#9ca3af';
    return '#6b7280';
  }

  function getStrokeWidth(code: string): number {
    if (hoveredCode === code && !claimedCountries.has(code)) return 1.5;
    return 0.5;
  }

  function getStrokeColor(code: string): string {
    if (hoveredCode === code && !claimedCountries.has(code)) return '#d1d5db';
    return '#374151';
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

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
  }

  function findCountryAtPoint(x: number, y: number): string | null {
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

  function handleMouseMove(e: MouseEvent) {
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const code = findCountryAtPoint(x, y);
    if (code !== hoveredCode) {
      hoveredCode = code;
      drawMap();
    }
  }

  function handleMouseLeave() {
    if (hoveredCode !== null) {
      hoveredCode = null;
      drawMap();
    }
  }

  function handleClick(e: MouseEvent) {
    if (clickBlocked) return;

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const code = findCountryAtPoint(x, y);

    if (!code) return; // clicked ocean
    if (claimedCountries.has(code)) return; // already claimed

    onCountryClick?.(code);
  }

  export function flashWrong(code: string) {
    flashCode = code;
    clickBlocked = true;
    drawMap();
    setTimeout(() => {
      flashCode = null;
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

    // Max zoom: roughly stage-2 level (630km extent)
    // Base scale shows full world. Stage 2 scale ≈ width / (630/111 * π/180) / 2
    const maxK = (width / ((630 / 111) * (Math.PI / 180)) / 2) / baseScale;

    zoomBehavior = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, maxK])
      .on('zoom', (event) => {
        currentTransform = event.transform;
        drawMap();
      });

    d3.select(canvasEl).call(zoomBehavior);

    // Disable double-click zoom to avoid interfering with click-to-answer
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

    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  class="w-full h-full relative"
  style="cursor: {hoveredCode && !claimedCountries.has(hoveredCode) ? 'pointer' : 'grab'}"
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

**Key design decisions:**
- D3 zoom modifies a transform that is applied to the base projection on each render. `buildProjection()` creates the base (world-fitted) projection, and `getTransformedProjection()` applies the current zoom transform's scale + translate to it.
- `findCountryAtPoint()` inverts the screen coordinates through the transformed projection and uses `d3.geoContains()` for hit detection — no radius circle needed.
- `flashWrong()` is an exported method called by the parent page to trigger the red flash + click block.
- `redraw()` is exported so the parent can trigger a repaint after updating `claimedCountries`.
- The `onmousemove` handler is on the container div (not the canvas) since D3 zoom captures pointer events on the canvas. **Note:** If hover detection doesn't work because D3 zoom intercepts events, we may need to listen on the zoom event's `sourceEvent` instead. Test this during implementation.
- Double-click zoom is disabled to prevent accidental zoom when clicking answers.

**Step 2: Verify the app builds**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/components/MapAttackMap.svelte
git commit -m "feat: add MapAttackMap component with D3 zoom and hover detection"
```

---

### Task 3: Create the /map-attack page — setup phase

**Files:**
- Create: `src/routes/map-attack/+page.svelte`

**Step 1: Create the page with all three phases**

Create `src/routes/map-attack/+page.svelte`:

```svelte
<script lang="ts">
  import { base } from '$app/paths';
  import MapAttackMap from '$lib/components/MapAttackMap.svelte';
  import {
    getCountryList,
    ALL_REGIONS,
    REGION_LABELS,
    REGION_COLORS,
    type Region
  } from '$lib/data/countries';

  const STORAGE_KEY = 'map-attack-regions';
  const MAX_LIVES = 3;

  const countryList = getCountryList();
  const nameByCode = Object.fromEntries(countryList.map((c) => [c.code, c.name]));

  // --- State ---
  type Phase = 'setup' | 'playing' | 'results';
  let phase = $state<Phase>('setup');

  // Region selection (persisted)
  function loadRegions(): Record<Region, boolean> {
    if (typeof window === 'undefined') {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
  }

  let selectedRegions = $state<Record<Region, boolean>>(loadRegions());

  function saveRegions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedRegions));
  }

  function toggleRegion(region: Region) {
    selectedRegions[region] = !selectedRegions[region];
    saveRegions();
  }

  let regionCounts = $derived.by(() => {
    const counts: Record<Region, number> = {} as Record<Region, number>;
    for (const r of ALL_REGIONS) counts[r] = 0;
    for (const c of countryList) counts[c.region] += 1;
    return counts;
  });

  let anyRegionSelected = $derived(ALL_REGIONS.some((r) => selectedRegions[r]));

  // --- Game state ---
  let lives = $state(MAX_LIVES);
  let claimedCountries = $state(new Set<string>());
  let currentTarget = $state<string | null>(null);
  let won = $state(false);

  let eligibleCountries: string[] = [];
  let remainingCountries: string[] = [];

  let mapComponent: ReturnType<typeof MapAttackMap>;

  let totalCountries = $derived(eligibleCountries.length);
  let claimedCount = $derived(claimedCountries.size);

  function startGame() {
    eligibleCountries = countryList
      .filter((c) => selectedRegions[c.region])
      .map((c) => c.code);
    remainingCountries = shuffle([...eligibleCountries]);
    claimedCountries = new Set();
    lives = MAX_LIVES;
    won = false;
    currentTarget = remainingCountries.pop() ?? null;
    phase = 'playing';
  }

  function pickNextTarget() {
    if (remainingCountries.length === 0) {
      // Win!
      won = true;
      phase = 'results';
      return;
    }
    currentTarget = remainingCountries.pop() ?? null;
  }

  function handleCountryClick(code: string) {
    if (!currentTarget) return;

    if (code === currentTarget) {
      // Correct!
      claimedCountries = new Set([...claimedCountries, code]);
      mapComponent?.redraw();
      pickNextTarget();
    } else {
      // Wrong
      lives -= 1;
      mapComponent?.flashWrong(code);
      if (lives <= 0) {
        // Game over after flash
        setTimeout(() => {
          won = false;
          phase = 'results';
        }, 600);
      }
    }
  }

  function playAgain() {
    startGame();
  }

  function changeRegions() {
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
        <h1 class="text-2xl font-bold">Map Attack</h1>
        <a href="{base}/" class="text-sm text-gray-400 hover:text-white">Back to Game</a>
      </div>

      <p class="text-gray-400 mb-4">Select regions to include, then identify every country. You have 3 lives.</p>

      <div class="flex flex-wrap gap-2 mb-6">
        {#each ALL_REGIONS as region}
          <button
            onclick={() => toggleRegion(region)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2"
            style={selectedRegions[region]
              ? `background-color: ${REGION_COLORS[region]}; border-color: ${REGION_COLORS[region]}; color: #111`
              : `background-color: transparent; border-color: #4b5563; color: #9ca3af`}
          >
            {REGION_LABELS[region]} ({regionCounts[region]})
          </button>
        {/each}
      </div>

      <button
        onclick={startGame}
        disabled={!anyRegionSelected}
        class="w-full py-3 rounded-lg font-semibold text-lg transition-colors {anyRegionSelected
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
        Click on: <span class="text-blue-400">{currentTarget ? nameByCode[currentTarget] ?? currentTarget : ''}</span>
      </div>
      <div class="text-sm text-gray-300">
        {claimedCount} / {totalCountries}
      </div>
      <div class="flex gap-1">
        {#each Array(MAX_LIVES) as _, i}
          <span class="text-xl">{i < lives ? '❤️' : '🩶'}</span>
        {/each}
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        bind:this={mapComponent}
        targetCode={currentTarget ?? ''}
        {claimedCountries}
        onCountryClick={handleCountryClick}
      />
    </div>
  </div>

{:else}
  <!-- Results overlay on top of map -->
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        targetCode=""
        {claimedCountries}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-gray-400 mb-6">All {totalCountries} countries identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-gray-400 mb-6">{claimedCount} / {totalCountries} countries identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeRegions}
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600"
            >
              Change Regions
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 block text-center"
            >
              Back to Game
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
```

**Step 2: Verify the app builds**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/routes/map-attack/+page.svelte
git commit -m "feat: add /map-attack page with setup, playing, and results phases"
```

---

### Task 4: Add navigation links to Map Attack

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/manage/+page.svelte`

**Step 1: Add Map Attack link to the main game page**

In `src/routes/+page.svelte`, find the header section (around line 88-97). Change the `<a>` for "Manage Countries" area to include a Map Attack link too. Replace:

```svelte
    <a href="{base}/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
```

With:

```svelte
    <div class="flex gap-4">
      <a href="{base}/map-attack" class="text-sm text-gray-400 hover:text-white">Map Attack</a>
      <a href="{base}/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
    </div>
```

**Step 2: Add Map Attack link to the manage page**

In `src/routes/manage/+page.svelte`, find the header links area (around line 82-88). Change:

```svelte
        <a href="{base}/" class="text-sm text-blue-400 hover:text-blue-300">Back to Game</a>
```

To:

```svelte
        <a href="{base}/map-attack" class="text-sm text-blue-400 hover:text-blue-300">Map Attack</a>
        <a href="{base}/" class="text-sm text-blue-400 hover:text-blue-300">Back to Game</a>
```

**Step 3: Verify the app builds**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/routes/+page.svelte src/routes/manage/+page.svelte
git commit -m "feat: add Map Attack navigation links to game and manage pages"
```

---

### Task 5: Manual testing and bug fixes

**Files:**
- May modify: `src/lib/components/MapAttackMap.svelte`, `src/routes/map-attack/+page.svelte`

**Step 1: Start the dev server**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run dev`

**Step 2: Test the following scenarios**

1. **Setup phase**: Navigate to `/map-attack`. Toggle regions on/off. Verify counts update. Verify Start button disables when no regions selected. Verify region selection persists on page reload.

2. **Zoom/pan**: Start a game. Scroll wheel to zoom in/out. Click-and-drag to pan. Verify zoom limits (can't zoom out past world view, max zoom is reasonable). Verify pinch-to-zoom on mobile/trackpad.

3. **Hover**: Move mouse over countries. Verify unclaimed countries highlight (lighter fill + thicker border). Verify cursor changes to pointer over unclaimed countries and grab elsewhere. Verify claimed countries have subtler hover.

4. **Click-to-answer**: Click the correct country — verify it fills with region color and a new target appears. Click a wrong country — verify it flashes red, life is deducted, same target remains.

5. **Win condition**: Play with City-states (fewest countries) and verify victory screen appears after all are identified.

6. **Lose condition**: Deliberately miss 3 times. Verify game over screen with correct stats.

7. **Results screen**: Verify map is visible behind the results overlay. Test Play Again and Change Regions buttons.

8. **D3 zoom + click interaction**: The most likely bug area. If `d3.zoom()` captures mouse events before our `onclick` handler, hover detection and click handling may not work. In that case, move event handling into the zoom behavior's event listener using `event.sourceEvent`. This would mean:
   - In `onMount`, add a `'click'` filter or use the zoom event's `sourceEvent` to detect clicks
   - Move `handleMouseMove` logic into the zoom `'zoom'` event using `event.sourceEvent.type === 'mousemove'`

**Step 3: Fix any issues found**

Apply fixes directly. Common anticipated issues:
- D3 zoom intercepting click/hover events (see above)
- Canvas not repainting on `claimedCountries` prop change (may need `$effect` to call `drawMap()`)
- Zoom transform not accounting for resize correctly

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: address map attack testing issues"
```

---

### Task 6: Final verification

**Step 1: Run type check**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run check`
Expected: No errors

**Step 2: Run build**

Run: `cd /Users/jelsherbini/dev/geography_game && npm run build`
Expected: Clean build, static output in `build/`

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final map attack polish"
```
