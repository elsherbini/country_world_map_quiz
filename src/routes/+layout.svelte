<script>
  import '../app.css';
  import { Toaster } from 'svelte-sonner';
  import ThemeControls from '$lib/components/ThemeControls.svelte';

  let { children } = $props();
  // data-theme is set before paint by the anti-flash IIFE in app.html and
  // kept current by toggleMode/toggleContrast — no reconciliation needed here.
</script>

<Toaster position="top-center" richColors visibleToasts={1} />
<ThemeControls />
{@render children()}
