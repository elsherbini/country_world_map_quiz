# Geography Game Design

A SvelteKit web app for learning country locations through spaced repetition with a D3.js interactive map.

## Core Loop

1. A country name is displayed (e.g. "Click on: **France**")
2. A circle cursor follows the mouse over the map showing the click radius
3. User clicks to place the circle
4. Hit: circle intersects target country polygon -> green highlight, option to skip country in future
5. Miss: circle turns red, target country highlights, then next round
6. Next country selected by weighted random from the bucket system

## Bucket System

7 buckets with descending weights for country selection:

| Bucket | Weight | Meaning |
|--------|--------|---------|
| 1 | 64 | New / reset — most likely to appear |
| 2 | 32 | |
| 3 | 16 | |
| 4 | 8 | |
| 5 | 4 | |
| 6 | 2 | |
| 7 | 1 | Almost learned |
| Retired | 0 | Past bucket 7, never shown |

- Correct answer: move up one bucket
- Wrong answer: back to bucket 1
- New countries added to bucket 1 only when fewer than 5 countries are in bucket 1
- New countries drawn randomly from unseen, unskipped pool

## Zoom Stages

Each country progresses through zoom stages independently:

| Stage | View | Approximate area |
|-------|------|-----------------|
| 0 | Whole world | ~510M km² |
| 1 | Regional | ~1M km² (1000km x 1000km) |
| 2 | Local | ~100k km² (316km x 316km) |
| 3 | Random | Random pick from 0, 1, or 2 |

- Stage advances on correct answer (stage 0 -> 1 -> 2 -> 3)
- Target country centroid offset randomly within middle 60% of viewport so it's not always centered

## localStorage Schema

Single key `geography-game`:

```json
{
  "countries": {
    "FRA": { "bucket": 3, "stage": 1, "skipped": false }
  }
}
```

Countries not present in the object are unseen.

## Pages

### `/` — Game Page

- Top: country name prompt
- Center: D3 SVG map filling most of viewport
- Bottom: stats bar (streak, hits/misses, bucket distribution)
- After correct answer: "Skip this country in future" button appears briefly
- Circle cursor overlay shows click radius before clicking

### `/manage` — Country Management Page

- All countries listed, grouped by status: active (with bucket), skipped, retired, unseen
- Toggle skip on/off per country
- Reset button to move country back to unseen
- Nav link back to game

## Technical Stack

- **SvelteKit** with `adapter-static` for single-file build
- **D3.js** for map rendering (SVG)
- **Natural Earth 110m** GeoJSON bundled in `src/lib/data/`
- **Tailwind CSS** for styling
- **No runtime external dependencies** — everything bundled, no API calls

## Map Rendering

- Projection: `geoNaturalEarth1` or `geoMercator`
- Country paths rendered as SVG
- Zoomed views: adjust projection `scale` and `translate` to frame target area
- Intersection check: `d3.geoContains` on click center + ~8 perimeter points of the circle

## Future Features (not in v1)

- Toggle countries by continent
- Toggle off pacific island countries
