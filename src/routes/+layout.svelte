<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { Toaster } from 'svelte-sonner';
  import ThemeControls from '$lib/components/ThemeControls.svelte';
  import { applyTheme } from '$lib/theme.svelte';

  let { children } = $props();

  // Reconcile <html data-theme> with the reactive state once on the client.
  onMount(() => applyTheme());
</script>

<Toaster position="top-center" richColors visibleToasts={1} />
<ThemeControls />
{@render children()}
