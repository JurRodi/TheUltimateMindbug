<script lang="ts">
	import TeamRecordChart from '$lib/components/TeamRecordChart.svelte';
	import GameLogRow from '$lib/components/GameLogRow.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import StreakChip from '$lib/components/StreakChip.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import ExpandableList from '$lib/components/ExpandableList.svelte';
	import PlayerChip from '$lib/components/PlayerChip.svelte';
	import { resolve } from '$app/paths';
	import { pct } from '$lib/format';
	let { data } = $props();

	const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
</script>

<BackLink href={resolve('/')} label="Leaderboard" />

<Hero
	title={data.members.map((m) => m.name).join(' + ')}
	rank="#{data.rank} of {data.rankTotal} teams"
>
	{#snippet art()}
		<div class="herocluster">
			{#each data.members as m (m.id)}<span class="av">{m.emoji}</span>{/each}
		</div>
	{/snippet}
	{#snippet badges()}
		<span class="fmtbadge">{data.format} TEAM</span>
		{#if data.mvps > 0}<span class="chip mvp">{data.mvps} MVP</span>{/if}
	{/snippet}
	{#snippet stats()}
		<Stat n={pct(data.record.winRate)} label="Win rate" />
		<Stat n="{data.record.wins}–{data.record.losses}" label="Record" />
		<Stat n={data.record.games} label="Games" />
		<Stat n={signed(data.netRecord)} label="Net record" />
		{#if data.record.games > 0}<StreakChip streak={data.streak} />{/if}
	{/snippet}
	<div class="members">
		{#each data.members as m (m.id)}<PlayerChip {...m} />{/each}
	</div>
</Hero>

<h2>Net record over time</h2>
<div class="card chart-card">
	<TeamRecordChart points={data.series} />
</div>

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
				us={data.members}
				opponents={g.opponents}
				valueText={signed(g.netAfter)}
				valueUp={g.netAfter >= 0}
			/>
		{/snippet}
	</ExpandableList>
{/if}

<style>
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
	}
	.herocluster {
		width: 128px;
		height: 88px;
		flex: 0 0 auto;
		border-radius: 14px;
		background: var(--gold-art);
		border: 2px solid var(--edge);
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.av {
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
	.av:first-child {
		margin-left: 0;
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
	.members {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.7rem;
	}
	.chart-card {
		padding: 1rem 0.9rem 0.8rem;
	}
</style>
