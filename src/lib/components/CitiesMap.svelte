<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as d3 from 'd3';
  import { countries } from '$lib/data/countries';
  import { cities, cityKey } from '$lib/data/cities';
  import { lakes } from '$lib/data/lakes';
  import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';

  let {
    claimedCities = new Set<string>(),
    eligibleCityKeys = new Set<string>(),
    onCityClick
  }: {
    claimedCities?: Set<string>;
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

  let colors = $state(DEFAULT_MAP_COLORS);

  // Re-snapshot CSS map colors when the theme changes, then redraw.
  // Only theme.mode / theme.highContrast are tracked; drawMap() is untracked
  // so the reactive state it reads (width, hover, etc.) can't trigger this.
  $effect(() => {
    void theme.mode;
    void theme.highContrast;
    colors = getMapColors();
    untrack(() => drawMap());
  });

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
    if (flashKey === key) return colors.miss;
    if (claimedCities.has(key)) {
      return hoveredKey === key ? colors.claimedHover : colors.claimed;
    }
    if (hoveredKey === key) return colors.hover;
    return colors.backdrop;
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, width, height);

    // Pass 1: Country borders (context only)
    for (const feature of countries.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = colors.land;
      ctx.fill();
      ctx.strokeStyle = colors.landBorder;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // Pass 2: Lakes
    for (const feature of lakes.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = colors.lake;
      ctx.fill();
    }

    // Pass 3: City dots
    for (const city of cities) {
      const key = cityKey(city.name, city.country);
      if (!eligibleCityKeys.has(key)) continue;

      const projected = proj([city.lon, city.lat]);
      if (!projected) continue;
      const [px, py] = projected;

      const fill = getCityFill(key);
      const radius = 8;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = hoveredKey === key ? colors.hoverBorder : colors.landBorder;
      ctx.lineWidth = hoveredKey === key ? 2 : 1;
      ctx.stroke();
    }
  }

  function findCityAtPoint(x: number, y: number): string | null {
    const proj = getTransformedProjection();

    let closest: string | null = null;
    let closestDist = Infinity;
    for (const city of cities) {
      const key = cityKey(city.name, city.country);
      if (!eligibleCityKeys.has(key)) continue;
      const projected = proj([city.lon, city.lat]);
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
