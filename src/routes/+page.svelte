<script lang="ts">
  import GameMap from '$lib/components/GameMap.svelte';
  import {
    getCountryList,
    getSubdivisionList,
    ALL_REGIONS,
    REGION_LABELS,
    SUBNATIONAL_PARENT_ISO_A2,
    type Region
  } from '$lib/data/countries';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import {
    loadGameData,
    selectNextCountry,
    recordHit,
    recordMiss,
    toggleSkip,
    toggleRegion,
    getZoomStage,
    type GameData
  } from '$lib/game-state';

  const countryList = getCountryList();
  const subdivisionList = getSubdivisionList();
  const allTargets = [...countryList, ...subdivisionList];
  const nameByCode = Object.fromEntries(allTargets.map((c) => [c.code, c.name]));

  let gameData = $state<GameData>(loadGameData());
  let currentCode = $state<string | null>(selectNextCountry(gameData));
  let zoomStage = $state(currentCode ? getZoomStage(gameData, currentCode) : 0);
  let streak = $state(0);
  let totalHits = $state(0);
  let totalMisses = $state(0);

  let activeSubnationalIsoA2s = $derived(
    Object.entries(SUBNATIONAL_PARENT_ISO_A2)
      .filter(([region]) => gameData.regions[region as Region])
      .map(([, isoA2]) => isoA2 as string)
  );

  let regionCounts = $derived.by(() => {
    const counts: Record<Region, number> = {} as Record<Region, number>;
    for (const r of ALL_REGIONS) counts[r] = 0;
    for (const c of allTargets) counts[c.region] += 1;
    return counts;
  });

  let showRegions = $state(false);

  function handleToggleRegion(region: Region) {
    toggleRegion(gameData, region);
    gameData = loadGameData();
  }

  let mapComponent: ReturnType<typeof GameMap>;

  function advanceToNext() {
    gameData = loadGameData();
    currentCode = selectNextCountry(gameData);
    zoomStage = currentCode ? getZoomStage(gameData, currentCode) : 0;

    setTimeout(() => {
      if (currentCode) {
        mapComponent?.transitionTo(zoomStage, currentCode);
      }
    }, 1000);
  }

  function skipAction(code: string, name: string): { label: string; onClick: () => void } {
    return {
      label: 'Skip in future',
      onClick: () => {
        const data = loadGameData();
        toggleSkip(data, code);
        toast.dismiss();
        toast.info(`${name} will be skipped`, { duration: 2000 });
      }
    };
  }

  function handleClickResult(hit: boolean) {
    if (!currentCode) return;

    const answeredCode = currentCode;
    const countryName = nameByCode[answeredCode] ?? answeredCode;

    if (hit) {
      streak += 1;
      totalHits += 1;
      recordHit(gameData, answeredCode);
      toast.dismiss();
      toast.success(`Correct! ${countryName}`, {
        duration: 3000,
        action: skipAction(answeredCode, countryName)
      });
      advanceToNext();
    } else {
      streak = 0;
      totalMisses += 1;
      recordMiss(gameData, answeredCode);
      toast.dismiss();
      toast.error(`Missed! Click on ${countryName} to continue`, {
        duration: 5000,
        action: skipAction(answeredCode, countryName)
      });
      // Don't advance — wait for retry
    }
  }

  function handleRetryComplete() {
    advanceToNext();
  }
</script>

<div class="flex flex-col h-screen bg-canvas text-fg">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2 bg-surface">
    <h1 class="text-lg font-bold">
      {#if currentCode}
        Click on: <span class="text-accent">{nameByCode[currentCode] ?? currentCode}</span>
      {:else}
        No countries to review!
      {/if}
    </h1>
    <div class="flex gap-4">
      <button
        onclick={() => (showRegions = true)}
        class="text-sm text-muted hover:text-fg"
      >
        Regions
      </button>
      <a href="{base}/map-attack" class="text-sm text-muted hover:text-fg">Map Attack</a>
      <a href="{base}/cities" class="text-sm text-muted hover:text-fg">Cities</a>
      <a href="{base}/manage" class="text-sm text-muted hover:text-fg">Manage Countries</a>
    </div>
  </div>

  <!-- Map -->
  <div class="flex-1 relative overflow-hidden">
    {#if showRegions}
      <div class="absolute inset-0 bg-canvas z-10 flex items-center justify-center p-6">
        <div class="max-w-md w-full">
          <h2 class="text-2xl font-bold mb-6 text-center">Select regions</h2>
          <div class="flex flex-wrap gap-2 justify-center mb-6">
            {#each ALL_REGIONS as region}
              <button
                onclick={() => handleToggleRegion(region)}
                class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
                  {gameData.regions[region]
                    ? 'bg-accent border-accent text-fg'
                    : 'bg-transparent border-edge text-muted'}"
              >
                {REGION_LABELS[region]} ({regionCounts[region]})
              </button>
            {/each}
          </div>
          <button
            onclick={() => (showRegions = false)}
            class="w-full py-3 rounded-lg font-semibold text-lg bg-accent hover:bg-accent-hover text-fg"
          >
            Done
          </button>
        </div>
      </div>
    {/if}
    <GameMap
      bind:this={mapComponent}
      {zoomStage}
      targetCode={currentCode ?? ''}
      {activeSubnationalIsoA2s}
      onClickResult={handleClickResult}
      onRetryComplete={handleRetryComplete}
    />
  </div>

  <!-- Stats bar -->
  <div class="flex items-center justify-between px-4 py-2 bg-surface text-sm text-muted">
    <span>Streak: {streak}</span>
    <span>Hits: {totalHits} | Misses: {totalMisses}</span>
    <span>
      {#if currentCode && gameData.countries[currentCode]}
        Bucket {gameData.countries[currentCode].bucket} | Stage {gameData.countries[currentCode].stage}
      {/if}
    </span>
  </div>
</div>
