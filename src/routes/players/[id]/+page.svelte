<script lang="ts">
	import RatingChart from '$lib/components/RatingChart.svelte';
	import { resolve } from '$app/paths';
	import type { Track } from '$lib/types';
	let { data } = $props();

	const chart = $derived([
		{ label: 'Total', color: 'var(--teal)', points: data.series.total },
		{ label: '2v2', color: 'var(--pink)', points: data.series['2v2'] },
		{ label: '3v3', color: 'var(--gold)', points: data.series['3v3'] }
	]);
	const cur = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : '—');
	const pct = (w: number) => `${Math.round(w * 100)}%`;

	const tiles: { label: string; key: Track; cls: string }[] = [
		{ label: 'Total', key: 'total', cls: 't1' },
		{ label: '2v2', key: '2v2', cls: 't2' },
		{ label: '3v3', key: '3v3', cls: 't3' }
	];

	const overall = $derived(data.stats.total);
	const streakText = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	// Recent games: 5 by default, "View all" expands to the full history.
	let expanded = $state(false);
	const shown = $derived(expanded ? data.history : data.history.slice(0, 5));
</script>

<a class="backlink" href={resolve('/')}>← Leaderboard</a>

<div class="card hero">
	<div class="avatar">{data.avatar}</div>
	<div class="hero-body">
		<div class="hero-top">
			<h1>{data.player.name}</h1>
			{#if data.rank}<span class="rank">#{data.rank} of {data.rankTotal}</span>{/if}
		</div>
		<div class="statrow">
			<div class="stat"><span class="n">{cur(data.series.total)}</span><span class="l">Rating</span></div>
			<div class="stat">
				<span class="n">{overall.wins}–{overall.losses}</span><span class="l">Record</span>
			</div>
			<div class="stat"><span class="n">{pct(overall.winRate)}</span><span class="l">Win rate</span></div>
			<div class="stat"><span class="n">{overall.games}</span><span class="l">Games</span></div>
			{#if overall.games > 0}
				<span class="chip {overall.streak > 0 ? 'w' : overall.streak < 0 ? 'l' : 'none'}"
					>{streakText(overall.streak)}</span
				>
			{/if}
		</div>
	</div>
</div>

<div class="tiles">
	{#each tiles as { label, key, cls } (key)}
		{@const s = data.stats[key]}
		<div class="card tile {cls}">
			<span class="k">{label}</span>
			<span class="v">{cur(data.series[key])}</span>
			<span class="wr">{pct(s.winRate)} WR</span>
			<span class="sub">{s.wins}W · {s.losses}L · {s.games} GP</span>
		</div>
	{/each}
</div>

<h2>Rating over time</h2>
<div class="card chart-card">
	<RatingChart series={chart} />
</div>

<h2>Recent games</h2>
{#if data.history.length === 0}
	<p class="card">No games logged yet.</p>
{:else}
	<div class="games-head">
		<span class="count">
			{#if expanded}All {data.history.length} games{:else}Last {shown.length} of {data.history.length}{/if}
		</span>
		{#if data.history.length > 5}
			<button class="viewall" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less ▴' : 'View all ▾'}
			</button>
		{/if}
	</div>
	<div class="log">
		{#each shown as g (g.gameId)}
			<div class="card row">
				<div class="res {g.won ? 'w' : 'l'}">{g.won ? 'W' : 'L'}</div>
				<div class="mid">
					<div class="line1"><span class="fmt">{g.format}</span><span class="date">{fmtDate(g.playedAt)}</span></div>
					<div class="teams">
						<span class="teamgrp {g.won ? 'win good' : ''}">
							<a class="pchip you" href={resolve('/players/[id]', { id: String(data.player.id) })}
								><span class="em">{data.avatar}</span>{data.player.name}</a
							>
							{#each g.teammates as p (p.id)}
								<a class="pchip" href={resolve('/players/[id]', { id: String(p.id) })}
									><span class="em">{p.emoji}</span>{p.name}</a
								>
							{/each}
						</span>
						<span class="vs">vs</span>
						<span class="teamgrp {g.won ? '' : 'win bad'}">
							{#each g.opponents as p (p.id)}
								<a class="pchip" href={resolve('/players/[id]', { id: String(p.id) })}
									><span class="em">{p.emoji}</span>{p.name}</a
								>
							{/each}
						</span>
					</div>
				</div>
				<div class="delta {g.delta >= 0 ? 'up' : 'down'}">{g.delta >= 0 ? '+' : ''}{g.delta}</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
	}
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
	}

	/* Hero */
	.hero {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.avatar {
		width: 88px;
		height: 88px;
		flex: 0 0 auto;
		border-radius: 14px;
		display: grid;
		place-items: center;
		font-size: 3rem;
		border: 2px solid var(--edge);
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.35);
	}
	.hero-body {
		min-width: 0;
		flex: 1;
	}
	.hero-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.hero h1 {
		margin: 0;
		color: var(--ink);
		font-size: 1.6rem;
	}
	.rank {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.statrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin-top: 0.6rem;
		align-items: center;
	}
	.stat {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.stat .n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.15rem;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.stat .l {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 800;
	}

	/* Track tiles */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	.tile {
		display: grid;
		gap: 0.25rem;
		text-align: center;
		padding: 0.8rem 0.6rem;
	}
	.tile .k {
		font-family: var(--display);
		color: var(--muted);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 800;
	}
	.tile .v {
		font-family: var(--display);
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--teal);
		font-variant-numeric: tabular-nums;
	}
	.tile.t2 .v {
		color: var(--pink);
	}
	.tile.t3 .v {
		color: var(--gold);
	}
	.tile .wr {
		font-size: 0.72rem;
		color: var(--ink);
		font-weight: 800;
	}
	.tile .sub {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}

	.chart-card {
		padding: 1rem 0.9rem 0.8rem;
	}

	/* Recent games */
	.games-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}
	.count {
		font-size: 0.78rem;
		color: var(--onmat-muted);
		font-weight: 700;
	}
	.viewall {
		font-family: var(--display);
		font-size: 0.75rem;
		font-weight: 800;
		cursor: pointer;
		border: none;
		background: var(--surface-2);
		color: var(--muted);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.7rem;
	}
	.res {
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		border-radius: 9px;
		display: grid;
		place-items: center;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.9rem;
	}
	.res.w {
		background: #d7efe0;
		color: var(--up);
	}
	.res.l {
		background: #f6ddd4;
		color: var(--down);
	}
	.mid {
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.teams {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.teamgrp {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		padding: 0.2rem 0.3rem;
		border-radius: 9px;
		border: 1.5px solid transparent;
	}
	.teamgrp.win.good {
		background: rgba(15, 143, 106, 0.14);
		border-color: rgba(15, 143, 106, 0.5);
	}
	.teamgrp.win.bad {
		background: rgba(214, 74, 55, 0.13);
		border-color: rgba(214, 74, 55, 0.5);
	}
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.1rem 0.5rem 0.1rem 0.28rem;
		border: 1.5px solid transparent;
	}
	.pchip .em {
		font-size: 0.9rem;
		line-height: 1;
	}
	.pchip.you {
		background: var(--gold-2);
		border-color: var(--gold);
		font-weight: 800;
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.05em;
	}
	.delta {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.delta.up {
		color: var(--up);
	}
	.delta.down {
		color: var(--down);
	}
</style>
