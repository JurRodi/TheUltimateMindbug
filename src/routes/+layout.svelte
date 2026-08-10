<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	let { children } = $props();
	// The board (home route) has a two-column board+aside layout, so it gets a
	// wider max-width on desktop; the form/list pages stay a narrower reading width.
	const wide = $derived(page.url.pathname === '/');
</script>

<div class="shell">
	<Nav />
	<main>
		<div class="wrap" class:wide>
			{@render children()}
		</div>
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
	}
	main {
		min-width: 0;
	}
	@media (min-width: 820px) {
		.shell {
			display: grid;
			grid-template-columns: 250px 1fr;
			align-items: start;
		}
	}
</style>
