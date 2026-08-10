<script lang="ts">
	let { points }: { points: { playedAt: string; net: number }[] } = $props();

	const W = 640;
	const H = 240;
	const L = 46;
	const R = 48;
	const T = 16;
	const B = 30;

	const vals = $derived(points.map((p) => p.net));
	// Always include 0 in view, with 1 unit of headroom each side.
	const lo = $derived(vals.length ? Math.min(0, ...vals) - 1 : -1);
	const hi = $derived(vals.length ? Math.max(0, ...vals) + 1 : 1);
	const span = $derived(hi - lo || 1);
	const ticks = $derived([...new Set([hi, 0, lo])]);

	const x = (i: number, n: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
	const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);

	const d = $derived(
		points
			.map(
				(p, i) => `${i === 0 ? 'M' : 'L'}${x(i, points.length).toFixed(1)},${y(p.net).toFixed(1)}`
			)
			.join(' ')
	);
	const last = $derived(points.length ? points[points.length - 1].net : null);
	const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`);
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net record over time">
	{#each ticks as t (t)}
		<line
			x1={L}
			y1={y(t)}
			x2={W - R}
			y2={y(t)}
			stroke="var(--line-card)"
			stroke-width={t === 0 ? 1.5 : 1}
		/>
		<text
			x={L - 8}
			y={y(t) + 4}
			text-anchor="end"
			fill="var(--muted)"
			font-size="11"
			font-weight="700">{fmt(t)}</text
		>
	{/each}

	{#if points.length}
		<path
			{d}
			fill="none"
			stroke="var(--teal)"
			stroke-width="2.5"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
		{#each points as p, i (i)}
			{@const isLast = i === points.length - 1}
			<circle
				cx={x(i, points.length)}
				cy={y(p.net)}
				r={isLast ? 4.5 : 2.8}
				fill={isLast ? 'var(--teal)' : 'var(--card)'}
				stroke="var(--teal)"
				stroke-width="2"
			/>
		{/each}
		<text
			x={x(points.length - 1, points.length) + 7}
			y={y(last ?? 0) + 4}
			fill="var(--up)"
			font-size="12"
			font-weight="800">{fmt(last ?? 0)}</text
		>
	{:else}
		<text
			x={W / 2}
			y={H / 2}
			text-anchor="middle"
			fill="var(--muted)"
			font-size="13"
			font-weight="700">No games yet</text
		>
	{/if}
</svg>

<div class="legend">
	<span class="key"
		><i></i>Net record (wins − losses){#if last !== null}<b>{fmt(last)}</b>{/if}</span
	>
	<span class="count">{points.length} game{points.length === 1 ? '' : 's'}</span>
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.legend {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		background: var(--teal);
		display: inline-block;
	}
	.key b {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.count {
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
