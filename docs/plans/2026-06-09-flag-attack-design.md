# Flag Attack — Design

**Date:** 2026-06-09

## Summary

Add a "Flag Attack" mode: identical gameplay to Map Attack, but the prompt
shows a country/state **flag image** instead of the region's name. The available
regions are limited (for now) to the countries of the world plus US states.

## Goals

- Reuse Map Attack's game logic and map rendering wholesale.
- Show a flag that is clearly larger than an emoji (~100px tall).
- Limit region selection to world countries + US states.
- Keep the app static/offline-friendly elsewhere; flags load from a CDN
  (accepted trade-off — flag mode requires network).

## Architecture

### New route: `/flag-attack/+page.svelte`

A near-copy of `src/routes/map-attack/+page.svelte`. Same three phases
(`setup` → `playing` → `results`), same 3-lives model, same shuffle / claim /
miss / re-queue logic. It reuses the existing `MapAttackMap.svelte` component
**unchanged** — that component only needs `targetCode`, `claimedCountries`,
`activeSubnationalIsoA2s`, and `onCountryClick`, and is agnostic to how the
prompt is displayed.

Differences from map-attack:

- The HUD prompt is a **flag image**, not the country name text.
- Region toggles are drawn from a limited `FLAG_REGIONS` set.
- Persists region selection under localStorage key `flag-attack-regions`.
- Eligible pool is filtered to targets that have a resolvable flag URL.

### Region set

`FLAG_REGIONS` (defined locally in the page; no change to `countries.ts`):

```
north-america, south-america, europe, asia, africa,
oceania, small-islands, city-states, us-states
```

The other subnational regions (China provinces, India states, Canada, Mexico,
France, Spain, Italy, Germany) are simply not listed. `activeSubnationalIsoA2s`
is computed exactly as in map-attack but only `us-states` will ever be active,
so the US subdivisions render on the map when that region is selected.

### Flag URL resolution

Build a `flagUrlByCode: Record<string, string>` once at module load from
`getCountryList()` + `getSubdivisionList()`:

- **Countries:** find the GeoJSON feature for the code, read `ISO_A2_EH`
  (fallback `ISO_A2`); lowercase → `https://flagcdn.com/<a2>.svg`.
- **US states:** the subdivision `code` is already `US-CA` form → lowercase
  `us-ca` → `https://flagcdn.com/us-ca.svg`.

Targets with no valid alpha-2 (Somaliland, N. Cyprus — no flagcdn flag) are
omitted from `flagUrlByCode` and therefore filtered out of the eligible pool at
game start, so an unanswerable flag is never shown.

## UI

### Floating flag card (playing phase)

Replaces the `Click on: <name>` text. An absolutely-positioned card overlaid on
the map (top-center), containing:

```html
<img src={flagUrlByCode[currentTarget]} alt="" class="h-[100px] w-auto ..." />
```

Styling: `bg-surface`, rounded corners, padding, thin border + subtle shadow so
it reads against any map area. Fixed min dimensions to avoid layout jump when the
target changes. flagcdn's `.svg` endpoint scales crisply at 100px.

The slim top bar keeps the rest of the HUD exactly like map-attack: back link,
`claimed / total` counter, lives hearts, change-regions ↻ button.

### Setup & results phases

Identical structure to map-attack. Setup shows `FLAG_REGIONS` toggle pills with
per-region counts and a Start button. Results shows the Win / Game Over overlay
with Play Again / Change Regions / Back links. Copy adjusted to reference flags.

### Home page link

Add `<a href="{base}/flag-attack">Flag Attack</a>` next to the existing Map
Attack link in `src/routes/+page.svelte` (line ~133).

## Edge cases

- **US state flags:** flagcdn serves `us-ca` etc. (confirmed format).
- **Missing flags:** pre-filtered out via the alpha-2 check. If an obscure
  territory's URL 404s, the `<img>` simply renders empty (acceptable).
- **Offline:** flags won't load without network — accepted per CDN choice.

## Testing / verification

Manual, in the browser via the dev server:

1. Start a game with a couple of regions selected.
2. Confirm the flag card displays a large, correct flag.
3. Correct click claims the country and advances; wrong click flashes, costs a
   life, and re-queues — same as map-attack.
4. Win flow (all claimed) and lose flow (0 lives) both reach results.
5. US states region shows state flags and the US subdivisions on the map.
