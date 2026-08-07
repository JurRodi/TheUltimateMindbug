<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	let { view }: { view: string } = $props();

	function set(value: string) {
		const url = new URL(page.url);
		url.searchParams.set('view', value);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<div class="tabset">
	<button class:on={view === 'players'} onclick={() => set('players')}>Players</button>
	<button class:on={view === 'teams'} onclick={() => set('teams')}>Teams</button>
</div>

<style>
	/* Colors/active state come from the global .tabset rules (Task 12); only
	   layout is scoped here. */
	.tabset {
		margin-top: 0.75rem;
	}
</style>
