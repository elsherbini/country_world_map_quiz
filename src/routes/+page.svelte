<script lang="ts">
  import GameMap from '$lib/components/GameMap.svelte';
  import { getCountryList } from '$lib/data/countries';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import {
    loadGameData,
    selectNextCountry,
    recordHit,
    recordMiss,
    toggleSkip,
    getZoomStage,
    type GameData
  } from '$lib/game-state';

  const countryList = getCountryList();
  const nameByCode = Object.fromEntries(countryList.map((c) => [c.code, c.name]));

  let gameData = $state<GameData>(loadGameData());
  let currentCode = $state<string | null>(selectNextCountry(gameData));
  let zoomStage = $state(currentCode ? getZoomStage(gameData, currentCode) : 0);
  let streak = $state(0);
  let totalHits = $state(0);
  let totalMisses = $state(0);

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
        toast.info(`${name} will be skipped`);
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
      toast.success(`Correct! ${countryName}`, {
        duration: 5000,
        action: skipAction(answeredCode, countryName)
      });
      advanceToNext();
    } else {
      streak = 0;
      totalMisses += 1;
      recordMiss(gameData, answeredCode);
      toast.error(`Missed! Click on ${countryName} to continue`, {
        duration: 10000,
        action: skipAction(answeredCode, countryName)
      });
      // Don't advance — wait for retry
    }
  }

  function handleRetryComplete() {
    advanceToNext();
  }
</script>

<div class="flex flex-col h-screen bg-gray-900 text-white">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2 bg-gray-800">
    <h1 class="text-lg font-bold">
      {#if currentCode}
        Click on: <span class="text-blue-400">{nameByCode[currentCode] ?? currentCode}</span>
      {:else}
        No countries to review!
      {/if}
    </h1>
    <a href="{base}/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
  </div>

  <!-- Map -->
  <div class="flex-1 relative overflow-hidden">
    <GameMap
      bind:this={mapComponent}
      {zoomStage}
      targetCode={currentCode ?? ''}
      onClickResult={handleClickResult}
      onRetryComplete={handleRetryComplete}
    />
  </div>

  <!-- Stats bar -->
  <div class="flex items-center justify-between px-4 py-2 bg-gray-800 text-sm text-gray-400">
    <span>Streak: {streak}</span>
    <span>Hits: {totalHits} | Misses: {totalMisses}</span>
    <span>
      {#if currentCode && gameData.countries[currentCode]}
        Bucket {gameData.countries[currentCode].bucket} | Stage {gameData.countries[currentCode].stage}
      {/if}
    </span>
  </div>
</div>
