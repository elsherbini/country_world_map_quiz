<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { countries } from '$lib/data/countries';
  import { cities, CONTINENT_COLORS, cityKey, type CityContinent } from '$lib/data/cities';
  import { lakes } from '$lib/data/lakes';
  import type { Feature, Geometry } from 'geojson';

  let {
    claimedCities = new Set<string>(),
    renderMode = 'dots' as 'dots' | 'boundaries',
    eligibleCityKeys = new Set<string>(),
    onCityClick
  }: {
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
        return d3.color(CONTINENT_COLORS[continent])?.brighter(0.5)?.formatHex() ?? CONTINENT_COLORS[continent];
      }
      return CONTINENT_COLORS[continent];
    }
    if (hoveredKey === key) return '#d1d5db';
    return '#9ca3af';
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    // Pass 1: Country borders (context only)
    for (const feature of countries.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Pass 2: Lakes
    for (const feature of lakes.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = '#111827';
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
