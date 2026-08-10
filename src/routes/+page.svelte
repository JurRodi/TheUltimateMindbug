<script lang="ts">
	import BoardFilters from '$lib/components/BoardFilters.svelte';
	import Podium from '$lib/components/Podium.svelte';
	import CreatureTile from '$lib/components/CreatureTile.svelte';
	import { creatureFor } from '$lib/creatures';
	import { resolve } from '$app/paths';
	let { data } = $props();

	const pct = (w: number) => `${Math.round(w * 100)}%`;
	const streakChip = (s: number) =>
		s > 0
			? { text: `W${s}`, tone: 'w' as const }
			: s < 0
				? { text: `L${-s}`, tone: 'l' as const }
				: { text: '–', tone: 'none' as const };

	const podiumItems = $derived(
		data.rows.slice(0, 3).map((r, i) => ({
			rank: (i + 1) as 1 | 2 | 3,
			emoji: creatureFor(r.player.id, r.player.avatar),
			name: r.player.name,
			power: r.rated ? r.rating : '—',
			powerLabel: r.rated ? 'RATING' : 'UNRATED',
			chips: [{ text: `${r.games} GP` }, { text: pct(r.winRate) }, streakChip(r.streak)],
			href: resolve('/players/[id]', { id: String(r.player.id) })
		}))
	);
	const rest = $derived(data.rows.slice(3));

	// Aside cards.
	const champ = $derived(data.rows[0] ?? null);
	const champStreak = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');
	const deltaText = (d: number) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '–');
</script>

<h1>The Ultimate Mindbug 🐛</h1>

<BoardFilters view={data.view} format={data.format} range={data.range} />

{#if data.view === 'teams'}
	{#if data.teams.length === 0}
		<p class="card">No games logged yet.</p>
	{:else}
		<div class="tiles">
			{#each data.teams as t, i (t.playerIds.join('-'))}
				<CreatureTile
					rank={i + 1}
					emoji={creatureFor(t.playerIds[0], t.avatars[0])}
					name={t.names.join(' + ')}
					chips={[
						{ text: `${t.games} GP` },
						{ text: `${t.wins}W`, tone: 'w' },
						{ text: `${t.losses}L`, tone: 'l' }
					]}
					power={pct(t.winRate)}
					powerLabel="WIN%"
					king={i === 0}
				/>
			{/each}
		</div>
	{/if}
{:else if data.rows.length === 0}
	<p class="card">No players yet. Add the crew on the Players page.</p>
{:else}
	<div class="board-layout">
		<div class="board-main">
			<Podium items={podiumItems} />
			<div class="tiles">
				{#each rest as r, i (r.player.id)}
					<CreatureTile
						rank={i + 4}
						emoji={creatureFor(r.player.id, r.player.avatar)}
						name={r.player.name}
						chips={[{ text: `${r.games} GP` }, { text: pct(r.winRate) }, streakChip(r.streak)]}
						power={r.rated ? r.rating : '—'}
						powerLabel={r.rated ? 'RATING' : 'UNRATED'}
						href={resolve('/players/[id]', { id: String(r.player.id) })}
					/>
				{/each}
			</div>
		</div>

		<aside class="aside">
			{#if champ}
				<div class="info grad">
					<h4>Champion</h4>
					<div class="big">{champ.player.name}</div>
					<div class="row"><span>rating</span><span>{champ.rated ? champ.rating : '—'}</span></div>
					<div class="row"><span>streak</span><span>{champStreak(champ.streak)}</span></div>
				</div>
			{/if}
			<div class="info">
				<h4>This week</h4>
				<div class="big">{data.weekly.games}</div>
				<div class="row"><span>games played</span><span>{deltaText(data.weekly.delta)}</span></div>
				<div class="row">
					<span>biggest climb</span>
					<span
						>{data.weekly.climb
							? `${data.weekly.climb.name} +${data.weekly.climb.gain}`
							: '–'}</span
					>
				</div>
			</div>
			<div class="info">
				<h4>Tile legend</h4>
				<div class="legend">
					<span class="chip">40 GP</span> games · <span class="chip">64%</span> win rate ·
					<span class="chip w">W5</span> win streak · <span class="chip l">L3</span> loss streak ·
					<span class="chip none">–</span> none · <b style="color: #fff">1187</b> rating
				</div>
			</div>
		</aside>
	</div>
{/if}

<style>
	.tiles {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
	}
	.board-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.9rem;
		align-items: start;
	}
	.board-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	/* Wide screens: leaderboard + a fixed-width aside column. Below this the
	   aside stacks under the board. */
	@media (min-width: 1080px) {
		.board-layout {
			grid-template-columns: minmax(0, 1fr) 264px;
		}
	}
</style>
