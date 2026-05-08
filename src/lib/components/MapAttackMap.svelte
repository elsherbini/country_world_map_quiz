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
