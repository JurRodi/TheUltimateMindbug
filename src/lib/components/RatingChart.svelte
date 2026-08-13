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

	const TOL = 15; // px (viewBox units) — how close the cursor must be to engage
	const FADE = 0.2; // opacity of the non-active tracks while one is hovered

	const all = $derived(series.flatMap((s) => s.points.map((p) => p.rating)));
	// Round the axis bounds out to the nearest 10 with a little headroom.
	const lo = $derived(all.length ? Math.floor((Math.min(...all) - 5) / 10) * 10 : 980);
	const hi = $derived(all.length ? Math.ceil((Math.max(...all) + 5) / 10) * 10 : 1020);
	const span = $derived(hi - lo || 1);
	const ticks = $derived([lo, Math.round((lo + hi) / 2), hi]);
	const drawn = $derived(series.filter((s) => s.points.length));

	const x = (i: number, n: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
	const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);

	type Dot = { cx: number; cy: number; rating: number; playedAt: string };
	// Precomputed screen positions per drawn track — used both to render and to hit-test.
	const laid = $derived(
		drawn.map((s) => {
			const n = s.points.length;
			const pts: Dot[] = s.points.map((p, i) => ({
				cx: x(i, n),
				cy: y(p.rating),
				rating: p.rating,
				playedAt: p.playedAt
			}));
			const d = pts
				.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`)
				.join(' ');
			return { label: s.label, color: s.color, pts, d };
		})
	);

	const current = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : null);

	// --- Hover state ---
	let root = $state<HTMLDivElement>();
	let svgEl = $state<SVGSVGElement>();
	let active = $state<string | null>(null);
	let hl = $state<{ cx: number; cy: number; color: string } | null>(null);
	let tip = $state<{
		x: number;
		y: number;
		color: string;
		track: string;
		date: string;
		rating: number;
	} | null>(null);

	const fmtDate = (s: string) => {
		const d = new Date(s);
		return isNaN(d.getTime())
			? s
			: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};

	function distSeg(px: number, py: number, a: Dot, b: Dot): number {
		const dx = b.cx - a.cx;
		const dy = b.cy - a.cy;
		const l2 = dx * dx + dy * dy;
		let t = l2 ? ((px - a.cx) * dx + (py - a.cy) * dy) / l2 : 0;
		t = Math.max(0, Math.min(1, t));
		return Math.hypot(px - (a.cx + t * dx), py - (a.cy + t * dy));
	}

	function clear() {
		active = null;
		hl = null;
		tip = null;
	}

	function onMove(ev: MouseEvent) {
		if (!svgEl) return;
		const r = svgEl.getBoundingClientRect();
		if (!r.width || !r.height) return;
		const mx = ((ev.clientX - r.left) / r.width) * W;
		const my = ((ev.clientY - r.top) / r.height) * H;

		// Nearest track: min distance to its segments and its dots.
		let best: (typeof laid)[number] | null = null;
		let bestD = Infinity;
		for (const s of laid) {
			let d = Infinity;
			for (let i = 0; i < s.pts.length - 1; i++)
				d = Math.min(d, distSeg(mx, my, s.pts[i], s.pts[i + 1]));
			for (const p of s.pts) d = Math.min(d, Math.hypot(mx - p.cx, my - p.cy));
			if (d < bestD) {
				bestD = d;
				best = s;
			}
		}
		if (!best || bestD > TOL) {
			clear();
			return;
		}

		active = best.label;
		// Nearest dot on the active track drives the highlight + tooltip.
		let dot = best.pts[0];
		let dd = Infinity;
		for (const p of best.pts) {
			const q = Math.hypot(mx - p.cx, my - p.cy);
			if (q < dd) {
				dd = q;
				dot = p;
			}
		}
		hl = { cx: dot.cx, cy: dot.cy, color: best.color };
		tip = {
			x: (dot.cx / W) * r.width,
			y: (dot.cy / H) * r.height,
			color: best.color,
			track: best.label,
			date: fmtDate(dot.playedAt),
			rating: dot.rating
		};
	}

	// Attach listeners imperatively so the SVG needs no inline handlers (keeps a11y lint clean).
	$effect(() => {
		const el = svgEl;
		if (!el) return;
		el.addEventListener('mousemove', onMove);
		el.addEventListener('mouseleave', clear);
		return () => {
			el.removeEventListener('mousemove', onMove);
			el.removeEventListener('mouseleave', clear);
		};
	});

	// Legend hover isolates a track too.
	$effect(() => {
		if (!root) return;
		const keys = Array.from(root.querySelectorAll<HTMLElement>('.key'));
		const handlers = keys.map((k) => {
			const label = k.dataset.track ?? null;
			const enter = () => (active = label);
			const leave = clear;
			k.addEventListener('mouseenter', enter);
			k.addEventListener('mouseleave', leave);
			return { k, enter, leave };
		});
		return () =>
			handlers.forEach(({ k, enter, leave }) => {
				k.removeEventListener('mouseenter', enter);
				k.removeEventListener('mouseleave', leave);
			});
	});

	const dim = (label: string) => (active && active !== label ? FADE : 1);
</script>

<div class="chart" bind:this={root}>
	<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rating over time" bind:this={svgEl}>
		{#each ticks as t (t)}
			<line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="var(--line-card)" stroke-width="1" />
			<text
				class="axis"
				x={L - 8}
				y={y(t) + 4}
				text-anchor="end"
				fill="var(--muted)"
				font-size="11"
				font-weight="700">{t}</text
			>
		{/each}

		{#each laid as s (s.label)}
			{@const n = s.pts.length}
			<path
				class="line"
				d={s.d}
				fill="none"
				stroke={s.color}
				stroke-width="2.5"
				stroke-linejoin="round"
				stroke-linecap="round"
				opacity={dim(s.label)}
			/>
			{#each s.pts as p, i (i)}
				{@const last = i === n - 1}
				<circle
					class="pt"
					cx={p.cx}
					cy={p.cy}
					r={last ? 4.5 : 2.8}
					fill={last ? s.color : 'var(--card)'}
					stroke={s.color}
					stroke-width="2"
					opacity={dim(s.label)}
				/>
			{/each}
			<text
				class="lbl"
				x={s.pts[n - 1].cx + 7}
				y={s.pts[n - 1].cy + 4}
				fill={s.color}
				font-size="12"
				font-weight="800"
				opacity={dim(s.label)}>{s.pts[n - 1].rating}</text
			>
		{/each}

		{#if hl}
			<circle cx={hl.cx} cy={hl.cy} r="9" fill={hl.color} opacity="0.22" />
			<circle cx={hl.cx} cy={hl.cy} r="5" fill={hl.color} />
		{/if}

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

	{#if tip}
		<div class="tip" style={`left:${tip.x}px; top:${tip.y}px; border-top-color:${tip.color}`}>
			<span class="tt">{tip.track} · {tip.date}</span>
			<span class="tv">{tip.rating}</span>
		</div>
	{/if}
</div>

<div class="legend">
	{#each series as s (s.label)}
		{@const v = current(s.points)}
		<span class="key" data-track={s.label} style={`opacity:${dim(s.label)}`}>
			<i style={`background:${s.color}`}></i>{s.label}
			<b class:empty={v === null}>{v ?? '–'}</b>
		</span>
	{/each}
</div>

<style>
	.chart {
		position: relative;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.line,
	.pt,
	.lbl {
		transition: opacity 0.13s ease;
	}
	/* The SVG scales down on phones, shrinking these labels; bump them up there.
	   Kept within the chart's L/R padding so 4-digit values never clip. */
	@media (max-width: 560px) {
		.axis {
			font-size: 15px;
		}
		.lbl {
			font-size: 16px;
		}
	}
	.tip {
		position: absolute;
		pointer-events: none;
		transform: translate(-50%, -118%);
		background: var(--ink);
		color: #fff;
		font-weight: 700;
		font-size: 0.72rem;
		padding: 6px 9px;
		border-radius: 9px;
		border-top: 2px solid;
		white-space: nowrap;
		z-index: 5;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
	}
	.tip .tt {
		display: block;
		font-size: 0.6rem;
		color: #c9c1b0;
		margin-bottom: 2px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.tip .tv {
		font-size: 0.92rem;
		font-variant-numeric: tabular-nums;
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
		transition: opacity 0.13s ease;
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
	.key b.empty {
		color: var(--muted);
	}
</style>
