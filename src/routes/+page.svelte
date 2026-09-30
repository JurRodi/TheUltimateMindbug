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
	const titleChips = (n: number) => (n > 0 ? [{ text: `🏆 ${n}`, tone: 'mvp' as const }] : []);
	const mvpChips = (n: number) => (n > 0 ? [{ text: `${n} MVP`, tone: 'mvp' as const }] : []);
	// Win% chip: green above 50%, red below, neutral at exactly 50% (or no games).
	const winPctChip = (winRate: number, games: number) => {
		const p = Math.round(winRate * 100);
		const text = `${p}%`;
		return games === 0 || p === 50
			? { text }
			: { text, tone: p > 50 ? ('w' as const) : ('l' as const) };
	};

	const podiumItems = $derived(
		data.rows.slice(0, 3).map((r, i) => ({
			rank: (i + 1) as 1 | 2 | 3,
			emoji: creatureFor(r.player.id, r.player.avatar),
			name: r.player.name,
			power: r.rated ? r.rating : '—',
			powerLabel: r.rated ? 'RATING' : 'UNRATED',
			chips: [
				{ text: `${r.games} GP` },
				winPctChip(r.winRate, r.games),
				streakChip(r.streak),
				...mvpChips(r.mvps),
				...titleChips(r.titles)
			],
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
	const champStreak = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–');
	const deltaText = (d: number) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '–');

	// Collapsed-filter summary shown on mobile (the full controls live inside the
	// <details> body; on desktop the summary is hidden and BoardFilters shows inline).
	const filterSummary = $derived(
		[
			data.view === 'teams' ? 'Teams' : 'Players',
			data.format === 'total' ? 'Total' : data.format,
			data.range === 'week' ? 'Week' : data.range === 'month' ? 'Month' : 'All time'
		].join(' · ')
	);
</script>

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

<div class="title">
	<h1>The Ultimate Mindbug</h1>
	<img src="/icons/favicon-256.png" alt="" />
</div>

<!-- Mobile: the filter bar collapses to a summary pill (tap to reveal the
     controls). Desktop hides the summary and shows BoardFilters inline as before. -->
<details class="filter-collapse">
	<summary>
		<span class="fc-label">Filters</span>
		<span class="fc-summary">{filterSummary}</span>
	</summary>
	<div class="fc-body">
		<BoardFilters view={data.view} format={data.format} range={data.range} />
	</div>
</details>

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

			<!-- Mobile: these collapse to tappable pills and move above the podium
			     (see .aside order/…-collapse rules). Desktop restores the pinned column. -->
			<aside class="aside">
				{#if topTeam}
					<details class="info card-collapse grad">
						<summary>
							<span class="cc-title">Top team</span>
							<span class="cc-headline">{topTeam.names.join(' + ')}</span>
						</summary>
						<div class="cc-body">
							<div class="row"><span>win rate</span><span>{pct(topTeam.winRate)}</span></div>
							<div class="row">
								<span>record</span><span>{topTeam.wins}W · {topTeam.losses}L</span>
							</div>
							{#if data.flags.mvp}
								<div class="row"><span>MVPs</span><span>{topTeam.mvps}</span></div>
							{/if}
						</div>
					</details>
				{/if}
				<details class="info card-collapse">
					<summary>
						<span class="cc-title">This week</span>
						<span class="cc-headline">{data.weekly.games}</span>
					</summary>
					<div class="cc-body">
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
						{#if data.flags.mvp}
							<div class="row">
								<span>MVP of week</span><span>{data.weekly.mvp ? data.weekly.mvp.name : '–'}</span>
							</div>
						{/if}
					</div>
				</details>
				<details class="info card-collapse">
					<summary><span class="cc-title">Tile legend</span></summary>
					<div class="cc-body">
						<div class="legend">
							<span class="chip">40 GP</span> games · <span class="chip w">18W</span> wins ·
							<span class="chip l">7L</span> losses · <b style="color: #fff">72%</b> win rate{#if data.flags.mvp}
								·
								<span class="chip mvp">3 MVP</span> most valuable plays{/if}
						</div>
						<p class="rule-note">Teams need 3+ games to rank on win rate.</p>
					</div>
				</details>
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
						chips={[
							{ text: `${r.games} GP` },
							winPctChip(r.winRate, r.games),
							streakChip(r.streak),
							...mvpChips(r.mvps),
							...titleChips(r.titles)
						]}
						power={r.rated ? r.rating : '—'}
						powerLabel={r.rated ? 'RATING' : 'UNRATED'}
						href={resolve('/players/[id]', { id: String(r.player.id) })}
					/>
				{/each}
			</div>
		</div>

		<!-- Mobile: these collapse to tappable pills and move above the podium
		     (see .aside order/…-collapse rules). Desktop restores the pinned column. -->
		<aside class="aside">
			{#if champ}
				<details class="info card-collapse grad">
					<summary>
						<span class="cc-title">Champion</span>
						<span class="cc-headline">{champ.player.name}</span>
					</summary>
					<div class="cc-body">
						<div class="row">
							<span>rating</span><span>{champ.rated ? champ.rating : '—'}</span>
						</div>
						<div class="row"><span>streak</span><span>{champStreak(champ.streak)}</span></div>
						{#if data.flags.mvp}
							<div class="row"><span>MVPs</span><span>{champ.mvps}</span></div>
						{/if}
					</div>
				</details>
			{/if}
			<details class="info card-collapse">
				<summary>
					<span class="cc-title">This week</span>
					<span class="cc-headline">{data.weekly.games}</span>
				</summary>
				<div class="cc-body">
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
					{#if data.flags.mvp}
						<div class="row">
							<span>MVP of week</span><span>{data.weekly.mvp ? data.weekly.mvp.name : '–'}</span>
						</div>
					{/if}
				</div>
			</details>
			<details class="info card-collapse">
				<summary><span class="cc-title">Tile legend</span></summary>
				<div class="cc-body">
					<div class="legend">
						<span class="chip">40 GP</span> games · <span class="chip">64%</span> win rate ·
						<span class="chip w">W5</span> win streak · <span class="chip l">L3</span> loss streak ·
						<span class="chip none">–</span> none · <b style="color: #fff">1187</b>
						rating{#if data.flags.mvp}
							·
							<span class="chip mvp">3 MVP</span> most valuable plays{/if}
					</div>
				</div>
			</details>
		</aside>
	</div>
{/if}

<style>
	.title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.title img {
		height: 32px;
		width: auto;
		flex: none;
	}
	@media (min-width: 640px) {
		.title img {
			height: 48px;
		}
	}

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

	/* ---------------------------------------------------------------------------
	   Mobile collapsibles. The filter bar and the three side cards each render as
	   a <details>: collapsed to a tappable pill on mobile, forced open (and made
	   non-interactive) on desktop so the original board layout is unchanged.
	   --------------------------------------------------------------------------- */

	/* Enable height:auto <-> 0 interpolation so the <details> can animate open.
	   Browsers without it just skip the height tween (still open/close fine). */
	:global(:root) {
		interpolate-size: allow-keywords;
		/* Chevron icon used (via mask) for every collapsible's disclosure arrow. */
		--chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 5l7 7-7 7'/%3E%3C/svg%3E");
	}

	/* Filter: one integrated collapsible card on mobile — the summary is the
	   header and the controls expand inside the same card (not a panel below). */
	.filter-collapse {
		margin: 0.75rem 0 0.5rem;
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.22);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.filter-collapse > summary {
		list-style: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 0.85rem;
	}
	.filter-collapse > summary::-webkit-details-marker {
		display: none;
	}
	.fc-label {
		flex: none;
		font-size: 0.62rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		font-weight: 800;
		color: var(--onmat-muted);
	}
	.fc-summary {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--onmat);
	}
	.filter-collapse > summary::after {
		content: '';
		margin-left: auto;
		width: 0.95rem;
		height: 0.95rem;
		background-color: var(--onmat-muted);
		-webkit-mask: var(--chevron) center / contain no-repeat;
		mask: var(--chevron) center / contain no-repeat;
		transition: transform 0.2s ease;
	}
	.filter-collapse[open] > summary::after {
		transform: rotate(90deg);
	}
	.fc-body {
		padding: 0 0.85rem 0.75rem;
	}
	/* Strip BoardFilters' own mobile panel chrome so it lives inside this card;
	   its grid/labels stay. Desktop re-adds the wrapper's spacing (see below). */
	.fc-body :global(.filters) {
		margin: 0 !important;
		background: none !important;
		border: 0 !important;
		padding: 0 !important;
	}

	/* Side cards: collapsed pills that move above the podium on mobile. */
	.aside {
		order: -1;
	}
	/* Trim the collapsed pill height (symmetric top/bottom); the desktop block
	   restores the full .info padding for the pinned cards. */
	.card-collapse {
		padding: 0.55rem 1rem;
	}
	.card-collapse > summary {
		list-style: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.card-collapse > summary::-webkit-details-marker {
		display: none;
	}
	.cc-title {
		flex: none;
		font-size: 0.7rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		font-weight: 800;
		color: var(--onmat-muted);
	}
	.cc-headline {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 800;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		font-family: var(--display);
		color: var(--onmat);
	}
	.card-collapse > summary::after {
		content: '';
		flex: none;
		margin-left: auto;
		width: 0.95rem;
		height: 0.95rem;
		background-color: var(--onmat-muted);
		-webkit-mask: var(--chevron) center / contain no-repeat;
		mask: var(--chevron) center / contain no-repeat;
		transition: transform 0.2s ease;
	}
	.card-collapse[open] > summary::after {
		transform: rotate(90deg);
	}
	.card-collapse.grad .cc-title {
		color: rgba(58, 43, 6, 0.7);
	}
	.card-collapse.grad > summary::after {
		background-color: rgba(58, 43, 6, 0.7);
	}
	.card-collapse.grad .cc-headline {
		color: #3a2b06;
	}
	.cc-body {
		margin-top: 0.6rem;
	}
	/* Stat rows: uniform height, with a tidy tabular value column. */
	.cc-body .row {
		align-items: center;
		min-height: 1.5rem;
	}
	.cc-body .row span:last-child {
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	/* Animate expand/collapse for every collapsible on mobile. height transitions
	   to/from auto thanks to the :root interpolate-size above; allow-discrete keeps
	   the content rendered through the closing tween. */
	.filter-collapse::details-content,
	.card-collapse::details-content {
		height: 0;
		overflow: hidden;
		opacity: 0;
		transition:
			height 0.26s ease,
			opacity 0.22s ease,
			content-visibility 0.26s;
		transition-behavior: allow-discrete;
	}
	.filter-collapse[open]::details-content,
	.card-collapse[open]::details-content {
		height: auto;
		opacity: 1;
	}

	/* Wide screens: leaderboard + a fixed-width aside column. Below this the
	   aside stacks above the board (as collapsible pills). */
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
			padding: 0.5rem 0.35rem 0;
		}
		/* Don't let the podium/list get squashed to fit the scroll container —
		   keep their natural heights (so the podium tiers stay correct) and let
		   board-main scroll through them instead. */
		.board-main > :global(.podium),
		.tiles {
			flex-shrink: 0;
		}
		/* Restore the aside to the right-hand column at its natural height. */
		.aside {
			order: 0;
			align-self: start;
			padding-top: 0.5rem;
		}

		/* Filter renders inline as before — drop the card chrome and the header. */
		.filter-collapse {
			background: none;
			border: 0;
		}
		.filter-collapse > summary {
			display: none;
		}
		.fc-body {
			padding: 0;
			display: block !important;
		}

		/* Side cards render as static cards: title over headline over rows. */
		.card-collapse {
			padding: 1rem;
		}
		.card-collapse > summary {
			display: block;
			cursor: default;
			pointer-events: none;
		}
		.card-collapse > summary::after {
			display: none;
		}
		.cc-title {
			display: block;
			margin-bottom: 0.5rem;
		}
		.cc-headline {
			display: block;
			font-size: 1.7rem;
			white-space: normal;
			overflow: visible;
		}
		.cc-body {
			margin-top: 0;
			display: block !important;
		}
		/* No animation on desktop — everything is forced open and static. */
		.filter-collapse::details-content,
		.card-collapse::details-content {
			height: auto;
			overflow: visible;
			opacity: 1;
			content-visibility: visible;
			transition: none;
		}
	}
</style>
