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
  const ANIMATION_DURATION = 500;

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
    const kmExtent = stage === 1 ? 2000 : 630;
    const degExtent = kmExtent / 111;

    const offsetLon = (Math.random() - 0.5) * degExtent * 0.6;
    const offsetLat = (Math.random() - 0.5) * degExtent * 0.6;

    const scale = width / (degExtent * Math.PI / 180) / 2;

    return {
      scale,
      rotate: [-(centroid[0] + offsetLon), -(centroid[1] + offsetLat), 0],
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
        ctx.fillStyle = '#374151';
      }
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
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
    if (!clickable || animating) {
      mousePos = null;
      return;
    }
    const rect = containerEl.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseLeave() {
    mousePos = null;
  }

  function handleClick(e: MouseEvent) {
    if (!clickable || animating) return;

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const proj = buildProjection(currentParams);

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

    let hit = false;
    if (targetFeature) {
      for (const pt of pointsToCheck) {
        const coords = proj.invert?.(pt);
        if (coords && d3.geoContains(targetFeature, coords)) {
          hit = true;
          break;
        }
      }
    }

    const clickCoords = proj.invert?.([x, y]);
    clickable = false;
    clickGeo = clickCoords ? { lonLat: clickCoords as [number, number], hit } : null;
    highlightCode = targetCode;
    highlightHit = hit;
    mousePos = null;

    drawMap();
    onClickResult?.(hit);
  }

  export function transitionTo(stage: number, code: string) {
    const targetParams = computeParams(stage, code);
    animateTo(targetParams, () => {
      clickGeo = null;
      highlightCode = null;
      highlightHit = false;
      clickable = true;
      drawMap();
    });
  }

  export function setInitialView(stage: number, code: string) {
    currentParams = computeParams(stage, code);
    drawMap();
    clickable = true;
  }

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        drawMap();
      }
    });
    observer.observe(containerEl);

    currentParams = computeParams(zoomStage, targetCode);
    drawMap();

    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  class="w-full h-full relative"
  class:cursor-none={!animating}
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
    {#if mousePos && clickable && !animating}
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
