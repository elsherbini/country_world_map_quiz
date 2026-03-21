<script lang="ts">
	import { getCountryList } from '$lib/data/countries';
	const list = getCountryList();
</script>

<p>Loaded {list.length} countries</p>
