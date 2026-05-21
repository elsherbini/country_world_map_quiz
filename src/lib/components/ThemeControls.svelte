<script lang="ts">
  import { onMount } from 'svelte';
  import { theme, toggleMode, toggleContrast } from '$lib/theme.svelte';

  // Render only after hydration so SSR's default-dark guess can't cause a mismatch.
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
</script>

{#if mounted}
  <div
    class="fixed bottom-3 right-3 z-50 flex gap-1 rounded-lg border border-edge
           bg-surface p-1 shadow-lg"
  >
    <button
      onclick={toggleMode}
      aria-label={theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme.mode === 'light'}
      title={theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      class="flex h-8 w-8 items-center justify-center rounded text-fg hover:bg-raised"
    >
      {#if theme.mode === 'dark'}
        <!-- moon -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      {:else}
        <!-- sun -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      {/if}
    </button>
    <button
      onclick={toggleContrast}
      aria-label={theme.highContrast ? 'Turn off high contrast' : 'Turn on high contrast'}
      aria-pressed={theme.highContrast}
      title={theme.highContrast ? 'Turn off high contrast' : 'Turn on high contrast'}
      class="flex h-8 w-8 items-center justify-center rounded
             {theme.highContrast ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-raised'}"
    >
      <!-- contrast: circle, left half filled -->
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" />
      </svg>
    </button>
  </div>
{/if}
