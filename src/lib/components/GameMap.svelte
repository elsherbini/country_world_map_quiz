<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { countries, type CountryProperties } from '$lib/data/countries';
  import type { Feature, Geometry } from 'geojson';

  let {
    zoomStage = 0,
    targetCode = '',
    onClickResult
  }: {
    zoomStage?: number;
    targetCode?: string;
    onClickResult?: (hit: boolean) => void;
  } = $props();

  const CIRCLE_RADIUS_PX = 20;

  let svgEl: SVGSVGElement;
  let width = $state(960);
  let height = $state(500);
  let mousePos = $state<{ x: number; y: number } | null>(null);
  let clickResult = $state<{ x: number; y: number; hit: boolean } | null>(null);
  let highlightCode = $state<string | null>(null);
  let clickable = $state(true);

  function getProjection() {
    const projection = d3.geoNaturalEarth1();

    if (zoomStage === 0) {
      projection.fitExtent([[10, 10], [width - 10, height - 10]], countries);
    } else {
      const targetFeature = countries.features.find(
        (f) => {
          const code = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
          return code === targetCode;
        }
      );
      if (targetFeature) {
        const centroid = d3.geoCentroid(targetFeature);
        // Determine km extent based on stage
        const kmExtent = zoomStage === 1 ? 1000 : 316; // km
        const degExtent = kmExtent / 111; // rough km to degrees

        // Offset centroid randomly within middle 60% of view
        const offsetLon = (Math.random() - 0.5) * degExtent * 0.6;
        const offsetLat = (Math.random() - 0.5) * degExtent * 0.6;
        const center: [number, number] = [centroid[0] + offsetLon, centroid[1] + offsetLat];

        // Create a bounding box GeoJSON to fit
        const bbox: GeoJSON.Feature = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [center[0] - degExtent, center[1] - degExtent],
              [center[0] + degExtent, center[1] - degExtent],
              [center[0] + degExtent, center[1] + degExtent],
              [center[0] - degExtent, center[1] + degExtent],
              [center[0] - degExtent, center[1] - degExtent]
            ]]
          }
        };
        projection.fitExtent([[10, 10], [width - 10, height - 10]], bbox);
      }
    }
    return projection;
  }

  let projection = $derived(getProjection());
  let path = $derived(d3.geoPath().projection(projection));

  function handleMouseMove(e: MouseEvent) {
    if (!clickable) return;
    const rect = svgEl.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseLeave() {
    mousePos = null;
  }

  function handleClick(e: MouseEvent) {
    if (!clickable) return;
    const rect = svgEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check intersection: center point + 8 perimeter points
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    const pointsToCheck: [number, number][] = [[x, y]];
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      pointsToCheck.push([
        x + CIRCLE_RADIUS_PX * Math.cos(rad),
        y + CIRCLE_RADIUS_PX * Math.sin(rad)
      ]);
    }

    const targetFeature = countries.features.find((f) => {
      const code = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
      return code === targetCode;
    });

    let hit = false;
    if (targetFeature && projection) {
      for (const pt of pointsToCheck) {
        const coords = projection.invert?.(pt);
        if (coords && d3.geoContains(targetFeature, coords)) {
          hit = true;
          break;
        }
      }
    }

    clickable = false;
    clickResult = { x, y, hit };
    if (!hit) {
      highlightCode = targetCode;
    }
    mousePos = null;

    onClickResult?.(hit);
  }

  export function reset() {
    clickResult = null;
    highlightCode = null;
    clickable = true;
  }

  function countryFill(feature: Feature<Geometry, CountryProperties>): string {
    const code = feature.properties.ISO_A3_EH !== '-99'
      ? feature.properties.ISO_A3_EH
      : feature.properties.ISO_A3;
    if (highlightCode === code) return '#ef4444'; // red highlight for missed target
    return '#374151'; // gray-700
  }

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
      }
    });
    observer.observe(svgEl.parentElement!);
    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  {width}
  {height}
  class="w-full h-full cursor-none"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onclick={handleClick}
>
  <!-- Country paths -->
  {#each countries.features as feature}
    <path
      d={path(feature) ?? ''}
      fill={countryFill(feature)}
      stroke="#1f2937"
      stroke-width="0.5"
    />
  {/each}

  <!-- Circle cursor -->
  {#if mousePos}
    <circle
      cx={mousePos.x}
      cy={mousePos.y}
      r={CIRCLE_RADIUS_PX}
      fill="rgba(59, 130, 246, 0.3)"
      stroke="#3b82f6"
      stroke-width="2"
      pointer-events="none"
    />
  {/if}

  <!-- Click result circle -->
  {#if clickResult}
    <circle
      cx={clickResult.x}
      cy={clickResult.y}
      r={CIRCLE_RADIUS_PX}
      fill={clickResult.hit ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}
      stroke={clickResult.hit ? '#22c55e' : '#ef4444'}
      stroke-width="2"
      pointer-events="none"
    />
  {/if}
</svg>
