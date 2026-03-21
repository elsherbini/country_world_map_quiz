<script lang="ts">
  import { getCountryList } from '$lib/data/countries';
  import {
    loadGameData,
    toggleSkip,
    resetCountry,
    type GameData,
    type CountryState
  } from '$lib/game-state';

  const countryList = getCountryList();
  let gameData = $state<GameData>(loadGameData());

  type Status = 'active' | 'skipped' | 'retired' | 'unseen';

  function getStatus(code: string): Status {
    const state = gameData.countries[code];
    if (!state) return 'unseen';
    if (state.skipped) return 'skipped';
    if (state.bucket === 8) return 'retired';
    return 'active';
  }

  function getBucket(code: string): number | null {
    const state = gameData.countries[code];
    if (!state || state.bucket === 8) return null;
    return state.bucket;
  }

  let grouped = $derived.by(() => {
    const groups: Record<Status, { name: string; code: string; bucket: number | null }[]> = {
      active: [],
      skipped: [],
      retired: [],
      unseen: []
    };
    for (const c of countryList) {
      const status = getStatus(c.code);
      groups[status].push({ ...c, bucket: getBucket(c.code) });
    }
    return groups;
  });

  function handleToggleSkip(code: string) {
    toggleSkip(gameData, code);
    gameData = loadGameData();
  }

  function handleReset(code: string) {
    resetCountry(gameData, code);
    gameData = loadGameData();
  }
</script>

<div class="min-h-screen bg-gray-900 text-white p-6">
  <div class="max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Manage Countries</h1>
      <a href="/" class="text-sm text-blue-400 hover:text-blue-300">Back to Game</a>
    </div>

    {#each (['active', 'skipped', 'retired', 'unseen'] as const) as status}
      {@const items = grouped[status]}
      {#if items.length > 0}
        <div class="mb-8">
          <h2 class="text-lg font-semibold mb-2 capitalize text-gray-300">
            {status} ({items.length})
          </h2>
          <div class="space-y-1">
            {#each items as item}
              <div class="flex items-center justify-between px-3 py-2 bg-gray-800 rounded">
                <div>
                  <span>{item.name}</span>
                  {#if item.bucket !== null}
                    <span class="text-xs text-gray-500 ml-2">Bucket {item.bucket}</span>
                  {/if}
                </div>
                <div class="flex gap-2">
                  <button
                    onclick={() => handleToggleSkip(item.code)}
                    class="text-xs px-2 py-1 rounded {status === 'skipped' ? 'bg-green-700 hover:bg-green-600' : 'bg-yellow-700 hover:bg-yellow-600'}"
                  >
                    {status === 'skipped' ? 'Unskip' : 'Skip'}
                  </button>
                  {#if status !== 'unseen'}
                    <button
                      onclick={() => handleReset(item.code)}
                      class="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
                    >
                      Reset
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
