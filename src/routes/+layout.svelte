<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	let { children } = $props();
</script>

<div class="shell">
	<Nav />
	<main>
		<div class="wrap">
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
			grid-template-columns: 210px 1fr;
			align-items: start;
		}
	}
</style>
