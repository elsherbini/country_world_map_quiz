<script lang="ts">
  import { base } from '$app/paths';
  import CitiesMap from '$lib/components/CitiesMap.svelte';
  import {
    getCityList,
    findDuplicateNames,
    CITY_CONTINENTS,
    POPULATION_TIERS,
    POPULATION_TIER_LABELS,
    type CityContinent,
    type PopulationTier
  } from '$lib/data/cities';

  const STORAGE_KEY = 'cities-game-settings';
  const MAX_LIVES = 3;

  const allCities = getCityList();
  const nameByKey = Object.fromEntries(allCities.map((c) => [c.key, c]));

  // --- State ---
  type Phase = 'setup' | 'playing' | 'results';
  let phase = $state<Phase>('setup');
  let showAbout = $state(false);

  const sortedCities = [...allCities].sort((a, b) => b.population - a.population);

  // Settings (persisted)
  interface CitySettings {
    continents: Record<CityContinent, boolean>;
    tiers: Record<PopulationTier, boolean>;
    showCountry: boolean;
  }

  function loadSettings(): CitySettings {
    if (typeof window === 'undefined') return defaultSettings();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    try {
      const parsed = JSON.parse(raw);
      const defs = defaultSettings();
      return {
        continents: { ...defs.continents, ...parsed.continents },
        tiers: { ...defs.tiers, ...parsed.tiers },
        showCountry: parsed.showCountry ?? defs.showCountry
      };
    } catch {
      return defaultSettings();
    }
  }

  function defaultSettings(): CitySettings {
    return {
      continents: Object.fromEntries(CITY_CONTINENTS.map((c) => [c, true])) as Record<CityContinent, boolean>,
      tiers: Object.fromEntries(POPULATION_TIERS.map((t) => [t, true])) as Record<PopulationTier, boolean>,
      showCountry: true
    };
  }

  let settings = $state<CitySettings>(loadSettings());

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function toggleContinent(c: CityContinent) {
    settings.continents[c] = !settings.continents[c];
    saveSettings();
  }

  function toggleTier(t: PopulationTier) {
    settings.tiers[t] = !settings.tiers[t];
    saveSettings();
  }

  function toggleShowCountry() {
    settings.showCountry = !settings.showCountry;
    saveSettings();
  }

  // --- Filtered city counts ---
  let eligibleCities = $derived(
    allCities.filter(
      (c) => settings.continents[c.continent] && settings.tiers[c.populationTier]
    )
  );

  // Cross-filtered counts: continent counts filtered by selected tiers
  let continentCounts = $derived.by(() => {
    const counts: Record<CityContinent, number> = {} as Record<CityContinent, number>;
    for (const c of CITY_CONTINENTS) counts[c] = 0;
    for (const city of allCities) {
      if (settings.tiers[city.populationTier]) {
        counts[city.continent] += 1;
      }
    }
    return counts;
  });

  // Cross-filtered counts: tier counts filtered by selected continents
  let tierCounts = $derived.by(() => {
    const counts: Record<PopulationTier, number> = {} as Record<PopulationTier, number>;
    for (const t of POPULATION_TIERS) counts[t] = 0;
    for (const city of allCities) {
      if (settings.continents[city.continent]) {
        counts[city.populationTier] += 1;
      }
    }
    return counts;
  });

  let anySelected = $derived(eligibleCities.length > 0);

  // --- Game state ---
  let lives = $state(MAX_LIVES);
  let claimedCities = $state(new Set<string>());
  let currentTarget = $state<string | null>(null);
  let won = $state(false);
  let gameCities = $state<string[]>([]);
  let remainingCities: string[] = [];
  let eligibleCityKeys = $state(new Set<string>());
  let duplicateNames = $state(new Set<string>());

  let mapComponent = $state<ReturnType<typeof CitiesMap>>();

  let totalCities = $derived(gameCities.length);
  let claimedCount = $derived(claimedCities.size);

  function formatPopulation(pop: number): string {
    return pop.toLocaleString();
  }

  function getTargetDisplay(): string {
    if (!currentTarget) return '';
    const city = nameByKey[currentTarget];
    if (!city) return currentTarget;
    let display = `${city.name} ${formatPopulation(city.population)}`;
    if (settings.showCountry || duplicateNames.has(city.name)) {
      display = `${city.name}, ${city.country} ${formatPopulation(city.population)}`;
    }
    return display;
  }

  function startGame() {
    const eligible = allCities.filter(
      (c) => settings.continents[c.continent] && settings.tiers[c.populationTier]
    );
    gameCities = eligible.map((c) => c.key);
    eligibleCityKeys = new Set(gameCities);
    duplicateNames = findDuplicateNames(eligibleCityKeys, allCities);
    remainingCities = shuffle([...gameCities]);
    claimedCities = new Set();
    lives = MAX_LIVES;
    won = false;
    currentTarget = remainingCities.pop() ?? null;
    phase = 'playing';
  }

  function pickNextTarget() {
    if (remainingCities.length === 0) {
      won = true;
      phase = 'results';
      return;
    }
    currentTarget = remainingCities.pop() ?? null;
  }

  function handleCityClick(key: string) {
    if (!currentTarget) return;

    if (key === currentTarget) {
      claimedCities = new Set([...claimedCities, key]);
      mapComponent?.redraw();
      pickNextTarget();
    } else {
      lives -= 1;
      mapComponent?.flashWrong(key);
      if (lives <= 0) {
        setTimeout(() => {
          won = false;
          phase = 'results';
        }, 600);
      } else {
        const insertIdx = Math.floor(Math.random() * remainingCities.length);
        remainingCities.splice(insertIdx, 0, currentTarget!);
        pickNextTarget();
      }
    }
  }

  function playAgain() {
    startGame();
  }

  function changeCities() {
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

{#if showAbout}
  <div class="fixed inset-0 bg-gray-900 text-white z-50 overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">City Population Data</h2>
        <button
          onclick={() => (showAbout = false)}
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
        >
          Done
        </button>
      </div>

      <div class="space-y-3 text-gray-300 mb-8">
        <p>
          Populations come from the <strong>UN World Urbanization Prospects 2025</strong>
          (released November 2025), produced jointly with the European Commission's Joint Research Centre.
        </p>
        <p>
          An urban agglomeration is defined as <strong>contiguous land at ≥1,500 persons/km² density</strong>,
          identified from satellite imagery (the Global Human Settlement Layer). This single satellite-derived
          definition is applied consistently to every country — it does not depend on administrative boundaries,
          which makes Tokyo's, Karachi's and Lagos's metros directly comparable.
        </p>
        <p>
          Coordinates are population-weighted centroids of each urban center. Cities are included if their 2025
          population is at least 2 million.
        </p>
        <p class="text-sm text-gray-400">
          Side effect of the methodology: US, Canadian and Australian metros come out smaller than the MSA figures
          most Americans quote, because suburban density falls below the threshold. New York is 14M (not 20M);
          Chicago, Boston, Atlanta, Dallas and others are smaller or absent. The trade-off is global consistency.
        </p>
      </div>

      <h3 class="text-lg font-semibold mb-3">All cities ({sortedCities.length})</h3>
      <table class="w-full text-sm">
        <thead class="text-gray-400 text-left border-b border-gray-700">
          <tr>
            <th class="py-2 pr-4 w-12">#</th>
            <th class="py-2 pr-4">City</th>
            <th class="py-2 pr-4">Country</th>
            <th class="py-2 text-right">Population</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedCities as city, i}
            <tr class="border-b border-gray-800">
              <td class="py-1.5 pr-4 text-gray-500">{i + 1}</td>
              <td class="py-1.5 pr-4">{city.name}</td>
              <td class="py-1.5 pr-4 text-gray-400">{city.country}</td>
              <td class="py-1.5 text-right tabular-nums">{city.population.toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

{#if phase === 'setup'}
  <div class="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
    <div class="max-w-md w-full">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">Cities</h1>
          <button
            onclick={() => (showAbout = true)}
            aria-label="About the population data"
            title="About the population data"
            class="w-6 h-6 rounded-full border border-gray-500 text-gray-400 hover:text-white hover:border-white text-sm leading-none"
          >
            ?
          </button>
        </div>
        <a href="{base}/" class="text-sm text-gray-400 hover:text-white">← Back to Learning Mode</a>
      </div>

      <p class="text-gray-400 mb-4">Select continents and population ranges, then identify every city. You have 3 lives.</p>

      <!-- Continent filter -->
      <h2 class="text-sm font-semibold text-gray-400 mb-2">Continents</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each CITY_CONTINENTS as continent}
          <button
            onclick={() => toggleContinent(continent)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {settings.continents[continent]
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-gray-600 text-gray-400'}"
          >
            {continent} ({continentCounts[continent]})
          </button>
        {/each}
      </div>

      <!-- Population filter -->
      <h2 class="text-sm font-semibold text-gray-400 mb-2">Population</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each POPULATION_TIERS as tier}
          <button
            onclick={() => toggleTier(tier)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {settings.tiers[tier]
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-gray-600 text-gray-400'}"
          >
            {POPULATION_TIER_LABELS[tier]} ({tierCounts[tier]})
          </button>
        {/each}
      </div>

      <!-- Toggles -->
      <div class="flex gap-4 mb-4">
        <button
          onclick={toggleShowCountry}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors bg-gray-700 hover:bg-gray-600"
        >
          Country: {settings.showCountry ? 'On' : 'Off'}
        </button>
      </div>

      <!-- Total count -->
      <p class="text-gray-400 text-sm mb-4">{eligibleCities.length} cities selected</p>

      <button
        onclick={startGame}
        disabled={!anySelected}
        class="w-full py-3 rounded-lg font-semibold text-lg transition-colors {anySelected
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
        Click on: <span class="text-blue-400">{getTargetDisplay()}</span>
      </div>
      <div class="text-sm text-gray-300">
        {claimedCount} / {totalCities}
      </div>
      <div class="flex items-center gap-3">
        <div class="flex gap-1">
          {#each Array(MAX_LIVES) as _, i}
            <span class="text-xl">{i < lives ? '❤️' : '🩶'}</span>
          {/each}
        </div>
        <button
          onclick={() => (showAbout = true)}
          aria-label="About the population data"
          title="About the population data"
          class="w-6 h-6 rounded-full border border-gray-500 text-gray-400 hover:text-white hover:border-white text-sm leading-none"
        >
          ?
        </button>
      </div>
    </div>

    <!-- Map -->
    <div class="flex-1 relative overflow-hidden">
      <CitiesMap
        bind:this={mapComponent}
        {claimedCities}
        {eligibleCityKeys}
        onCityClick={handleCityClick}
      />
    </div>
  </div>

{:else}
  <!-- Results overlay on top of map -->
  <div class="flex flex-col h-screen bg-gray-900 text-white">
    <div class="flex-1 relative overflow-hidden">
      <CitiesMap
        {claimedCities}
        {eligibleCityKeys}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-gray-400 mb-6">All {totalCities} cities identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-gray-400 mb-6">{claimedCount} / {totalCities} cities identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeCities}
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600"
            >
              Change Cities
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 block text-center"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
