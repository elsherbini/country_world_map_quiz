<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as d3 from 'd3';
  import { countries } from '$lib/data/countries';
  import { cities, cityKey } from '$lib/data/cities';
  import { subdivisions } from '$lib/data/subdivisions';
  import { lakes } from '$lib/data/lakes';
  import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';

  let {
    claimedCities = new Set<string>(),
    eligibleCityKeys = new Set<string>(),
    showLabels = false,
    onCityClick,
    onCityHover
  }: {
    claimedCities?: Set<string>;
    eligibleCityKeys?: Set<string>;
    showLabels?: boolean;
    onCityClick?: (key: string) => void;
    onCityHover?: (key: string | null, x: number, y: number) => void;
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

  // Redraw when the label layer is toggled.
  $effect(() => {
    void showLabels;
    untrack(() => drawMap());
  });

  // Eligible cities in label-priority order (largest population first).
  let labelCities = $derived(
    cities
      .filter((c) => eligibleCityKeys.has(cityKey(c.id)))
      .sort((a, b) => b.population - a.population)
  );

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

    // Internal borders for US / India / China
    for (const feature of subdivisions.features) {
      if (!['US', 'IN', 'CN'].includes(feature.properties.iso_a2)) continue;
      ctx.beginPath();
      pathGen(feature);
      ctx.strokeStyle = colors.subdivBorder;
      ctx.lineWidth = 0.4;
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
      const key = cityKey(city.id);
      if (!eligibleCityKeys.has(key)) continue;

      const projected = proj([city.lon, city.lat]);
      if (!projected) continue;
      const [px, py] = projected;

      const fill = getCityFill(key);
      const radius = 5;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = hoveredKey === key ? colors.hoverBorder : colors.landBorder;
      ctx.lineWidth = hoveredKey === key ? 2 : 1;
      ctx.stroke();
    }

    // Pass 4: City name labels (greedy collision, population priority).
    // Big cities label at world zoom; zooming in spreads points so more fit.
    if (showLabels) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      // Round joins: the default miter join shoots spikes off sharp glyph
      // corners when stroking text for the halo.
      ctx.lineJoin = 'round';
      const placed: [number, number, number, number][] = [];
      for (const city of labelCities) {
        const projected = proj([city.lon, city.lat]);
        if (!projected) continue;
        const [px, py] = projected;
        if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;
        const w = ctx.measureText(city.name).width;
        const x0 = px + 7;
        const box: [number, number, number, number] = [x0 - 4, py - 9, x0 + w + 4, py + 9];
        let collides = false;
        for (const [a0, b0, a1, b1] of placed) {
          if (box[0] < a1 && a0 < box[2] && box[1] < b1 && b0 < box[3]) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
        placed.push(box);
        ctx.strokeStyle = colors.sea;
        ctx.lineWidth = 3;
        ctx.strokeText(city.name, x0, py);
        ctx.fillStyle = colors.hoverBorder;
        ctx.fillText(city.name, x0, py);
      }
      ctx.lineJoin = 'miter';
    }
  }

  function findCityAtPoint(x: number, y: number): string | null {
    const proj = getTransformedProjection();

    let closest: string | null = null;
    let closestDist = Infinity;
    for (const city of cities) {
      const key = cityKey(city.id);
      if (!eligibleCityKeys.has(key)) continue;
      const projected = proj([city.lon, city.lat]);
      if (!projected) continue;
      const dx = projected[0] - x;
      const dy = projected[1] - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 14 && dist < closestDist) {
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
    onCityHover?.(key, x, y);
  }

  function handleMouseLeave() {
    if (hoveredKey !== null) {
      hoveredKey = null;
      drawMap();
    }
    onCityHover?.(null, 0, 0);
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
