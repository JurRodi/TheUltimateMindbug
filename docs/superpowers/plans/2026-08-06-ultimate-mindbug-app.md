# The Ultimate Mindbug — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted, installable leaderboard + team-aware Elo rating web app for a friend group's daily Mindbug games.

**Architecture:** A single SvelteKit full-stack app (frontend + server routes + DB access) deployed on Vercel, backed by Neon Postgres via Drizzle ORM. Games are the source of truth; ratings and all stats are pure functions that replay game history (three independent Elo tracks: Total, 2v2, 3v3). Viewing is open; logging/managing is gated by a shared password.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), TypeScript, Drizzle ORM, Neon Postgres (`@neondatabase/serverless`), Vitest, PGlite (`@electric-sql/pglite`) for hermetic DB tests, `@sveltejs/adapter-vercel`, native SvelteKit service worker + web manifest (PWA), `@fontsource` for offline fonts.

## Global Constraints

- **Runtime:** Node 20+.
- **Language:** TypeScript everywhere; Svelte 5 runes syntax (`$state`, `$props`, `$derived`) for components.
- **Rating config (verbatim):** `startRating = 1000`, `K = 24`. Exposed as `DEFAULT_CONFIG` and tunable via a single config object — never hard-coded at call sites.
- **Rating tracks (verbatim):** exactly three — `'total'` (all games), `'2v2'` (only 2v2 games), `'3v3'` (only 3v3 games). Each starts every player at `startRating`.
- **Team sizes:** 2v2 and 3v3 only, always symmetric (2 or 3 players per side). Exactly two sides (`'A'`, `'B'`) per game.
- **Ratings are derived, never stored mutably.** No rating columns in the DB; recompute from game history on read.
- **Player `name` is UNIQUE** at the DB level.
- **Access:** viewing open; logging a game and managing players require the shared password.
- **No external CDN / network assets at runtime** (PWA must work offline): all fonts/icons are bundled locally.
- **Env vars (exact names):** `DATABASE_URL` (Neon connection string), `MINDBUG_PASSWORD` (shared logging password), `AUTH_SECRET` (random secret for signing the auth cookie).
- **Process:** TDD (red → green → refactor) for all pure logic and the data layer. DRY. YAGNI. Commit after every green step.

---

## File Structure

```
drizzle.config.ts                      # drizzle-kit config (schema path, Neon dialect)
svelte.config.js                       # adapter-vercel
vite.config.ts                         # vitest config (sveltekit plugin)
.env.example                           # documents required env vars
src/
  app.html                             # links manifest + theme-color
  app.css                              # Mindbug design tokens + base styles
  app.d.ts
  service-worker.ts                    # PWA offline shell
  lib/
    types.ts                           # shared types (Side, Format, Track, DateRange, GameInput, Player)
    rating/
      engine.ts                        # pure Elo engine (expectedScore, computeTrack, computeRatings)
      engine.test.ts
    stats/
      aggregate.ts                     # player stats: wins, games, winRate, streak + filters
      aggregate.test.ts
      teams.ts                         # team-combo records
      teams.test.ts
    server/
      auth.ts                          # verifyPassword, authCookie, isAuthed, requireAuth
      auth.test.ts
      db/
        schema.ts                      # drizzle tables (players, games, game_participants)
        index.ts                       # prod db client (neon-http)
        shape.ts                       # pure rows -> GameInput[] shaper
        shape.test.ts
        queries.ts                     # getPlayers, addPlayer, setPlayerActive, getPlayer, insertGame, getAllGames
        queries.test.ts                # pglite integration tests
        test-db.ts                     # pglite test-db factory (test helper)
    creatures.ts                       # emoji creature avatars + deterministic fallback
    components/
      Nav.svelte                       # responsive: bottom bar (mobile) / left rail (desktop)
      ViewTabs.svelte                  # Players/Teams toggle (?view)
      FilterBar.svelte
      CreatureTile.svelte              # full-width player/team creature card
      Podium.svelte                    # stepped top-3 creature cards
      RatingChart.svelte
  routes/
    +layout.svelte                     # responsive shell (rail + content grid on desktop)
    +page.svelte                       # leaderboard: Players + Teams tabs (?view=players|teams)
    +page.server.ts                    # loads both player ranking and team records
    login/+page.svelte
    login/+page.server.ts
    log/+page.svelte                   # log a game (protected)
    log/+page.server.ts
    players/+page.svelte               # manage players (roster)
    players/+page.server.ts
    players/[id]/+page.svelte          # player profile
    players/[id]/+page.server.ts
static/
  manifest.webmanifest
  icons/icon.svg  icons/icon-192.png  icons/icon-512.png  icons/maskable-512.png
```

Testing note: `$lib/server/db/queries.test.ts` runs against an in-process PGlite database created by `test-db.ts`, which applies the same generated Drizzle migrations used in production — so query/transaction behavior is tested for real without Docker or a network DB. Pure modules (`rating`, `stats`, `shape`, `auth`) have zero DB/network dependencies and are tested directly.

---

## Task 1: Scaffold SvelteKit project + tooling

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts`, `src/routes/+page.svelte`, `.env.example`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable SvelteKit + Vitest project. `npm run dev`, `npm run build`, `npm test` all work.

- [ ] **Step 1: Scaffold with the Svelte CLI**

Run in the repo root (the repo already contains `README.md`, `CLAUDE.md`, `docs/`, `.gitignore`; there is no `package.json`, so the scaffold will not conflict):

```bash
npx sv create .
```

Choose, when prompted: template **SvelteKit minimal**; type checking **TypeScript**; add-ons **prettier**, **eslint**, **vitest**. If prompted about a non-empty directory, continue (our files don't conflict).

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit @electric-sql/pglite @sveltejs/adapter-vercel
```

> Fonts: do NOT install `@fontsource/*` packages — this environment's npm
> supply-chain guard blocks them. The design uses the system-font fallbacks
> already declared in the tokens (`'Century Gothic', system-ui` for display,
> system sans for body). Self-hosting real Poppins/Nunito woff2 files can be a
> later, separate task if desired.

- [ ] **Step 3: Write a smoke test**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
	it('runs the test toolchain', () => {
		expect(1 + 1).toBe(2);
	});
});
```

- [ ] **Step 4: Run the smoke test (expect PASS)**

Run: `npm test -- --run`
Expected: the smoke test passes (the scaffold may include a demo test too — that's fine).

- [ ] **Step 5: Verify dev + build**

Run: `npm run build`
Expected: build succeeds (adapter-node/auto default is fine for now; adapter-vercel is wired in Task 18).

- [ ] **Step 6: Add `.env.example`**

Create `.env.example`:

```bash
# Neon Postgres connection string (from Vercel/Neon dashboard)
DATABASE_URL="postgres://user:pass@host/db?sslmode=require"
# Shared password required to log games and manage players
MINDBUG_PASSWORD="change-me"
# Random secret used to sign the auth cookie (e.g. `openssl rand -hex 32`)
AUTH_SECRET="change-me"
```

Confirm `.env` is git-ignored (add `.env` to `.gitignore` if not already present).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit app with Vitest, Drizzle, PWA deps"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/types.ts`

**Interfaces:**
- Produces: `Side`, `Format`, `Track`, `DateRange`, `GameInput`, `Player` — imported by nearly every later task via `$lib/types`.

- [ ] **Step 1: Create the types module**

Create `src/lib/types.ts`:

```ts
export type Side = 'A' | 'B';
export type Format = '2v2' | '3v3';
/** Rating/leaderboard track. 'total' = all games; '2v2'/'3v3' = format-filtered. */
export type Track = 'total' | '2v2' | '3v3';
export type DateRange = 'week' | 'month' | 'all';

/** A single logged game, already shaped for the pure engine/stats layers. */
export interface GameInput {
	id: number;
	/** ISO-8601 timestamp string; sortable ascending for chronological order. */
	playedAt: string;
	format: Format;
	winnerSide: Side;
	/** Player ids on each side. Length 2 for 2v2, 3 for 3v3. */
	sideA: number[];
	sideB: number[];
}

export interface Player {
	id: number;
	name: string;
	/** A single emoji creature avatar, or null to use a deterministic fallback. */
	avatar: string | null;
	isActive: boolean;
	/** ISO-8601 timestamp string. */
	createdAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared domain types"
```

---

## Task 3: Rating engine — `expectedScore`

**Files:**
- Create: `src/lib/rating/engine.ts`, `src/lib/rating/engine.test.ts`

**Interfaces:**
- Consumes: `$lib/types`.
- Produces: `expectedScore(ratingA: number, ratingB: number): number` (the Elo expected score for A), plus `RatingConfig` and `DEFAULT_CONFIG = { startRating: 1000, k: 24 }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/rating/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { expectedScore, DEFAULT_CONFIG } from './engine';

describe('expectedScore', () => {
	it('is 0.5 for equal ratings', () => {
		expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
	});

	it('is ~0.76 when 200 points higher', () => {
		expect(expectedScore(1200, 1000)).toBeCloseTo(0.7597, 3);
	});

	it('is symmetric: E_A + E_B = 1', () => {
		const a = expectedScore(1337, 1010);
		const b = expectedScore(1010, 1337);
		expect(a + b).toBeCloseTo(1, 10);
	});
});

describe('DEFAULT_CONFIG', () => {
	it('starts at 1000 with K=24', () => {
		expect(DEFAULT_CONFIG).toEqual({ startRating: 1000, k: 24 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: FAIL — module `./engine` not found / exports missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/rating/engine.ts`:

```ts
export interface RatingConfig {
	startRating: number;
	k: number;
}

export const DEFAULT_CONFIG: RatingConfig = { startRating: 1000, k: 24 };

/** Standard Elo expected score for player/team A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rating/engine.ts src/lib/rating/engine.test.ts
git commit -m "feat: add Elo expectedScore and rating config"
```

---

## Task 4: Rating engine — `computeTrack` (single-track replay)

**Files:**
- Modify: `src/lib/rating/engine.ts`
- Test: `src/lib/rating/engine.test.ts`

**Interfaces:**
- Consumes: `GameInput` from `$lib/types`; `expectedScore`, `RatingConfig`, `DEFAULT_CONFIG`.
- Produces:
  - `interface Snapshot { gameId: number; playedAt: string; playerId: number; ratingBefore: number; ratingAfter: number; delta: number; }`
  - `interface TrackResult { current: Record<number, number>; history: Snapshot[]; }`
  - `computeTrack(games: GameInput[], config?: RatingConfig): TrackResult` — replays games in chronological order (by `playedAt`, tiebreak `id`); team rating = average of members' current ratings (default `startRating` if unseen); shared delta `k * (actual - expected)` applied to every member.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/rating/engine.test.ts`:

```ts
import { computeTrack } from './engine';
import type { GameInput } from '$lib/types';

const g = (over: Partial<GameInput> & Pick<GameInput, 'id' | 'playedAt' | 'winnerSide' | 'sideA' | 'sideB'>): GameInput => ({
	format: '2v2',
	...over
});

describe('computeTrack', () => {
	it('returns empty state for no games', () => {
		const r = computeTrack([]);
		expect(r.current).toEqual({});
		expect(r.history).toEqual([]);
	});

	it('applies a symmetric ±K delta for an even 2v2 (all start equal)', () => {
		const r = computeTrack([
			g({ id: 1, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		]);
		// equal ratings => E = 0.5 => delta = 24 * (1 - 0.5) = 12 for winners, -12 for losers
		expect(r.current[1]).toBeCloseTo(1012, 6);
		expect(r.current[2]).toBeCloseTo(1012, 6);
		expect(r.current[3]).toBeCloseTo(988, 6);
		expect(r.current[4]).toBeCloseTo(988, 6);
	});

	it('records a chronological history snapshot per participant per game', () => {
		const r = computeTrack([
			g({ id: 7, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		]);
		expect(r.history).toHaveLength(4);
		const p1 = r.history.find((h) => h.playerId === 1)!;
		expect(p1).toMatchObject({ gameId: 7, ratingBefore: 1000, ratingAfter: 1012, delta: 12 });
	});

	it('processes games in chronological order regardless of input order', () => {
		const later = g({ id: 2, playedAt: '2026-01-02T10:00:00Z', winnerSide: 'B', sideA: [1, 2], sideB: [3, 4] });
		const earlier = g({ id: 1, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] });
		const r = computeTrack([later, earlier]);
		// game1: 1&2 -> 1012, 3&4 -> 988. game2: B wins; teamA=1012, teamB=988
		// E_A = 1/(1+10^((988-1012)/400)) ≈ 0.5345; A loses => delta_A = 24*(0-0.5345) ≈ -12.83
		expect(r.current[1]).toBeCloseTo(1012 - 12.828, 2);
		expect(r.current[3]).toBeCloseTo(988 + 12.828, 2);
	});

	it('does not mutate the input array', () => {
		const games = [
			g({ id: 2, playedAt: '2026-01-02T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] }),
			g({ id: 1, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		];
		computeTrack(games);
		expect(games[0].id).toBe(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: FAIL — `computeTrack` not exported.

- [ ] **Step 3: Implement `computeTrack`**

Add to `src/lib/rating/engine.ts`:

```ts
import type { GameInput } from '$lib/types';

export interface Snapshot {
	gameId: number;
	playedAt: string;
	playerId: number;
	ratingBefore: number;
	ratingAfter: number;
	delta: number;
}

export interface TrackResult {
	/** playerId -> current rating. Only contains players who have played in this track. */
	current: Record<number, number>;
	/** One snapshot per participant per game, in chronological order. */
	history: Snapshot[];
}

function chronological(games: GameInput[]): GameInput[] {
	return [...games].sort((a, b) =>
		a.playedAt === b.playedAt ? a.id - b.id : a.playedAt < b.playedAt ? -1 : 1
	);
}

export function computeTrack(games: GameInput[], config: RatingConfig = DEFAULT_CONFIG): TrackResult {
	const current: Record<number, number> = {};
	const history: Snapshot[] = [];
	const ratingOf = (id: number) => current[id] ?? config.startRating;

	for (const game of chronological(games)) {
		const teamA = game.sideA.reduce((s, id) => s + ratingOf(id), 0) / game.sideA.length;
		const teamB = game.sideB.reduce((s, id) => s + ratingOf(id), 0) / game.sideB.length;
		const eA = expectedScore(teamA, teamB);
		const actualA = game.winnerSide === 'A' ? 1 : 0;
		const deltaA = config.k * (actualA - eA);
		const deltaB = config.k * (1 - actualA - (1 - eA));

		const apply = (ids: number[], delta: number) => {
			for (const id of ids) {
				const before = ratingOf(id);
				const after = before + delta;
				current[id] = after;
				history.push({
					gameId: game.id,
					playedAt: game.playedAt,
					playerId: id,
					ratingBefore: before,
					ratingAfter: after,
					delta
				});
			}
		};

		apply(game.sideA, deltaA);
		apply(game.sideB, deltaB);
	}

	return { current, history };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rating/engine.ts src/lib/rating/engine.test.ts
git commit -m "feat: add single-track Elo replay (computeTrack)"
```

---

## Task 5: Rating engine — `computeRatings` (three tracks)

**Files:**
- Modify: `src/lib/rating/engine.ts`
- Test: `src/lib/rating/engine.test.ts`

**Interfaces:**
- Consumes: `computeTrack`, `TrackResult`.
- Produces:
  - `interface RatingResult { total: TrackResult; '2v2': TrackResult; '3v3': TrackResult; }`
  - `computeRatings(games: GameInput[], config?: RatingConfig): RatingResult` — `total` over all games, `'2v2'`/`'3v3'` over format-filtered games.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/rating/engine.test.ts`:

```ts
import { computeRatings } from './engine';

describe('computeRatings', () => {
	it('computes three independent tracks filtered by format', () => {
		const games: GameInput[] = [
			{ id: 1, playedAt: '2026-01-01T10:00:00Z', format: '2v2', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] },
			{ id: 2, playedAt: '2026-01-02T10:00:00Z', format: '3v3', winnerSide: 'A', sideA: [1, 2, 5], sideB: [3, 4, 6] }
		];
		const r = computeRatings(games);
		// total sees both games; 2v2 sees only game 1; 3v3 sees only game 2
		expect(Object.keys(r['2v2'].current).sort()).toEqual(['1', '2', '3', '4']);
		expect(Object.keys(r['3v3'].current).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
		// player 5 only exists in 3v3 and total, never in 2v2
		expect(r['2v2'].current[5]).toBeUndefined();
		expect(r['3v3'].current[5]).toBeGreaterThan(1000);
		expect(r.total.current[5]).toBeGreaterThan(1000);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: FAIL — `computeRatings` not exported.

- [ ] **Step 3: Implement `computeRatings`**

Add to `src/lib/rating/engine.ts`:

```ts
export interface RatingResult {
	total: TrackResult;
	'2v2': TrackResult;
	'3v3': TrackResult;
}

export function computeRatings(games: GameInput[], config: RatingConfig = DEFAULT_CONFIG): RatingResult {
	return {
		total: computeTrack(games, config),
		'2v2': computeTrack(games.filter((g) => g.format === '2v2'), config),
		'3v3': computeTrack(games.filter((g) => g.format === '3v3'), config)
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/rating/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rating/engine.ts src/lib/rating/engine.test.ts
git commit -m "feat: add three-track rating computation (total/2v2/3v3)"
```

---

## Task 6: Player stats — filters, wins, win rate, streak

**Files:**
- Create: `src/lib/stats/aggregate.ts`, `src/lib/stats/aggregate.test.ts`

**Interfaces:**
- Consumes: `GameInput`, `Track`, `DateRange` from `$lib/types`.
- Produces:
  - `interface StatsOpts { track: Track; range: DateRange; now: Date; }`
  - `filterGames(games: GameInput[], opts: StatsOpts): GameInput[]` — filters by format (track) and date range.
  - `interface PlayerStats { playerId: number; games: number; wins: number; losses: number; winRate: number; streak: number; }` — `winRate` in `[0,1]` (0 when no games); `streak` signed (positive = current win streak, negative = current loss streak, 0 = no games).
  - `playerStats(games: GameInput[], playerId: number, opts: StatsOpts): PlayerStats`
  - `allPlayerStats(games: GameInput[], playerIds: number[], opts: StatsOpts): PlayerStats[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/stats/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterGames, playerStats, allPlayerStats } from './aggregate';
import type { GameInput } from '$lib/types';

const NOW = new Date('2026-01-31T12:00:00Z');

const games: GameInput[] = [
	{ id: 1, playedAt: '2026-01-01T10:00:00Z', format: '2v2', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] },
	{ id: 2, playedAt: '2026-01-15T10:00:00Z', format: '3v3', winnerSide: 'B', sideA: [1, 2, 5], sideB: [3, 4, 6] },
	{ id: 3, playedAt: '2026-01-30T10:00:00Z', format: '2v2', winnerSide: 'B', sideA: [1, 2], sideB: [4, 6] }
];

describe('filterGames', () => {
	it('filters by format track', () => {
		expect(filterGames(games, { track: '2v2', range: 'all', now: NOW }).map((g) => g.id)).toEqual([1, 3]);
		expect(filterGames(games, { track: '3v3', range: 'all', now: NOW }).map((g) => g.id)).toEqual([2]);
		expect(filterGames(games, { track: 'total', range: 'all', now: NOW }).map((g) => g.id)).toEqual([1, 2, 3]);
	});

	it('filters by date range (week = last 7 days, month = last 30 days)', () => {
		expect(filterGames(games, { track: 'total', range: 'week', now: NOW }).map((g) => g.id)).toEqual([3]);
		expect(filterGames(games, { track: 'total', range: 'month', now: NOW }).map((g) => g.id)).toEqual([2, 3]);
	});
});

describe('playerStats', () => {
	it('counts wins/losses/winRate for a player across all games', () => {
		// player 1: game1 sideA wins (W), game2 sideA loses (L), game3 sideA loses (L)
		const s = playerStats(games, 1, { track: 'total', range: 'all', now: NOW });
		expect(s).toMatchObject({ playerId: 1, games: 3, wins: 1, losses: 2 });
		expect(s.winRate).toBeCloseTo(1 / 3, 6);
	});

	it('returns zeros and winRate 0 for a player with no games in filter', () => {
		const s = playerStats(games, 5, { track: '2v2', range: 'all', now: NOW });
		expect(s).toEqual({ playerId: 5, games: 0, wins: 0, losses: 0, winRate: 0, streak: 0 });
	});

	it('computes a signed current streak (most recent games)', () => {
		// player 4: game1 L, game2 W, game3 W -> current streak +2
		expect(playerStats(games, 4, { track: 'total', range: 'all', now: NOW }).streak).toBe(2);
		// player 2: game1 W, game2 L, game3 L -> current streak -2
		expect(playerStats(games, 2, { track: 'total', range: 'all', now: NOW }).streak).toBe(-2);
	});
});

describe('allPlayerStats', () => {
	it('returns one entry per requested player id', () => {
		const rows = allPlayerStats(games, [1, 2, 3, 4], { track: 'total', range: 'all', now: NOW });
		expect(rows.map((r) => r.playerId)).toEqual([1, 2, 3, 4]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/stats/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `aggregate.ts`**

Create `src/lib/stats/aggregate.ts`:

```ts
import type { GameInput, Track, DateRange } from '$lib/types';

export interface StatsOpts {
	track: Track;
	range: DateRange;
	now: Date;
}

export interface PlayerStats {
	playerId: number;
	games: number;
	wins: number;
	losses: number;
	/** [0,1]; 0 when no games. */
	winRate: number;
	/** Signed current streak: >0 win streak, <0 loss streak, 0 = no games. */
	streak: number;
}

function rangeStart(range: DateRange, now: Date): number {
	if (range === 'all') return -Infinity;
	const days = range === 'week' ? 7 : 30;
	return now.getTime() - days * 24 * 60 * 60 * 1000;
}

export function filterGames(games: GameInput[], opts: StatsOpts): GameInput[] {
	const start = rangeStart(opts.range, opts.now);
	return games.filter((g) => {
		if (opts.track !== 'total' && g.format !== opts.track) return false;
		return new Date(g.playedAt).getTime() >= start;
	});
}

function playerGames(games: GameInput[], playerId: number): { game: GameInput; won: boolean }[] {
	return games
		.filter((g) => g.sideA.includes(playerId) || g.sideB.includes(playerId))
		.map((g) => ({
			game: g,
			won: (g.winnerSide === 'A' ? g.sideA : g.sideB).includes(playerId)
		}))
		.sort((a, b) =>
			a.game.playedAt === b.game.playedAt
				? a.game.id - b.game.id
				: a.game.playedAt < b.game.playedAt
					? -1
					: 1
		);
}

export function playerStats(games: GameInput[], playerId: number, opts: StatsOpts): PlayerStats {
	const relevant = playerGames(filterGames(games, opts), playerId);
	const wins = relevant.filter((r) => r.won).length;
	const total = relevant.length;
	const losses = total - wins;

	let streak = 0;
	for (let i = relevant.length - 1; i >= 0; i--) {
		const won = relevant[i].won;
		if (i === relevant.length - 1) streak = won ? 1 : -1;
		else if (won && streak > 0) streak++;
		else if (!won && streak < 0) streak--;
		else break;
	}

	return {
		playerId,
		games: total,
		wins,
		losses,
		winRate: total === 0 ? 0 : wins / total,
		streak
	};
}

export function allPlayerStats(
	games: GameInput[],
	playerIds: number[],
	opts: StatsOpts
): PlayerStats[] {
	return playerIds.map((id) => playerStats(games, id, opts));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/stats/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/aggregate.ts src/lib/stats/aggregate.test.ts
git commit -m "feat: add player stats (wins, win rate, streak) with filters"
```

---

## Task 7: Team-combo stats

**Files:**
- Create: `src/lib/stats/teams.ts`, `src/lib/stats/teams.test.ts`

**Interfaces:**
- Consumes: `GameInput` from `$lib/types`; `StatsOpts`, `filterGames` from `./aggregate`.
- Produces:
  - `interface TeamRecord { playerIds: number[]; games: number; wins: number; losses: number; winRate: number; }` — `playerIds` sorted ascending.
  - `teamStats(games: GameInput[], opts: StatsOpts): TeamRecord[]` — one record per distinct line-up (set of players on a side), aggregated across every game/side that line-up appeared, sorted by `games` desc then `winRate` desc.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/stats/teams.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { teamStats } from './teams';
import type { GameInput } from '$lib/types';

const NOW = new Date('2026-02-01T12:00:00Z');

const games: GameInput[] = [
	{ id: 1, playedAt: '2026-01-01T10:00:00Z', format: '2v2', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] },
	{ id: 2, playedAt: '2026-01-02T10:00:00Z', format: '2v2', winnerSide: 'B', sideA: [3, 4], sideB: [2, 1] }
];

describe('teamStats', () => {
	it('aggregates a line-up across games regardless of side order', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		const team12 = rows.find((r) => r.playerIds.join('-') === '1-2')!;
		// [1,2] won game1 (side A) and lost game2 (side B)
		expect(team12).toMatchObject({ games: 2, wins: 1, losses: 1 });
		expect(team12.winRate).toBeCloseTo(0.5, 6);
	});

	it('normalizes player id order within a line-up', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		expect(rows.every((r) => r.playerIds.join(',') === [...r.playerIds].sort((a, b) => a - b).join(','))).toBe(true);
	});

	it('sorts by games desc then winRate desc', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		for (let i = 1; i < rows.length; i++) {
			const prev = rows[i - 1];
			const cur = rows[i];
			expect(prev.games > cur.games || (prev.games === cur.games && prev.winRate >= cur.winRate)).toBe(true);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/stats/teams.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `teams.ts`**

Create `src/lib/stats/teams.ts`:

```ts
import type { GameInput } from '$lib/types';
import { filterGames, type StatsOpts } from './aggregate';

export interface TeamRecord {
	/** Sorted ascending. */
	playerIds: number[];
	games: number;
	wins: number;
	losses: number;
	winRate: number;
}

export function teamStats(games: GameInput[], opts: StatsOpts): TeamRecord[] {
	const acc = new Map<string, { playerIds: number[]; games: number; wins: number }>();

	const record = (ids: number[], won: boolean) => {
		const sorted = [...ids].sort((a, b) => a - b);
		const key = sorted.join('-');
		const entry = acc.get(key) ?? { playerIds: sorted, games: 0, wins: 0 };
		entry.games++;
		if (won) entry.wins++;
		acc.set(key, entry);
	};

	for (const g of filterGames(games, opts)) {
		record(g.sideA, g.winnerSide === 'A');
		record(g.sideB, g.winnerSide === 'B');
	}

	return [...acc.values()]
		.map((e) => ({
			playerIds: e.playerIds,
			games: e.games,
			wins: e.wins,
			losses: e.games - e.wins,
			winRate: e.games === 0 ? 0 : e.wins / e.games
		}))
		.sort((a, b) => (b.games !== a.games ? b.games - a.games : b.winRate - a.winRate));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/stats/teams.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/teams.ts src/lib/stats/teams.test.ts
git commit -m "feat: add team line-up records"
```

---

## Task 8: Database schema + Drizzle config + migrations

**Files:**
- Create: `src/lib/server/db/schema.ts`, `drizzle.config.ts`, `src/lib/server/db/index.ts`
- Create (generated): `drizzle/` migration SQL

**Interfaces:**
- Produces: Drizzle table objects `players`, `games`, `gameParticipants`, enums `formatEnum`, `sideEnum` (exported from `schema.ts`); prod `db` client (exported from `index.ts`); generated SQL migrations in `./drizzle`.

- [ ] **Step 1: Write the schema**

Create `src/lib/server/db/schema.ts`:

```ts
import { pgTable, serial, text, boolean, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';

export const formatEnum = pgEnum('format', ['2v2', '3v3']);
export const sideEnum = pgEnum('side', ['A', 'B']);

export const players = pgTable('players', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	avatar: text('avatar'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const games = pgTable('games', {
	id: serial('id').primaryKey(),
	playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
	format: formatEnum('format').notNull(),
	winnerSide: sideEnum('winner_side').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const gameParticipants = pgTable('game_participants', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id')
		.notNull()
		.references(() => games.id, { onDelete: 'cascade' }),
	playerId: integer('player_id')
		.notNull()
		.references(() => players.id),
	side: sideEnum('side').notNull()
});
```

- [ ] **Step 2: Write the Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL ?? '' }
});
```

- [ ] **Step 3: Write the prod DB client**

Create `src/lib/server/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Generate migrations**

Run: `npx drizzle-kit generate`
Expected: creates `./drizzle/0000_*.sql` and a `meta` folder. Inspect the SQL — it must create the two enums and three tables.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/index.ts drizzle.config.ts drizzle/
git commit -m "feat: add Drizzle schema, client, and initial migration"
```

---

## Task 9: Pure row shaper — `toGameInputs`

**Files:**
- Create: `src/lib/server/db/shape.ts`, `src/lib/server/db/shape.test.ts`

**Interfaces:**
- Consumes: `GameInput`, `Side`, `Format` from `$lib/types`.
- Produces:
  - `interface GameRow { id: number; playedAt: Date; format: Format; winnerSide: Side; }`
  - `interface ParticipantRow { gameId: number; playerId: number; side: Side; }`
  - `toGameInputs(gameRows: GameRow[], participantRows: ParticipantRow[]): GameInput[]` — joins participants onto games, producing `GameInput` with `playedAt` as ISO string and `sideA`/`sideB` player-id arrays (each sorted ascending), ordered by `playedAt` then `id`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/db/shape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toGameInputs } from './shape';

describe('toGameInputs', () => {
	it('joins participants into sideA/sideB and ISO playedAt', () => {
		const result = toGameInputs(
			[{ id: 1, playedAt: new Date('2026-01-01T10:00:00Z'), format: '2v2', winnerSide: 'A' }],
			[
				{ gameId: 1, playerId: 2, side: 'A' },
				{ gameId: 1, playerId: 1, side: 'A' },
				{ gameId: 1, playerId: 4, side: 'B' },
				{ gameId: 1, playerId: 3, side: 'B' }
			]
		);
		expect(result).toEqual([
			{
				id: 1,
				playedAt: '2026-01-01T10:00:00.000Z',
				format: '2v2',
				winnerSide: 'A',
				sideA: [1, 2],
				sideB: [3, 4]
			}
		]);
	});

	it('orders games chronologically then by id', () => {
		const result = toGameInputs(
			[
				{ id: 2, playedAt: new Date('2026-01-02T10:00:00Z'), format: '2v2', winnerSide: 'A' },
				{ id: 1, playedAt: new Date('2026-01-01T10:00:00Z'), format: '2v2', winnerSide: 'A' }
			],
			[
				{ gameId: 1, playerId: 1, side: 'A' },
				{ gameId: 1, playerId: 2, side: 'B' },
				{ gameId: 2, playerId: 1, side: 'A' },
				{ gameId: 2, playerId: 2, side: 'B' }
			]
		);
		expect(result.map((g) => g.id)).toEqual([1, 2]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/server/db/shape.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shape.ts`**

Create `src/lib/server/db/shape.ts`:

```ts
import type { GameInput, Side, Format } from '$lib/types';

export interface GameRow {
	id: number;
	playedAt: Date;
	format: Format;
	winnerSide: Side;
}

export interface ParticipantRow {
	gameId: number;
	playerId: number;
	side: Side;
}

export function toGameInputs(gameRows: GameRow[], participantRows: ParticipantRow[]): GameInput[] {
	const byGame = new Map<number, { A: number[]; B: number[] }>();
	for (const p of participantRows) {
		const entry = byGame.get(p.gameId) ?? { A: [], B: [] };
		entry[p.side].push(p.playerId);
		byGame.set(p.gameId, entry);
	}

	return gameRows
		.map((g) => {
			const sides = byGame.get(g.id) ?? { A: [], B: [] };
			return {
				id: g.id,
				playedAt: g.playedAt.toISOString(),
				format: g.format,
				winnerSide: g.winnerSide,
				sideA: [...sides.A].sort((a, b) => a - b),
				sideB: [...sides.B].sort((a, b) => a - b)
			};
		})
		.sort((a, b) => (a.playedAt === b.playedAt ? a.id - b.id : a.playedAt < b.playedAt ? -1 : 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/server/db/shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/shape.ts src/lib/server/db/shape.test.ts
git commit -m "feat: add pure DB-row-to-GameInput shaper"
```

---

## Task 10: Query layer + PGlite integration tests

**Files:**
- Create: `src/lib/server/db/queries.ts`, `src/lib/server/db/test-db.ts`, `src/lib/server/db/queries.test.ts`

**Interfaces:**
- Consumes: `schema` from `./schema`; `toGameInputs` from `./shape`; `Player`, `GameInput`, `Format`, `Side` from `$lib/types`.
- Produces (all take the Drizzle db as first arg so tests can inject a PGlite instance; type it as `PgDatabase<any, typeof schema>` from `drizzle-orm/pg-core`):
  - `getPlayers(db): Promise<Player[]>` — ordered by name.
  - `getPlayer(db, id: number): Promise<Player | null>`
  - `addPlayer(db, name: string, avatar?: string | null): Promise<Player>`
  - `setPlayerActive(db, id: number, isActive: boolean): Promise<void>`
  - `insertGame(db, input: { playedAt: string; format: Format; winnerSide: Side; sideA: number[]; sideB: number[] }): Promise<number>` — inserts the game and its participants in one transaction; returns the new game id.
  - `getAllGames(db): Promise<GameInput[]>` — reads all games + participants, returns via `toGameInputs`.
- Note: convert DB `Date`/timestamp values to ISO strings and `is_active` to `isActive` when mapping to `Player`.

- [ ] **Step 1: Create the PGlite test-db factory**

Create `src/lib/server/db/test-db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

/** Creates a fresh in-process Postgres with migrations applied. For tests only. */
export async function makeTestDb() {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });
	return db;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/server/db/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, getPlayers, getPlayer, setPlayerActive, insertGame, getAllGames } from './queries';

let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
	db = await makeTestDb();
});

describe('players', () => {
	it('adds and lists players ordered by name', async () => {
		await addPlayer(db, 'Zoe');
		await addPlayer(db, 'Ada');
		const players = await getPlayers(db);
		expect(players.map((p) => p.name)).toEqual(['Ada', 'Zoe']);
		expect(players[0]).toMatchObject({ isActive: true });
		expect(typeof players[0].createdAt).toBe('string');
	});

	it('rejects duplicate names', async () => {
		await addPlayer(db, 'Ada');
		await expect(addPlayer(db, 'Ada')).rejects.toBeTruthy();
	});

	it('fetches a single player and toggles active', async () => {
		const p = await addPlayer(db, 'Ada');
		await setPlayerActive(db, p.id, false);
		expect((await getPlayer(db, p.id))?.isActive).toBe(false);
		expect(await getPlayer(db, 9999)).toBeNull();
	});
});

describe('games', () => {
	it('inserts a game with participants and reads it back as GameInput', async () => {
		const [a, b, c, d] = await Promise.all([
			addPlayer(db, 'A'),
			addPlayer(db, 'B'),
			addPlayer(db, 'C'),
			addPlayer(db, 'D')
		]);
		const id = await insertGame(db, {
			playedAt: '2026-01-01T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id]
		});
		expect(id).toBeGreaterThan(0);

		const games = await getAllGames(db);
		expect(games).toHaveLength(1);
		expect(games[0]).toMatchObject({
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id].sort((x, y) => x - y),
			sideB: [c.id, d.id].sort((x, y) => x - y)
		});
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run src/lib/server/db/queries.test.ts`
Expected: FAIL — `queries` module not found.

- [ ] **Step 4: Implement `queries.ts`**

Create `src/lib/server/db/queries.ts`:

```ts
import { eq, asc } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { players, games, gameParticipants } from './schema';
import { toGameInputs, type GameRow, type ParticipantRow } from './shape';
import type { Player, GameInput, Format, Side } from '$lib/types';

type DB = PgDatabase<any, typeof schema>;

function toPlayer(row: typeof players.$inferSelect): Player {
	return {
		id: row.id,
		name: row.name,
		avatar: row.avatar,
		isActive: row.isActive,
		createdAt: row.createdAt.toISOString()
	};
}

export async function getPlayers(db: DB): Promise<Player[]> {
	const rows = await db.select().from(players).orderBy(asc(players.name));
	return rows.map(toPlayer);
}

export async function getPlayer(db: DB, id: number): Promise<Player | null> {
	const rows = await db.select().from(players).where(eq(players.id, id));
	return rows[0] ? toPlayer(rows[0]) : null;
}

export async function addPlayer(db: DB, name: string, avatar?: string | null): Promise<Player> {
	const rows = await db
		.insert(players)
		.values({ name, avatar: avatar ?? null })
		.returning();
	return toPlayer(rows[0]);
}

export async function setPlayerActive(db: DB, id: number, isActive: boolean): Promise<void> {
	await db.update(players).set({ isActive }).where(eq(players.id, id));
}

export async function insertGame(
	db: DB,
	input: { playedAt: string; format: Format; winnerSide: Side; sideA: number[]; sideB: number[] }
): Promise<number> {
	return db.transaction(async (tx) => {
		const [game] = await tx
			.insert(games)
			.values({
				playedAt: new Date(input.playedAt),
				format: input.format,
				winnerSide: input.winnerSide
			})
			.returning({ id: games.id });

		const rows = [
			...input.sideA.map((playerId) => ({ gameId: game.id, playerId, side: 'A' as Side })),
			...input.sideB.map((playerId) => ({ gameId: game.id, playerId, side: 'B' as Side }))
		];
		await tx.insert(gameParticipants).values(rows);
		return game.id;
	});
}

export async function getAllGames(db: DB): Promise<GameInput[]> {
	const gameRows = (await db.select().from(games)) as GameRow[];
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	return toGameInputs(gameRows, participantRows);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/lib/server/db/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/queries.ts src/lib/server/db/test-db.ts src/lib/server/db/queries.test.ts
git commit -m "feat: add DB query layer with PGlite integration tests"
```

---

## Task 11: Auth module (shared password)

**Files:**
- Create: `src/lib/server/auth.ts`, `src/lib/server/auth.test.ts`

**Interfaces:**
- Consumes: `MINDBUG_PASSWORD`, `AUTH_SECRET` via `$env/dynamic/private`; `redirect` from `@sveltejs/kit`.
- Produces:
  - `verifyPassword(input: string): boolean` — timing-safe compare against `MINDBUG_PASSWORD`.
  - `AUTH_COOKIE = 'mb_auth'`, `cookieValue(): string` — HMAC token.
  - `isAuthed(cookies: { get(name: string): string | undefined }): boolean`
  - `authCookieOptions()` — `{ path, httpOnly, sameSite, secure, maxAge }`.
  - `requireAuth(cookies)` — throws `redirect(303, '/login')` when not authed.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
	vi.stubEnv('MINDBUG_PASSWORD', 'hunter2');
	vi.stubEnv('AUTH_SECRET', 'test-secret');
});

describe('auth', () => {
	it('verifies the shared password (timing-safe)', async () => {
		const { verifyPassword } = await import('./auth');
		expect(verifyPassword('hunter2')).toBe(true);
		expect(verifyPassword('wrong')).toBe(false);
		expect(verifyPassword('')).toBe(false);
	});

	it('issues a cookie value that isAuthed accepts and rejects tampering', async () => {
		const { cookieValue, isAuthed, AUTH_COOKIE } = await import('./auth');
		const value = cookieValue();
		const good = { get: (n: string) => (n === AUTH_COOKIE ? value : undefined) };
		const bad = { get: (n: string) => (n === AUTH_COOKIE ? value + 'x' : undefined) };
		const none = { get: () => undefined };
		expect(isAuthed(good)).toBe(true);
		expect(isAuthed(bad)).toBe(false);
		expect(isAuthed(none)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/server/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `auth.ts`**

Create `src/lib/server/auth.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const AUTH_COOKIE = 'mb_auth';

function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifyPassword(input: string): boolean {
	return safeEqual(input, env.MINDBUG_PASSWORD ?? '');
}

export function cookieValue(): string {
	return createHmac('sha256', env.AUTH_SECRET ?? '').update('authorized').digest('hex');
}

export function isAuthed(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	return value !== undefined && safeEqual(value, cookieValue());
}

export function authCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: true,
		maxAge: 60 * 60 * 24 * 365
	};
}

export function requireAuth(cookies: { get(name: string): string | undefined }): void {
	if (!isAuthed(cookies)) throw redirect(303, '/login');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/server/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth.ts src/lib/server/auth.test.ts
git commit -m "feat: add shared-password auth with signed cookie"
```

---

## Task 12: Design foundation (Mindbug look) + app shell

**Files:**
- Modify: `src/app.html`, `src/app.css`, `src/routes/+layout.svelte`
- Create: `src/lib/components/Nav.svelte`

**Interfaces:**
- Produces: the finalized design system as global CSS custom properties + component classes (`.card`, `.tile`, `.rankchip`, `.art`, `.chip`, `.power`, `.podium`, `.bigcard`, `.btn`, `.pill`, tab/segment controls, form controls, nav); a responsive `Nav` (bottom bar on mobile, left rail on desktop); the two-column app shell. No tests (visual/structural); verified by build + dev render.

**Design source of truth:** `docs/superpowers/design/mindbug-ui-reference.html` — the approved mockup. It shows the exact palette, the stepped top-3 podium, the full-width creature-card tiles with their chips/states, and both the desktop (nav rail · podium · tiles) and mobile layouts. Match it. The CSS below is ported from it; if anything here is ambiguous, the reference wins.

**Chosen direction:** "Dark · Creature Tiles" — a dark teal game-mat, cream creature-card surfaces, gold for the champion, coral for actions; geometric display type (Poppins, standing in for the Futura-style Mindbug wordmark) + Nunito body. Gradients are deliberately subtle; all card borders are uniform (no oversized winner lip).

Note: When building the `RatingChart` later (Task 16), consult the `dataviz` skill before writing chart code — use the teal/coral/gold accents from these tokens for its series.

- [ ] **Step 1: Import offline fonts and write the design system in `app.css`**

Replace `src/app.css` with:

```css
/* Fonts come from the system-font fallback stacks in --display / --body below.
   No @fontsource imports — the npm supply-chain guard blocks those packages. */

:root {
	/* ground + surfaces */
	--mat: #0b4744;
	--mat-2: #0e5a56;
	--mat-top: #0d534e;
	--card: #f3e6c6;
	--card-hi: #f8efd6;
	--edge: #c99a3f;
	--gold: #e0a52a;
	--gold-2: #f4d271;
	--ink: #2a2014;
	--muted: #7c6a48;
	--line-card: #ddc99c;
	/* accents */
	--teal: #17b3a6;
	--coral: #ef6a4d;
	--pink: #d24f96;
	--up: #0f8f6a;
	--down: #d64a37;
	/* text on the dark mat */
	--onmat: #ecfaf7;
	--onmat-muted: #9fd0ca;
	/* misc */
	--gold-grad: linear-gradient(160deg, #ecc25a, #dfa528);
	--radius: 16px;
	--radius-sm: 11px;
	--display: 'Poppins', 'Century Gothic', system-ui, sans-serif;
	--body: 'Nunito', system-ui, sans-serif;

	/* Semantic aliases so the form/profile components (Tasks 13, 15–17) that were
	   authored against these names render consistently on the cream-card theme.
	   Everything inside a `.card` is dark-on-cream; these map the old names onto
	   the new palette. */
	--surface: var(--card-hi); /* raised cream sub-panel */
	--surface-2: #e7d6ad; /* tan control/track */
	--bg: #fbf4e2; /* input field background (light cream) */
	--accent: var(--teal); /* primary accent */
	--accent-2: var(--pink);
	--accent-3: var(--gold);
	--danger: var(--down);
	--shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
}

* {
	box-sizing: border-box;
}

html,
body {
	margin: 0;
	background: radial-gradient(120% 80% at 50% 0%, var(--mat-top) 0%, var(--mat) 60%) fixed;
	color: var(--onmat);
	font-family: var(--body);
	-webkit-font-smoothing: antialiased;
	min-height: 100vh;
}

h1,
h2,
h3 {
	font-family: var(--display);
	letter-spacing: 0.01em;
	line-height: 1.1;
	color: var(--gold-2);
}

a {
	color: var(--teal);
}

/* cream card surface */
.card {
	background: var(--card);
	color: var(--ink);
	border: 2px solid var(--edge);
	border-radius: var(--radius);
	box-shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
	padding: 0.9rem 1rem;
}

/* coral action button */
.btn {
	font-family: var(--display);
	border: none;
	border-radius: var(--radius-sm);
	padding: 0.7rem 1.1rem;
	background: var(--coral);
	color: #fff;
	cursor: pointer;
	font-weight: 800;
	font-size: 0.95rem;
}
.btn.secondary {
	background: #e7d6ad;
	color: var(--muted);
}
.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* stat chip (on cream cards) */
.chip {
	font-size: 0.68rem;
	font-weight: 800;
	padding: 0.12rem 0.45rem;
	border-radius: 999px;
	background: #e7d6ad;
	color: var(--muted);
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}
.chip.w {
	background: #d7efe0;
	color: var(--up);
}
.chip.l {
	background: #f6ddd4;
	color: var(--down);
}
.chip.none {
	opacity: 0.75;
}

/* pill (on the dark mat) */
.pill {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.2rem 0.6rem;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.24);
	color: var(--onmat-muted);
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

/* tab + segment controls (Players/Teams, Total/2v2/3v3) */
.tabset,
.segset {
	display: inline-flex;
	gap: 3px;
	border-radius: 999px;
	padding: 3px;
	background: rgba(0, 0, 0, 0.26);
}
.tabset button,
.segset button {
	font-family: var(--display);
	font-size: 0.72rem;
	font-weight: 800;
	padding: 0.34rem 0.72rem;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--onmat-muted);
	cursor: pointer;
}
.tabset button.on,
.segset button.on {
	background: var(--gold-grad);
	color: #2a2014;
}

/* creature avatar art frame */
.art {
	border-radius: 9px;
	display: grid;
	place-items: center;
	background: linear-gradient(155deg, #31b7a9, #0e7a74);
	border: 1.5px solid var(--edge);
}
.art.gold {
	background: linear-gradient(155deg, #edca66, #cf9a2c);
}

/* content width + bottom padding for the fixed mobile nav */
.wrap {
	width: 100%;
	max-width: 760px;
	margin: 0 auto;
	padding: 1.1rem 1rem 6rem;
}

@media (min-width: 820px) {
	.wrap {
		padding-bottom: 2rem;
	}
}
```

- [ ] **Step 2: Wire the manifest + theme color in `app.html`**

In `src/app.html`, inside `<head>`, add (keep the existing `%sveltekit.head%`):

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0b4744" />
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
```

- [ ] **Step 3: Build the responsive `Nav` component**

Create `src/lib/components/Nav.svelte` — a bottom bar on mobile, a left rail (with the brand) on desktop:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	const links = [
		{ href: '/', label: 'Board', icon: '📊' },
		{ href: '/players', label: 'Players', icon: '👾' },
		{ href: '/log', label: 'Log', icon: '➕' }
	];
	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<nav>
	<div class="brand"><span class="bug">🐛</span> Mindbug</div>
	{#each links as l}
		<a href={l.href} class:on={isActive(l.href)}>
			<span class="icon">{l.icon}</span><span class="label">{l.label}</span>
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		justify-content: space-around;
		align-items: center;
		background: rgba(0, 0, 0, 0.32);
		backdrop-filter: blur(8px);
		border-top: 1px solid rgba(0, 0, 0, 0.3);
		padding: 0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom));
	}
	.brand {
		display: none;
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--onmat-muted);
		text-decoration: none;
		padding: 0.3rem 0.6rem;
		border-radius: 10px;
	}
	a .icon {
		font-size: 1.05rem;
	}
	a.on {
		color: #2a2014;
		background: var(--gold-grad);
	}

	@media (min-width: 820px) {
		nav {
			position: sticky;
			top: 0;
			bottom: auto;
			height: 100vh;
			flex-direction: column;
			justify-content: flex-start;
			align-items: stretch;
			gap: 0.35rem;
			width: 100%;
			padding: 1.2rem 0.9rem;
			border-top: 0;
			border-right: 1px solid rgba(0, 0, 0, 0.3);
			backdrop-filter: none;
		}
		.brand {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-family: var(--display);
			font-weight: 800;
			font-size: 1.1rem;
			color: var(--gold-2);
			margin-bottom: 1rem;
		}
		.brand .bug {
			font-size: 1.35rem;
		}
		a {
			flex-direction: row;
			justify-content: flex-start;
			gap: 0.55rem;
			font-size: 0.85rem;
			text-transform: none;
			letter-spacing: 0;
			padding: 0.58rem 0.7rem;
		}
	}
</style>
```

- [ ] **Step 4: Build the responsive shell layout**

Replace `src/routes/+layout.svelte` with a single-column shell on mobile that becomes a two-column (rail + content) grid on desktop:

```svelte
<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	let { children } = $props();
</script>

<div class="shell">
	<Nav />
	<main>
		<div class="wrap">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
	}
	main {
		min-width: 0;
	}
	@media (min-width: 820px) {
		.shell {
			display: grid;
			grid-template-columns: 210px 1fr;
			align-items: start;
		}
	}
</style>
```

- [ ] **Step 5: Verify build + dev render**

Run: `npm run build`
Expected: build succeeds. Then `npm run dev` and confirm: dark teal ground, a bottom nav on a narrow window that becomes a left rail past ~820px, and cream `.card` surfaces. Compare against `docs/superpowers/design/mindbug-ui-reference.html`.

- [ ] **Step 6: Commit**

```bash
git add src/app.html src/app.css src/routes/+layout.svelte src/lib/components/Nav.svelte
git commit -m "feat: add Mindbug design system, responsive shell, and nav"
```

---

## Task 13: Login page + password gate

**Files:**
- Create: `src/routes/login/+page.server.ts`, `src/routes/login/+page.svelte`

**Interfaces:**
- Consumes: `verifyPassword`, `cookieValue`, `AUTH_COOKIE`, `authCookieOptions`, `isAuthed` from `$lib/server/auth`.
- Produces: a `default` form action that sets the auth cookie on correct password and redirects to `redirectTo` (default `/log`); returns `fail(400)` with an error on wrong password.

- [ ] **Step 1: Implement the login action**

Create `src/routes/login/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { verifyPassword, cookieValue, AUTH_COOKIE, authCookieOptions } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!verifyPassword(password)) {
			return fail(400, { error: 'Wrong password' });
		}
		cookies.set(AUTH_COOKIE, cookieValue(), authCookieOptions());
		const to = url.searchParams.get('redirectTo') ?? '/log';
		throw redirect(303, to);
	}
};
```

- [ ] **Step 2: Build the login form**

Create `src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<h1>Enter the crew password</h1>
<p class="muted">You only need this to log games or manage players.</p>

<form method="POST" use:enhance class="card">
	<input type="password" name="password" placeholder="Shared password" autocomplete="current-password" />
	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<button class="btn" type="submit">Unlock</button>
</form>

<style>
	form {
		display: grid;
		gap: 0.8rem;
		margin-top: 1rem;
	}
	input {
		padding: 0.8rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-size: 1rem;
	}
	.muted {
		color: var(--muted);
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/routes/login/
git commit -m "feat: add login page and password gate"
```

---

## Task 14: Leaderboard (home) — Players & Teams tabs

**Files:**
- Create: `src/routes/+page.server.ts`, `src/lib/creatures.ts`, `src/lib/components/FilterBar.svelte`, `src/lib/components/ViewTabs.svelte`, `src/lib/components/CreatureTile.svelte`, `src/lib/components/Podium.svelte`
- Replace: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `db` from `$lib/server/db`; `getPlayers`, `getAllGames` from queries; `computeRatings` from rating engine; `allPlayerStats` from stats; `teamStats` from `$lib/stats/teams`; `Track`, `DateRange` from `$lib/types`.
- Produces: a single leaderboard `load` returning `{ view, format, range, rows, teams }` where:
  - `view` is `'players' | 'teams'` from `?view` (default `'players'`).
  - `rows` (player ranking) — each `{ player, rating, rated, games, wins, winRate, streak }`, sorted by rating desc (rated first).
  - `teams` (line-up records) — each `{ playerIds, names, avatars, games, wins, losses, winRate }`, from `teamStats`, in that function's sort order.
  - Both are always computed from one `getAllGames` call; the page renders whichever `view` selects.
- `creatureFor(id, avatar?)` in `$lib/creatures.ts` returns the player's emoji avatar, or a deterministic fallback creature from a fixed list.
- `FilterBar` reads/writes `?format` and `?range`; `ViewTabs` reads/writes `?view` (both in the page header). `CreatureTile` renders one full-width player card (rank badge · creature avatar · name · chips for games / win% / streak states · rating with its label, or `UNRATED` when the player has no games in this track). `Podium` renders the top 3 as stepped creature cards (#1 largest + gold). Teams have no Elo — they rank by record and render as `CreatureTile`s (rating slot shows the combined record).

- [ ] **Step 1: Implement the leaderboard load (both views)**

Create `src/routes/+page.server.ts`:

```ts
import { db } from '$lib/server/db';
import { getPlayers, getAllGames } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { allPlayerStats } from '$lib/stats/aggregate';
import { teamStats } from '$lib/stats/teams';
import type { Track, DateRange } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const view = (url.searchParams.get('view') ?? 'players') as 'players' | 'teams';
	const format = (url.searchParams.get('format') ?? 'total') as Track;
	const range = (url.searchParams.get('range') ?? 'all') as DateRange;
	const now = new Date();

	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));

	// Player ranking. Note: allPlayerStats takes the Track string (`format`), NOT the TrackResult.
	const track = computeRatings(games)[format];
	const stats = allPlayerStats(
		games,
		players.map((p) => p.id),
		{ track: format, range, now }
	);
	const statById = new Map(stats.map((s) => [s.playerId, s]));
	const rows = players
		.filter((p) => p.isActive)
		.map((p) => {
			const s = statById.get(p.id)!;
			const rated = track.current[p.id] !== undefined;
			return {
				player: p,
				rating: Math.round(track.current[p.id] ?? 1000),
				rated,
				games: s.games,
				wins: s.wins,
				winRate: s.winRate,
				streak: s.streak
			};
		})
		.sort((a, b) => (a.rated === b.rated ? b.rating - a.rating : a.rated ? -1 : 1));

	// Team records (no Elo — ranked by record inside teamStats).
	const teams = teamStats(games, { track: format, range, now }).map((t) => ({
		...t,
		names: t.playerIds.map((id) => nameById.get(id) ?? `#${id}`),
		avatars: t.playerIds.map((id) => avatarById.get(id) ?? null)
	}));

	return { view, format, range, rows, teams };
};
```

- [ ] **Step 2: Build `ViewTabs`**

Create `src/lib/components/ViewTabs.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	let { view }: { view: string } = $props();

	function set(value: string) {
		const url = new URL(page.url);
		url.searchParams.set('view', value);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<div class="tabs">
	<button class:on={view === 'players'} onclick={() => set('players')}>Players</button>
	<button class:on={view === 'teams'} onclick={() => set('teams')}>Teams</button>
</div>

<style>
	.tabs {
		display: flex;
		gap: 0.25rem;
		background: var(--surface);
		border-radius: 999px;
		padding: 0.3rem;
		margin-top: 0.75rem;
	}
	button {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		font-size: 0.9rem;
		padding: 0.5rem;
		border-radius: 999px;
		cursor: pointer;
	}
	button.on {
		background: var(--accent);
		color: #06231a;
	}
</style>
```

- [ ] **Step 3: Build `FilterBar`**

Create `src/lib/components/FilterBar.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	let { format, range }: { format: string; range: string } = $props();

	function setParam(key: string, value: string) {
		const url = new URL(page.url);
		url.searchParams.set(key, value);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
	const formats = [
		{ v: 'total', l: 'Total' },
		{ v: '2v2', l: '2v2' },
		{ v: '3v3', l: '3v3' }
	];
	const ranges = [
		{ v: 'all', l: 'All time' },
		{ v: 'month', l: 'Month' },
		{ v: 'week', l: 'Week' }
	];
</script>

<div class="bar">
	<div class="group">
		{#each formats as f}
			<button class:on={format === f.v} onclick={() => setParam('format', f.v)}>{f.l}</button>
		{/each}
	</div>
	<div class="group">
		{#each ranges as r}
			<button class:on={range === r.v} onclick={() => setParam('range', r.v)}>{r.l}</button>
		{/each}
	</div>
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		margin: 0.75rem 0 1rem;
	}
	.group {
		display: flex;
		gap: 0.25rem;
		background: var(--surface);
		border-radius: 999px;
		padding: 0.25rem;
	}
	button {
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		font-size: 0.75rem;
		padding: 0.4rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}
	button.on {
		background: var(--accent);
		color: #06231a;
	}
</style>
```

- [ ] **Step 4: Build the creatures helper + `CreatureTile`**

Create `src/lib/creatures.ts`:

```ts
/** Fixed set of Mindbug-style hybrid creatures used as fallback avatars. */
export const CREATURES = ['🦍', '🦈', '🕷️', '🐸', '🦎', '🐙', '🦇', '🦂', '🐺', '🦖', '🦉', '🐗'];

/** A player's chosen emoji avatar, or a deterministic fallback from their id. */
export function creatureFor(id: number, avatar?: string | null): string {
	if (avatar) return avatar;
	return CREATURES[((id % CREATURES.length) + CREATURES.length) % CREATURES.length];
}
```

Create `src/lib/components/CreatureTile.svelte` — one full-width creature card. `.art` and `.chip` come from the global design system (Task 12); the rest is scoped here.

```svelte
<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' };
	let {
		rank,
		emoji,
		name,
		chips = [],
		power,
		powerLabel = 'RATING',
		href = null,
		king = false
	}: {
		rank: string | number;
		emoji: string;
		name: string;
		chips?: Chip[];
		power: string | number;
		powerLabel?: string;
		href?: string | null;
		king?: boolean;
	} = $props();
</script>

{#snippet inner()}
	<span class="rankchip">{typeof rank === 'number' ? `#${rank}` : rank}</span>
	<div class="art" class:gold={king}>{emoji}</div>
	<div class="body">
		<div class="tname">{name}</div>
		<div class="chips">
			{#each chips as c}<span class="chip {c.tone ?? ''}">{c.text}</span>{/each}
		</div>
	</div>
	<div class="power"><b>{power}</b><small>{powerLabel}</small></div>
{/snippet}

{#if href}
	<a class="tile" class:king {href}>{@render inner()}</a>
{:else}
	<div class="tile" class:king>{@render inner()}</div>
{/if}

<style>
	.tile {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--card);
		color: var(--ink);
		border: 2px solid var(--edge);
		border-radius: 14px;
		padding: 7px;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
		position: relative;
		text-decoration: none;
	}
	.tile.king {
		border-color: var(--gold);
	}
	.rankchip {
		position: absolute;
		top: -8px;
		left: -8px;
		min-width: 22px;
		height: 22px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--edge);
		color: #2a1c06;
		font-size: 0.66rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.25);
	}
	.tile.king .rankchip {
		background: var(--gold);
	}
	.art {
		width: 48px;
		height: 58px;
		flex: none;
		font-size: 1.7rem;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}
	.tname {
		font-weight: 800;
		font-size: 0.98rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
	}
	.power {
		text-align: center;
		min-width: 3.4rem;
	}
	.power b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.4rem;
		font-variant-numeric: tabular-nums;
		display: block;
		line-height: 1;
	}
	.power small {
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		color: var(--muted);
		font-weight: 800;
	}
</style>
```

- [ ] **Step 5: Build the stepped `Podium`**

Create `src/lib/components/Podium.svelte` — the top 3 as creature cards, #1 centered/largest/gold:

```svelte
<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' };
	type Item = {
		rank: 1 | 2 | 3;
		emoji: string;
		name: string;
		power: string | number;
		powerLabel?: string;
		chips?: Chip[];
		href?: string | null;
	};
	let { items }: { items: Item[] } = $props();
	const byRank = (r: number) => items.find((i) => i.rank === r);
	// Visual order: 2nd, 1st (centre), 3rd.
	const order = [byRank(2), byRank(1), byRank(3)].filter(Boolean) as Item[];
	const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
	const pos = (r: number) => (r === 1 ? 'p1' : r === 2 ? 'p2' : 'p3');
</script>

<div class="podium">
	{#each order as it}
		<a class="bigcard {pos(it.rank)}" href={it.href ?? undefined}>
			<span class="medal">{medal(it.rank)}</span>
			<div class="bart" class:gold={it.rank === 1}>{it.emoji}</div>
			<div class="bn">{it.name}</div>
			<div class="bp">{it.power}<small>{it.powerLabel ?? 'RATING'}</small></div>
			<div class="chips">{#each it.chips ?? [] as c}<span class="chip {c.tone ?? ''}">{c.text}</span>{/each}</div>
		</a>
	{/each}
</div>

<style>
	.podium {
		display: grid;
		grid-template-columns: 1fr 1.18fr 1fr;
		gap: 0.6rem;
		align-items: end;
		margin-bottom: 0.7rem;
	}
	.bigcard {
		background: var(--card);
		color: var(--ink);
		border: 2px solid var(--edge);
		border-radius: 14px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.22rem;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
		text-align: center;
		text-decoration: none;
	}
	.medal {
		font-size: 1.3rem;
		line-height: 1;
	}
	.bart {
		width: 100%;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: linear-gradient(155deg, #31b7a9, #0e7a74);
		border: 1.5px solid var(--edge);
	}
	.bart.gold {
		background: linear-gradient(155deg, #edca66, #cf9a2c);
	}
	.bn {
		font-weight: 800;
		font-size: 0.9rem;
	}
	.bp {
		font-family: var(--display);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.05;
	}
	.bp small {
		display: block;
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		color: var(--muted);
		font-weight: 800;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.28rem;
	}
	.p1 {
		border-color: var(--gold);
		transform: translateY(-10px);
	}
	.p1 .bart {
		height: 92px;
		font-size: 2.4rem;
	}
	.p1 .bp {
		font-size: 1.6rem;
	}
	.p2 .bart {
		height: 78px;
		font-size: 2rem;
	}
	.p2 .bp {
		font-size: 1.35rem;
	}
	.p3 .bart {
		height: 64px;
		font-size: 1.7rem;
	}
	.p3 .bp {
		font-size: 1.2rem;
	}
</style>
```

- [ ] **Step 6: Build the leaderboard page (podium + full-width tiles)**

Replace `src/routes/+page.svelte` with:

```svelte
<script lang="ts">
	import ViewTabs from '$lib/components/ViewTabs.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Podium from '$lib/components/Podium.svelte';
	import CreatureTile from '$lib/components/CreatureTile.svelte';
	import { creatureFor } from '$lib/creatures';
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
			href: `/players/${r.player.id}`
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
			{#each data.teams as t, i}
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
		{#each rest as r, i}
			<CreatureTile
				rank={i + 4}
				emoji={creatureFor(r.player.id, r.player.avatar)}
				name={r.player.name}
				chips={[{ text: `${r.games} GP` }, { text: pct(r.winRate) }, streakChip(r.streak)]}
				power={r.rated ? r.rating : '—'}
				powerLabel={r.rated ? 'RATING' : 'UNRATED'}
				href={`/players/${r.player.id}`}
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
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: build succeeds. (With no DB configured yet, the page load only errors at runtime once a DB is connected — build/typecheck should pass.) Then `npm run dev` and compare against `docs/superpowers/design/mindbug-ui-reference.html`: stepped podium, full-width creature tiles, chips showing games / win% / streak states, gold #1.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+page.svelte src/lib/creatures.ts src/lib/components/ViewTabs.svelte src/lib/components/FilterBar.svelte src/lib/components/CreatureTile.svelte src/lib/components/Podium.svelte
git commit -m "feat: add leaderboard with podium and creature-card tiles"
```

---

## Task 15: Log a game (protected)

**Files:**
- Create: `src/routes/log/+page.server.ts`, `src/routes/log/+page.svelte`

**Interfaces:**
- Consumes: `requireAuth` from `$lib/server/auth`; `db`, `getPlayers`, `insertGame`; `Format`, `Side` from `$lib/types`.
- Produces: `load` (calls `requireAuth`, returns active players); a `default` action that validates the submission (correct team sizes for the chosen format, no player on both sides, a winner chosen) and calls `insertGame`, then redirects to `/`. Returns `fail(400, { error })` on invalid input.

- [ ] **Step 1: Implement the load + action**

Create `src/routes/log/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { getPlayers, insertGame } from '$lib/server/db/queries';
import type { Format, Side } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	requireAuth(cookies);
	const players = await getPlayers(db);
	return { players: players.filter((p) => p.isActive) };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		requireAuth(cookies);
		const form = await request.formData();
		const format = String(form.get('format')) as Format;
		const winnerSide = String(form.get('winnerSide')) as Side;
		const playedAt = String(form.get('playedAt') || new Date().toISOString());
		const sideA = form.getAll('sideA').map(Number).filter(Boolean);
		const sideB = form.getAll('sideB').map(Number).filter(Boolean);

		const size = format === '2v2' ? 2 : 3;
		if (format !== '2v2' && format !== '3v3') return fail(400, { error: 'Pick a format' });
		if (winnerSide !== 'A' && winnerSide !== 'B') return fail(400, { error: 'Pick the winning side' });
		if (sideA.length !== size || sideB.length !== size)
			return fail(400, { error: `Each side needs exactly ${size} players` });
		const all = [...sideA, ...sideB];
		if (new Set(all).size !== all.length) return fail(400, { error: 'A player cannot be on both sides' });

		await insertGame(db, { playedAt: new Date(playedAt).toISOString(), format, winnerSide, sideA, sideB });
		throw redirect(303, '/');
	}
};
```

- [ ] **Step 2: Build the log form**

Create `src/routes/log/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	let format = $state<'2v2' | '3v3'>('2v2');
	let size = $derived(format === '2v2' ? 2 : 3);
	let winnerSide = $state<'A' | 'B'>('A');
</script>

<h1>Log a game</h1>

<form method="POST" use:enhance class="card">
	<input type="hidden" name="format" value={format} />
	<input type="hidden" name="winnerSide" value={winnerSide} />

	<div class="seg">
		<button type="button" class:on={format === '2v2'} onclick={() => (format = '2v2')}>2v2</button>
		<button type="button" class:on={format === '3v3'} onclick={() => (format = '3v3')}>3v3</button>
	</div>

	<div class="sides">
		<fieldset class:winner={winnerSide === 'A'}>
			<legend>Side A</legend>
			{#each Array(size) as _, i}
				<select name="sideA" required>
					<option value="">– player –</option>
					{#each data.players as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/each}
			<button type="button" class="btn secondary" onclick={() => (winnerSide = 'A')}>A won</button>
		</fieldset>

		<fieldset class:winner={winnerSide === 'B'}>
			<legend>Side B</legend>
			{#each Array(size) as _, i}
				<select name="sideB" required>
					<option value="">– player –</option>
					{#each data.players as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/each}
			<button type="button" class="btn secondary" onclick={() => (winnerSide = 'B')}>B won</button>
		</fieldset>
	</div>

	<label>Date <input type="date" name="playedAt" /></label>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<button class="btn" type="submit">Save game</button>
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.25rem;
		width: fit-content;
	}
	.seg button {
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		padding: 0.4rem 1rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--accent);
		color: #06231a;
	}
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	fieldset {
		border: 2px solid var(--surface-2);
		border-radius: var(--radius-sm);
		display: grid;
		gap: 0.5rem;
	}
	fieldset.winner {
		border-color: var(--accent);
	}
	select,
	input[type='date'] {
		padding: 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/routes/log/
git commit -m "feat: add protected log-a-game form with validation"
```

---

## Task 16: Player profile + rating chart

**Files:**
- Create: `src/routes/players/[id]/+page.server.ts`, `src/routes/players/[id]/+page.svelte`, `src/lib/components/RatingChart.svelte`

**Interfaces:**
- Consumes: `db`, `getPlayer`, `getAllGames`; `computeRatings`; `playerStats`; `Snapshot` from the engine.
- Produces: profile `load` returning `{ player, stats: {total,'2v2','3v3' PlayerStats}, series: {total,'2v2','3v3': {playedAt, rating}[]} }`; `RatingChart` renders a multi-series line chart from those series using inline SVG (no external chart lib).

Before writing `RatingChart`, consult the `dataviz` skill for line-chart color/legibility guidance.

- [ ] **Step 1: Implement the profile load**

Create `src/routes/players/[id]/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayer, getAllGames } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { playerStats } from '$lib/stats/aggregate';
import type { Track } from '$lib/types';
import type { PageServerLoad } from './$types';

const TRACKS: Track[] = ['total', '2v2', '3v3'];

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	const player = await getPlayer(db, id);
	if (!player) throw error(404, 'Player not found');

	const games = await getAllGames(db);
	const ratings = computeRatings(games);
	const now = new Date();

	const series = Object.fromEntries(
		TRACKS.map((t) => [
			t,
			ratings[t].history
				.filter((h) => h.playerId === id)
				.map((h) => ({ playedAt: h.playedAt, rating: Math.round(h.ratingAfter) }))
		])
	) as Record<Track, { playedAt: string; rating: number }[]>;

	const stats = Object.fromEntries(
		TRACKS.map((t) => [t, playerStats(games, id, { track: t, range: 'all', now })])
	) as Record<Track, ReturnType<typeof playerStats>>;

	return { player, series, stats };
};
```

- [ ] **Step 2: Build `RatingChart` (inline SVG)**

Create `src/lib/components/RatingChart.svelte`:

```svelte
<script lang="ts">
	let {
		series
	}: {
		series: { label: string; color: string; points: { playedAt: string; rating: number }[] }[];
	} = $props();

	const W = 640;
	const H = 220;
	const PAD = 28;

	const all = series.flatMap((s) => s.points.map((p) => p.rating));
	const min = all.length ? Math.min(...all) : 980;
	const max = all.length ? Math.max(...all) : 1020;
	const span = max - min || 1;

	function path(points: { rating: number }[]): string {
		if (points.length === 0) return '';
		const n = points.length;
		return points
			.map((p, i) => {
				const x = PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
				const y = H - PAD - ((p.rating - min) / span) * (H - 2 * PAD);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rating over time">
	<line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--surface-2)" />
	{#each series as s}
		{#if s.points.length}
			<path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2.5" />
		{/if}
	{/each}
</svg>
<div class="legend">
	{#each series as s}
		<span class="key"><i style={`background:${s.color}`}></i>{s.label}</span>
	{/each}
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		background: var(--surface);
		border-radius: var(--radius);
	}
	.legend {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.key i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		display: inline-block;
	}
</style>
```

- [ ] **Step 3: Build the profile page**

Create `src/routes/players/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import RatingChart from '$lib/components/RatingChart.svelte';
	let { data } = $props();

	const chart = [
		{ label: 'Total', color: 'var(--accent)', points: data.series.total },
		{ label: '2v2', color: 'var(--accent-2)', points: data.series['2v2'] },
		{ label: '3v3', color: 'var(--accent-3)', points: data.series['3v3'] }
	];
	const cur = (pts: { rating: number }[]) => (pts.length ? pts[pts.length - 1].rating : '—');
</script>

<h1>{data.player.name}</h1>

<div class="tiles">
	{#each [['Total', 'total'], ['2v2', '2v2'], ['3v3', '3v3']] as [label, key]}
		<div class="card tile">
			<span class="k">{label}</span>
			<span class="v">{cur(data.series[key])}</span>
			<span class="pill">{data.stats[key].wins}W · {data.stats[key].losses}L</span>
		</div>
	{/each}
</div>

<h2>Rating over time</h2>
<RatingChart series={chart} />

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
		margin: 1rem 0;
	}
	.tile {
		display: grid;
		gap: 0.3rem;
		text-align: center;
	}
	.k {
		font-family: var(--display);
		color: var(--muted);
		font-size: 0.8rem;
	}
	.v {
		font-family: var(--display);
		font-size: 1.5rem;
		color: var(--accent);
	}
</style>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/players/\[id\]/ src/lib/components/RatingChart.svelte
git commit -m "feat: add player profile with three-track rating chart"
```

---

## Task 17: Manage players page

**Files:**
- Create: `src/routes/players/+page.server.ts`, `src/routes/players/+page.svelte`

**Interfaces:**
- Consumes: `db`, `getPlayers`, `addPlayer`, `setPlayerActive`; `isAuthed`, `requireAuth`; `CREATURES`, `creatureFor` from `$lib/creatures`.
- Produces: players `load` returning `{ players, canEdit }` (canEdit = `isAuthed`); `add` (accepts optional `avatar` emoji) and `toggle` actions (both `requireAuth`).

Note: team records live on the leaderboard's Teams tab (Task 14), so there is no `/teams` route. This task is only the roster-management page.

- [ ] **Step 1: Implement manage-players load + actions**

Create `src/routes/players/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, addPlayer, setPlayerActive } from '$lib/server/db/queries';
import { isAuthed, requireAuth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return { players: await getPlayers(db), canEdit: isAuthed(cookies) };
};

export const actions: Actions = {
	add: async ({ request, cookies }) => {
		requireAuth(cookies);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		if (!name) return fail(400, { error: 'Name required' });
		try {
			await addPlayer(db, name, avatar);
		} catch {
			return fail(400, { error: 'That name already exists' });
		}
		return { ok: true };
	},
	toggle: async ({ request, cookies }) => {
		requireAuth(cookies);
		const form = await request.formData();
		await setPlayerActive(db, Number(form.get('id')), form.get('active') === 'true');
		return { ok: true };
	}
};
```

- [ ] **Step 2: Build the manage-players page**

Create `src/routes/players/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { CREATURES, creatureFor } from '$lib/creatures';
	let { data, form } = $props();
	let avatar = $state(CREATURES[0]);
</script>

<h1>Players</h1>

{#if data.canEdit}
	<form method="POST" action="?/add" use:enhance class="card add">
		<div class="row1">
			<span class="preview">{avatar}</span>
			<input name="name" placeholder="New player name" />
			<button class="btn" type="submit">Add</button>
		</div>
		<input type="hidden" name="avatar" value={avatar} />
		<div class="picker">
			{#each CREATURES as c}
				<button type="button" class:on={avatar === c} onclick={() => (avatar = c)}>{c}</button>
			{/each}
		</div>
	</form>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
{:else}
	<p class="pill">Viewing only — <a href="/login?redirectTo=/players">unlock</a> to edit.</p>
{/if}

<ul>
	{#each data.players as p}
		<li class="card">
			<a href={`/players/${p.id}`} class:inactive={!p.isActive}>
				<span class="crea">{creatureFor(p.id, p.avatar)}</span>{p.name}
			</a>
			{#if data.canEdit}
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="id" value={p.id} />
					<input type="hidden" name="active" value={(!p.isActive).toString()} />
					<button class="btn secondary" type="submit">{p.isActive ? 'Deactivate' : 'Activate'}</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.add {
		display: grid;
		gap: 0.6rem;
		margin: 1rem 0;
	}
	.row1 {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.preview {
		font-size: 1.4rem;
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: #e7d6ad;
		flex: none;
	}
	.row1 input {
		flex: 1;
		padding: 0.7rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.picker button {
		font-size: 1.1rem;
		border: 1.5px solid var(--surface-2);
		background: var(--bg);
		border-radius: 9px;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
	}
	.picker button.on {
		border-color: var(--teal);
		background: #d7efe0;
	}
	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	li a {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink);
		text-decoration: none;
		font-weight: 700;
	}
	.crea {
		font-size: 1.2rem;
	}
	a.inactive {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.err {
		color: var(--danger);
	}
</style>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/routes/players/+page.server.ts src/routes/players/+page.svelte
git commit -m "feat: add manage-players page"
```

---

## Task 18: PWA (manifest, icons, service worker)

**Files:**
- Create: `static/manifest.webmanifest`, `static/icons/icon.svg`, `static/icons/icon-192.png`, `static/icons/icon-512.png`, `static/icons/maskable-512.png`, `src/service-worker.ts`

**Interfaces:**
- Produces: installable PWA with an offline app-shell cache. Verified via build + Lighthouse/installability (manual).

- [ ] **Step 1: Create the source icon**

Create `static/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<rect width="512" height="512" rx="96" fill="#0b4744" />
	<circle cx="256" cy="256" r="150" fill="#e0a52a" />
	<circle cx="212" cy="230" r="26" fill="#0b4744" />
	<circle cx="300" cy="230" r="26" fill="#0b4744" />
	<path d="M190 320 q66 60 132 0" stroke="#0b4744" stroke-width="18" fill="none" stroke-linecap="round" />
	<path d="M150 150 l40 40 M362 150 l-40 40" stroke="#ef6a4d" stroke-width="18" stroke-linecap="round" />
</svg>
```

- [ ] **Step 2: Generate PNG icons from the SVG**

Run (uses `sharp` on the fly; no permanent dependency needed):

```bash
npx --yes sharp-cli -i static/icons/icon.svg -o static/icons/icon-192.png resize 192 192
npx --yes sharp-cli -i static/icons/icon.svg -o static/icons/icon-512.png resize 512 512
cp static/icons/icon-512.png static/icons/maskable-512.png
```

Expected: three PNG files exist in `static/icons/`. (If `sharp-cli` flags differ, any SVG→PNG rasterizer producing 192px and 512px PNGs is acceptable.)

- [ ] **Step 3: Create the manifest**

Create `static/manifest.webmanifest`:

```json
{
	"name": "The Ultimate Mindbug",
	"short_name": "Mindbug",
	"description": "Leaderboard and Elo ratings for our Mindbug games",
	"start_url": "/",
	"display": "standalone",
	"background_color": "#0b4744",
	"theme_color": "#0b4744",
	"icons": [
		{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
		{ "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
		{ "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
	]
}
```

- [ ] **Step 4: Create the service worker**

Create `src/service-worker.ts`:

```ts
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `mindbug-cache-${version}`;
const ASSETS = [...build, ...files];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	// Never cache navigations/data — always try network first so the board stays fresh.
	if (url.origin !== location.origin || req.mode === 'navigate') return;
	event.respondWith(
		caches.match(req).then((cached) => cached ?? fetch(req))
	);
});
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds and includes the service worker.

- [ ] **Step 6: Commit**

```bash
git add static/manifest.webmanifest static/icons/ src/service-worker.ts
git commit -m "feat: make the app an installable PWA with offline shell"
```

---

## Task 19: Vercel adapter, env docs, deploy prep

**Files:**
- Modify: `svelte.config.js`, `README.md`
- Create: `package.json` script for DB migration (modify `package.json`)

**Interfaces:**
- Produces: production-ready build config for Vercel; documented env + deploy steps; a `db:migrate` npm script.

- [ ] **Step 1: Switch to the Vercel adapter**

In `svelte.config.js`, replace the adapter import/usage with:

```js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: { adapter: adapter() }
};

export default config;
```

- [ ] **Step 2: Add a migration script**

In `package.json` `"scripts"`, add:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run`
Expected: ALL tests pass (rating, stats, teams, shape, queries, auth, smoke).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds with the Vercel adapter.

- [ ] **Step 5: Document setup + deploy in README**

Append a "Running & deploying" section to `README.md` covering:
- Required env vars (`DATABASE_URL`, `MINDBUG_PASSWORD`, `AUTH_SECRET`) — copy from `.env.example`.
- Local dev: `npm install`, create `.env`, `npm run db:migrate`, `npm run dev`.
- Deploy: connect the GitHub repo to Vercel, add the Neon integration (sets `DATABASE_URL`), set `MINDBUG_PASSWORD` and `AUTH_SECRET` in Vercel env, run `npm run db:migrate` against the Neon DB once (locally with the prod `DATABASE_URL`, or via a one-off), then deploy.

- [ ] **Step 6: Commit**

```bash
git add svelte.config.js package.json README.md
git commit -m "chore: wire Vercel adapter, migration scripts, and deploy docs"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Elo per-player rating, team-averaged, shared delta → Tasks 3–5. ✅
- Three tracks (total/2v2/3v3) → Task 5, surfaced in Tasks 14 & 16. ✅
- Win rate, all-time wins, games played, streak → Task 6. ✅
- Filter by format, date range, player → Task 6 (`filterGames`), Task 14 (leaderboard/teams filters), Task 16 (per-player profile). ✅
- Team-combo stats → Task 7 (logic), surfaced on the leaderboard's Teams tab in Task 14. ✅
- Data model (players, games, game_participants; unique name; derived ratings) → Tasks 8–10. ✅
- Shared-password access; open viewing → Tasks 11, 13; gating in 15 & 17. ✅
- SvelteKit + Neon + Drizzle + Vercel → Tasks 1, 8, 19. ✅
- PWA installable → Task 18. ✅
- Mindbug look & feel → Task 12 (tokens/shell), applied across all pages. ✅
- Start empty; add players in UI → Task 17. ✅

**Placeholder scan:** No TBD/TODO; all steps carry real code or concrete commands.

**Type consistency:** `Track` is used consistently for the format axis in both rating (`RatingResult` keys) and stats (`StatsOpts.track`). `allPlayerStats(games, ids, {track, range, now})` matches its Task 6 signature (the leaderboard passes `format` as `track`). `insertGame` input shape matches between Task 10 and Task 15. `Snapshot`/`TrackResult`/`RatingResult` names are stable across Tasks 4–5 and consumed unchanged in Task 16.

**Scope:** Single cohesive app; one plan is appropriate (subsystems are interdependent, not standalone).
