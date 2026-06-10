<script lang="ts">
  import { base } from '$app/paths';
  import CitiesMap from '$lib/components/CitiesMap.svelte';
  import {
    getCityList,
    getCityCountries,
    findDuplicateNames,
    CITY_REGIONS,
    REGION_LABELS,
    type CityEntry
  } from '$lib/data/cities';
  import { type Region } from '$lib/data/countries';

  const STORAGE_KEY = 'cities-game-settings-v2';
  const MAX_LIVES = 3;

  const allCities = getCityList();
  const nameByKey = Object.fromEntries(allCities.map((c) => [c.key, c]));
  const allCountries = getCityCountries();
  const countryNameByCode = Object.fromEntries(allCountries.map((c) => [c.code, c.name]));
  const sortedCities = [...allCities].sort((a, b) => b.population - a.population);

  // cities grouped by country code, sorted by population desc (built once)
  const citiesByCode = new Map<string, CityEntry[]>();
  for (const c of allCities) {
    const arr = citiesByCode.get(c.code) ?? [];
    arr.push(c);
    citiesByCode.set(c.code, arr);
  }
  for (const arr of citiesByCode.values()) arr.sort((a, b) => b.population - a.population);

  // --- State ---
  type Phase = 'setup' | 'playing' | 'results';
  let phase = $state<Phase>('setup');
  let showAbout = $state(false);

  // Settings (persisted)
  interface CitySettings {
    regions: Record<Region, boolean>;
    countries: string[]; // ISO codes (additive to regions)
    populationMode: boolean;
    capitals: boolean;
    topN: number;
    cutoff: number;
    showCountry: boolean;
  }

  function defaultSettings(): CitySettings {
    return {
      regions: Object.fromEntries(CITY_REGIONS.map((r) => [r, true])) as Record<Region, boolean>,
      countries: [],
      populationMode: true,
      capitals: false,
      topN: 5,
      cutoff: 1_000_000,
      showCountry: true
    };
  }

  function loadSettings(): CitySettings {
    if (typeof window === 'undefined') return defaultSettings();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    try {
      const p = JSON.parse(raw);
      const d = defaultSettings();
      return {
        regions: { ...d.regions, ...p.regions },
        countries: Array.isArray(p.countries) ? p.countries : d.countries,
        populationMode: p.populationMode ?? d.populationMode,
        capitals: p.capitals ?? d.capitals,
        topN: p.topN ?? d.topN,
        cutoff: p.cutoff ?? d.cutoff,
        showCountry: p.showCountry ?? d.showCountry
      };
    } catch {
      return defaultSettings();
    }
  }

  let settings = $state<CitySettings>(loadSettings());

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function toggleRegion(r: Region) {
    settings.regions[r] = !settings.regions[r];
    saveSettings();
  }

  function toggleCountry(code: string) {
    const i = settings.countries.indexOf(code);
    if (i >= 0) settings.countries.splice(i, 1);
    else settings.countries.push(code);
    saveSettings();
  }

  function togglePopulationMode() {
    settings.populationMode = !settings.populationMode;
    saveSettings();
  }

  function toggleCapitals() {
    settings.capitals = !settings.capitals;
    saveSettings();
  }

  function toggleShowCountry() {
    settings.showCountry = !settings.showCountry;
    saveSettings();
  }

  function setTopN(n: number) {
    settings.topN = Math.max(1, Math.min(25, Math.floor(n) || 1));
    saveSettings();
  }

  function setCutoff(n: number) {
    settings.cutoff = Math.max(500_000, Math.floor(n) || 500_000);
    saveSettings();
  }

  // --- Eligible set logic ---
  let inPlayCodes = $derived.by(() => {
    const set = new Set<string>();
    for (const c of allCountries) {
      if (settings.regions[c.region] || settings.countries.includes(c.code)) set.add(c.code);
    }
    return set;
  });

  let eligibleCities = $derived.by(() => {
    const out: CityEntry[] = [];
    for (const code of inPlayCodes) {
      const list = citiesByCode.get(code) ?? [];
      list.forEach((city, idx) => {
        const include =
          (settings.populationMode &&
            (idx === 0 || (idx < settings.topN && city.population > settings.cutoff))) ||
          (settings.capitals && city.isCapital);
        if (include) out.push(city);
      });
    }
    return out;
  });

  let regionCounts = $derived.by(() => {
    const counts = Object.fromEntries(CITY_REGIONS.map((r) => [r, 0])) as Record<Region, number>;
    for (const c of eligibleCities) if (c.region in counts) counts[c.region] += 1;
    return counts;
  });

  let anySelected = $derived(eligibleCities.length > 0);

  let countryQuery = $state('');
  let filteredCountries = $derived(
    countryQuery.trim()
      ? allCountries.filter((c) => c.name.toLowerCase().includes(countryQuery.trim().toLowerCase()))
      : allCountries
  );

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
    gameCities = eligibleCities.map((c) => c.key);
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
  <div class="fixed inset-0 bg-canvas text-fg z-50 overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">City Population Data</h2>
        <button
          onclick={() => (showAbout = false)}
          class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-semibold"
        >
          Done
        </button>
      </div>

      <div class="space-y-3 text-fg mb-8">
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
          Coordinates are population-weighted centroids of each urban center. The dataset includes cities down to
          500,000 people; in the game, each selected country always contributes its largest city, additional cities
          appear when they exceed your population cutoff, and national capitals can be included regardless of size.
        </p>
        <p class="text-sm text-muted">
          Side effect of the methodology: US, Canadian and Australian metros come out smaller than the MSA figures
          most Americans quote, because suburban density falls below the threshold. New York is 14M (not 20M);
          Chicago, Boston, Atlanta, Dallas and others are smaller or absent. The trade-off is global consistency.
        </p>
      </div>

      <h3 class="text-lg font-semibold mb-3">All cities ({sortedCities.length})</h3>
      <table class="w-full text-sm">
        <thead class="text-muted text-left border-b border-edge">
          <tr>
            <th class="py-2 pr-4 w-12">#</th>
            <th class="py-2 pr-4">City</th>
            <th class="py-2 pr-4">Country</th>
            <th class="py-2 text-right">Population</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedCities as city, i}
            <tr class="border-b border-edge">
              <td class="py-1.5 pr-4 text-muted">{i + 1}</td>
              <td class="py-1.5 pr-4">{city.name}</td>
              <td class="py-1.5 pr-4 text-muted">{city.country}</td>
              <td class="py-1.5 text-right tabular-nums">{city.population.toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

{#if phase === 'setup'}
  <div class="min-h-screen bg-canvas text-fg flex items-center justify-center p-6">
    <div class="max-w-md w-full">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">Cities</h1>
          <button
            onclick={() => (showAbout = true)}
            aria-label="About the population data"
            title="About the population data"
            class="w-6 h-6 rounded-full border border-edge text-muted hover:text-fg hover:border-fg text-sm leading-none"
          >
            ?
          </button>
        </div>
        <a href="{base}/" class="text-sm text-muted hover:text-fg">← Back to Learning Mode</a>
      </div>

      <p class="text-muted mb-4">Pick regions and/or specific countries, then identify every city. You have 3 lives.</p>

      <!-- Regions -->
      <h2 class="text-sm font-semibold text-muted mb-2">Regions</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each CITY_REGIONS as region}
          <button
            onclick={() => toggleRegion(region)}
            class="text-sm px-3 py-1.5 rounded-full transition-colors border-2
              {settings.regions[region] ? 'bg-accent border-accent text-accent-fg' : 'bg-transparent border-edge text-muted'}"
          >{REGION_LABELS[region]} ({regionCounts[region]})</button>
        {/each}
      </div>

      <!-- Country multiselect -->
      <h2 class="text-sm font-semibold text-muted mb-2">Specific countries (optional)</h2>
      {#if settings.countries.length}
        <div class="flex flex-wrap gap-1.5 mb-2">
          {#each settings.countries as code}
            <span class="text-xs px-2 py-1 rounded-full bg-accent text-accent-fg flex items-center gap-1">
              {countryNameByCode[code] ?? code}
              <button onclick={() => toggleCountry(code)} aria-label="Remove {countryNameByCode[code] ?? code}" class="leading-none">×</button>
            </span>
          {/each}
        </div>
      {/if}
      <input
        type="text"
        bind:value={countryQuery}
        placeholder="Search countries…"
        class="w-full px-3 py-2 rounded-lg bg-raised text-fg border border-edge mb-2 text-sm"
      />
      {#if countryQuery.trim()}
        <div class="max-h-40 overflow-y-auto border border-edge rounded-lg mb-4">
          {#each filteredCountries.slice(0, 60) as c}
            <button
              onclick={() => toggleCountry(c.code)}
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-raised-hover flex items-center justify-between
                {settings.countries.includes(c.code) ? 'text-accent' : 'text-fg'}"
            >
              <span>{c.name}</span>
              {#if settings.countries.includes(c.code)}<span>✓</span>{/if}
            </button>
          {:else}
            <p class="px-3 py-2 text-sm text-muted">No matches</p>
          {/each}
        </div>
      {:else}
        <div class="mb-4"></div>
      {/if}

      <!-- Capitals + top-N + cutoff + country label -->
      <div class="space-y-3 mb-4">
        <button
          onclick={togglePopulationMode}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors {settings.populationMode ? 'bg-accent text-accent-fg' : 'bg-raised hover:bg-raised-hover'}"
        >Population cities: {settings.populationMode ? 'On' : 'Off'}</button>

        <button
          onclick={toggleCapitals}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors {settings.capitals ? 'bg-accent text-accent-fg' : 'bg-raised hover:bg-raised-hover'}"
        >Capitals: {settings.capitals ? 'On' : 'Off'}</button>

        <div class="flex items-center gap-3 text-sm {settings.populationMode ? '' : 'opacity-40'}">
          <label class="text-muted" for="topN">Top cities per country</label>
          <input id="topN" type="number" min="1" max="25" value={settings.topN}
            disabled={!settings.populationMode}
            oninput={(e) => setTopN(+e.currentTarget.value)}
            class="w-20 px-2 py-1 rounded bg-raised border border-edge text-fg {settings.populationMode ? '' : 'opacity-40 cursor-not-allowed'}" />
        </div>

        <div class="flex items-center gap-3 text-sm {settings.populationMode ? '' : 'opacity-40'}">
          <label class="text-muted" for="cutoff">Population cutoff for #2+</label>
          <input id="cutoff" type="number" min="500000" step="100000" value={settings.cutoff}
            disabled={!settings.populationMode}
            oninput={(e) => setCutoff(+e.currentTarget.value)}
            class="w-32 px-2 py-1 rounded bg-raised border border-edge text-fg {settings.populationMode ? '' : 'opacity-40 cursor-not-allowed'}" />
        </div>

        <button
          onclick={toggleShowCountry}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors bg-raised hover:bg-raised-hover"
        >Country label: {settings.showCountry ? 'On' : 'Off'}</button>
      </div>

      <p class="text-muted text-sm mb-4">{eligibleCities.length} cities across {inPlayCodes.size} countries</p>

      <button
        onclick={startGame}
        disabled={!anySelected}
        class="w-full py-3 rounded-lg font-semibold text-lg transition-colors {anySelected
          ? 'bg-accent hover:bg-accent-hover text-accent-fg'
          : 'bg-raised text-muted cursor-not-allowed'}"
      >
        Start
      </button>
    </div>
  </div>

{:else if phase === 'playing'}
  <div class="flex flex-col h-screen bg-canvas text-fg">
    <!-- HUD -->
    <div class="flex items-center justify-between px-4 py-2 bg-surface/90 z-10">
      <div class="text-lg font-semibold">
        Click on: <span class="text-accent">{getTargetDisplay()}</span>
      </div>
      <div class="text-sm text-fg">
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
          class="w-6 h-6 rounded-full border border-edge text-muted hover:text-fg hover:border-fg text-sm leading-none"
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
  <div class="flex flex-col h-screen bg-canvas text-fg">
    <div class="flex-1 relative overflow-hidden">
      <CitiesMap
        {claimedCities}
        {eligibleCityKeys}
      />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
        <div class="bg-surface rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          {#if won}
            <h2 class="text-3xl font-bold mb-2">You Win!</h2>
            <p class="text-muted mb-6">All {totalCities} cities identified</p>
          {:else}
            <h2 class="text-3xl font-bold mb-2">Game Over</h2>
            <p class="text-muted mb-6">{claimedCount} / {totalCities} cities identified</p>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              onclick={playAgain}
              class="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-semibold"
            >
              Play Again
            </button>
            <button
              onclick={changeCities}
              class="w-full py-2 rounded-lg bg-raised hover:bg-raised-hover"
            >
              Change Cities
            </button>
            <a
              href="{base}/"
              class="w-full py-2 rounded-lg bg-raised hover:bg-raised-hover block text-center"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
