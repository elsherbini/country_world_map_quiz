<script lang="ts">
  import GameMap from '$lib/components/GameMap.svelte';
  import { getCountryList } from '$lib/data/countries';
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
  let lastResult = $state<'hit' | 'miss' | null>(null);
  let streak = $state(0);
  let totalHits = $state(0);
  let totalMisses = $state(0);

  let mapComponent: ReturnType<typeof GameMap>;

  function handleClickResult(hit: boolean) {
    if (!currentCode) return;

    if (hit) {
      lastResult = 'hit';
      streak += 1;
      totalHits += 1;
      recordHit(gameData, currentCode);
    } else {
      lastResult = 'miss';
      streak = 0;
      totalMisses += 1;
      recordMiss(gameData, currentCode);
    }
  }

  function handleSkip() {
    if (!currentCode) return;
    toggleSkip(gameData, currentCode);
    nextRound();
  }

  function nextRound() {
    lastResult = null;
    gameData = loadGameData();
    currentCode = selectNextCountry(gameData);
    zoomStage = currentCode ? getZoomStage(gameData, currentCode) : 0;
    mapComponent?.reset();
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
    <a href="/manage" class="text-sm text-gray-400 hover:text-white">Manage Countries</a>
  </div>

  <!-- Map -->
  <div class="flex-1 relative overflow-hidden">
    <GameMap
      bind:this={mapComponent}
      {zoomStage}
      targetCode={currentCode ?? ''}
      onClickResult={handleClickResult}
    />
  </div>

  <!-- Result bar -->
  {#if lastResult}
    <div class="flex items-center justify-center gap-4 px-4 py-3 {lastResult === 'hit' ? 'bg-green-900' : 'bg-red-900'}">
      <span class="font-bold">{lastResult === 'hit' ? 'Correct!' : 'Missed!'}</span>
      {#if lastResult === 'hit'}
        <button onclick={handleSkip} class="text-sm px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">
          Skip in future
        </button>
      {/if}
      <button onclick={nextRound} class="text-sm px-3 py-1 bg-blue-600 rounded hover:bg-blue-500">
        Next
      </button>
    </div>
  {/if}

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
