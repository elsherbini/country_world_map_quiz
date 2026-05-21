# Theming (Light / Dark / High-Contrast) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add light mode and a high-contrast mode to the geography game, and raise contrast on the maps (country borders, land/sea boundary).

**Architecture:** Two independent axes — `mode` (light/dark) and `highContrast` (bool) — combine into one of four `data-theme` keys on `<html>`. All colors become CSS custom properties defined per theme in `app.css`; page UI uses Tailwind v4 semantic tokens, and the three canvas maps read the same CSS variables via `getComputedStyle`. A reactive module owns the state; an inline script in `app.html` prevents a flash on load.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind CSS v4, D3 canvas rendering, `localStorage`.

**Design doc:** `docs/plans/2026-05-21-theming-design.md`

**Note on testing:** This project has no unit-test runner — only `npm run check` (svelte-check). Every task's gate is `npm run check` passing clean. Visual tasks additionally call for a manual check in `npm run dev`; the final task is the full manual matrix.

**Note on git:** Work happens directly on `main` (user's choice — no worktree). Commit after each task.

---

## Reference: UI class mapping table

Used by Tasks 9–12. Replace every occurrence of the old Tailwind class with the new semantic class. This list is exhaustive for the color utilities currently in the codebase.

| Old class | New class |
|-----------|-----------|
| `bg-gray-900` | `bg-canvas` |
| `bg-gray-800` | `bg-surface` |
| `bg-gray-700` | `bg-raised` |
| `hover:bg-gray-600` | `hover:bg-raised-hover` |
| `bg-blue-600` | `bg-accent` |
| `hover:bg-blue-500` | `hover:bg-accent-hover` |
| `bg-red-700` | `bg-danger` |
| `hover:bg-red-600` | `hover:bg-danger-hover` |
| `bg-green-700` | `bg-success` |
| `hover:bg-green-600` | `hover:bg-success-hover` |
| `bg-yellow-700` | `bg-warning` |
| `hover:bg-yellow-600` | `hover:bg-warning-hover` |
| `bg-black/60` | *(unchanged — modal scrim)* |
| `text-white` | `text-fg` |
| `text-gray-300` | `text-fg` |
| `text-gray-400` | `text-muted` |
| `text-gray-500` | `text-muted` |
| `text-gray-600` | `text-muted` |
| `text-blue-400` | `text-accent` |
| `hover:text-white` | `hover:text-fg` |
| `hover:text-blue-300` | `hover:text-accent-hover` |
| `border-gray-500` | `border-edge` |
| `border-gray-600` | `border-edge` |
| `border-gray-700` | `border-edge` |
| `border-gray-800` | `border-edge` |
| `border-blue-600` | `border-accent` |
| `hover:border-white` | `hover:border-fg` |

**Outlier — handle explicitly, do NOT use the table:** the manage-page "Reset" button uses `bg-gray-600 ... hover:bg-gray-500`. Map it to `bg-raised hover:bg-raised-hover` (Task 10 covers this).

---

## Task 1: CSS tokens & theme palettes

**Files:**
- Modify: `src/app.css` (currently only `@import "tailwindcss";`)

**Step 1: Replace the entire file with the token system**

```css
@import "tailwindcss";

/* Semantic UI tokens — each maps to a per-theme custom property below.
   `inline` makes utilities emit `var(--canvas)` directly so they re-resolve
   when the [data-theme] attribute changes. */
@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-raised: var(--raised);
  --color-raised-hover: var(--raised-hover);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-fg: var(--accent-fg);
  --color-edge: var(--edge);
  --color-success: var(--success);
  --color-success-hover: var(--success-hover);
  --color-danger: var(--danger);
  --color-danger-hover: var(--danger-hover);
  --color-warning: var(--warning);
  --color-warning-hover: var(--warning-hover);
}

/* ---- Dark (default) ---- */
:root,
[data-theme='dark'] {
  --canvas: #0b0f1a;
  --surface: #1b2333;
  --raised: #2a3447;
  --raised-hover: #3a4761;
  --fg: #f5f7fa;
  --muted: #aab4c4;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-fg: #ffffff;
  --edge: #5b6678;
  --success: #22c55e;
  --success-hover: #4ade80;
  --danger: #ef4444;
  --danger-hover: #f87171;
  --warning: #d97706;
  --warning-hover: #f59e0b;

  --map-land: #8b94a5;
  --map-land-border: #cbd2de;
  --map-backdrop: #2a3344;
  --map-backdrop-border: #4a5568;
  --map-sea: #0b0f1a;
  --map-lake: #0b0f1a;
  --map-hover: #dde2ea;
  --map-hover-border: #ffffff;
  --map-subdiv-border: #aab4c4;
  --map-hit: #22c55e;
  --map-miss: #ef4444;
  --map-claimed: #4ade80;
  --map-claimed-hover: #86efac;
  --map-cursor: #3b82f6;
}

/* ---- Light ---- */
[data-theme='light'] {
  --canvas: #eef1f6;
  --surface: #ffffff;
  --raised: #e2e6ec;
  --raised-hover: #d2d8e0;
  --fg: #161a22;
  --muted: #56606f;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-fg: #ffffff;
  --edge: #b3bcc9;
  --success: #16a34a;
  --success-hover: #15803d;
  --danger: #dc2626;
  --danger-hover: #b91c1c;
  --warning: #ca8a04;
  --warning-hover: #a16207;

  --map-land: #a9b4c2;
  --map-land-border: #3c4453;
  --map-backdrop: #cfd6df;
  --map-backdrop-border: #8a93a2;
  --map-sea: #eef1f6;
  --map-lake: #eef1f6;
  --map-hover: #97a2b2;
  --map-hover-border: #161a22;
  --map-subdiv-border: #7c8696;
  --map-hit: #15a047;
  --map-miss: #dc2626;
  --map-claimed: #16a34a;
  --map-claimed-hover: #15803d;
  --map-cursor: #2563eb;
}

/* ---- Dark, high contrast ---- */
[data-theme='dark-hc'] {
  --canvas: #000000;
  --surface: #000000;
  --raised: #1a1a1a;
  --raised-hover: #2e2e2e;
  --fg: #ffffff;
  --muted: #ededed;
  --accent: #4cc2ff;
  --accent-hover: #82d4ff;
  --accent-fg: #000000;
  --edge: #ffffff;
  --success: #3bff86;
  --success-hover: #74ffae;
  --danger: #ff6b6b;
  --danger-hover: #ff9a9a;
  --warning: #ffd60a;
  --warning-hover: #ffe45c;

  --map-land: #ffffff;
  --map-land-border: #000000;
  --map-backdrop: #2e2e2e;
  --map-backdrop-border: #ffffff;
  --map-sea: #000000;
  --map-lake: #000000;
  --map-hover: #ffe45c;
  --map-hover-border: #000000;
  --map-subdiv-border: #4cc2ff;
  --map-hit: #3bff86;
  --map-miss: #ff6b6b;
  --map-claimed: #3bff86;
  --map-claimed-hover: #aaffce;
  --map-cursor: #4cc2ff;
}

/* ---- Light, high contrast ---- */
[data-theme='light-hc'] {
  --canvas: #ffffff;
  --surface: #ffffff;
  --raised: #e6e6e6;
  --raised-hover: #d0d0d0;
  --fg: #000000;
  --muted: #1a1a1a;
  --accent: #0040c1;
  --accent-hover: #0030a0;
  --accent-fg: #ffffff;
  --edge: #000000;
  --success: #006d2c;
  --success-hover: #00521f;
  --danger: #c20000;
  --danger-hover: #960000;
  --warning: #8a5a00;
  --warning-hover: #6b4500;

  --map-land: #000000;
  --map-land-border: #ffffff;
  --map-backdrop: #d0d0d0;
  --map-backdrop-border: #000000;
  --map-sea: #ffffff;
  --map-lake: #ffffff;
  --map-hover: #0040c1;
  --map-hover-border: #ffffff;
  --map-subdiv-border: #c20000;
  --map-hit: #00a23f;
  --map-miss: #e60000;
  --map-claimed: #00a23f;
  --map-claimed-hover: #00701f;
  --map-cursor: #0040c1;
}

/* GameMap SVG cursor — themed via CSS so it needs no JS */
.map-cursor {
  fill: var(--map-cursor);
  fill-opacity: 0.3;
  stroke: var(--map-cursor);
  stroke-width: 2;
}
```

**Step 2: Verify**

Run: `npm run check`
Expected: PASS (no Svelte/TS errors — this file is plain CSS).

**Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat: add light/dark/high-contrast CSS token palettes"
```

---

## Task 2: Theme state module

**Files:**
- Create: `src/lib/theme.svelte.ts`

The `.svelte.ts` extension is required for module-level `$state`. Import it elsewhere as `$lib/theme.svelte`.

**Step 1: Create the file**

```ts
import { browser } from '$app/environment';

export type Mode = 'light' | 'dark';
export type ThemeKey = 'dark' | 'light' | 'dark-hc' | 'light-hc';

function initialMode(): Mode {
  if (!browser) return 'dark';
  const stored = localStorage.getItem('theme-mode');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialContrast(): boolean {
  if (!browser) return false;
  return localStorage.getItem('theme-contrast') === 'true';
}

/** Reactive theme state. Mutate `.mode` / `.highContrast` to change the theme. */
export const theme = $state({
  mode: initialMode(),
  highContrast: initialContrast()
});

/** Pure: combine the two axes into a single data-theme key. */
export function resolveTheme(mode: Mode, highContrast: boolean): ThemeKey {
  return (highContrast ? `${mode}-hc` : mode) as ThemeKey;
}

/** Sync the <html data-theme> attribute to current state. Does NOT persist. */
export function applyTheme(): void {
  if (!browser) return;
  document.documentElement.dataset.theme = resolveTheme(theme.mode, theme.highContrast);
}

/** Write the user's explicit choice to localStorage. */
function persist(): void {
  if (!browser) return;
  localStorage.setItem('theme-mode', theme.mode);
  localStorage.setItem('theme-contrast', String(theme.highContrast));
}

export function toggleMode(): void {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
  applyTheme();
  persist();
}

export function toggleContrast(): void {
  theme.highContrast = !theme.highContrast;
  applyTheme();
  persist();
}

export interface MapColors {
  land: string;
  landBorder: string;
  backdrop: string;
  backdropBorder: string;
  sea: string;
  lake: string;
  hover: string;
  hoverBorder: string;
  subdivBorder: string;
  hit: string;
  miss: string;
  claimed: string;
  claimedHover: string;
  cursor: string;
}

/** Dark-theme map colors — used as the pre-hydration / SSR fallback. */
export const DEFAULT_MAP_COLORS: MapColors = {
  land: '#8b94a5',
  landBorder: '#cbd2de',
  backdrop: '#2a3344',
  backdropBorder: '#4a5568',
  sea: '#0b0f1a',
  lake: '#0b0f1a',
  hover: '#dde2ea',
  hoverBorder: '#ffffff',
  subdivBorder: '#aab4c4',
  hit: '#22c55e',
  miss: '#ef4444',
  claimed: '#4ade80',
  claimedHover: '#86efac',
  cursor: '#3b82f6'
};

/** Read the current theme's --map-* custom properties off <html>.
    Call only on the client (inside an effect / onMount). */
export function getMapColors(): MapColors {
  if (!browser) return DEFAULT_MAP_COLORS;
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    land: v('--map-land'),
    landBorder: v('--map-land-border'),
    backdrop: v('--map-backdrop'),
    backdropBorder: v('--map-backdrop-border'),
    sea: v('--map-sea'),
    lake: v('--map-lake'),
    hover: v('--map-hover'),
    hoverBorder: v('--map-hover-border'),
    subdivBorder: v('--map-subdiv-border'),
    hit: v('--map-hit'),
    miss: v('--map-miss'),
    claimed: v('--map-claimed'),
    claimedHover: v('--map-claimed-hover'),
    cursor: v('--map-cursor')
  };
}
```

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/theme.svelte.ts
git commit -m "feat: add reactive theme state module"
```

---

## Task 3: Flash-prevention script

**Files:**
- Modify: `src/app.html`

**Step 1: Add an inline script to `<head>`, immediately before `%sveltekit.head%`**

```html
		<script>
			(function () {
				try {
					var m = localStorage.getItem('theme-mode');
					var hc = localStorage.getItem('theme-contrast') === 'true';
					if (m !== 'light' && m !== 'dark') {
						m = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
					}
					document.documentElement.dataset.theme = m + (hc ? '-hc' : '');
				} catch (e) {
					document.documentElement.dataset.theme = 'dark';
				}
			})();
		</script>
		%sveltekit.head%
```

This runs synchronously before first paint, so the page renders in the correct theme with no flash. It only reads `localStorage` — it never writes, so the OS preference keeps being followed until the user makes an explicit choice.

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/app.html
git commit -m "feat: set data-theme before paint to prevent flash"
```

---

## Task 4: Theme controls component

**Files:**
- Create: `src/lib/components/ThemeControls.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { theme, toggleMode, toggleContrast } from '$lib/theme.svelte';

  // Render only after hydration so SSR's default-dark guess can't cause a mismatch.
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
</script>

{#if mounted}
  <div
    class="fixed bottom-3 right-3 z-50 flex gap-1 rounded-lg border border-edge
           bg-surface p-1 shadow-lg"
  >
    <button
      onclick={toggleMode}
      aria-label={theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme.mode === 'light'}
      title={theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      class="flex h-8 w-8 items-center justify-center rounded text-fg hover:bg-raised"
    >
      {#if theme.mode === 'dark'}
        <!-- moon -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      {:else}
        <!-- sun -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      {/if}
    </button>
    <button
      onclick={toggleContrast}
      aria-label={theme.highContrast ? 'Turn off high contrast' : 'Turn on high contrast'}
      aria-pressed={theme.highContrast}
      title={theme.highContrast ? 'Turn off high contrast' : 'Turn on high contrast'}
      class="flex h-8 w-8 items-center justify-center rounded
             {theme.highContrast ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-raised'}"
    >
      <!-- contrast: circle, left half filled -->
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" />
      </svg>
    </button>
  </div>
{/if}
```

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/components/ThemeControls.svelte
git commit -m "feat: add theme controls component"
```

---

## Task 5: Mount controls in the layout

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Replace the file contents**

```svelte
<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { Toaster } from 'svelte-sonner';
  import ThemeControls from '$lib/components/ThemeControls.svelte';
  import { applyTheme } from '$lib/theme.svelte';

  let { children } = $props();

  // Reconcile <html data-theme> with the reactive state once on the client.
  onMount(() => applyTheme());
</script>

<Toaster position="top-center" richColors visibleToasts={1} />
<ThemeControls />
{@render children()}
```

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev` and open `/`: the theme control chip appears bottom-right; clicking the mode button flips `<html data-theme>` between `dark` and `light` (inspect the element). Page UI colors will not change yet — that is Tasks 9–12.

**Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: mount theme controls in layout"
```

---

## Task 6: GameMap — theme-aware colors

**Files:**
- Modify: `src/lib/components/GameMap.svelte`

**Step 1: Add imports and a theme-colors snapshot**

In the `<script>` block, add to the imports:

```ts
import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';
```

After the `currentParams` `$state` declaration (right before `function interiorPoint`), add:

```ts
  let colors = $state(DEFAULT_MAP_COLORS);

  // Re-snapshot CSS map colors whenever the theme changes, then redraw.
  $effect(() => {
    void theme.mode;
    void theme.highContrast;
    colors = getMapColors();
    drawMap();
  });
```

**Step 2: Rewrite `drawMap` color usage**

In `drawMap`, after `ctx.clearRect(0, 0, width, height);` add an explicit sea fill:

```ts
    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, width, height);
```

Then replace the hardcoded hex values:

- Country fill block:
  - `ctx.fillStyle = highlightHit ? '#22c55e' : '#ef4444';` → `ctx.fillStyle = highlightHit ? colors.hit : colors.miss;`
  - `ctx.fillStyle = '#6b7280';` → `ctx.fillStyle = colors.land;`
  - `ctx.strokeStyle = '#374151';` → `ctx.strokeStyle = colors.landBorder;`
  - `ctx.lineWidth = 0.5;` → `ctx.lineWidth = 0.75;`
- Subdivision block:
  - `ctx.fillStyle = highlightHit ? '#22c55e' : '#ef4444';` → `ctx.fillStyle = highlightHit ? colors.hit : colors.miss;`
  - `ctx.strokeStyle = '#6b7280';` → `ctx.strokeStyle = colors.subdivBorder;`
- Lakes: `ctx.fillStyle = '#111827';` → `ctx.fillStyle = colors.lake;`
- `clickGeo` circle — replace the block body with:

```ts
      if (px) {
        const c = clickGeo.hit ? colors.hit : colors.miss;
        ctx.beginPath();
        ctx.arc(px[0], px[1], CIRCLE_RADIUS_PX, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = c;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
```

- `targetCentroidGeo` circle — replace the block body with:

```ts
      if (px) {
        ctx.beginPath();
        ctx.arc(px[0], px[1], CIRCLE_RADIUS_PX, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = colors.hit;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.hit;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
```

**Step 3: Theme the SVG cursor**

Replace the `<circle>` in the SVG with:

```svelte
      <circle class="map-cursor" cx={mousePos.x} cy={mousePos.y} r={CIRCLE_RADIUS_PX} />
```

(The `fill`, `stroke`, `stroke-width` are now supplied by the `.map-cursor` rule in `app.css`.)

**Step 4: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, open `/`: the map renders; switching theme via the corner control recolors land/sea/borders live. Borders are visibly stronger than before.

**Step 5: Commit**

```bash
git add src/lib/components/GameMap.svelte
git commit -m "feat: theme-aware colors and stronger borders in GameMap"
```

---

## Task 7: CitiesMap — theme-aware colors

**Files:**
- Modify: `src/lib/components/CitiesMap.svelte`

**Step 1: Add imports and a theme-colors snapshot**

Add to imports:

```ts
import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';
```

Replace the two `CLAIMED_*` constants:

```ts
  const CLAIMED_COLOR = '#4ade80';
  const CLAIMED_HOVER_COLOR = '#86efac';
```

with:

```ts
  let colors = $state(DEFAULT_MAP_COLORS);

  $effect(() => {
    void theme.mode;
    void theme.highContrast;
    colors = getMapColors();
    drawMap();
  });
```

**Step 2: Update `getCityFill`**

```ts
  function getCityFill(key: string): string {
    if (flashKey === key) return colors.miss;
    if (claimedCities.has(key)) {
      return hoveredKey === key ? colors.claimedHover : colors.claimed;
    }
    if (hoveredKey === key) return colors.hover;
    return colors.land;
  }
```

**Step 3: Update `drawMap`**

After `ctx.clearRect(0, 0, width, height);` add:

```ts
    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, width, height);
```

- Pass 1 (country backdrop): `ctx.fillStyle = '#1f2937';` → `ctx.fillStyle = colors.backdrop;`
- Pass 1 stroke: `ctx.strokeStyle = '#374151';` → `ctx.strokeStyle = colors.backdropBorder;`
- Pass 1 width: `ctx.lineWidth = 0.5;` → `ctx.lineWidth = 0.75;`
- Pass 2 (lakes): `ctx.fillStyle = '#111827';` → `ctx.fillStyle = colors.lake;`
- Pass 3 (city dots) stroke: `ctx.strokeStyle = hoveredKey === key ? '#f3f4f6' : '#374151';` → `ctx.strokeStyle = hoveredKey === key ? colors.hoverBorder : colors.landBorder;`

**Step 4: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, open `/cities`, start a game: dots and backdrop recolor with theme switches.

**Step 5: Commit**

```bash
git add src/lib/components/CitiesMap.svelte
git commit -m "feat: theme-aware colors in CitiesMap"
```

---

## Task 8: MapAttackMap — theme-aware colors

**Files:**
- Modify: `src/lib/components/MapAttackMap.svelte`

**Step 1: Add imports and a theme-colors snapshot**

Add to imports:

```ts
import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';
```

Replace the two `CLAIMED_*` constants:

```ts
  const CLAIMED_COLOR = '#4ade80';
  const CLAIMED_HOVER_COLOR = '#86efac';
```

with:

```ts
  let colors = $state(DEFAULT_MAP_COLORS);

  $effect(() => {
    void theme.mode;
    void theme.highContrast;
    colors = getMapColors();
    drawMap();
  });
```

**Step 2: Update the fill/stroke helpers**

```ts
  function getFillColor(code: string): string {
    if (flashCode === code) return colors.miss;
    if (claimedCountries.has(code)) {
      return hoveredCode === code ? colors.claimedHover : colors.claimed;
    }
    if (hoveredCode === code) return colors.hover;
    return colors.land;
  }
```

```ts
  function getStrokeColor(code: string): string {
    if (hoveredCode === code) return colors.hoverBorder;
    return colors.landBorder;
  }
```

(`getStrokeWidth` is unchanged.)

**Step 3: Update `drawMap`**

After `ctx.clearRect(0, 0, width, height);` add:

```ts
    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, width, height);
```

- Pass 2 (subdivision borders): `ctx.strokeStyle = '#6b7280';` → `ctx.strokeStyle = colors.subdivBorder;`
- Pass 3 (lakes): `ctx.fillStyle = '#111827';` → `ctx.fillStyle = colors.lake;`

(Country fill/stroke in Pass 1 already go through the helpers updated in Step 2. Pass 1's `ctx.lineWidth` comes from `getStrokeWidth` — leave it.)

**Step 4: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, open `/map-attack`, start a game: countries recolor with theme switches; borders are stronger.

**Step 5: Commit**

```bash
git add src/lib/components/MapAttackMap.svelte
git commit -m "feat: theme-aware colors in MapAttackMap"
```

---

## Task 9: Home/game page — UI token swap

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Apply the mapping table**

Read the file, then apply every row of the **UI class mapping table** (top of this plan) to the markup. Notable spots: root `bg-gray-900 text-white`, header `bg-gray-800`, nav links `text-gray-400 hover:text-white`, the regions overlay (`bg-gray-900`, region buttons `bg-blue-600 border-blue-600 text-white` / `bg-transparent border-gray-600 text-gray-400`, Done button `bg-blue-600 hover:bg-blue-500 text-white`), and the stats bar `bg-gray-800 text-gray-400`.

There are no outliers in this file — the table covers every color class.

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, open `/`: switching to light mode now recolors the whole game page; check the regions overlay too.

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: themed UI tokens on game page"
```

---

## Task 10: Manage page — UI token swap

**Files:**
- Modify: `src/routes/manage/+page.svelte`

**Step 1: Apply the mapping table**

Apply every row of the **UI class mapping table** to the markup.

**Step 2: Fix the outlier — the "Reset" button**

The per-item "Reset" button is `class="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"`. The table does not cover `bg-gray-600` as a base class or `hover:bg-gray-500`. Change it to:

```svelte
class="text-xs px-2 py-1 bg-raised rounded hover:bg-raised-hover"
```

**Step 3: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, open `/manage`: page recolors with theme; check the region pills, the status-group buttons (Skip/Unskip green/yellow), and Reset / Reset All.

**Step 4: Commit**

```bash
git add src/routes/manage/+page.svelte
git commit -m "feat: themed UI tokens on manage page"
```

---

## Task 11: Cities page — UI token swap

**Files:**
- Modify: `src/routes/cities/+page.svelte`

**Step 1: Apply the mapping table**

Read the whole file (setup, playing, and results phases) and apply every row of the **UI class mapping table**. Notable spots: phase containers `bg-gray-900 text-white`, the playing-phase HUD (`bg-black/60` stays; `text-blue-400`, `text-gray-300`), the "?" button (`border border-gray-500 text-gray-400 hover:text-white hover:border-white` → `border border-edge text-muted hover:text-fg hover:border-fg`), and the results overlay (`bg-black/60` stays; card `bg-gray-800`; buttons `bg-blue-600 hover:bg-blue-500`, `bg-gray-700 hover:bg-gray-600`).

`bg-black/60` is a modal scrim — leave it unchanged. There are no other outliers.

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, walk `/cities` through setup → playing → results in light mode; confirm legibility at each phase.

**Step 3: Commit**

```bash
git add src/routes/cities/+page.svelte
git commit -m "feat: themed UI tokens on cities page"
```

---

## Task 12: Map Attack page — UI token swap

**Files:**
- Modify: `src/routes/map-attack/+page.svelte`

**Step 1: Apply the mapping table**

Read the whole file and apply every row of the **UI class mapping table**. `bg-black/60`, if present, stays. There are no outliers in this file.

**Step 2: Verify**

Run: `npm run check`
Expected: PASS.

Then `npm run dev`, walk `/map-attack` through its phases in light mode.

**Step 3: Commit**

```bash
git add src/routes/map-attack/+page.svelte
git commit -m "feat: themed UI tokens on map-attack page"
```

---

## Task 13: Full verification matrix

**Files:** none (verification only).

**Step 1: Static check**

Run: `npm run check`
Expected: PASS, 0 errors, 0 warnings introduced by this work.

**Step 2: Theme matrix**

Run `npm run dev`. For each of the four themes — `dark`, `light`, `dark-hc`, `light-hc` (set via the corner control: mode button × contrast button) — visit every page and confirm:

- `/` — header, nav, regions overlay, stats bar, map (land/sea/border contrast, hit/miss highlight, cursor circle).
- `/manage` — region pills, status groups, Skip/Reset/Reset All buttons.
- `/cities` — setup, playing (HUD, lives, "?" button, map dots), results overlay.
- `/map-attack` — all phases, map countries, claimed/hover states.

Confirm in every theme: text is legible on its background, country borders read clearly, land is clearly distinct from sea, and hit/miss/claimed colors are distinguishable from plain land.

**Step 3: Persistence & flash**

- Switch to light mode, reload — page loads light with no dark flash.
- Toggle high contrast, reload — high contrast persists.
- In devtools, clear `localStorage` (`theme-mode`, `theme-contrast`), set the OS to light, reload — first load is light (follows OS).
- Clear again, set OS to dark, reload — first load is dark.

**Step 4: Report**

Report the matrix result. If any palette value reads poorly, adjust the relevant token in `src/app.css` Task 1 and re-verify before final commit.

**Step 5: Commit any palette tweaks**

```bash
git add src/app.css
git commit -m "fix: tune theme palette values after verification"
```

---

## Done

All four themes work across all four pages; the choice persists; the first visit follows the OS; map borders and land/sea contrast are stronger than the original. No new test framework was added (out of scope) — verification is `npm run check` plus the manual matrix above.
