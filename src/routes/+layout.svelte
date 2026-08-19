<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import Nav from '$lib/components/Nav.svelte';
	import NavProgress from '$lib/components/NavProgress.svelte';
	import EnablePushBanner from '$lib/components/EnablePushBanner.svelte';
	let { children, data } = $props();
	// The board (home route) has a two-column board+aside layout, so it gets a
	// wider max-width on desktop; the form/list pages stay a narrower reading width.
	const wide = $derived(page.url.pathname === '/');

	// Cross-fade between routes where the View Transitions API is available and
	// the viewer hasn't asked for reduced motion.
	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> };
		};
		if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
			return;
		return new Promise((resolve) => {
			doc.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<NavProgress />
<div class="shell">
	<Nav />
	<main>
		<div class="wrap" class:wide>
			{#if data.me}<EnablePushBanner />{/if}
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
