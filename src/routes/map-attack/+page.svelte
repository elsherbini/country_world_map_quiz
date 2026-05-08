<script lang="ts">
  import { base } from '$app/paths';
  import MapAttackMap from '$lib/components/MapAttackMap.svelte';
  import {
    getCountryList,
    ALL_REGIONS,
    REGION_LABELS,
    REGION_COLORS,
    type Region
  } from '$lib/data/countries';

  const STORAGE_KEY = 'map-attack-regions';
  const MAX_LIVES = 3;

  const countryList = getCountryList();
  const nameByCode = Object.fromEntries(countryList.map((c) => [c.code, c.name]));

  // --- State ---
  type Phase = 'setup' | 'playing' | 'results';
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
    return counts;
  });

  let anyRegionSelected = $derived(ALL_REGIONS.some((r) => selectedRegions[r]));

  // --- Game state ---
  let lives = $state(MAX_LIVES);
  let claimedCountries = $state(new Set<string>());
  let currentTarget = $state<string | null>(null);
  let won = $state(false);

  let eligibleCountries: string[] = [];
  let remainingCountries: string[] = [];

  let mapComponent: ReturnType<typeof MapAttackMap>;

  let totalCountries = $derived(eligibleCountries.length);
  let claimedCount = $derived(claimedCountries.size);

  function startGame() {
    eligibleCountries = countryList
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
      // Wrong
      lives -= 1;
      mapComponent?.flashWrong(code);
      if (lives <= 0) {
        // Game over after flash
        setTimeout(() => {
          won = false;
          phase = 'results';
        }, 600);
      }
    }
  }

  function playAgain() {
    startGame();
  }

  function changeRegions() {
    phase = 'setup';
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
  <div class="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
    <div class="max-w-md w-full">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Map Attack</h1>
        <a href="{base}/" class="text-sm text-gray-400 hover:text-white">Back to Game</a>
      </div>

      <p class="text-gray-400 mb-4">Select regions to include, then identify every country. You have 3 lives.</p>

      <div class="flex flex-wrap gap-2 mb-6">
        {#each ALL_REGIONS as region}
          <button
            onclick={() => toggleRegion(region)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2"
            style={selectedRegions[region]
              ? `background-color: ${REGION_COLORS[region]}; border-color: ${REGION_COLORS[region]}; color: #111`
              : `background-color: transparent; border-color: #4b5563; color: #9ca3af`}
          >
            {REGION_LABELS[region]} ({regionCounts[region]})
          </button>
        {/each}
      </div>

      <button
        onclick={startGame}
        disabled={!anyRegionSelected}
        class="w-full py-3 rounded-lg font-semibold text-lg transition-colors {anyRegionSelected
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
      >
        Start
      </button>
    </div>
  </div>

{:else if phase === 'playing'}
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <!-- HUD -->
    <div class="flex items-center justify-between px-4 py-2 bg-black/60 z-10">
      <div class="text-lg font-semibold">
        Click on: <span class="text-blue-400">{currentTarget ? nameByCode[currentTarget] ?? currentTarget : ''}</span>
      </div>
      <div class="text-sm text-gray-300">
        {claimedCount} / {totalCountries}
      </div>
      <div class="flex gap-1">
        {#each Array(MAX_LIVES) as _, i}
          <span class="text-xl">{i < lives ? '❤️' : '🩶'}</span>
        {/each}
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        bind:this={mapComponent}
        targetCode={currentTarget ?? ''}
        {claimedCountries}
        onCountryClick={handleCountryClick}
      />
    </div>
  </div>

{:else}
  <!-- Results overlay on top of map -->
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <div class="flex-1 relative overflow-hidden">
      <MapAttackMap
        targetCode=""
        {claimedCountries}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-gray-400 mb-6">All {totalCountries} countries identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-gray-400 mb-6">{claimedCount} / {totalCountries} countries identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeRegions}
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600"
            >
              Change Regions
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 block text-center"
            >
              Back to Game
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
