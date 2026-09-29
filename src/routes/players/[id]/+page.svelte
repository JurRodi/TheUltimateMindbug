<script lang="ts">
	import RatingChart from '$lib/components/RatingChart.svelte';
	import GameLogRow from '$lib/components/GameLogRow.svelte';
	import { resolve } from '$app/paths';
	import type { Track } from '$lib/types';
	let { data } = $props();

	const chart = $derived([
		{ label: 'Total', color: 'var(--teal)', points: data.series.total },
		{ label: '1v1', color: 'var(--coral)', points: data.series['1v1'] },
		{ label: '2v2', color: 'var(--pink)', points: data.series['2v2'] },
		{ label: '3v3', color: 'var(--gold)', points: data.series['3v3'] }
	]);
	const cur = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : '—');
	const pct = (w: number) => `${Math.round(w * 100)}%`;

	const tiles: { label: string; key: Track; cls: string }[] = [
		{ label: 'Total', key: 'total', cls: 't1' },
		{ label: '1v1', key: '1v1', cls: 't4' },
		{ label: '2v2', key: '2v2', cls: 't2' },
		{ label: '3v3', key: '3v3', cls: 't3' }
	];

	const overall = $derived(data.stats.total);
	const streakText = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');

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
			{#if overall.games > 0}
				<span class="chip {overall.streak > 0 ? 'w' : overall.streak < 0 ? 'l' : 'none'}">
					{streakText(overall.streak)}
				</span>
			{/if}
			{#if data.rank}<span class="rank">#{data.rank} of {data.rankTotal}</span>{/if}
		</div>
		<div class="statrow">
			<div class="stat">
				<span class="n">{cur(data.series.total)}</span><span class="l">Rating</span>
			</div>
			<div class="stat">
				<span class="n">{overall.wins}–{overall.losses}</span><span class="l">Record</span>
			</div>
			<div class="stat">
				<span class="n">{pct(overall.winRate)}</span><span class="l">Win rate</span>
			</div>
			<div class="stat"><span class="n">{overall.games}</span><span class="l">Games</span></div>
			{#if overall.games > 0}
				<div class="stat">
					<span class="n up">{overall.longestWinStreak ? `W${overall.longestWinStreak}` : '–'}</span
					><span class="l">Longest win</span>
				</div>
				<div class="stat">
					<span class="n down"
						>{overall.longestLossStreak ? `L${overall.longestLossStreak}` : '–'}</span
					><span class="l">Longest loss</span>
				</div>
			{/if}
			{#if data.mvps > 0}
				<div class="stat mvp">
					<span class="n">{data.mvps}</span><span class="l">MVPs</span>
				</div>
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
			{#if expanded}All {data.history.length} games{:else}Last {shown.length} of {data.history
					.length}{/if}
		</span>
		{#if data.history.length > 5}
			<button class="viewall" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less ▴' : 'View all ▾'}
			</button>
		{/if}
	</div>
	<div class="log">
		{#each shown as g (g.gameId)}
			<GameLogRow
				won={g.won}
				format={g.format}
				playedAt={g.playedAt}
				us={[{ id: data.player.id, name: data.player.name, emoji: data.avatar }, ...g.teammates]}
				opponents={g.opponents}
				youId={data.player.id}
				valueText={`${g.delta >= 0 ? '+' : ''}${g.delta}`}
				valueUp={g.delta >= 0}
			/>
		{/each}
	</div>
{/if}

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
		transition: opacity 0.15s ease;
	}
	.backlink:hover {
		text-decoration: underline;
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
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.hero-top .rank {
		margin-left: auto;
	}
	.hero h1 {
		margin: 0;
		color: var(--ink);
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
	.n.up {
		color: var(--up);
	}
	.n.down {
		color: var(--down);
	}

	/* Track tiles: 2×2 on phones, 4-up on wider screens. */
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	@media (min-width: 560px) {
		.tiles {
			grid-template-columns: repeat(4, 1fr);
		}
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
	.tile.t4 .v {
		color: var(--coral);
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
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.viewall:hover {
		background: #dcc79b;
		color: var(--ink);
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
</style>
