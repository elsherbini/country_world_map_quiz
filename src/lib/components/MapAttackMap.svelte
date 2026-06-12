<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as d3 from 'd3';
  import {
    countries,
    type CountryProperties,
  } from '$lib/data/countries';
  import { subdivisions, isSubdivisionCode } from '$lib/data/subdivisions';
  import { lakes } from '$lib/data/lakes';
  import { theme, getMapColors, DEFAULT_MAP_COLORS } from '$lib/theme.svelte';
  import type { Feature, Geometry } from 'geojson';

  let {
    targetCode = '',
    claimedCountries = new Set<string>(),
    activeSubnationalIsoA2s = [] as string[],
    studyMode = false,
    showLabels = false,
    onCountryClick,
    onCountryHover
  }: {
    targetCode?: string;
    claimedCountries?: Set<string>;
    activeSubnationalIsoA2s?: string[];
    studyMode?: boolean;
    showLabels?: boolean;
    onCountryClick?: (code: string) => void;
    onCountryHover?: (code: string | null, x: number, y: number) => void;
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

  // Target-aware click magnet for tiny regions like Monaco, Ceuta, Vatican.
  // Features whose lon/lat span is below the threshold get a screen-space
  // boost radius around their centroid — applied only when they're the target.
  const SMALL_SPAN_DEG = 1.5;
  const SMALL_BOOST_PX = 25;
  const smallCentroids = new Map<string, [number, number]>();
  for (const f of countries.features) {
    const [[lon0, lat0], [lon1, lat1]] = d3.geoBounds(f);
    if (Math.max(lon1 - lon0, lat1 - lat0) < SMALL_SPAN_DEG) {
      smallCentroids.set(getCodeForFeature(f), d3.geoCentroid(f));
    }
  }
  for (const f of subdivisions.features) {
    const [[lon0, lat0], [lon1, lat1]] = d3.geoBounds(f);
    if (Math.max(lon1 - lon0, lat1 - lat0) < SMALL_SPAN_DEG) {
      smallCentroids.set(f.properties.iso_3166_2, d3.geoCentroid(f));
    }
  }

  // Label anchors: centroid of each feature's largest polygon (whole-feature
  // centroids drift — France's lands in the Atlantic via French Guiana),
  // with spherical area for priority so big features label first.
  interface LabelPoint {
    name: string;
    isoA2: string;
    point: [number, number];
    area: number;
  }

  function largestPolygonCentroid(geom: Geometry): [number, number] {
    if (geom.type === 'MultiPolygon') {
      let best: Geometry = { type: 'Polygon', coordinates: geom.coordinates[0] };
      let bestArea = -1;
      for (const coords of geom.coordinates) {
        const poly: Geometry = { type: 'Polygon', coordinates: coords };
        const a = d3.geoArea(poly);
        if (a > bestArea) {
          bestArea = a;
          best = poly;
        }
      }
      return d3.geoCentroid(best);
    }
    return d3.geoCentroid(geom);
  }

  const countryLabels: LabelPoint[] = countries.features.map((f) => {
    const p = f.properties as Record<string, unknown>;
    const a2raw = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
    return {
      name: f.properties.NAME,
      isoA2: typeof a2raw === 'string' ? a2raw : '',
      point: largestPolygonCentroid(f.geometry),
      area: d3.geoArea(f)
    };
  });

  const subdivisionLabels: LabelPoint[] = subdivisions.features.map((f) => ({
    name: f.properties.name,
    isoA2: f.properties.iso_a2,
    point: largestPolygonCentroid(f.geometry),
    area: d3.geoArea(f)
  }));

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

  function getFillColor(code: string): string {
    if (flashCode === code) return colors.miss;
    if (claimedCountries.has(code)) {
      return hoveredCode === code ? colors.claimedHover : colors.claimed;
    }
    if (hoveredCode === code) return colors.hover;
    return colors.land;
  }

  function getStrokeWidth(code: string): number {
    if (hoveredCode === code) return claimedCountries.has(code) ? 1 : 1.5;
    return 0.5;
  }

  function getStrokeColor(code: string): string {
    if (hoveredCode === code) return colors.hoverBorder;
    return colors.landBorder;
  }

  function drawMap() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;

    const proj = getTransformedProjection();
    const pathGen = d3.geoPath().projection(proj).context(ctx);

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, width, height);

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
        ctx.strokeStyle = colors.subdivBorder;
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }

    // Pass 3: Draw lakes on top to mask land
    for (const feature of lakes.features) {
      ctx.beginPath();
      pathGen(feature);
      ctx.fillStyle = colors.lake;
      ctx.fill();
    }

    // Pass 4: Name labels (greedy collision, area priority). Countries with
    // active subdivisions get their subdivisions labeled instead.
    if (showLabels) {
      const candidates = [
        ...countryLabels.filter((l) => !activeSubnationalIsoA2s.includes(l.isoA2)),
        ...subdivisionLabels.filter((l) => activeSubnationalIsoA2s.includes(l.isoA2))
      ].sort((a, b) => b.area - a.area);

      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const placed: [number, number, number, number][] = [];
      for (const l of candidates) {
        const projected = proj(l.point);
        if (!projected) continue;
        const [px, py] = projected;
        if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;
        const w = ctx.measureText(l.name).width;
        const box: [number, number, number, number] = [px - w / 2 - 4, py - 9, px + w / 2 + 4, py + 9];
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
        ctx.strokeText(l.name, px, py);
        ctx.fillStyle = colors.hoverBorder;
        ctx.fillText(l.name, px, py);
      }
      ctx.textAlign = 'start';
    }
  }

  function findTargetAtPoint(x: number, y: number): string | null {
    const proj = getTransformedProjection();

    // Boost: if the target is a small feature, accept clicks within
    // SMALL_BOOST_PX of its projected centroid before falling through.
    if (targetCode) {
      const cent = smallCentroids.get(targetCode);
      if (cent) {
        const projCent = proj(cent);
        if (projCent) {
          const dx = projCent[0] - x;
          const dy = projCent[1] - y;
          if (Math.hypot(dx, dy) < SMALL_BOOST_PX) return targetCode;
        }
      }
    }

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
    onCountryHover?.(code, x, y);
  }

  function handleMouseLeave() {
    if (hoveredCode !== null) {
      hoveredCode = null;
      drawMap();
    }
    onCountryHover?.(null, 0, 0);
  }

  function handleClick(e: MouseEvent) {
    if (clickBlocked) return;

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const code = findTargetAtPoint(x, y);

    if (!code) return; // clicked ocean

    // Study mode: any feature is pinnable as-is (subdivisions stay subdivisions)
    if (studyMode) {
      onCountryClick?.(code);
      return;
    }

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
