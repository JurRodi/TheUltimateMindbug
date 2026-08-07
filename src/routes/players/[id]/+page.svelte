<script lang="ts">
	import RatingChart from '$lib/components/RatingChart.svelte';
	import type { Track } from '$lib/types';
	let { data } = $props();

	const chart = $derived([
		{ label: 'Total', color: 'var(--accent)', points: data.series.total },
		{ label: '2v2', color: 'var(--accent-2)', points: data.series['2v2'] },
		{ label: '3v3', color: 'var(--accent-3)', points: data.series['3v3'] }
	]);
	const cur = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : '—');

	const tiles: { label: string; key: Track }[] = [
		{ label: 'Total', key: 'total' },
		{ label: '2v2', key: '2v2' },
		{ label: '3v3', key: '3v3' }
	];
</script>

<h1>{data.player.name}</h1>

<div class="tiles">
	{#each tiles as { label, key } (key)}
		<div class="card tile">
			<span class="k">{label}</span>
			<span class="v">{cur(data.series[key])}</span>
			<span class="pill">{data.stats[key].wins}W · {data.stats[key].losses}L</span>
		</div>
	{/each}
</div>

<h2>Rating over time</h2>
<RatingChart series={chart} />

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
		margin: 1rem 0;
	}
	.tile {
		display: grid;
		gap: 0.3rem;
		text-align: center;
	}
	.k {
		font-family: var(--display);
		color: var(--muted);
		font-size: 0.8rem;
	}
	.v {
		font-family: var(--display);
		font-size: 1.5rem;
		color: var(--accent);
	}
</style>
