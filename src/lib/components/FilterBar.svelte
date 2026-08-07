<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	let { format, range }: { format: string; range: string } = $props();

	function setParam(key: string, value: string) {
		const url = new URL(page.url);
		url.searchParams.set(key, value);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
	const formats = [
		{ v: 'total', l: 'Total' },
		{ v: '2v2', l: '2v2' },
		{ v: '3v3', l: '3v3' }
	];
	const ranges = [
		{ v: 'all', l: 'All time' },
		{ v: 'month', l: 'Month' },
		{ v: 'week', l: 'Week' }
	];
</script>

<div class="bar">
	<div class="segset">
		{#each formats as f}
			<button class:on={format === f.v} onclick={() => setParam('format', f.v)}>{f.l}</button>
		{/each}
	</div>
	<div class="segset">
		{#each ranges as r}
			<button class:on={range === r.v} onclick={() => setParam('range', r.v)}>{r.l}</button>
		{/each}
	</div>
</div>

<style>
	/* Colors/active state come from the global .segset rules (Task 12); only
	   layout (spacing the two groups apart) is scoped here. */
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		margin: 0.75rem 0 1rem;
	}
</style>
