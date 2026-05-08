<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import {
    countries,
    type CountryProperties,
  } from '$lib/data/countries';
  import { subdivisions, isSubdivisionCode } from '$lib/data/subdivisions';
  import type { Feature, Geometry } from 'geojson';

  let {
    targetCode = '',
    claimedCountries = new Set<string>(),
    activeSubnationalIsoA2s = [] as string[],
    onCountryClick
  }: {
    targetCode?: string;
    claimedCountries?: Set<string>;
    activeSubnationalIsoA2s?: string[];
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

  const CLAIMED_COLOR = '#4ade80';
  const CLAIMED_HOVER_COLOR = '#86efac';

  function getFillColor(code: string): string {
    if (flashCode === code) return '#ef4444';
    if (claimedCountries.has(code)) {
      if (hoveredCode === code) return CLAIMED_HOVER_COLOR;
      return CLAIMED_COLOR;
    }
    if (hoveredCode === code) return '#d1d5db';
    return '#9ca3af';
  }

  function getStrokeWidth(code: string): number {
    if (hoveredCode === code) return claimedCountries.has(code) ? 1 : 1.5;
    return 0.5;
  }

  function getStrokeColor(code: string): string {
    if (hoveredCode === code) return claimedCountries.has(code) ? '#e5e7eb' : '#f3f4f6';
    return '#374151';
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    // Pass 1: Draw country polygons
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

    // Pass 2: Draw subdivision boundaries on top
    if (activeSubnationalIsoA2s.length > 0) {
      for (const feature of subdivisions.features) {
        if (!activeSubnationalIsoA2s.includes(feature.properties.iso_a2)) continue;
        const code = feature.properties.iso_3166_2;
        ctx.beginPath();
        pathGen(feature);

        // If this subdivision is claimed, hovered, or flashing, fill it
        if (claimedCountries.has(code) || hoveredCode === code || flashCode === code) {
          ctx.fillStyle = getFillColor(code);
          ctx.fill();
        }

        // Always draw subdivision borders (subtle)
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  }

  function findTargetAtPoint(x: number, y: number): string | null {
    const proj = getTransformedProjection();
    const lonLat = proj.invert?.([x, y]);
    if (!lonLat) return null;

    // Check subdivisions first (most specific)
    if (activeSubnationalIsoA2s.length > 0) {
      for (const feature of subdivisions.features) {
        if (!activeSubnationalIsoA2s.includes(feature.properties.iso_a2)) continue;
        if (d3.geoContains(feature, lonLat)) {
          return feature.properties.iso_3166_2;
        }
      }
    }

    // Fall back to country level
    for (const feature of countries.features) {
      if (d3.geoContains(feature, lonLat)) {
        return getCodeForFeature(feature);
      }
    }
    return null;
  }

  function findCountryCodeAtPoint(x: number, y: number): string | null {
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
    const code = findTargetAtPoint(x, y);
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
    const code = findTargetAtPoint(x, y);

    if (!code) return; // clicked ocean
    if (claimedCountries.has(code)) return; // already claimed

    // If clicked a subdivision but target is a country, resolve to country level
    if (isSubdivisionCode(code) && !isSubdivisionCode(targetCode)) {
      const parentCountryCode = findCountryCodeAtPoint(x, y);
      if (parentCountryCode && !claimedCountries.has(parentCountryCode)) {
        onCountryClick?.(parentCountryCode);
        return;
      }
    }

    onCountryClick?.(code);
  }

  let flashTimeout: ReturnType<typeof setTimeout>;

  export function flashWrong(code: string) {
    clearTimeout(flashTimeout);
    flashCode = code;
    clickBlocked = true;
    drawMap();
    flashTimeout = setTimeout(() => {
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
