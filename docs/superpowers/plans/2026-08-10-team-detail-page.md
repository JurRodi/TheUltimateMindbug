# Team Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-team detail page at `/teams/[id]`, reachable by tapping teams on the existing homepage Teams tab.

**Architecture:** Three new pure functions in `src/lib/stats/teams.ts` (unit-tested), a small `TeamRecordChart` SVG component, a new SvelteKit route (`+page.server.ts` load + `+page.svelte`), and href wiring on the existing homepage Teams podium/tiles. No new nav item, no overview route, no Elo.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Vitest.

## Global Constraints

- Team identity = `playerIds.sort((a,b)=>a-b).join('-')` (e.g. `1-4`). Match games on the exact sorted id-set of a side, never `includes`.
- Teams have no Elo; rank/record come from the existing `teamStats` (all-time, `total` track).
- Reuse existing theme tokens/classes; dark-teal product theme, single theme (no light/dark toggle).
- `pnpm check`, `pnpm lint`, full vitest suite stay green.
- Commit under the repo-local identity already configured; do not touch `CLAUDE.md`.

---

## File Structure

- Modify: `src/lib/stats/teams.ts` — add `teamGameLog`, `teamNetSeries`, `teamStreak` (+ shared `teamGamesChrono` helper).
- Modify: `src/lib/stats/teams.test.ts` — tests for the three new functions.
- Create: `src/lib/components/TeamRecordChart.svelte` — net-record line chart.
- Create: `src/routes/teams/[id]/+page.server.ts` — load.
- Create: `src/routes/teams/[id]/+page.svelte` — page.
- Modify: `src/routes/+page.svelte` — set `href` on team podium items + tiles.

---

### Task 1: Pure team-history functions

**Files:**
- Modify: `src/lib/stats/teams.ts`
- Test: `src/lib/stats/teams.test.ts`

**Interfaces:**
- Consumes: `GameInput`, `Format` from `$lib/types`; `filterGames` already imported.
- Produces:
  - `interface TeamGameLogEntry { gameId: number; playedAt: string; format: Format; won: boolean; opponentIds: number[]; netAfter: number; }`
  - `teamGameLog(games: GameInput[], playerIds: number[]): TeamGameLogEntry[]` — newest-first.
  - `interface TeamNetPoint { playedAt: string; net: number; }`
  - `teamNetSeries(games: GameInput[], playerIds: number[]): TeamNetPoint[]` — oldest-first.
  - `teamStreak(games: GameInput[], playerIds: number[]): number` — signed.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/stats/teams.test.ts`:

```ts
import { teamGameLog, teamNetSeries, teamStreak } from './teams';

// Reuse the module-level `games` fixture (games 1 & 2, both lineup [1,2] vs [3,4]).
describe('team history helpers', () => {
	it('teamNetSeries walks running net oldest-first', () => {
		// [1,2]: game1 W (+1), game2 L (0)
		expect(teamNetSeries(games, [2, 1])).toEqual([
			{ playedAt: '2026-01-01T10:00:00Z', net: 1 },
			{ playedAt: '2026-01-02T10:00:00Z', net: 0 }
		]);
	});

	it('teamGameLog returns newest-first with netAfter and opponents', () => {
		const log = teamGameLog(games, [1, 2]);
		expect(log.map((e) => e.gameId)).toEqual([2, 1]);
		expect(log[0]).toMatchObject({ won: false, netAfter: 0, opponentIds: [3, 4] });
		expect(log[1]).toMatchObject({ won: true, netAfter: 1, opponentIds: [3, 4] });
	});

	it('matches on the exact lineup, not a superset', () => {
		const extra: GameInput[] = [
			...games,
			{ id: 3, playedAt: '2026-01-03T10:00:00Z', format: '3v3', winnerSide: 'A', sideA: [1, 2, 5], sideB: [3, 4, 6] }
		];
		// [1,2] (2-player team) must NOT pick up the 3-player game
		expect(teamGameLog(extra, [1, 2]).map((e) => e.gameId)).toEqual([2, 1]);
		expect(teamGameLog(extra, [1, 2, 5]).map((e) => e.gameId)).toEqual([3]);
	});

	it('teamStreak is signed from the most recent games', () => {
		// [1,2]: game1 W, game2 L -> current streak -1
		expect(teamStreak(games, [1, 2])).toBe(-1);
		// [3,4]: game1 L, game2 W -> current streak +1
		expect(teamStreak(games, [3, 4])).toBe(1);
		expect(teamStreak(games, [9, 9])).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/stats/teams.test.ts`
Expected: FAIL — `teamGameLog`/`teamNetSeries`/`teamStreak` are not exported.

- [ ] **Step 3: Implement the functions**

Append to `src/lib/stats/teams.ts` (add `Format` to the type import at the top: `import type { GameInput, Format } from '$lib/types';`):

```ts
const keyOf = (ids: number[]) => [...ids].sort((a, b) => a - b).join('-');

/** The team's games in chronological order, with win flag + opponents. */
function teamGamesChrono(
	games: GameInput[],
	playerIds: number[]
): { game: GameInput; won: boolean; opponentIds: number[] }[] {
	const key = keyOf(playerIds);
	return games
		.filter((g) => keyOf(g.sideA) === key || keyOf(g.sideB) === key)
		.map((g) => {
			const onA = keyOf(g.sideA) === key;
			return {
				game: g,
				won: g.winnerSide === (onA ? 'A' : 'B'),
				opponentIds: [...(onA ? g.sideB : g.sideA)]
			};
		})
		.sort((a, b) =>
			a.game.playedAt === b.game.playedAt
				? a.game.id - b.game.id
				: a.game.playedAt < b.game.playedAt
					? -1
					: 1
		);
}

export interface TeamGameLogEntry {
	gameId: number;
	playedAt: string;
	format: Format;
	won: boolean;
	opponentIds: number[];
	/** Running net record (cumulative wins − losses) after this game. */
	netAfter: number;
}

/** The team's games, newest first, with running net record per game. */
export function teamGameLog(games: GameInput[], playerIds: number[]): TeamGameLogEntry[] {
	let net = 0;
	const chrono = teamGamesChrono(games, playerIds).map((r) => {
		net += r.won ? 1 : -1;
		return {
			gameId: r.game.id,
			playedAt: r.game.playedAt,
			format: r.game.format,
			won: r.won,
			opponentIds: r.opponentIds,
			netAfter: net
		};
	});
	return chrono.reverse();
}

export interface TeamNetPoint {
	playedAt: string;
	net: number;
}

/** Running net record, oldest → newest, for the trend chart. */
export function teamNetSeries(games: GameInput[], playerIds: number[]): TeamNetPoint[] {
	let net = 0;
	return teamGamesChrono(games, playerIds).map((r) => {
		net += r.won ? 1 : -1;
		return { playedAt: r.game.playedAt, net };
	});
}

/** Signed current streak: >0 win streak, <0 loss streak, 0 = no games. */
export function teamStreak(games: GameInput[], playerIds: number[]): number {
	const chrono = teamGamesChrono(games, playerIds);
	let streak = 0;
	for (let i = chrono.length - 1; i >= 0; i--) {
		const won = chrono[i].won;
		if (i === chrono.length - 1) streak = won ? 1 : -1;
		else if (won && streak > 0) streak++;
		else if (!won && streak < 0) streak--;
		else break;
	}
	return streak;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/stats/teams.test.ts`
Expected: PASS (all, including the pre-existing `teamStats` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/teams.ts src/lib/stats/teams.test.ts
git commit -m "feat(stats): team game log, net-record series, and streak"
```

---

### Task 2: TeamRecordChart component

**Files:**
- Create: `src/lib/components/TeamRecordChart.svelte`

**Interfaces:**
- Consumes: `points: { playedAt: string; net: number }[]` (from `teamNetSeries`).
- Produces: an SVG net-record line with gridlines at `hi`/`0`/`lo`, an emphasized zero baseline, dots (latest emphasized), a latest-value label, and an empty state.

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
	let { points }: { points: { playedAt: string; net: number }[] } = $props();

	const W = 640;
	const H = 240;
	const L = 46;
	const R = 48;
	const T = 16;
	const B = 30;

	const vals = $derived(points.map((p) => p.net));
	// Always include 0 in view, with 1 unit of headroom each side.
	const lo = $derived(vals.length ? Math.min(0, ...vals) - 1 : -1);
	const hi = $derived(vals.length ? Math.max(0, ...vals) + 1 : 1);
	const span = $derived(hi - lo || 1);
	const ticks = $derived([...new Set([hi, 0, lo])]);

	const x = (i: number, n: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
	const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);

	const d = $derived(
		points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i, points.length).toFixed(1)},${y(p.net).toFixed(1)}`)
			.join(' ')
	);
	const last = $derived(points.length ? points[points.length - 1].net : null);
	const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`);
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net record over time">
	{#each ticks as t (t)}
		<line
			x1={L}
			y1={y(t)}
			x2={W - R}
			y2={y(t)}
			stroke="var(--line-card)"
			stroke-width={t === 0 ? 1.5 : 1}
		/>
		<text x={L - 8} y={y(t) + 4} text-anchor="end" fill="var(--muted)" font-size="11" font-weight="700"
			>{fmt(t)}</text
		>
	{/each}

	{#if points.length}
		<path d={d} fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
		{#each points as p, i (i)}
			{@const isLast = i === points.length - 1}
			<circle
				cx={x(i, points.length)}
				cy={y(p.net)}
				r={isLast ? 4.5 : 2.8}
				fill={isLast ? 'var(--teal)' : 'var(--card)'}
				stroke="var(--teal)"
				stroke-width="2"
			/>
		{/each}
		<text
			x={x(points.length - 1, points.length) + 7}
			y={y(last ?? 0) + 4}
			fill="var(--up)"
			font-size="12"
			font-weight="800">{fmt(last ?? 0)}</text
		>
	{:else}
		<text x={W / 2} y={H / 2} text-anchor="middle" fill="var(--muted)" font-size="13" font-weight="700"
			>No games yet</text
		>
	{/if}
</svg>

<div class="legend">
	<span class="key"><i></i>Net record (wins − losses){#if last !== null}<b>{fmt(last)}</b>{/if}</span>
	<span class="count">{points.length} game{points.length === 1 ? '' : 's'}</span>
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.legend {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
	}
	.key i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		background: var(--teal);
		display: inline-block;
	}
	.key b {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.count {
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/TeamRecordChart.svelte
git commit -m "feat(ui): TeamRecordChart net-record line chart"
```

---

### Task 3: Team detail server load

**Files:**
- Create: `src/routes/teams/[id]/+page.server.ts`

**Interfaces:**
- Consumes: `getPlayers`, `getAllGames` from `$lib/server/db/queries`; `db`; `teamStats`, `teamGameLog`, `teamNetSeries`, `teamStreak`; `creatureFor`.
- Produces the page `data`: `{ key, members: {id,name,emoji}[], format, rank, rankTotal, record: {wins,losses,games,winRate}, netRecord, streak, series, history }` where `history[i] = { gameId, playedAt, format, won, netAfter, opponents: {id,name,emoji}[] }`.

- [ ] **Step 1: Create the load**

```ts
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, getAllGames } from '$lib/server/db/queries';
import { teamStats, teamGameLog, teamNetSeries, teamStreak } from '$lib/stats/teams';
import { creatureFor } from '$lib/creatures';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const ids = params.id.split('-').map((s) => Number(s));
	if (ids.length < 2 || ids.some((n) => !Number.isInteger(n)))
		throw error(404, 'Team not found');
	const key = [...ids].sort((a, b) => a - b).join('-');

	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const now = new Date();
	const teams = teamStats(games, { track: 'total', range: 'all', now });
	const rankIndex = teams.findIndex((t) => t.playerIds.join('-') === key);
	if (rankIndex < 0) throw error(404, 'Team not found');
	const team = teams[rankIndex];

	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (pid: number) => ({
		id: pid,
		name: nameById.get(pid) ?? `#${pid}`,
		emoji: creatureFor(pid, avatarById.get(pid))
	});

	const history = teamGameLog(games, team.playerIds).map((e) => ({
		gameId: e.gameId,
		playedAt: e.playedAt,
		format: e.format,
		won: e.won,
		netAfter: e.netAfter,
		opponents: e.opponentIds.map(resolve)
	}));

	return {
		key,
		members: team.playerIds.map(resolve),
		format: team.playerIds.length === 2 ? '2v2' : '3v3',
		rank: rankIndex + 1,
		rankTotal: teams.length,
		record: { wins: team.wins, losses: team.losses, games: team.games, winRate: team.winRate },
		netRecord: team.wins - team.losses,
		streak: teamStreak(games, team.playerIds),
		series: teamNetSeries(games, team.playerIds)
	};
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm check`
Expected: 0 errors (the route's `./$types` is generated once `+page.svelte` also exists in Task 4; if `pnpm check` complains about a missing `+page.svelte`, proceed to Task 4 and re-run there).

- [ ] **Step 3: Commit**

```bash
git add src/routes/teams/[id]/+page.server.ts
git commit -m "feat(teams): team detail page load"
```

---

### Task 4: Team detail page

**Files:**
- Create: `src/routes/teams/[id]/+page.svelte`

**Interfaces:**
- Consumes: `data` from Task 3; `TeamRecordChart` from Task 2; `resolve` from `$app/paths`.

- [ ] **Step 1: Create the page**

```svelte
<script lang="ts">
	import TeamRecordChart from '$lib/components/TeamRecordChart.svelte';
	import { resolve } from '$app/paths';
	let { data } = $props();

	const pct = (w: number) => `${Math.round(w * 100)}%`;
	const streakText = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');
	const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
			<div class="stat"><span class="n">{pct(data.record.winRate)}</span><span class="l">Win rate</span></div>
			<div class="stat"><span class="n">{data.record.wins}–{data.record.losses}</span><span class="l">Record</span></div>
			<div class="stat"><span class="n">{data.record.games}</span><span class="l">Games</span></div>
			<div class="stat"><span class="n">{signed(data.netRecord)}</span><span class="l">Net record</span></div>
			{#if data.record.games > 0}
				<span class="chip {data.streak > 0 ? 'w' : data.streak < 0 ? 'l' : 'none'}">{streakText(data.streak)}</span>
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
					<div class="line1">
						<span class="fmt">{g.format}</span><span class="date">{fmtDate(g.playedAt)}</span>
					</div>
					<div class="teams">
						<span class="teamgrp us {g.won ? 'good' : 'bad'}">
							{#each data.members as m (m.id)}<span class="em">{m.emoji}</span>{/each}
						</span>
						<span class="vs">vs</span>
						<span class="teamgrp">
							{#each g.opponents as p (p.id)}
								<a class="pchip sm" href={resolve('/players/[id]', { id: String(p.id) })}
									><span class="em">{p.emoji}</span>{p.name}</a
								>
							{/each}
						</span>
					</div>
				</div>
				<div class="net {g.netAfter >= 0 ? 'up' : 'down'}">{signed(g.netAfter)}</div>
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
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: #fbf4e2;
		border: 2px solid var(--edge);
		display: grid;
		place-items: center;
		font-size: 1.9rem;
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
	}
	.pchip.sm {
		font-size: 0.74rem;
		font-weight: 700;
		padding: 0.1rem 0.5rem 0.1rem 0.28rem;
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
	.teamgrp .em {
		font-size: 0.95rem;
		line-height: 1;
	}
	.teamgrp.us.good {
		background: rgba(15, 143, 106, 0.14);
		border-color: rgba(15, 143, 106, 0.5);
	}
	.teamgrp.us.bad {
		background: rgba(214, 74, 55, 0.13);
		border-color: rgba(214, 74, 55, 0.5);
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.05em;
	}
	.net {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.net.up {
		color: var(--up);
	}
	.net.down {
		color: var(--down);
	}
</style>
```

- [ ] **Step 2: Verify type-check + lint**

Run: `pnpm check && pnpm lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Runtime smoke test**

Start `pnpm dev --port 5199`, load `/teams/<a real lineup key from the seed>` → HTTP 200 with hero, chart, and games. A bad key (e.g. `/teams/999-998`) → 404.

- [ ] **Step 4: Commit**

```bash
git add src/routes/teams/[id]/+page.svelte
git commit -m "feat(teams): team detail page"
```

---

### Task 5: Make the homepage Teams tab clickable

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `resolve` from `$app/paths` (already imported); `Podium`/`CreatureTile` already forward `href`.

- [ ] **Step 1: Set href on the team podium items**

In the `teamPodium` `$derived`, change `href: null` to:

```ts
href: resolve('/teams/[id]', { id: t.playerIds.join('-') })
```

- [ ] **Step 2: Set href on the team tiles**

On the `<CreatureTile>` inside the `{#each teamRest ...}` block, add:

```svelte
href={resolve('/teams/[id]', { id: t.playerIds.join('-') })}
```

- [ ] **Step 3: Verify + smoke test**

Run: `pnpm check && pnpm lint`
Expected: clean. Then on the running dev server, open the Teams tab and click a podium card and a tile — both navigate to the matching `/teams/[id]` detail page.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(board): link Teams tab cards to team detail pages"
```

---

## Self-Review

- **Spec coverage:** detail route (T3/T4), net-record chart (T2), pure functions + tests (T1), homepage wiring (T5), format badge + rank-from-teamStats + member cross-links (T4/T3) — all covered. No overview route / nav item / icon, per spec.
- **Placeholder scan:** none — every step has concrete code.
- **Type consistency:** `teamNetSeries` → `{playedAt, net}` consumed by `TeamRecordChart` `points`; `teamGameLog` → `netAfter`/`opponentIds` consumed by the load's `history`; load `data` shape matches the page's usage (`members`, `record`, `netRecord`, `streak`, `series`, `format`, `rank`, `rankTotal`).
