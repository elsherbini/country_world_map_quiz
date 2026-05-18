# Border Fixes for countries.json

## Goal

Adjust the bundled Natural Earth country geometry to reflect the desired political assignment:

1. **Crimea** belongs to Ukraine, not Russia.
2. **Greenland** is part of Denmark (not a separate country in the game).

## Approach

A new preprocessing script, `scripts/fix-borders.js`, mutates `src/lib/data/countries.json` in place. It runs after `scripts/filter-countries.js` in the post-processing pipeline. The script is idempotent — running it twice produces the same result as running it once.

## Data observations

From inspecting the current `countries.json` (Natural Earth 110m):

- **Russia (`RUS`)**: MultiPolygon with 101 polygons. Polygon index 100 has bbox `[32.5, 44.4] → [36.6, 46.2]` and 73 points in a single ring — this is the Crimean peninsula, cleanly isolated.
- **Ukraine (`UKR`)**: MultiPolygon with 2 polygons (mainland + a small coastal island).
- **Denmark (`DNK`)**: MultiPolygon with 12 polygons (Jutland + Danish islands).
- **Greenland (`GRL`)**: Separate feature, MultiPolygon with 17 polygons.

Crimea being one isolated polygon makes the surgery clean — no need to clip a shared boundary.

## Script logic

```
load countries.json

# 1. Move Crimea
russia = features.find(ISO_A3_EH === 'RUS')
ukraine = features.find(ISO_A3_EH === 'UKR')
crimeaBox = { minLon: 32, maxLon: 37, minLat: 44, maxLat: 46.5 }
crimeaPolys = russia.geometry.coordinates that fall inside crimeaBox
if (crimeaPolys.length === 0):
  warn "no Crimea polygon found in RUS — already moved or source changed"
else:
  russia.geometry.coordinates = russia minus crimeaPolys
  ukraine.geometry.coordinates = ukraine concat crimeaPolys

# 2. Merge Greenland into Denmark
denmark = features.find(ISO_A3_EH === 'DNK')
greenlandIdx = features.findIndex(ISO_A3_EH === 'GRL')
if (greenlandIdx === -1):
  warn "no GRL feature found — already merged"
else:
  denmark.geometry.coordinates = denmark concat greenland.geometry.coordinates
  features.splice(greenlandIdx, 1)

write countries.json (minified)
```

### Bbox check for Crimea

A polygon is considered "Crimea" if its bbox is fully inside `[32, 44] → [37, 46.5]`. This intentionally excludes Russia's poly 18 (`[27, 41] → [180, 78]` — that's the rest of European Russia and beyond), and matches only poly 100. If Natural Earth changes the source so multiple polygons match, all of them move together.

## Companion edit

`src/lib/data/countries.ts` line 202: remove `GRL: 'small-islands'` from `REGION_OVERRIDES` — the feature no longer exists.

## Pipeline order

```
1. (manual / external) regenerate countries.json from Natural Earth source
2. node scripts/filter-countries.js   # drops unwanted features
3. node scripts/fix-borders.js        # this script
```

## Trade-offs

- **Bbox-based Crimea detection is source-dependent.** If a future Natural Earth release splits Crimea into multiple polygons or attaches it to mainland Russia, the script silently no-ops. The console warning on zero-match makes this discoverable.
- **No Geometric union.** Greenland is appended as additional polygons in the Denmark MultiPolygon, not unioned. They are non-adjacent, so a true union would produce identical geometry anyway.
- **POP_EST and other properties are not updated.** Greenland's ~56k population is dropped along with the feature. Not used by the game.

## Verification

After running the script:

- `data.features.length` should be exactly 1 less than before.
- No feature with `ISO_A3_EH === 'GRL'` exists.
- Russia's polygon count drops by 1; Ukraine's grows by 1.
- Re-running the script produces no further changes (idempotency check).
- Visual: load the game, confirm Greenland renders in the same color as Denmark, and Crimea renders with Ukraine.
