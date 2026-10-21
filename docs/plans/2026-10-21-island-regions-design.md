# Split "Small Islands" into continent-aligned island regions

**Date:** 2026-10-21

## Problem

"Small Islands" is one flat region of ~60 entries spanning the Caribbean, the
Pacific, the Indian Ocean, the North Atlantic and Antarctica. Players think in
continents, so a single bucket mixing Barbados, Fiji, Jersey and the Falklands
is hard to reason about and hard to toggle usefully.

## Decision

Replace `small-islands` with five regions, each kept separate from the
mainland continent regions:

| Region key                   | Label                         | Members |
| ---------------------------- | ----------------------------- | ------- |
| `islands-caribbean`          | Islands: Caribbean            | VIR AIA CYM VGB TCA MSR MAF BLM ABW CUW SXM TTO BRB GRD VCT LCA KNA DMA ATG (+MTQ if present) |
| `islands-oceania`            | Islands: Oceania              | VUT FSM MHL MNP GUM ASM TON WSM PLW NIU COK NRU KIR TUV PYF NCL WLF PCN NFK FJI SLB |
| `islands-europe`             | Islands: Europe               | FRO ALA JEY GGY IMN |
| `islands-africa`             | Islands: Africa               | SYC MUS COM STP SHN IOT (+MYT REU if present) |
| `islands-atlantic-antarctic` | Islands: Atlantic & Antarctic | BMU SPM FLK SGS ATF HMD ATA |

Maldives (MDV) moves into mainland `asia`, the same treatment Singapore,
Brunei and Bahrain already get. A one-member "Islands: Asia" region was
rejected.

Alternatives considered and rejected:

- Four ocean-based regions (Caribbean / Pacific / Indian Ocean / Atlantic) with
  the European dependencies folded into Europe. Rejected because Indian Ocean
  mixes Maldives with African islands, and the user wants the European
  dependencies kept out of mainland Europe.
- Folding the Pacific islands into the existing Oceania region. Rejected to keep
  the small-island / mainland distinction consistent across continents.

## Changes

### `src/lib/data/countries.ts`

- `Region` union: drop `'small-islands'`, add the five keys above.
- `REGION_LABELS`, `REGION_COLORS`: five new entries.
- `ALL_REGIONS`, `FLAG_REGIONS`, `CITY_REGIONS` (in `cities.ts`): five keys
  replace the old one, placed right after `oceania`.
- `REGION_OVERRIDES`: every former `small-islands` entry remapped explicitly;
  `MDV: 'asia'` added.
- `CONTINENT_TO_REGION`: "Seven seas (open ocean)" and "Antarctica" map to
  `islands-atlantic-antarctic`. The unknown-code fallback in `getRegion` does
  too.

### Persistence

Each mode stores a `Record<Region, boolean>` in localStorage. A returning
player has a `small-islands` key and none of the new ones.

- Add `migrateRegions(stored)` in `countries.ts`: start from the mode's
  defaults, overlay stored values, and if `small-islands` is present copy its
  boolean onto all five new keys, then drop it.
- Main game (`game-state.ts`), Map Attack, Flag Attack and Cities all call it
  when loading. Map Attack and Flag Attack currently return the raw parsed
  JSON without merging defaults; they switch to the merge so new keys are not
  `undefined`.

### `game-state.ts`

`getRegionForCode` falls back to `'small-islands'` for an unknown subdivision
parent; change to `islands-atlantic-antarctic` to keep the type happy (the
branch is unreachable in practice).

## Not changing

- No UI changes. Chips, counts, Manage list and study maps iterate
  `ALL_REGIONS` / `REGION_LABELS`.
- Country-to-region assignment for everything outside the old bucket.

## Verification

- `npm run check` passes.
- A script asserts every country in `countries.json` resolves to exactly one
  region and that the five new regions contain exactly the members listed
  above (for codes present in the dataset).
