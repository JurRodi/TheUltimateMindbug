<script lang="ts">
	let {
		series
	}: {
		series: { label: string; color: string; points: { playedAt: string; rating: number }[] }[];
	} = $props();

	const W = 640;
	const H = 220;
	const PAD = 28;

	const all = $derived(series.flatMap((s) => s.points.map((p) => p.rating)));
	const min = $derived(all.length ? Math.min(...all) : 980);
	const max = $derived(all.length ? Math.max(...all) : 1020);
	const span = $derived(max - min || 1);

	function path(points: { rating: number }[]): string {
		if (points.length === 0) return '';
		const n = points.length;
		return points
			.map((p, i) => {
				const x = PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
				const y = H - PAD - ((p.rating - min) / span) * (H - 2 * PAD);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rating over time">
	<line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--surface-2)" />
	{#each series as s (s.label)}
		{#if s.points.length}
			<path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2.5" />
		{/if}
	{/each}
</svg>
<div class="legend">
	{#each series as s (s.label)}
		<span class="key"><i style={`background:${s.color}`}></i>{s.label}</span>
	{/each}
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		background: var(--surface);
		border-radius: var(--radius);
	}
	.legend {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.key i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		display: inline-block;
	}
</style>
