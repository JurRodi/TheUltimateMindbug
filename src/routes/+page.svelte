<script lang="ts">
	import ViewTabs from '$lib/components/ViewTabs.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
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
</script>

<h1>The Ultimate Mindbug 🐛</h1>

<div class="board-head">
	<ViewTabs view={data.view} />
	<FilterBar format={data.format} range={data.range} />
</div>

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
{/if}

<style>
	.board-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		margin: 0.75rem 0 1rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
	}
</style>
