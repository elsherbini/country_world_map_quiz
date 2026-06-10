<script lang="ts">
  import { base } from '$app/paths';

  type ModeKey = 'learning' | 'map-attack' | 'flag-attack' | 'cities' | 'manage';

  let {
    current,
    onRestart
  }: {
    current: ModeKey;
    onRestart?: () => void;
  } = $props();

  const links: { key: ModeKey; label: string; href: string }[] = [
    { key: 'learning', label: 'Learning Mode', href: `${base}/` },
    { key: 'map-attack', label: 'Map Attack', href: `${base}/map-attack` },
    { key: 'flag-attack', label: 'Flag Attack', href: `${base}/flag-attack` },
    { key: 'cities', label: 'Cities', href: `${base}/cities` },
    { key: 'manage', label: 'Manage Countries', href: `${base}/manage` }
  ];
</script>

<nav class="flex items-center justify-between gap-4 px-4 py-2 bg-surface">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
    {#each links as link}
      {#if link.key === current}
        <span class="text-sm text-fg font-semibold">{link.label}</span>
      {:else}
        <a href={link.href} class="text-sm text-muted hover:text-fg">{link.label}</a>
      {/if}
    {/each}
  </div>
  {#if onRestart}
    <button
      onclick={onRestart}
      aria-label="Restart and change selection"
      class="text-sm text-muted hover:text-fg whitespace-nowrap"
    >↻ Restart</button>
  {/if}
</nav>
