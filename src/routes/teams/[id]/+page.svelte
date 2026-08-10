<script lang="ts">
	import TeamRecordChart from '$lib/components/TeamRecordChart.svelte';
	import GameLogRow from '$lib/components/GameLogRow.svelte';
	import { resolve } from '$app/paths';
	let { data } = $props();

	const pct = (w: number) => `${Math.round(w * 100)}%`;
	const streakText = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');
	const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

	let expanded = $state(false);
	const shown = $derived(expanded ? data.history : data.history.slice(0, 5));
</script>

<a class="backlink" href={resolve('/')}>← Leaderboard</a>

<div class="card hero">
	<div class="art herocluster">
		<div class="cluster">
			{#each data.members as m (m.id)}<span class="av">{m.emoji}</span>{/each}
		</div>
	</div>
	<div class="hero-body">
		<div class="hero-top">
			<h1>{data.members.map((m) => m.name).join(' + ')}</h1>
			<span class="fmtbadge">{data.format} TEAM</span>
			<span class="rank">#{data.rank} of {data.rankTotal} teams</span>
		</div>
		<div class="statrow">
			<div class="stat">
				<span class="n">{pct(data.record.winRate)}</span><span class="l">Win rate</span>
			</div>
			<div class="stat">
				<span class="n">{data.record.wins}–{data.record.losses}</span><span class="l">Record</span>
			</div>
			<div class="stat"><span class="n">{data.record.games}</span><span class="l">Games</span></div>
			<div class="stat">
				<span class="n">{signed(data.netRecord)}</span><span class="l">Net record</span>
			</div>
			{#if data.record.games > 0}
				<span class="chip {data.streak > 0 ? 'w' : data.streak < 0 ? 'l' : 'none'}"
					>{streakText(data.streak)}</span
				>
			{/if}
		</div>
		<div class="members">
			{#each data.members as m (m.id)}
				<a class="pchip" href={resolve('/players/[id]', { id: String(m.id) })}
					><span class="em">{m.emoji}</span>{m.name}</a
				>
			{/each}
		</div>
	</div>
</div>

<h2>Net record over time</h2>
<div class="card chart-card">
	<TeamRecordChart points={data.series} />
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
				us={data.members}
				opponents={g.opponents}
				valueText={signed(g.netAfter)}
				valueUp={g.netAfter >= 0}
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
	.hero {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.herocluster {
		width: 128px;
		height: 88px;
		flex: 0 0 auto;
		border-radius: 14px;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border: 2px solid var(--edge);
	}
	.cluster {
		display: flex;
		justify-content: center;
	}
	.herocluster .av {
		/* Sized so a 3-member cluster (3·46 − 2·12 = 114px) fits inside the 128px
		   frame without overflowing; a 2-member line-up centres in the same frame. */
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: #fbf4e2;
		border: 2px solid var(--edge);
		display: grid;
		place-items: center;
		font-size: 1.6rem;
		margin-left: -12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}
	.herocluster .av:first-child {
		margin-left: 0;
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
	}
	.fmtbadge {
		font-family: var(--display);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		padding: 0.16rem 0.5rem;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--muted);
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
	.members {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.7rem;
	}
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 800;
		color: var(--ink);
		text-decoration: none;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.2rem 0.6rem 0.2rem 0.3rem;
		transition:
			transform 0.12s ease,
			filter 0.12s ease;
	}
	.pchip:hover {
		transform: translateY(-1px);
		filter: brightness(0.97);
	}
	.pchip .em {
		font-size: 1rem;
		line-height: 1;
	}
	.chart-card {
		padding: 1rem 0.9rem 0.8rem;
	}
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
