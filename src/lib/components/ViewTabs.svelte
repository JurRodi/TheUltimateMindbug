<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	let { view }: { view: string } = $props();

	function set(value: string) {
		const url = new URL(page.url);
		url.searchParams.set('view', value);
		// This component only renders on the home route ("/"); resolving against
		// that literal route id satisfies svelte/no-navigation-without-resolve
		// while preserving the same query-param-only navigation.
		goto(resolve(`/?${url.searchParams.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
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
