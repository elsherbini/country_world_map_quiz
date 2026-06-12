<script lang="ts">
  import { base } from '$app/paths';
  import MapAttackMap from '$lib/components/MapAttackMap.svelte';
  import ModeNav from '$lib/components/ModeNav.svelte';
  import {
    getCountryList,
    getSubdivisionList,
    ALL_REGIONS,
    REGION_LABELS,
    SUBNATIONAL_PARENT_ISO_A2,
    getFlagUrl,
    type Region
  } from '$lib/data/countries';

  const STORAGE_KEY = 'map-attack-regions';
  const MAX_LIVES = 3;

  const countryList = getCountryList();
  const subdivisionList = getSubdivisionList();
  const allTargets = [...countryList, ...subdivisionList];
  const nameByCode = Object.fromEntries(allTargets.map((c) => [c.code, c.name]));
  const targetByCode = Object.fromEntries(allTargets.map((c) => [c.code, c]));

  // --- State ---
  type Phase = 'setup' | 'study' | 'playing' | 'results';
  let phase = $state<Phase>('setup');

  // Region selection (persisted)
  function loadRegions(): Record<Region, boolean> {
    if (typeof window === 'undefined') {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
    }
  }

  let selectedRegions = $state<Record<Region, boolean>>(loadRegions());

  function saveRegions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedRegions));
  }

  function toggleRegion(region: Region) {
    selectedRegions[region] = !selectedRegions[region];
    saveRegions();
  }

  let regionCounts = $derived.by(() => {
    const counts: Record<Region, number> = {} as Record<Region, number>;
    for (const r of ALL_REGIONS) counts[r] = 0;
    for (const c of countryList) counts[c.region] += 1;
    for (const s of subdivisionList) counts[s.region] += 1;
    return counts;
  });

  let anyRegionSelected = $derived(ALL_REGIONS.some((r) => selectedRegions[r]));

  let activeSubnationalIsoA2s = $derived(
    Object.entries(SUBNATIONAL_PARENT_ISO_A2)
      .filter(([region]) => selectedRegions[region as Region])
      .map(([, isoA2]) => isoA2 as string)
  );

  // --- Game state ---
  let lives = $state(MAX_LIVES);
  let claimedCountries = $state(new Set<string>());
  let currentTarget = $state<string | null>(null);
  let won = $state(false);

  let eligibleCountries = $state<string[]>([]);
  let remainingCountries: string[] = [];

  let mapComponent = $state<ReturnType<typeof MapAttackMap>>();

  let totalCountries = $derived(eligibleCountries.length);
  let claimedCount = $derived(claimedCountries.size);

  function startGame() {
    eligibleCountries = allTargets
      .filter((c) => selectedRegions[c.region])
      .map((c) => c.code);
    remainingCountries = shuffle([...eligibleCountries]);
    claimedCountries = new Set();
    lives = MAX_LIVES;
    won = false;
    currentTarget = remainingCountries.pop() ?? null;
    phase = 'playing';
  }

  function pickNextTarget() {
    if (remainingCountries.length === 0) {
      // Win!
      won = true;
      phase = 'results';
      return;
    }
    currentTarget = remainingCountries.pop() ?? null;
  }

  function handleCountryClick(code: string) {
    if (!currentTarget) return;

    if (code === currentTarget) {
      // Correct!
      claimedCountries = new Set([...claimedCountries, code]);
      mapComponent?.redraw();
      pickNextTarget();
    } else {
      // Wrong — lose a life, re-queue the target, pick a new one
      lives -= 1;
      mapComponent?.flashWrong(code);
      if (lives <= 0) {
        // Game over after flash
        setTimeout(() => {
          won = false;
          phase = 'results';
        }, 600);
      } else {
        // Put current target back into the pool (not at the end, so it's not immediate)
        const insertIdx = Math.floor(Math.random() * remainingCountries.length);
        remainingCountries.splice(insertIdx, 0, currentTarget!);
        pickNextTarget();
      }
    }
  }

  function playAgain() {
    startGame();
  }

  function changeRegions() {
    phase = 'setup';
  }

  // --- Study mode ---
  let studyHover = $state<{ code: string; x: number; y: number } | null>(null);
  let studyPinned = $state<string | null>(null);

  let studyCount = $derived(allTargets.filter((c) => selectedRegions[c.region]).length);

  function startStudy() {
    studyHover = null;
    studyPinned = null;
    phase = 'study';
  }

  function handleStudyHover(code: string | null, x: number, y: number) {
    studyHover = code ? { code, x, y } : null;
  }

  function handleStudyClick(code: string) {
    studyPinned = studyPinned === code ? null : code;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
</script>

{#if phase === 'setup'}
  <div class="min-h-screen bg-canvas text-fg flex flex-col">
    <ModeNav current="map-attack" />
    <div class="flex-1 flex items-center justify-center p-6">
    <div class="max-w-md w-full">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Map Attack</h1>
      </div>

      <p class="text-muted mb-4">Select regions to include, then identify every country. You have 3 lives.</p>

      <div class="flex flex-wrap gap-2 mb-6">
        {#each ALL_REGIONS as region}
          <button
            onclick={() => toggleRegion(region)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {selectedRegions[region]
                ? 'bg-accent border-accent text-accent-fg'
                : 'bg-transparent border-edge text-muted'}"
          >
            {REGION_LABELS[region]} ({regionCounts[region]})
          </button>
        {/each}
      </div>

      <div class="flex gap-3">
        <button
          onclick={startGame}
          disabled={!anyRegionSelected}
          class="flex-[2] py-3 rounded-lg font-semibold text-lg transition-colors {anyRegionSelected
            ? 'bg-accent hover:bg-accent-hover text-accent-fg'
            : 'bg-raised text-muted cursor-not-allowed'}"
        >
          Start
        </button>
        <button
          onclick={startStudy}
          disabled={!anyRegionSelected}
          title="Explore the map freely — hover or tap to reveal names"
          class="flex-1 py-3 rounded-lg font-semibold text-lg transition-colors {anyRegionSelected
            ? 'bg-raised hover:bg-raised-hover'
            : 'bg-raised text-muted cursor-not-allowed'}"
        >
          Study
        </button>
      </div>
    </div>
    </div>
  </div>

{:else if phase === 'study'}
  <div class="flex flex-col h-screen bg-canvas text-fg">
    <ModeNav current="map-attack" onRestart={changeRegions} />
    <!-- HUD -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-surface/90 z-10">
      <div class="text-sm text-muted">Study — hover or tap a country to see its name.</div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted">{studyCount} in quiz pool</span>
        <button
          onclick={startGame}
          class="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-semibold"
        >
          Start quiz
        </button>
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        targetCode=""
        studyMode
        {activeSubnationalIsoA2s}
        onCountryClick={handleStudyClick}
        onCountryHover={handleStudyHover}
      />
      {#if studyHover && studyHover.code !== studyPinned}
        <div
          class="absolute pointer-events-none z-10 px-2 py-1 rounded bg-surface/95 border border-edge text-sm shadow-lg whitespace-nowrap"
          style="left: {studyHover.x}px; top: {studyHover.y + (studyHover.y < 60 ? 18 : -12)}px; transform: translate(-50%, {studyHover.y < 60 ? '0' : '-100%'});"
        >
          {nameByCode[studyHover.code] ?? studyHover.code}
        </div>
      {/if}
      {#if studyPinned}
        {@const pinned = targetByCode[studyPinned]}
        {@const pinnedFlagUrl = getFlagUrl(studyPinned)}
        <div class="absolute bottom-4 left-4 z-10 bg-surface/95 rounded-xl shadow-lg border border-edge p-4 pr-10 max-w-xs">
          <button
            type="button"
            onclick={() => (studyPinned = null)}
            aria-label="Close"
            class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-fg text-xl leading-none"
          >×</button>
          {#if pinnedFlagUrl}
            <img src={pinnedFlagUrl} alt="Flag of {pinned?.name ?? studyPinned}" class="h-12 w-auto rounded-sm shadow mb-2" />
          {/if}
          <div class="font-semibold">{pinned?.name ?? studyPinned}</div>
          {#if pinned}
            <div class="text-sm text-muted">{REGION_LABELS[pinned.region]}</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

{:else if phase === 'playing'}
  <div class="flex flex-col h-screen bg-canvas text-fg">
    <ModeNav current="map-attack" onRestart={changeRegions} />
    <!-- HUD -->
    <div class="flex items-center justify-between px-4 py-2 bg-surface/90 z-10">
      <div class="flex items-center gap-4">
        <div class="text-lg font-semibold">
          Click on: <span class="text-accent">{currentTarget ? nameByCode[currentTarget] ?? currentTarget : ''}</span>
        </div>
      </div>
      <div class="text-sm text-fg">
        {claimedCount} / {totalCountries}
      </div>
      <div class="flex items-center gap-3">
        <div class="flex gap-1">
          {#each Array(MAX_LIVES) as _, i}
            <span class="text-xl">{i < lives ? '❤️' : '🩶'}</span>
          {/each}
        </div>
        <button
          onclick={changeRegions}
          aria-label="Change regions"
          title="Change regions"
          class="text-muted hover:text-fg text-xl leading-none p-1"
        >
          ↻
        </button>
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        bind:this={mapComponent}
        targetCode={currentTarget ?? ''}
        {claimedCountries}
        {activeSubnationalIsoA2s}
        onCountryClick={handleCountryClick}
      />
    </div>
  </div>

{:else}
  <!-- Results overlay on top of map -->
  <div class="flex flex-col h-screen bg-canvas text-fg">
    <ModeNav current="map-attack" onRestart={changeRegions} />
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        targetCode=""
        {claimedCountries}
        {activeSubnationalIsoA2s}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-surface rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-muted mb-6">All {totalCountries} countries identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-muted mb-6">{claimedCount} / {totalCountries} countries identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeRegions}
              class="w-full py-2 rounded-lg bg-raised hover:bg-raised-hover"
            >
              Change Regions
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-raised hover:bg-raised-hover block text-center"
            >
              ← Back to Learning Mode
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
