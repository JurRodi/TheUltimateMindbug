<script lang="ts">
	import BoardFilters from '$lib/components/BoardFilters.svelte';
	import Podium from '$lib/components/Podium.svelte';
	import CreatureTile from '$lib/components/CreatureTile.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { creatureFor } from '$lib/creatures';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	let { data } = $props();

	// Success confirmation after logging a game (the log form redirects here with
	// ?saved=game). Show a toast once, then strip the param so a refresh is clean.
	let toast = $state<string | null>(null);
	$effect(() => {
		if (page.url.searchParams.get('saved') === 'game') {
			toast = 'Game saved ✓';
			const u = new URL(page.url);
			u.searchParams.delete('saved');
			const rest = u.searchParams.toString();
			replaceState(resolve(rest ? `/?${rest}` : '/'), {});
		}
	});

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

	// Teams: top-3 podium (avatar clusters) + the rest as cluster tiles.
	type TeamRow = (typeof data.teams)[number];
	const teamChips = (t: TeamRow) => [
		{ text: `${t.games} GP` },
		{ text: `${t.wins}W`, tone: 'w' as const },
		{ text: `${t.losses}L`, tone: 'l' as const }
	];
	const teamPodium = $derived(
		data.teams.slice(0, 3).map((t, i) => ({
			rank: (i + 1) as 1 | 2 | 3,
			name: t.names.join(' + '),
			members: t.playerIds.map((id, idx) => ({
				emoji: creatureFor(id, t.avatars[idx]),
				name: t.names[idx]
			})),
			power: pct(t.winRate),
			powerLabel: 'WIN%',
			chips: teamChips(t),
			href: resolve('/teams/[id]', { id: t.playerIds.join('-') })
		}))
	);
	const teamRest = $derived(data.teams.slice(3));
	const topTeam = $derived(data.teams[0] ?? null);

	// Aside cards.
	const champ = $derived(data.rows[0] ?? null);
	const champStreak = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');
	const deltaText = (d: number) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '–');
</script>

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

<h1>The Ultimate Mindbug 🐛</h1>

<BoardFilters view={data.view} format={data.format} range={data.range} />

{#if data.view === 'teams'}
	{#if data.teams.length === 0}
		<p class="card">No games logged yet.</p>
	{:else}
		<div class="board-layout">
			<div class="board-main">
				<Podium items={teamPodium} />
				{#if teamRest.length}
					<div class="tiles">
						{#each teamRest as t, i (t.playerIds.join('-'))}
							<CreatureTile
								rank={i + 4}
								avatars={t.playerIds.map((id, idx) => creatureFor(id, t.avatars[idx]))}
								name={t.names.join(' + ')}
								chips={teamChips(t)}
								power={pct(t.winRate)}
								powerLabel="WIN%"
								href={resolve('/teams/[id]', { id: t.playerIds.join('-') })}
							/>
						{/each}
					</div>
				{/if}
			</div>

			<aside class="aside">
				{#if topTeam}
					<div class="info grad">
						<h4>Top team</h4>
						<div class="big">{topTeam.names.join(' + ')}</div>
						<div class="row"><span>win rate</span><span>{pct(topTeam.winRate)}</span></div>
						<div class="row">
							<span>record</span><span>{topTeam.wins}W · {topTeam.losses}L</span>
						</div>
					</div>
				{/if}
				<div class="info">
					<h4>This week</h4>
					<div class="big">{data.weekly.games}</div>
					<div class="row">
						<span>games played</span><span>{deltaText(data.weekly.delta)}</span>
					</div>
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
						<span class="chip">40 GP</span> games · <span class="chip w">18W</span> wins ·
						<span class="chip l">7L</span> losses · <b style="color: #fff">72%</b> win rate
					</div>
					<p class="rule-note">Teams need 3+ games to rank on win rate.</p>
				</div>
			</aside>
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
	/* Small side note under the teams tile legend explaining the ranking rule. */
	.rule-note {
		margin: 0.5rem 0 0;
		font-size: 0.66rem;
		line-height: 1.4;
		color: var(--onmat-muted);
		opacity: 0.75;
	}
	/* Wide screens: leaderboard + a fixed-width aside column. Below this the
	   aside stacks under the board. */
	@media (min-width: 1080px) {
		/* Grow to fill the viewport-height wrap (see .wrap.wide in app.css); the
		   grid rows stretch so board-main gets a definite height to scroll into. */
		.board-layout {
			grid-template-columns: minmax(0, 1fr) 264px;
			flex: 1;
			min-height: 0;
			align-items: stretch;
		}
		/* Scroll the whole column — podium and ranking list together — so the aside
		   (Champion / Top team, This week, legend) stays in view beside it. Once #1
		   scrolls off, the Champion card still shows who's on top. */
		.board-main {
			min-height: 0;
			overflow-y: auto;
			padding: 0 0.35rem;
		}
		/* Don't let the podium/list get squashed to fit the scroll container —
		   keep their natural heights (so the podium tiers stay correct) and let
		   board-main scroll through them instead. */
		.board-main > :global(.podium),
		.tiles {
			flex-shrink: 0;
		}
		/* Keep the aside at its natural height, pinned to the top of the row. */
		.aside {
			align-self: start;
		}
	}
</style>
