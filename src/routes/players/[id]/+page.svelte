<script lang="ts">
	import RatingChart from '$lib/components/RatingChart.svelte';
	import GameLogRow from '$lib/components/GameLogRow.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import AvatarTile from '$lib/components/AvatarTile.svelte';
	import StreakChip from '$lib/components/StreakChip.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import ExpandableList from '$lib/components/ExpandableList.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import { resolve } from '$app/paths';
	import { pct, medal, shortDate, STYLE_LABEL } from '$lib/format';
	import type { Track } from '$lib/types';
	let { data } = $props();

	const chart = $derived([
		{ label: 'Total', color: 'var(--teal)', points: data.series.total },
		{ label: '1v1', color: 'var(--coral)', points: data.series['1v1'] },
		{ label: '2v2', color: 'var(--pink)', points: data.series['2v2'] },
		{ label: '3v3', color: 'var(--gold)', points: data.series['3v3'] }
	]);
	const cur = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : '—');

	const tiles: { label: string; key: Track; cls: string }[] = [
		{ label: 'Total', key: 'total', cls: 't1' },
		{ label: '1v1', key: '1v1', cls: 't4' },
		{ label: '2v2', key: '2v2', cls: 't2' },
		{ label: '3v3', key: '3v3', cls: 't3' }
	];

	const overall = $derived(data.stats.total);
</script>

<BackLink href={resolve('/')} label="Leaderboard" />

<Hero title={data.player.name} rank={data.rank ? `#${data.rank} of ${data.rankTotal}` : null}>
	{#snippet art()}<AvatarTile emoji={data.avatar} />{/snippet}
	{#snippet badges()}
		{#if overall.games > 0}<StreakChip streak={overall.streak} />{/if}
	{/snippet}
	{#snippet stats()}
		<Stat n={cur(data.series.total)} label="Rating" />
		<Stat n="{overall.wins}–{overall.losses}" label="Record" />
		<Stat n={pct(overall.winRate)} label="Win rate" />
		<Stat n={overall.games} label="Games" />
		{#if overall.games > 0}
			<Stat
				n={overall.longestWinStreak ? `W${overall.longestWinStreak}` : '–'}
				label="Longest win"
				tone="up"
			/>
			<Stat
				n={overall.longestLossStreak ? `L${overall.longestLossStreak}` : '–'}
				label="Longest loss"
				tone="down"
			/>
		{/if}
		{#if data.mvps > 0}<Stat n={data.mvps} label="MVPs" />{/if}
	{/snippet}
</Hero>

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

{#if data.tournaments.length}
	{@const tt = data.tournamentTotals}
	<h2>🏆 Tournaments</h2>
	<div class="ttiles">
		<div class="card ttile gold">
			<span class="v">{tt.titles}</span><span class="k">Titles</span>
		</div>
		<div class="card ttile"><span class="v">{tt.podiums}</span><span class="k">Podiums</span></div>
		<div class="card ttile"><span class="v">{tt.played}</span><span class="k">Played</span></div>
		<div class="card ttile">
			<span class="v">{tt.avgFinish ?? '—'}</span><span class="k">Avg finish</span>
		</div>
		<div class="card ttile wide">
			<span class="v">{tt.wins}–{tt.losses}</span><span class="k"
				>Tournament record · {pct(tt.winRate)}</span
			>
		</div>
		<div class="card ttile wide">
			<span class="v">{tt.bestStyle ? STYLE_LABEL[tt.bestStyle.style] : '—'}</span>
			<span class="k"
				>Best style{#if tt.bestStyle}
					· {tt.bestStyle.titles} title{tt.bestStyle.titles > 1 ? 's' : ''}{/if}</span
			>
		</div>
	</div>
	<div class="card list tlist">
		{#each data.tournaments as t (t.id)}
			<ListRow href={resolve('/tournaments/[id]', { id: String(t.id) })}>
				{#snippet icon()}
					<span class="pos p{t.position ?? 0}" class:live={t.status === 'live'}>
						{medal(t.position)}
						<small>{t.positionLabel}</small>
					</span>
				{/snippet}
				<span class="tname">
					{t.name}
					{#if t.status === 'live'}<span class="chip live">LIVE</span>{/if}
					{#if !t.ranked}<span class="chip">Unranked</span>{/if}
				</span>
				<span class="tmeta">
					{shortDate(t.createdAt)} · {STYLE_LABEL[t.style]} · {t.format}{#if t.teammates.length}
						· with {t.teammates.map((m) => `${m.emoji} ${m.name}`).join(', ')}{/if}
				</span>
				{#snippet aside()}
					<span class="trec">
						<b>{t.wins}–{t.losses}</b>
						{#if t.style === 'rotating'}<span class="tmeta"
								>{t.points} pt{t.points === 1 ? '' : 's'}</span
							>
						{:else if t.elo !== null}<span
								class="tmeta"
								class:up={t.elo >= 0}
								class:down={t.elo < 0}>{t.elo >= 0 ? '+' : ''}{t.elo} Elo</span
							>{/if}
					</span>
				{/snippet}
			</ListRow>
		{/each}
	</div>
{/if}

<h2>Recent games</h2>
{#if data.history.length === 0}
	<p class="card">No games logged yet.</p>
{:else}
	<ExpandableList items={data.history} key={(g) => g.gameId} noun="games">
		{#snippet row(g)}
			<GameLogRow
				won={g.won}
				format={g.format}
				playedAt={g.playedAt}
				us={[{ id: data.player.id, name: data.player.name, emoji: data.avatar }, ...g.teammates]}
				opponents={g.opponents}
				youId={data.player.id}
				ranked={g.ranked}
				tournament={g.tournament}
				valueText={g.ranked ? `${g.delta >= 0 ? '+' : ''}${g.delta}` : '±0'}
				valueUp={g.delta >= 0}
			/>
		{/snippet}
	</ExpandableList>
{/if}

<style>
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
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

	.ttiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
	}
	.ttile {
		text-align: center;
		padding: 0.6rem;
		margin: 0;
	}
	.ttile.wide {
		grid-column: span 2;
	}
	.ttile.gold {
		background: var(--gold-art);
		border-color: #a8791f;
	}
	.ttile .v {
		display: block;
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.3rem;
		color: var(--ink);
	}
	.ttile .k {
		font-size: 0.66rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	@media (max-width: 560px) {
		.ttiles {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.tlist {
		margin-top: 0.7rem;
	}
	.pos {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		align-content: center;
		font-family: var(--display);
		font-weight: 800;
		background: var(--surface);
		border: 2px solid var(--line-card);
		line-height: 1.05;
	}
	.pos small {
		font-size: 0.58rem;
		font-weight: 700;
		color: var(--muted);
	}
	.pos.p1 {
		background: var(--gold-art);
		border-color: #a8791f;
	}
	.pos.p2 {
		background: linear-gradient(155deg, #e9eef0, #b9c3c8);
		border-color: #8f9aa0;
	}
	.pos.p3 {
		background: linear-gradient(155deg, #e7b88a, #b87a45);
		border-color: #8f5a2e;
	}
	.pos.live {
		border-color: var(--teal);
	}
	.tname {
		font-weight: 800;
	}
	.tmeta {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.trec {
		text-align: right;
		display: grid;
	}
	.up {
		color: var(--up);
	}
	.down {
		color: var(--down);
	}
</style>
