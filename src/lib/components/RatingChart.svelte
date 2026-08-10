<script lang="ts">
	let {
		series
	}: {
		series: { label: string; color: string; points: { playedAt: string; rating: number }[] }[];
	} = $props();

	const W = 640;
	const H = 240;
	const L = 46; // left pad for y-axis value labels
	const R = 48; // right pad so the latest-value label never clips
	const T = 16;
	const B = 30;

	const all = $derived(series.flatMap((s) => s.points.map((p) => p.rating)));
	// Round the axis bounds out to the nearest 10 with a little headroom.
	const lo = $derived(all.length ? Math.floor((Math.min(...all) - 5) / 10) * 10 : 980);
	const hi = $derived(all.length ? Math.ceil((Math.max(...all) + 5) / 10) * 10 : 1020);
	const span = $derived(hi - lo || 1);
	const ticks = $derived([lo, Math.round((lo + hi) / 2), hi]);
	const drawn = $derived(series.filter((s) => s.points.length));

	const x = (i: number, n: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
	const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);

	function path(points: { rating: number }[]): string {
		const n = points.length;
		return points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i, n).toFixed(1)},${y(p.rating).toFixed(1)}`)
			.join(' ');
	}
	const current = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : null);
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rating over time">
	{#each ticks as t (t)}
		<line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="var(--line-card)" stroke-width="1" />
		<text
			x={L - 8}
			y={y(t) + 4}
			text-anchor="end"
			fill="var(--muted)"
			font-size="11"
			font-weight="700">{t}</text
		>
	{/each}

	{#each drawn as s (s.label)}
		{@const n = s.points.length}
		<path
			d={path(s.points)}
			fill="none"
			stroke={s.color}
			stroke-width="2.5"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
		{#each s.points as p, i (i)}
			{@const last = i === n - 1}
			<circle
				cx={x(i, n)}
				cy={y(p.rating)}
				r={last ? 4.5 : 2.8}
				fill={last ? s.color : 'var(--card)'}
				stroke={s.color}
				stroke-width="2"
			/>
		{/each}
		<text
			x={x(n - 1, n) + 7}
			y={y(s.points[n - 1].rating) + 4}
			fill={s.color}
			font-size="12"
			font-weight="800">{s.points[n - 1].rating}</text
		>
	{/each}

	{#if drawn.length === 0}
		<text
			x={W / 2}
			y={H / 2}
			text-anchor="middle"
			fill="var(--muted)"
			font-size="13"
			font-weight="700">No rating history yet</text
		>
	{/if}
</svg>

<div class="legend">
	{#each series as s (s.label)}
		<span class="key">
			<i style={`background:${s.color}`}></i>{s.label}
			{#if current(s.points) !== null}<b>{current(s.points)}</b>{/if}
		</span>
	{/each}
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.1rem;
		margin-top: 0.6rem;
		padding: 0 0.3rem;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.key i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		display: inline-block;
	}
	.key b {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
</style>
