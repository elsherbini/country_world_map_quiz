<script lang="ts">
  import { FLAG_REGIONS, REGION_LABELS, getFlagUrl, type Region } from '$lib/data/countries';

  let {
    targets,
    onClose
  }: {
    targets: { code: string; name: string; region: Region }[];
    onClose: () => void;
  } = $props();

  let query = $state('');
  let enlarged = $state<{ code: string; name: string } | null>(null);

  let groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? targets.filter((t) => t.name.toLowerCase().includes(q)) : targets;
    return FLAG_REGIONS.map((region) => ({
      region,
      items: filtered
        .filter((t) => t.region === region)
        .sort((a, b) => a.name.localeCompare(b.name))
    })).filter((g) => g.items.length > 0);
  });

  let shownCount = $derived(groups.reduce((n, g) => n + g.items.length, 0));
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      if (enlarged) enlarged = null;
      else onClose();
    }
  }}
/>

<div class="fixed inset-0 bg-canvas text-fg z-40 overflow-y-auto">
  <div class="max-w-5xl mx-auto p-6">
    <div class="flex items-center justify-between gap-4 mb-4">
      <h2 class="text-2xl font-bold">Flags ({shownCount})</h2>
      <button
        onclick={onClose}
        class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-semibold"
      >
        Done
      </button>
    </div>

    <input
      type="text"
      bind:value={query}
      placeholder="Search…"
      class="w-full max-w-sm px-3 py-2 rounded-lg bg-raised text-fg border border-edge mb-6 text-sm"
    />

    {#each groups as group (group.region)}
      <h3 class="text-lg font-semibold mb-3 mt-6 first:mt-0">
        {REGION_LABELS[group.region]}
        <span class="text-muted font-normal text-sm">({group.items.length})</span>
      </h3>
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
        {#each group.items as t (t.code)}
          <button
            type="button"
            onclick={() => (enlarged = t)}
            class="rounded-lg p-3 bg-surface border border-edge hover:bg-raised-hover cursor-zoom-in
              focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div class="h-20 flex items-center justify-center">
              <img
                src={getFlagUrl(t.code)}
                alt="Flag of {t.name}"
                loading="lazy"
                class="max-h-20 max-w-full rounded-sm shadow"
              />
            </div>
            <div class="text-sm mt-2 text-center leading-tight">{t.name}</div>
          </button>
        {/each}
      </div>
    {:else}
      <p class="text-muted">No flags match your search.</p>
    {/each}
  </div>
</div>

{#if enlarged}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-6">
    <button
      type="button"
      onclick={() => (enlarged = null)}
      aria-label="Close enlarged flag"
      class="absolute inset-0 bg-black/70 cursor-zoom-out"
    ></button>
    <div class="relative flex flex-col items-center gap-3">
      <button
        type="button"
        onclick={() => (enlarged = null)}
        aria-label="Close"
        class="absolute -top-3 -right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-surface border border-edge text-fg text-2xl leading-none shadow-lg hover:bg-raised-hover"
      >×</button>
      <img
        src={getFlagUrl(enlarged.code)}
        alt="Flag of {enlarged.name}"
        class="max-w-[90vw] max-h-[75vh] w-auto h-auto rounded-md shadow-2xl"
      />
      <div class="px-4 py-2 rounded-lg bg-surface border border-edge text-lg font-semibold shadow-lg">
        {enlarged.name}
      </div>
    </div>
  </div>
{/if}
