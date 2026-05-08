<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { countries, type CountryProperties } from '$lib/data/countries';
  import type { Feature, Geometry } from 'geojson';

  let {
    zoomStage = 0,
    targetCode = '',
    onClickResult,
    onRetryComplete
  }: {
    zoomStage?: number;
    targetCode?: string;
    onClickResult?: (hit: boolean) => void;
    onRetryComplete?: () => void;
  } = $props();

  const CIRCLE_RADIUS_PX = 20;
  const ANIMATION_DURATION = 1000;

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let width = $state(960);
  let height = $state(500);
  let mousePos = $state<{ x: number; y: number } | null>(null);
  let clickGeo = $state<{ lonLat: [number, number]; hit: boolean } | null>(null);
  let highlightCode = $state<string | null>(null);
  let highlightHit = $state(false);
  let clickable = $state(true);
  let animating = $state(false);
  let retrying = $state(false);
  let targetCentroidGeo = $state<[number, number] | null>(null);

  interface ProjParams {
    scale: number;
    rotate: [number, number, number];
    translate: [number, number];
    useClipExtent: boolean;
  }

  let currentParams = $state<ProjParams>({
    scale: 150,
    rotate: [0, 0, 0],
    translate: [480, 250],
    useClipExtent: false
  });

  function interiorPoint(feature: Feature<Geometry, CountryProperties>): [number, number] {
    // Try the overall centroid first
    const centroid = d3.geoCentroid(feature);
    if (d3.geoContains(feature, centroid)) return centroid;

    // For multipolygons, try each polygon's centroid (largest first)
    if (feature.geometry.type === 'MultiPolygon') {
      const polys = feature.geometry.coordinates
        .map((coords) => ({
          type: 'Feature' as const,
          properties: feature.properties,
          geometry: { type: 'Polygon' as const, coordinates: coords }
        }))
        .sort((a, b) => d3.geoArea(b) - d3.geoArea(a));

      for (const poly of polys) {
        const c = d3.geoCentroid(poly);
        if (d3.geoContains(poly, c)) return c;
      }
    }

    // Fallback: first coordinate of the geometry (on the border)
    const coords = extractCoords(feature.geometry);
    return coords[0] ?? centroid;
  }

  function extractCoords(geometry: Geometry): [number, number][] {
    switch (geometry.type) {
      case 'Polygon':
        return geometry.coordinates.flat() as [number, number][];
      case 'MultiPolygon':
        return geometry.coordinates.flat(2) as [number, number][];
      default:
        return [];
    }
  }

  function getCodeForFeature(f: Feature<Geometry, CountryProperties>): string {
    return f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
  }

  function computeParams(stage: number, code: string): ProjParams {
    const projection = d3.geoNaturalEarth1();

    if (stage === 0) {
      projection.fitExtent([[10, 10], [width - 10, height - 10]], countries);
      return {
        scale: projection.scale(),
        rotate: projection.rotate() as [number, number, number],
        translate: projection.translate() as [number, number],
        useClipExtent: false
      };
    }

    const targetFeature = countries.features.find((f) => getCodeForFeature(f) === code);
    if (!targetFeature) {
      projection.fitExtent([[10, 10], [width - 10, height - 10]], countries);
      return {
        scale: projection.scale(),
        rotate: projection.rotate() as [number, number, number],
        translate: projection.translate() as [number, number],
        useClipExtent: false
      };
    }

    const centroid = d3.geoCentroid(targetFeature);
    let kmExtent = stage === 1 ? 2000 : 630;

    // For stage 2, don't zoom in absurdly on large countries
    // Use the largest polygon's extent (ignores distant territories)
    if (stage === 2) {
      let mainCoords: [number, number][];
      if (targetFeature.geometry.type === 'MultiPolygon') {
        let bestCoords = targetFeature.geometry.coordinates[0];
        let bestArea = -1;
        for (const polyCoords of targetFeature.geometry.coordinates) {
          const poly = { type: 'Feature' as const, properties: targetFeature.properties,
            geometry: { type: 'Polygon' as const, coordinates: polyCoords } };
          const area = d3.geoArea(poly);
          if (area > bestArea) { bestArea = area; bestCoords = polyCoords; }
        }
        mainCoords = bestCoords.flat() as [number, number][];
      } else {
        mainCoords = extractCoords(targetFeature.geometry);
      }
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lon, lat] of mainCoords) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const countryExtentKm = Math.max((maxLon - minLon), (maxLat - minLat)) * 111;
      const midpoint = (2000 + 630) / 2; // ~1315km
      if (countryExtentKm > midpoint) {
        kmExtent = midpoint;
      }
    }

    const degExtent = kmExtent / 111;
    const scale = width / (degExtent * Math.PI / 180) / 2;
    const margin = 40; // px margin from edge to keep country visible

    // Try random offsets, ensuring all country vertices stay in frame
    for (let attempt = 0; attempt < 20; attempt++) {
      const offsetLon = (Math.random() - 0.5) * degExtent * 1.2;
      const offsetLat = (Math.random() - 0.5) * degExtent * 1.2;

      const params: ProjParams = {
        scale,
        rotate: [-(centroid[0] + offsetLon), -(centroid[1] + offsetLat), 0],
        translate: [width / 2, height / 2],
        useClipExtent: true
      };

      // Check that the country is visible in the viewport
      const proj = buildProjection(params);
      const coords = extractCoords(targetFeature.geometry);
      const allOutside = coords.every((lonLat) => {
        const px = proj(lonLat);
        if (!px) return true;
        return px[0] < margin || px[0] > width - margin || px[1] < margin || px[1] > height - margin;
      });

      if (!allOutside) return params;
    }

    // Fallback: center on the country with no offset
    return {
      scale,
      rotate: [-(centroid[0]), -(centroid[1]), 0],
      translate: [width / 2, height / 2],
      useClipExtent: true
    };
  }

  function buildProjection(params: ProjParams): d3.GeoProjection {
    const proj = d3.geoNaturalEarth1()
      .scale(params.scale)
      .rotate(params.rotate)
      .translate(params.translate);
    if (params.useClipExtent) {
      proj.clipExtent([[0, 0], [width, height]]);
    }
    return proj;
  }

  function drawMap(params?: ProjParams) {
    const p = params ?? currentParams;
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = buildProjection(p);
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    for (const feature of countries.features) {
      ctx.beginPath();
      pathGen(feature);
      const code = getCodeForFeature(feature);
      if (highlightCode === code) {
        ctx.fillStyle = highlightHit ? '#22c55e' : '#ef4444';
      } else {
        ctx.fillStyle = '#6b7280';
      }
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    if (clickGeo) {
      const px = proj(clickGeo.lonLat);
      if (px) {
        ctx.beginPath();
        ctx.arc(px[0], px[1], CIRCLE_RADIUS_PX, 0, 2 * Math.PI);
        ctx.fillStyle = clickGeo.hit ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        ctx.fill();
        ctx.strokeStyle = clickGeo.hit ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (targetCentroidGeo) {
      const px = proj(targetCentroidGeo);
      if (px) {
        ctx.beginPath();
        ctx.arc(px[0], px[1], CIRCLE_RADIUS_PX, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function animateTo(targetParams: ProjParams, onComplete?: () => void) {
    animating = true;
    clickable = false;

    const startParams = { ...currentParams };
    const scaleInterp = d3.interpolate(startParams.scale, targetParams.scale);
    const rotateInterp = d3.interpolate(startParams.rotate, targetParams.rotate);
    const translateInterp = d3.interpolate(startParams.translate, targetParams.translate);

    const startTime = performance.now();

    function frame(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / ANIMATION_DURATION);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const interpParams: ProjParams = {
        scale: scaleInterp(eased),
        rotate: rotateInterp(eased) as [number, number, number],
        translate: translateInterp(eased) as [number, number],
        useClipExtent: targetParams.useClipExtent
      };

      currentParams = interpParams;
      drawMap(interpParams);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        currentParams = targetParams;
        animating = false;
        onComplete?.();
      }
    }

    requestAnimationFrame(frame);
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = containerEl.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseLeave() {
    mousePos = null;
  }

  function checkHit(x: number, y: number, proj: d3.GeoProjection): boolean {
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    const pointsToCheck: [number, number][] = [[x, y]];
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      pointsToCheck.push([
        x + CIRCLE_RADIUS_PX * Math.cos(rad),
        y + CIRCLE_RADIUS_PX * Math.sin(rad)
      ]);
    }

    const targetFeature = countries.features.find((f) => getCodeForFeature(f) === targetCode);
    if (!targetFeature) return false;

    // Check 1: Do any circle sample points fall inside the country?
    for (const pt of pointsToCheck) {
      const coords = proj.invert?.(pt);
      if (coords && d3.geoContains(targetFeature, coords)) return true;
    }

    // Check 2: Do any of the country's vertices fall inside the circle?
    const r2 = CIRCLE_RADIUS_PX * CIRCLE_RADIUS_PX;
    const coords = extractCoords(targetFeature.geometry);
    for (const lonLat of coords) {
      const px = proj(lonLat);
      if (px) {
        const dx = px[0] - x;
        const dy = px[1] - y;
        if (dx * dx + dy * dy <= r2) return true;
      }
    }

    return false;
  }

  function handleClick(e: MouseEvent) {
    if (!clickable || animating) return;

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const proj = buildProjection(currentParams);
    const hit = checkHit(x, y, proj);
    const clickCoords = proj.invert?.([x, y]);

    if (retrying) {
      if (hit) {
        // Retry success — clear retry state and notify page
        clickGeo = clickCoords ? { lonLat: clickCoords as [number, number], hit: true } : null;
        highlightHit = true;
        targetCentroidGeo = null;
        retrying = false;
        clickable = false;
        drawMap();
        onRetryComplete?.();
      } else {
        // Retry miss — update red circle position, stay in retry
        clickGeo = clickCoords ? { lonLat: clickCoords as [number, number], hit: false } : null;
        drawMap();
      }
      return;
    }

    if (hit) {
      clickable = false;
      clickGeo = clickCoords ? { lonLat: clickCoords as [number, number], hit: true } : null;
      highlightCode = targetCode;
      highlightHit = true;
      drawMap();
      onClickResult?.(true);
    } else {
      // Miss — enter retry mode: show red circle, green target, highlight country green
      const targetFeature = countries.features.find((f) => getCodeForFeature(f) === targetCode);
      clickGeo = clickCoords ? { lonLat: clickCoords as [number, number], hit: false } : null;
      highlightCode = targetCode;
      highlightHit = true;
      retrying = true;
      if (targetFeature) {
        targetCentroidGeo = interiorPoint(targetFeature);
      }
      drawMap();
      onClickResult?.(false);
    }
  }

  export function transitionTo(stage: number, code: string) {
    const targetParams = computeParams(stage, code);
    animateTo(targetParams, () => {
      clickGeo = null;
      highlightCode = null;
      highlightHit = false;
      targetCentroidGeo = null;
      retrying = false;
      clickable = true;
      drawMap();
    });
  }

  export function setInitialView(stage: number, code: string) {
    currentParams = computeParams(stage, code);
    drawMap();
    clickable = true;
  }

  function resizeCurrentParams() {
    if (!currentParams.useClipExtent) {
      // World view — recompute fitExtent for new dimensions
      const projection = d3.geoNaturalEarth1();
      projection.fitExtent([[10, 10], [width - 10, height - 10]], countries);
      currentParams = {
        scale: projection.scale(),
        rotate: projection.rotate() as [number, number, number],
        translate: projection.translate() as [number, number],
        useClipExtent: false
      };
    } else {
      // Zoomed view — keep rotation and zoom level, just rescale proportionally for new width
      // Derive degExtent from current scale: scale = oldWidth / (degExtent * PI/180) / 2
      // So: degExtent = oldWidth / (scale * 2 * PI/180) — but oldWidth is unknown.
      // Simpler: scale is proportional to width, so just adjust proportionally.
      const oldScale = currentParams.scale;
      const oldTranslateX = currentParams.translate[0];
      // oldTranslateX was oldWidth/2, so oldWidth = oldTranslateX * 2
      const oldWidth = oldTranslateX * 2;
      currentParams = {
        ...currentParams,
        scale: oldScale * (width / oldWidth),
        translate: [width / 2, height / 2]
      };
    }
  }

  let initialDrawDone = false;

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        canvasEl.width = width;
        canvasEl.height = height;
        if (!animating) {
          if (!initialDrawDone) {
            currentParams = computeParams(zoomStage, targetCode);
            initialDrawDone = true;
          } else {
            resizeCurrentParams();
          }
        }
        // Defer draw to next frame so canvas buffer is fully ready
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
  class="w-full h-full relative cursor-none"
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

  <svg
    {width}
    {height}
    class="absolute inset-0 pointer-events-none"
  >
    {#if mousePos}
      <circle
        cx={mousePos.x}
        cy={mousePos.y}
        r={CIRCLE_RADIUS_PX}
        fill="rgba(59, 130, 246, 0.3)"
        stroke="#3b82f6"
        stroke-width="2"
      />
    {/if}
  </svg>
</div>
