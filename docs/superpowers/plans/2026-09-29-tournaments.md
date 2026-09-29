# Tournaments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tournaments (rotating teams / fixed-teams round-robin / knockout) whose matches are ordinary `games` rows, plus a ranked toggle for all games, tournament pages, player-page tournament stats and a 🏆 titles badge on the board.

**Architecture:** Tournament matches are `games` rows with a nullable `tournament_id`, `round`, `slot` and a `ranked` flag; unplayed matches have null `winner_side`/`played_at` (guarded by CHECK constraints). All draw/standings logic is pure and seeded in `src/lib/tournament/` (tested directly, also run in the browser for the create-page preview). DB writes live in `src/lib/server/db/tournaments.ts` as single-statement CTEs because the production neon-http driver has no transactions.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Drizzle ORM 0.45 (Postgres; pglite in tests), Vitest 4, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-29-tournaments-design.md` (mockups in `docs/superpowers/mockups/tournaments/`).

## Global Constraints

- Styles: `rotating | fixed | knockout`; statuses: `live | finished | abandoned`.
- One format per tournament: existing `format` enum (`1v1 | 2v2 | 3v3`); team size 1/2/3.
- `tables` ≥ 1, capped at `⌊players / (2 × teamSize)⌋`.
- Rotating: `rounds` 1–30, ≥ `2 × teamSize` players. Fixed/knockout: players divisible by team size, ≥ 2 teams.
- No auto-finish; Finish button only when every game has a result.
- Enter result for an unplayed match: any signed-in player. Change/clear result, finish, abandon: creator or admin. Delete tournament: admin.
- Knockout result change/clear only while the next-round match is unplayed.
- All mutating actions rejected on `finished` / `abandoned`.
- No MVP rounds for tournament games.
- Unranked games: excluded from Elo, board, W/L stats; shown in histories with an Unranked badge and `±0`.
- Tournament titles/podiums count regardless of ranked; only `finished` tournaments count toward player tiles and the board badge.
- Never use `db.transaction()` (neon-http throws). Multi-row writes = one SQL statement (CTE).
- Match cards are labelled **Team 1 / Team 2** (side A / side B), buttons "Team 1 won" / "Team 2 won". Pending/selected match = teal (`--teal`) border, never coral.
- Keep `pnpm check` at 0 errors / 0 warnings and `pnpm lint` clean.
- Commit under the repo-local identity (already configured); do not push.

## Review Focus

1. **Double entry race** — two phones enter the same match at once: the second must get "already entered", not overwrite. (Task 6: first entry's UPDATE is guarded by `WHERE winner_side IS NULL`; the sequential case is tested — a true concurrent test is flaky on single-connection pglite, so reviewer checks the guard by reading.)
2. **Admin deletes a tournament game from `/games`** — would corrupt a bracket/schedule; must be refused with a message. (Task 7: `deleteGame` guard + test.)
3. **Scheduled/unranked games leaking into Elo or stats** — e.g. a null `winner_side` reaching `computeRatings` → NaN ratings. (Task 1: `getAllGames` filter tests.)
4. **Knockout TBD match tapped** — a match with an unknown side must not accept a result. (Task 6: "teams not known yet" test.)
5. **Odd counts** — 5 players 2v2 rotating (sit-outs), 7 players 2v2 fixed (blocked with hint), 5 teams knockout (3 byes). (Tasks 2–4 tests.)

---

## File Structure

**Create**
- `src/lib/tournament/types.ts` — shared tournament types + `teamSize`.
- `src/lib/tournament/rng.ts` — seeded RNG, shuffle, random seed.
- `src/lib/tournament/validate.ts` — setup validation + tables cap.
- `src/lib/tournament/schedule.ts` — `generateSchedule` (rotating / round-robin / knockout).
- `src/lib/tournament/advance.ts` — knockout wiring helpers.
- `src/lib/tournament/standings.ts` — per-style standings with tiebreaks.
- `src/lib/tournament/summary.ts` — player tournament entries/totals, title counts, labels.
- Tests next to each: `*.test.ts`.
- `src/lib/server/db/tournaments.ts` (+ `tournaments.test.ts`) — DB layer.
- `src/lib/components/TournamentMatchCard.svelte`, `TournamentStandings.svelte`, `KnockoutBracket.svelte`.
- `src/routes/tournaments/+page.server.ts`, `+page.svelte` — list.
- `src/routes/tournaments/new/+page.server.ts`, `+page.svelte` — create.
- `src/routes/tournaments/[id]/+page.server.ts`, `+page.svelte` — detail.

**Modify**
- `src/lib/server/db/schema.ts` — enums, `tournaments`, `tournament_players`, `games` columns + checks.
- `drizzle/0006_*.sql` (generated).
- `src/lib/server/db/queries.ts` — `getAllGames` filter, `getGameHistory`, `insertGame` `ranked`, `deleteGame` guard, null-safety in MVP queries.
- `src/lib/server/db/shape.ts` — unchanged types; `getAllGames` still returns `GameInput[]`.
- `src/lib/nav.ts`, `src/lib/nav.test.ts` — Tournaments link.
- `src/lib/components/GameLogRow.svelte` — optional tournament link + Unranked badge.
- `src/routes/log/+page.server.ts`, `+page.svelte` — Ranked toggle.
- `src/routes/games/+page.server.ts`, `+page.svelte` — history incl. unranked, badges, hide delete for tournament games.
- `src/routes/players/[id]/+page.server.ts`, `+page.svelte` — tournaments section, unranked history.
- `src/routes/+page.server.ts`, `+page.svelte` — 🏆 titles chip.

Note: the team detail page (`/teams/[id]`) keeps using ranked games only (its net-record series would be distorted by unranked games) — deliberate simplification of the spec's "team recent games" line.

---

### Task 1: Schema, migration, ranked/scheduled filtering

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `drizzle/0006_<generated>.sql` (via `pnpm db:generate`)
- Modify: `src/lib/server/db/queries.ts`
- Test: `src/lib/server/db/tournament-schema.test.ts`, `src/lib/server/db/queries.test.ts`

**Interfaces:**
- Produces: tables `tournaments`, `tournamentPlayers`; enums `tournamentStyleEnum`, `tournamentStatusEnum`; `games.tournamentId`, `games.ranked`, `games.round`, `games.slot`; nullable `games.winnerSide` / `games.playedAt`.
- Produces: `insertGame(db, { ...existing, ranked?: boolean })`.
- Produces: `getAllGames(db): Promise<GameInput[]>` — **played + ranked only**.
- Produces: `type HistoryGame = GameInput & { ranked: boolean; tournament: { id: number; name: string; round: number } | null }` and `getGameHistory(db): Promise<HistoryGame[]>` — all played games, ranked or not.

- [ ] **Step 1: Write the failing schema test**

Create `src/lib/server/db/tournament-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { games, players, tournaments } from './schema';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
	db = await makeTestDb();
});

async function tournament() {
	const [p] = await db.insert(players).values({ name: 'Org' }).returning();
	const [t] = await db
		.insert(tournaments)
		.values({ name: 'T', style: 'rotating', format: '2v2', ranked: true, rounds: 3, tables: 1, seed: 1, createdBy: p.id })
		.returning();
	return t;
}

describe('games check constraints', () => {
	it('rejects an unplayed game outside a tournament', async () => {
		await expect(db.insert(games).values({ format: '2v2' })).rejects.toBeTruthy();
	});

	it('allows an unplayed game inside a tournament', async () => {
		const t = await tournament();
		const [g] = await db.insert(games).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 }).returning();
		expect(g.winnerSide).toBeNull();
		expect(g.ranked).toBe(true);
	});

	it('rejects a winner without played_at', async () => {
		const t = await tournament();
		await expect(
			db.insert(games).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0, winnerSide: 'A' })
		).rejects.toBeTruthy();
	});

	it('rejects round/slot on a non-tournament game', async () => {
		await expect(
			db.insert(games).values({ format: '2v2', winnerSide: 'A', playedAt: new Date(), round: 1, slot: 0 })
		).rejects.toBeTruthy();
	});

	it('rejects two games in the same tournament round/slot', async () => {
		const t = await tournament();
		await db.insert(games).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 });
		await expect(
			db.insert(games).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 })
		).rejects.toBeTruthy();
	});

	it('cascades tournament delete to its games', async () => {
		const t = await tournament();
		await db.insert(games).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 });
		await db.delete(tournaments);
		expect(await db.select().from(games)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/server/db/tournament-schema.test.ts`
Expected: FAIL (`tournaments` not exported from schema).

- [ ] **Step 3: Update the schema**

In `src/lib/server/db/schema.ts`: add `check` to the `drizzle-orm/pg-core` import and `import { sql } from 'drizzle-orm';`. Add the enums + `tournaments` table **after `players` and before `games`**, replace `games`, and add `tournamentPlayers` after `gameParticipants`:

```ts
export const tournamentStyleEnum = pgEnum('tournament_style', ['rotating', 'fixed', 'knockout']);
export const tournamentStatusEnum = pgEnum('tournament_status', ['live', 'finished', 'abandoned']);

export const tournaments = pgTable('tournaments', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	style: tournamentStyleEnum('style').notNull(),
	format: formatEnum('format').notNull(),
	ranked: boolean('ranked').notNull(),
	// Rotating only: number of rounds chosen at creation.
	rounds: integer('rounds'),
	// Matches played at once (multiple decks).
	tables: integer('tables').notNull().default(1),
	// Draw seed: the create-page preview and the server generate the same draw from it.
	seed: integer('seed').notNull(),
	status: tournamentStatusEnum('status').notNull().default('live'),
	createdBy: integer('created_by').references(() => players.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true })
});

export const games = pgTable(
	'games',
	{
		id: serial('id').primaryKey(),
		// Null only for a scheduled (unplayed) tournament match — see checks below.
		playedAt: timestamp('played_at', { withTimezone: true }),
		format: formatEnum('format').notNull(),
		winnerSide: sideEnum('winner_side'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		// Which player entered this game, for admin audit. Nullable: games logged
		// before this column existed stay null ("unknown"), and set-null on player
		// removal so a player can be deleted without orphaning game history.
		createdBy: integer('created_by').references(() => players.id, { onDelete: 'set null' }),
		// Unranked games are stored and shown but never move Elo or stats.
		ranked: boolean('ranked').notNull().default(true),
		tournamentId: integer('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }),
		// Tournament position: 1-based round; slot = table (rotating/fixed) or bracket position (knockout), 0-based.
		round: integer('round'),
		slot: integer('slot')
	},
	(t) => [
		// Raw column names: the checks live on this table, so no qualification needed.
		check('games_unplayed_needs_tournament', sql`winner_side IS NOT NULL OR tournament_id IS NOT NULL`),
		check('games_played_at_needs_tournament', sql`played_at IS NOT NULL OR tournament_id IS NOT NULL`),
		check('games_result_has_played_at', sql`(winner_side IS NULL) = (played_at IS NULL)`),
		check('games_round_slot_need_tournament', sql`(round IS NULL AND slot IS NULL) OR tournament_id IS NOT NULL`),
		unique('games_tournament_round_slot').on(t.tournamentId, t.round, t.slot)
	]
);
```

```ts
export const tournamentPlayers = pgTable(
	'tournament_players',
	{
		id: serial('id').primaryKey(),
		tournamentId: integer('tournament_id')
			.notNull()
			.references(() => tournaments.id, { onDelete: 'cascade' }),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		// Fixed/knockout team number (1-based); null for rotating.
		teamNo: integer('team_no')
	},
	(t) => [unique('tournament_players_tournament_player').on(t.tournamentId, t.playerId)]
);
```

- [ ] **Step 4: Generate the migration and inspect it**

Run: `pnpm db:generate`
Expected: new `drizzle/0006_*.sql`. Open it and confirm it contains: `CREATE TYPE "public"."tournament_style"`, `CREATE TYPE "public"."tournament_status"`, `CREATE TABLE "tournaments"`, `CREATE TABLE "tournament_players"`, `ALTER TABLE "games" ALTER COLUMN "played_at" DROP NOT NULL`, same for `winner_side`, `ADD COLUMN "ranked" boolean DEFAULT true NOT NULL`, the four `ADD CONSTRAINT ... CHECK` lines and the unique constraint. If drizzle-kit prompts (rename detection), answer "create" for every new column/table.

- [ ] **Step 5: Run the schema test**

Run: `pnpm vitest run src/lib/server/db/tournament-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Write failing query tests**

Append to `src/lib/server/db/queries.test.ts` (add `getGameHistory` to the import list, and `import { games as gamesTable, tournaments } from './schema';`):

```ts
describe('ranked and scheduled games', () => {
	async function four() {
		return Promise.all(['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n)));
	}

	it('getAllGames excludes unranked games; getGameHistory keeps them', async () => {
		const [a, b, c, d] = await four();
		await insertGame(db, { playedAt: '2026-01-01T10:00:00.000Z', format: '2v2', winnerSide: 'A', sideA: [a.id, b.id], sideB: [c.id, d.id] });
		const casual = await insertGame(db, { playedAt: '2026-01-02T10:00:00.000Z', format: '2v2', winnerSide: 'B', sideA: [a.id, b.id], sideB: [c.id, d.id], ranked: false });
		expect((await getAllGames(db)).map((g) => g.id)).not.toContain(casual);
		const history = await getGameHistory(db);
		expect(history).toHaveLength(2);
		expect(history.find((g) => g.id === casual)).toMatchObject({ ranked: false, tournament: null });
	});

	it('getAllGames and getGameHistory exclude scheduled tournament games', async () => {
		const [a] = await four();
		const [t] = await db
			.insert(tournaments)
			.values({ name: 'Cup', style: 'knockout', format: '2v2', ranked: true, tables: 1, seed: 1, createdBy: a.id })
			.returning();
		await db.insert(gamesTable).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 });
		expect(await getAllGames(db)).toEqual([]);
		expect(await getGameHistory(db)).toEqual([]);
	});

	it('getGameHistory attaches tournament name and round', async () => {
		const [a, b, c, d] = await four();
		const [t] = await db
			.insert(tournaments)
			.values({ name: 'Cup', style: 'knockout', format: '2v2', ranked: true, tables: 1, seed: 1, createdBy: a.id })
			.returning();
		const id = await insertGame(db, { playedAt: '2026-01-01T10:00:00.000Z', format: '2v2', winnerSide: 'A', sideA: [a.id, b.id], sideB: [c.id, d.id] });
		await db.update(gamesTable).set({ tournamentId: t.id, round: 2, slot: 0 });
		const [g] = await getGameHistory(db);
		expect(g).toMatchObject({ id, tournament: { id: t.id, name: 'Cup', round: 2 } });
	});
});
```

- [ ] **Step 7: Run to verify they fail**

Run: `pnpm vitest run src/lib/server/db/queries.test.ts`
Expected: FAIL (`getGameHistory` not exported / `ranked` not accepted).

- [ ] **Step 8: Implement query changes**

In `src/lib/server/db/queries.ts`:

1. Import `tournaments` from `./schema`.
2. `insertGame`: add `ranked?: boolean;` to the input type and write it in the CTE:

```ts
			INSERT INTO games (played_at, format, winner_side, created_by, ranked)
			VALUES (${new Date(input.playedAt)}, ${input.format}, ${input.winnerSide}, ${input.createdBy ?? null}, ${input.ranked ?? true})
```

3. Replace `getAllGames` and add `getGameHistory`:

```ts
/** Games that feed the rating engine and stats: played (has a winner) and
    ranked. Scheduled tournament matches and casual/unranked games never reach
    computeRatings — a null winner would poison it. */
export async function getAllGames(db: DB): Promise<GameInput[]> {
	const gameRows = (await db
		.select({ id: games.id, playedAt: games.playedAt, format: games.format, winnerSide: games.winnerSide })
		.from(games)
		.where(and(isNotNull(games.winnerSide), eq(games.ranked, true)))) as GameRow[];
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	return toGameInputs(gameRows, participantRows);
}

export type HistoryGame = GameInput & {
	ranked: boolean;
	tournament: { id: number; name: string; round: number } | null;
};

/** Every played game, ranked or not, with its tournament (if any) — for game
    history lists. Scheduled (unplayed) tournament matches are excluded. */
export async function getGameHistory(db: DB): Promise<HistoryGame[]> {
	const rows = await db
		.select({
			id: games.id,
			playedAt: games.playedAt,
			format: games.format,
			winnerSide: games.winnerSide,
			ranked: games.ranked,
			round: games.round,
			tournamentId: tournaments.id,
			tournamentName: tournaments.name
		})
		.from(games)
		.leftJoin(tournaments, eq(tournaments.id, games.tournamentId))
		.where(isNotNull(games.winnerSide));
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	const extra = new Map(rows.map((r) => [r.id, r]));
	return toGameInputs(rows as GameRow[], participantRows).map((g) => {
		const r = extra.get(g.id)!;
		return {
			...g,
			ranked: r.ranked,
			tournament:
				r.tournamentId != null
					? { id: r.tournamentId, name: r.tournamentName ?? '', round: r.round ?? 0 }
					: null
		};
	});
}
```

4. Null-safety fallout: `games.winnerSide` / `games.playedAt` are now nullable in Drizzle's types. MVP rounds only ever exist for played games, so in `getOpenRoundsForPlayer`, `getMyOpenVotes` and `getRecentResults` change `r.playedAt.toISOString()` → `r.playedAt!.toISOString()` and `winnerSide: r.winnerSide` → `winnerSide: r.winnerSide!`, with one comment above the first occurrence: `// MVP rounds exist only for played games, so winner/playedAt are set.`
5. Run `pnpm check` and fix any remaining nullable errors the same way (only where the row provably comes from a played game); for anything else, stop and report.

- [ ] **Step 9: Run tests + check**

Run: `pnpm vitest run src/lib/server/db && pnpm check`
Expected: all PASS; check 0 errors / 0 warnings.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/db drizzle
git commit -m "feat(db): tournaments schema, ranked flag, scheduled games"
```

---

### Task 2: Pure foundations — types, RNG, validation

**Files:**
- Create: `src/lib/tournament/types.ts`, `src/lib/tournament/rng.ts`, `src/lib/tournament/validate.ts`
- Test: `src/lib/tournament/rng.test.ts`, `src/lib/tournament/validate.test.ts`

**Interfaces:**
- Produces (types.ts):

```ts
import type { Format, Side } from '$lib/types';

export type TournamentStyle = 'rotating' | 'fixed' | 'knockout';
export type TournamentStatus = 'live' | 'finished' | 'abandoned';

export interface TournamentSetup {
	style: TournamentStyle;
	format: Format;
	playerIds: number[];
	/** Rotating only; null otherwise. */
	rounds: number | null;
	tables: number;
}

/** One match of a generated schedule. A null side = not known yet (knockout). */
export interface ScheduledGame {
	round: number;
	slot: number;
	sideA: number[] | null;
	sideB: number[] | null;
}

export interface Schedule {
	/** Fixed/knockout: teams in team_no order (index 0 = team 1). Null for rotating. */
	teams: number[][] | null;
	games: ScheduledGame[];
}

export interface TournamentInfo {
	id: number;
	name: string;
	style: TournamentStyle;
	format: Format;
	ranked: boolean;
	rounds: number | null;
	tables: number;
	seed: number;
	status: TournamentStatus;
	createdBy: number | null;
	createdAt: string;
	finishedAt: string | null;
}

export interface RosterEntry {
	playerId: number;
	teamNo: number | null;
}

/** A stored tournament game. Empty side arrays = not known yet. */
export interface TournamentGame {
	id: number;
	round: number;
	slot: number;
	winnerSide: Side | null;
	playedAt: string | null;
	sideA: number[];
	sideB: number[];
}

export interface TournamentData {
	tournament: TournamentInfo;
	roster: RosterEntry[];
	games: TournamentGame[];
}

export const teamSize = (format: Format): number => (format === '1v1' ? 1 : format === '2v2' ? 2 : 3);
```

- Produces (rng.ts): `type Rng = () => number`, `mulberry32(seed: number): Rng`, `shuffle<T>(items: readonly T[], rng: Rng): T[]`, `randomSeed(): number`.
- Produces (validate.ts): `MAX_ROUNDS = 30`, `maxTables(format, playerCount): number`, `validateSetup(input: TournamentSetup): { ok: true; setup: TournamentSetup } | { ok: false; error: string }`.

- [ ] **Step 1: Write failing tests**

`src/lib/tournament/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle } from './rng';

describe('rng', () => {
	it('is deterministic per seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
	});

	it('returns values in [0, 1)', () => {
		const r = mulberry32(7);
		for (let i = 0; i < 1000; i++) {
			const v = r();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('shuffle is a permutation and does not mutate input', () => {
		const input = [1, 2, 3, 4, 5, 6];
		const out = shuffle(input, mulberry32(1));
		expect([...out].sort()).toEqual(input);
		expect(input).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('different seeds give different orders', () => {
		const input = Array.from({ length: 10 }, (_, i) => i);
		expect(shuffle(input, mulberry32(1))).not.toEqual(shuffle(input, mulberry32(2)));
	});
});
```

`src/lib/tournament/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateSetup, maxTables } from './validate';
import type { TournamentSetup } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const base = (over: Partial<TournamentSetup>): TournamentSetup => ({
	style: 'rotating',
	format: '2v2',
	playerIds: ids(6),
	rounds: 5,
	tables: 1,
	...over
});

describe('validateSetup', () => {
	it('accepts a rotating setup with sit-outs', () => {
		const r = validateSetup(base({ playerIds: ids(5) }));
		expect(r.ok).toBe(true);
	});

	it('needs at least two teams worth of players', () => {
		const r = validateSetup(base({ playerIds: ids(3) }));
		expect(r).toEqual({ ok: false, error: 'Pick at least 4 players for 2v2' });
	});

	it('blocks fixed teams when players do not divide into teams', () => {
		const r = validateSetup(base({ style: 'fixed', playerIds: ids(7), rounds: null }));
		expect(r).toEqual({ ok: false, error: "7 players can't be split into teams of 2 — add 1 or remove 1" });
	});

	it('blocks knockout 3v3 with 8 players with the right hint', () => {
		const r = validateSetup(base({ style: 'knockout', format: '3v3', playerIds: ids(8), rounds: null }));
		expect(r).toEqual({ ok: false, error: "8 players can't be split into teams of 3 — add 1 or remove 2" });
	});

	it('rejects duplicate players', () => {
		expect(validateSetup(base({ playerIds: [1, 1, 2, 3] })).ok).toBe(false);
	});

	it('requires rounds 1..30 for rotating', () => {
		expect(validateSetup(base({ rounds: 0 })).ok).toBe(false);
		expect(validateSetup(base({ rounds: 31 })).ok).toBe(false);
		expect(validateSetup(base({ rounds: null })).ok).toBe(false);
	});

	it('drops rounds for non-rotating styles', () => {
		const r = validateSetup(base({ style: 'fixed', rounds: 9 }));
		expect(r.ok && r.setup.rounds).toBe(null);
	});

	it('caps tables at what the players allow', () => {
		expect(maxTables('2v2', 8)).toBe(2);
		expect(maxTables('2v2', 7)).toBe(1);
		const r = validateSetup(base({ playerIds: ids(8), tables: 5 }));
		expect(r.ok && r.setup.tables).toBe(2);
		const r2 = validateSetup(base({ tables: 0 }));
		expect(r2.ok && r2.setup.tables).toBe(1);
	});

	it('rejects an unknown style or format', () => {
		expect(validateSetup(base({ style: 'swiss' as never })).ok).toBe(false);
		expect(validateSetup(base({ format: '4v4' as never })).ok).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/tournament`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Create `types.ts` exactly as in Interfaces above.

`src/lib/tournament/rng.ts`:

```ts
/** A seeded source of floats in [0, 1). Seeding keeps the create-page preview
    and the server-side draw identical, and makes tests deterministic. */
export type Rng = () => number;

/** mulberry32 — tiny, fast, good enough for shuffling a friend group. */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher–Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** A fresh seed that fits a Postgres `integer`. */
export function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 31);
}
```

`src/lib/tournament/validate.ts`:

```ts
import { teamSize, type TournamentSetup } from './types';
import type { Format } from '$lib/types';

export const MAX_ROUNDS = 30;
const STYLES = ['rotating', 'fixed', 'knockout'];
const FORMATS = ['1v1', '2v2', '3v3'];

/** Most matches that can run at once with this many players. */
export function maxTables(format: Format, playerCount: number): number {
	return Math.max(1, Math.floor(playerCount / (2 * teamSize(format))));
}

export type ValidationResult = { ok: true; setup: TournamentSetup } | { ok: false; error: string };

/** Checks a create-form setup and normalises it (rounds dropped for team
    styles, tables clamped to 1..maxTables). */
export function validateSetup(input: TournamentSetup): ValidationResult {
	const fail = (error: string): ValidationResult => ({ ok: false, error });
	if (!STYLES.includes(input.style)) return fail('Pick a style');
	if (!FORMATS.includes(input.format)) return fail('Pick a format');
	const size = teamSize(input.format);
	const n = input.playerIds.length;
	if (new Set(input.playerIds).size !== n) return fail('A player was picked twice');
	if (n < 2 * size) return fail(`Pick at least ${2 * size} players for ${input.format}`);
	if (input.style !== 'rotating' && n % size !== 0) {
		const extra = n % size;
		return fail(`${n} players can't be split into teams of ${size} — add ${size - extra} or remove ${extra}`);
	}
	let rounds: number | null = null;
	if (input.style === 'rotating') {
		if (!Number.isInteger(input.rounds) || input.rounds! < 1 || input.rounds! > MAX_ROUNDS)
			return fail(`Rounds must be between 1 and ${MAX_ROUNDS}`);
		rounds = input.rounds;
	}
	const wanted = Number.isFinite(input.tables) ? Math.floor(input.tables) : 1;
	const tables = Math.min(Math.max(1, wanted), maxTables(input.format, n));
	return { ok: true, setup: { ...input, rounds, tables } };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/tournament`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament
git commit -m "feat(tournament): types, seeded rng, setup validation"
```

---

### Task 3: Rotating-teams schedule

**Files:**
- Create: `src/lib/tournament/schedule.ts`
- Test: `src/lib/tournament/schedule.test.ts`

**Interfaces:**
- Consumes: `TournamentSetup`, `Schedule`, `ScheduledGame`, `teamSize` (types.ts); `mulberry32`, `shuffle`, `Rng` (rng.ts).
- Produces: `generateSchedule(setup: TournamentSetup, seed: number): Schedule` (setup must already be validated). Also exports `chunk<T>(items: T[], size: number): T[][]`.

- [ ] **Step 1: Write failing tests**

`src/lib/tournament/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateSchedule } from './schedule';
import type { Schedule, TournamentSetup } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const rotating = (n: number, rounds: number, tables = 1, format: TournamentSetup['format'] = '2v2'): TournamentSetup => ({
	style: 'rotating',
	format,
	playerIds: ids(n),
	rounds,
	tables
});

function gamesPlayed(s: Schedule, n: number) {
	const c = new Map(ids(n).map((id) => [id, 0]));
	for (const g of s.games) for (const id of [...g.sideA!, ...g.sideB!]) c.set(id, c.get(id)! + 1);
	return [...c.values()];
}

describe('generateSchedule — rotating', () => {
	it('is deterministic for a seed', () => {
		expect(generateSchedule(rotating(6, 5), 99)).toEqual(generateSchedule(rotating(6, 5), 99));
	});

	it('creates rounds × tables matches with full sides', () => {
		const s = generateSchedule(rotating(8, 4, 2), 1);
		expect(s.teams).toBeNull();
		expect(s.games).toHaveLength(8);
		for (const g of s.games) {
			expect(g.sideA).toHaveLength(2);
			expect(g.sideB).toHaveLength(2);
		}
		expect(s.games.map((g) => `${g.round}:${g.slot}`)).toEqual(['1:0', '1:1', '2:0', '2:1', '3:0', '3:1', '4:0', '4:1']);
	});

	it('never puts a player twice in one round', () => {
		const s = generateSchedule(rotating(9, 6, 2), 3);
		for (let r = 1; r <= 6; r++) {
			const inRound = s.games.filter((g) => g.round === r).flatMap((g) => [...g.sideA!, ...g.sideB!]);
			expect(new Set(inRound).size).toBe(inRound.length);
		}
	});

	it('rotates sit-outs fairly (games played differ by at most 1)', () => {
		for (const [n, rounds] of [[5, 5], [6, 5], [7, 3], [10, 7]]) {
			const counts = gamesPlayed(generateSchedule(rotating(n, rounds), n * 31), n);
			expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
		}
	});

	it('avoids repeat teammates when possible', () => {
		// 4 players 2v2, 3 rounds: exactly 3 distinct pairings exist — each once.
		const s = generateSchedule(rotating(4, 3), 5);
		const pairs = s.games.flatMap((g) => [g.sideA!.join('-'), g.sideB!.join('-')]);
		expect(new Set(pairs).size).toBe(6);
	});

	it('supports 1v1', () => {
		const s = generateSchedule(rotating(3, 3, 1, '1v1'), 2);
		expect(s.games.every((g) => g.sideA!.length === 1 && g.sideB!.length === 1)).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/tournament/schedule.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/tournament/schedule.ts`:

```ts
import { mulberry32, shuffle, type Rng } from './rng';
import { teamSize, type Schedule, type ScheduledGame, type TournamentSetup } from './types';

const ATTEMPTS = 200;
const TEAMMATE_WEIGHT = 10;
const OPPONENT_WEIGHT = 1;

const byNum = (a: number, b: number) => a - b;
const sorted = (ids: number[]) => [...ids].sort(byNum);
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Builds the full schedule for a validated setup. Same setup + seed → same draw. */
export function generateSchedule(setup: TournamentSetup, seed: number): Schedule {
	const rng = mulberry32(seed);
	if (setup.style === 'rotating') return rotating(setup, rng);
	throw new Error(`Unsupported style: ${setup.style}`);
}

function rotating(setup: TournamentSetup, rng: Rng): Schedule {
	const size = teamSize(setup.format);
	const matches = Math.min(setup.tables, Math.floor(setup.playerIds.length / (2 * size)));
	const perRound = matches * 2 * size;
	const played = new Map(setup.playerIds.map((id) => [id, 0]));
	const mates = new Map<string, number>();
	const opps = new Map<string, number>();
	const count = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
	const bump = (m: Map<string, number>, k: string) => m.set(k, count(m, k) + 1);

	// Lower = fewer repeat teammates (heavy) and repeat opponents (light).
	const score = (teams: number[][]) => {
		let s = 0;
		for (const t of teams)
			for (let i = 0; i < t.length; i++)
				for (let j = i + 1; j < t.length; j++) s += TEAMMATE_WEIGHT * count(mates, pairKey(t[i], t[j]));
		for (let m = 0; m < teams.length; m += 2)
			for (const x of teams[m]) for (const y of teams[m + 1]) s += OPPONENT_WEIGHT * count(opps, pairKey(x, y));
		return s;
	};

	const games: ScheduledGame[] = [];
	for (let round = 1; round <= (setup.rounds ?? 0); round++) {
		// Fewest games first. Shuffle before the (stable) sort = random tiebreak,
		// so sit-outs rotate fairly.
		const chosen = shuffle(setup.playerIds, rng)
			.sort((a, b) => played.get(a)! - played.get(b)!)
			.slice(0, perRound);
		let best: number[][] = [];
		let bestScore = Infinity;
		for (let i = 0; i < ATTEMPTS && bestScore > 0; i++) {
			const teams = chunk(shuffle(chosen, rng), size);
			const s = score(teams);
			if (s < bestScore) [best, bestScore] = [teams, s];
		}
		for (let m = 0; m < matches; m++) {
			const a = sorted(best[2 * m]);
			const b = sorted(best[2 * m + 1]);
			games.push({ round, slot: m, sideA: a, sideB: b });
			for (const t of [a, b]) {
				for (const id of t) played.set(id, played.get(id)! + 1);
				for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) bump(mates, pairKey(t[i], t[j]));
			}
			for (const x of a) for (const y of b) bump(opps, pairKey(x, y));
		}
	}
	return { teams: null, games };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/tournament/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/schedule.ts src/lib/tournament/schedule.test.ts
git commit -m "feat(tournament): rotating-teams schedule with fair sit-outs"
```

---

### Task 4: Fixed round-robin + knockout schedules, knockout wiring

**Files:**
- Modify: `src/lib/tournament/schedule.ts`
- Create: `src/lib/tournament/advance.ts`
- Test: `src/lib/tournament/schedule.test.ts` (append), `src/lib/tournament/advance.test.ts`

**Interfaces:**
- Produces (advance.ts):
  - `nextSlot(round: number, slot: number, totalRounds: number): { round: number; slot: number; side: Side } | null`
  - `totalRounds(games: { round: number }[]): number`
  - `canChangeKnockoutResult(games: TournamentGame[], game: TournamentGame): boolean`
  - `roundName(round: number, totalRounds: number): string` — "Final", "Semi-finals", "Quarter-finals", else `Round N`.

- [ ] **Step 1: Write failing tests**

Append to `schedule.test.ts`:

```ts
const teamStyle = (style: 'fixed' | 'knockout', n: number, tables = 1, format: TournamentSetup['format'] = '2v2'): TournamentSetup => ({
	style,
	format,
	playerIds: ids(n),
	rounds: null,
	tables
});

describe('generateSchedule — fixed round-robin', () => {
	it('draws teams covering every player once', () => {
		const s = generateSchedule(teamStyle('fixed', 6), 1);
		expect(s.teams).toHaveLength(3);
		expect(s.teams!.flat().sort((a, b) => a - b)).toEqual(ids(6));
	});

	it('plays every pair of teams exactly once', () => {
		for (const n of [4, 6, 8, 10]) {
			const s = generateSchedule(teamStyle('fixed', n), n);
			const t = s.teams!.length;
			const keys = s.games.map((g) => [g.sideA!.join('-'), g.sideB!.join('-')].sort().join('|'));
			expect(keys).toHaveLength((t * (t - 1)) / 2);
			expect(new Set(keys).size).toBe(keys.length);
		}
	});

	it('never schedules a team twice in one round and respects tables', () => {
		const s = generateSchedule(teamStyle('fixed', 12, 2), 4); // 6 teams, 3 matches per circle round → split
		const rounds = new Set(s.games.map((g) => g.round));
		for (const r of rounds) {
			const inRound = s.games.filter((g) => g.round === r);
			expect(inRound.length).toBeLessThanOrEqual(2);
			const players = inRound.flatMap((g) => [...g.sideA!, ...g.sideB!]);
			expect(new Set(players).size).toBe(players.length);
		}
	});
});

describe('generateSchedule — knockout', () => {
	it('4 teams: 2 semis with sides, final without', () => {
		const s = generateSchedule(teamStyle('knockout', 8), 1);
		expect(s.games.map((g) => `${g.round}:${g.slot}`)).toEqual(['1:0', '1:1', '2:0']);
		expect(s.games[2].sideA).toBeNull();
		expect(s.games[2].sideB).toBeNull();
	});

	it('5 teams: bracket of 8, 3 byes placed into round 2', () => {
		const s = generateSchedule(teamStyle('knockout', 10), 2);
		const r1 = s.games.filter((g) => g.round === 1);
		const r2 = s.games.filter((g) => g.round === 2);
		expect(r1).toHaveLength(1); // 4 slots − 3 byes
		expect(r2).toHaveLength(2);
		expect(s.games.filter((g) => g.round === 3)).toHaveLength(1);
		const knownR2Sides = r2.flatMap((g) => [g.sideA, g.sideB]).filter(Boolean);
		expect(knownR2Sides).toHaveLength(3);
		// every team appears exactly once in the known sides
		const placed = [...r1.flatMap((g) => [g.sideA!, g.sideB!]), ...(knownR2Sides as number[][])];
		expect(placed.map((t) => t.join('-')).sort()).toEqual(s.teams!.map((t) => t.join('-')).sort());
	});

	it('2 teams: a single final', () => {
		const s = generateSchedule(teamStyle('knockout', 2, 1, '1v1'), 3);
		expect(s.games).toEqual([{ round: 1, slot: 0, sideA: expect.any(Array), sideB: expect.any(Array) }]);
	});
});
```

`src/lib/tournament/advance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextSlot, totalRounds, canChangeKnockoutResult, roundName } from './advance';
import type { TournamentGame } from './types';

const g = (round: number, slot: number, winnerSide: 'A' | 'B' | null): TournamentGame => ({
	id: round * 10 + slot,
	round,
	slot,
	winnerSide,
	playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null,
	sideA: [1],
	sideB: [2]
});

describe('advance', () => {
	it('maps slots to the next round and side', () => {
		expect(nextSlot(1, 0, 3)).toEqual({ round: 2, slot: 0, side: 'A' });
		expect(nextSlot(1, 3, 3)).toEqual({ round: 2, slot: 1, side: 'B' });
		expect(nextSlot(3, 0, 3)).toBeNull();
	});

	it('counts rounds', () => {
		expect(totalRounds([g(1, 0, null), g(2, 0, null)])).toBe(2);
		expect(totalRounds([])).toBe(0);
	});

	it('allows changing a result only while the next match is unplayed', () => {
		const semi = g(1, 0, 'A');
		expect(canChangeKnockoutResult([semi, g(1, 1, 'B'), g(2, 0, null)], semi)).toBe(true);
		expect(canChangeKnockoutResult([semi, g(1, 1, 'B'), g(2, 0, 'A')], semi)).toBe(false);
		const final = g(2, 0, 'A');
		expect(canChangeKnockoutResult([semi, final], final)).toBe(true);
	});

	it('names rounds from the final backwards', () => {
		expect(roundName(3, 3)).toBe('Final');
		expect(roundName(2, 3)).toBe('Semi-finals');
		expect(roundName(1, 3)).toBe('Quarter-finals');
		expect(roundName(1, 4)).toBe('Round 1');
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/tournament`
Expected: FAIL ("Unsupported style" / advance missing).

- [ ] **Step 3: Implement**

In `schedule.ts`, replace the body of `generateSchedule`:

```ts
export function generateSchedule(setup: TournamentSetup, seed: number): Schedule {
	const rng = mulberry32(seed);
	switch (setup.style) {
		case 'rotating':
			return rotating(setup, rng);
		case 'fixed':
			return roundRobin(setup, rng);
		case 'knockout':
			return knockout(setup, rng);
	}
}
```

Append:

```ts
function drawTeams(setup: TournamentSetup, rng: Rng): number[][] {
	return chunk(shuffle(setup.playerIds, rng), teamSize(setup.format)).map(sorted);
}

/** Circle method: team 0 fixed, the rest rotate; every pair meets once. An odd
    team count adds a phantom (null) — its opponent rests that round. A circle
    round with more matches than `tables` becomes several numbered rounds. */
function roundRobin(setup: TournamentSetup, rng: Rng): Schedule {
	const teams = drawTeams(setup, rng);
	let ring: (number | null)[] = teams.map((_, i) => i);
	if (ring.length % 2) ring.push(null);
	const n = ring.length;
	const games: ScheduledGame[] = [];
	let round = 0;
	for (let r = 0; r < n - 1; r++) {
		const pairs: [number, number][] = [];
		for (let i = 0; i < n / 2; i++) {
			const a = ring[i];
			const b = ring[n - 1 - i];
			if (a !== null && b !== null) pairs.push([a, b]);
		}
		for (let c = 0; c < pairs.length; c += setup.tables) {
			round++;
			pairs.slice(c, c + setup.tables).forEach(([a, b], slot) =>
				games.push({ round, slot, sideA: teams[a], sideB: teams[b] })
			);
		}
		ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
	}
	return { teams, games };
}

/** Single elimination. Bracket = next power of 2; byes go straight into their
    round-2 slot (no round-1 game). Byes fill even slots first so bye teams
    meet a round-1 winner rather than each other where possible. */
function knockout(setup: TournamentSetup, rng: Rng): Schedule {
	const teams = drawTeams(setup, rng);
	let bracket = 1;
	while (bracket < teams.length) bracket *= 2;
	const rounds = Math.log2(bracket);
	const firstSlots = bracket / 2;
	const slotOrder = [
		...Array.from({ length: firstSlots }, (_, i) => i).filter((i) => i % 2 === 0),
		...Array.from({ length: firstSlots }, (_, i) => i).filter((i) => i % 2 === 1)
	];
	const byeSlots = new Set(slotOrder.slice(0, bracket - teams.length));
	const games: ScheduledGame[] = [];
	const round2 = new Map<number, { sideA: number[] | null; sideB: number[] | null }>();
	let next = 0;
	for (let slot = 0; slot < firstSlots; slot++) {
		if (byeSlots.has(slot)) {
			const entry = round2.get(slot >> 1) ?? { sideA: null, sideB: null };
			if (slot % 2 === 0) entry.sideA = teams[next++];
			else entry.sideB = teams[next++];
			round2.set(slot >> 1, entry);
		} else {
			games.push({ round: 1, slot, sideA: teams[next++], sideB: teams[next++] });
		}
	}
	for (let r = 2; r <= rounds; r++) {
		for (let slot = 0; slot < bracket / 2 ** r; slot++) {
			const pre = r === 2 ? round2.get(slot) : undefined;
			games.push({ round: r, slot, sideA: pre?.sideA ?? null, sideB: pre?.sideB ?? null });
		}
	}
	return { teams, games };
}
```

Create `src/lib/tournament/advance.ts`:

```ts
import type { Side } from '$lib/types';
import type { TournamentGame } from './types';

/** Knockout wiring: (round r, slot i) feeds (r + 1, ⌊i / 2⌋) as side A when i
    is even, side B when odd. Null after the final. */
export function nextSlot(
	round: number,
	slot: number,
	totalRounds: number
): { round: number; slot: number; side: Side } | null {
	if (round >= totalRounds) return null;
	return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'A' : 'B' };
}

export function totalRounds(games: { round: number }[]): number {
	return games.reduce((m, g) => Math.max(m, g.round), 0);
}

/** A knockout result may change only while the match it feeds is unplayed. */
export function canChangeKnockoutResult(games: TournamentGame[], game: TournamentGame): boolean {
	const next = nextSlot(game.round, game.slot, totalRounds(games));
	if (!next) return true;
	const target = games.find((g) => g.round === next.round && g.slot === next.slot);
	return !target || target.winnerSide === null;
}

export function roundName(round: number, total: number): string {
	const fromEnd = total - round;
	if (fromEnd === 0) return 'Final';
	if (fromEnd === 1) return 'Semi-finals';
	if (fromEnd === 2) return 'Quarter-finals';
	return `Round ${round}`;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/tournament`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament
git commit -m "feat(tournament): round-robin and knockout schedules, bracket wiring"
```

---

### Task 5: Standings

**Files:**
- Create: `src/lib/tournament/standings.ts`
- Test: `src/lib/tournament/standings.test.ts`

**Interfaces:**
- Consumes: `TournamentData`, `TournamentGame` (types.ts); `totalRounds` (advance.ts).
- Produces:

```ts
export interface StandingRow {
	/** Sorted player ids joined by '-' (single id for rotating). */
	key: string;
	playerIds: number[];
	/** Team number for fixed/knockout, null for rotating. */
	teamNo: number | null;
	/** 1-based, shared on ties; null = still alive in a knockout / no position yet. */
	position: number | null;
	played: number;
	wins: number;
	losses: number;
	/** Rotating: games won. Team styles: equals wins. */
	points: number;
	winRate: number;
}
export function standings(data: TournamentData): StandingRow[];
```

- [ ] **Step 1: Write failing tests**

`src/lib/tournament/standings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { standings } from './standings';
import type { TournamentData, TournamentGame, TournamentInfo, TournamentStyle } from './types';

let nextId = 1;
const game = (round: number, slot: number, sideA: number[], sideB: number[], winnerSide: 'A' | 'B' | null): TournamentGame => ({
	id: nextId++,
	round,
	slot,
	sideA,
	sideB,
	winnerSide,
	playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null
});
const info = (style: TournamentStyle): TournamentInfo => ({
	id: 1, name: 'T', style, format: style === 'knockout' ? '1v1' : '2v2', ranked: true,
	rounds: null, tables: 1, seed: 1, status: 'live', createdBy: 1,
	createdAt: '2026-09-29T19:00:00.000Z', finishedAt: null
});
const pos = (rows: ReturnType<typeof standings>) => Object.fromEntries(rows.map((r) => [r.key, r.position]));

describe('standings — rotating', () => {
	it('ranks by points, then win%, sharing unresolved ties', () => {
		const data: TournamentData = {
			tournament: info('rotating'),
			roster: [1, 2, 3, 4, 5].map((playerId) => ({ playerId, teamNo: null })),
			games: [
				game(1, 0, [1, 2], [3, 4], 'A'), // 5 sits out
				game(2, 0, [1, 5], [2, 3], 'A'), // 4 sits out
				game(3, 0, [4, 5], [1, 3], 'B') // 2 sits out
			]
		};
		const rows = standings(data);
		// 1: 3 pts; 5: 1 pt (1/2); 2: 1 pt (1/2); 3: 1 pt (1/3); 4: 0 pts
		expect(rows[0]).toMatchObject({ key: '1', position: 1, points: 3, played: 3 });
		expect(pos(rows)['4']).toBe(5);
		expect(pos(rows)['3']).toBe(4);
		// 2 and 5 tie on points + win%; head-to-head: game 2 had 5 beating 2 → 5 ahead.
		expect(pos(rows)['5']).toBe(2);
		expect(pos(rows)['2']).toBe(3);
	});

	it('includes players who have not played yet', () => {
		const data: TournamentData = {
			tournament: info('rotating'),
			roster: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
			games: [game(1, 0, [1, 2], [3, 4], null)]
		};
		const rows = standings(data);
		expect(rows).toHaveLength(4);
		expect(rows.every((r) => r.position === 1 && r.played === 0)).toBe(true);
	});
});

describe('standings — fixed', () => {
	it('ranks teams by wins with head-to-head tiebreak', () => {
		const data: TournamentData = {
			tournament: info('fixed'),
			roster: [
				{ playerId: 1, teamNo: 1 }, { playerId: 2, teamNo: 1 },
				{ playerId: 3, teamNo: 2 }, { playerId: 4, teamNo: 2 },
				{ playerId: 5, teamNo: 3 }, { playerId: 6, teamNo: 3 }
			],
			games: [
				game(1, 0, [1, 2], [3, 4], 'A'),
				game(2, 0, [3, 4], [5, 6], 'A'),
				game(3, 0, [5, 6], [1, 2], 'A')
			]
		};
		const rows = standings(data);
		// All 1–1; circular h2h → all share 1st.
		expect(rows.map((r) => r.position)).toEqual([1, 1, 1]);
		expect(rows[0].teamNo).not.toBeNull();
	});
});

describe('standings — knockout', () => {
	it('places champion, runner-up and shared semi-finalists', () => {
		const data: TournamentData = {
			tournament: info('knockout'),
			roster: [1, 2, 3, 4].map((playerId, i) => ({ playerId, teamNo: i + 1 })),
			games: [game(1, 0, [1], [2], 'A'), game(1, 1, [3], [4], 'B'), game(2, 0, [1], [4], 'B')]
		};
		expect(pos(standings(data))).toEqual({ '4': 1, '1': 2, '2': 3, '3': 3 });
	});

	it('leaves alive teams without a position while live', () => {
		const data: TournamentData = {
			tournament: info('knockout'),
			roster: [1, 2, 3, 4].map((playerId, i) => ({ playerId, teamNo: i + 1 })),
			games: [game(1, 0, [1], [2], 'A'), game(1, 1, [3], [4], null), game(2, 0, [1], [], null)]
		};
		const p = pos(standings(data));
		expect(p['2']).toBe(3);
		expect(p['1']).toBeNull();
		expect(p['3']).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/tournament/standings.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/tournament/standings.ts`:

```ts
import { totalRounds } from './advance';
import type { TournamentData, TournamentGame } from './types';

export interface StandingRow {
	key: string;
	playerIds: number[];
	teamNo: number | null;
	position: number | null;
	played: number;
	wins: number;
	losses: number;
	points: number;
	winRate: number;
}

type Unit = { key: string; playerIds: number[]; teamNo: number | null };

/** Which side a unit played on in a game, if any. Teams are fixed, so the
    first member identifies the side; for rotating the unit is one player. */
function sideOf(unit: Unit, g: TournamentGame): 'A' | 'B' | null {
	const id = unit.playerIds[0];
	if (g.sideA.includes(id)) return 'A';
	if (g.sideB.includes(id)) return 'B';
	return null;
}

function units(data: TournamentData): Unit[] {
	if (data.tournament.style === 'rotating') {
		return data.roster.map((r) => ({ key: String(r.playerId), playerIds: [r.playerId], teamNo: null }));
	}
	const byTeam = new Map<number, number[]>();
	for (const r of data.roster) byTeam.set(r.teamNo ?? 0, [...(byTeam.get(r.teamNo ?? 0) ?? []), r.playerId]);
	return [...byTeam.entries()]
		.sort(([a], [b]) => a - b)
		.map(([teamNo, ids]) => {
			const playerIds = [...ids].sort((a, b) => a - b);
			return { key: playerIds.join('-'), playerIds, teamNo };
		});
}

/** Wins by `u` in played games where it faced another member of `group`. */
function headToHead(u: Unit, group: Unit[], played: TournamentGame[]): number {
	let wins = 0;
	for (const g of played) {
		const side = sideOf(u, g);
		if (!side || g.winnerSide !== side) continue;
		if (group.some((o) => o !== u && sideOf(o, g) !== null && sideOf(o, g) !== side)) wins++;
	}
	return wins;
}

export function standings(data: TournamentData): StandingRow[] {
	const played = data.games.filter((g) => g.winnerSide !== null);
	const rows = units(data).map((u) => {
		let wins = 0;
		let losses = 0;
		for (const g of played) {
			const side = sideOf(u, g);
			if (!side) continue;
			if (g.winnerSide === side) wins++;
			else losses++;
		}
		const games = wins + losses;
		return { unit: u, played: games, wins, losses, points: wins, winRate: games ? wins / games : 0 };
	});
	type Row = (typeof rows)[number];
	const toOut = (r: Row, position: number | null): StandingRow => ({
		key: r.unit.key,
		playerIds: r.unit.playerIds,
		teamNo: r.unit.teamNo,
		position,
		played: r.played,
		wins: r.wins,
		losses: r.losses,
		points: r.points,
		winRate: r.winRate
	});

	// finalRound comes from ALL games (the bracket), not only played ones.
	if (data.tournament.style === 'knockout')
		return knockoutStandings(rows, played, totalRounds(data.games), toOut);

	const primary = (a: Row, b: Row) =>
		data.tournament.style === 'rotating' ? b.points - a.points || b.winRate - a.winRate : b.wins - a.wins;
	const sortedRows = [...rows].sort(primary);
	const out: StandingRow[] = [];
	for (let i = 0; i < sortedRows.length; ) {
		let j = i;
		while (j < sortedRows.length && primary(sortedRows[i], sortedRows[j]) === 0) j++;
		const group = sortedRows.slice(i, j);
		const groupUnits = group.map((r) => r.unit);
		const h2h = new Map(group.map((r) => [r, headToHead(r.unit, groupUnits, played)]));
		group.sort((a, b) => h2h.get(b)! - h2h.get(a)!);
		group.forEach((r, k) => {
			const shared = k > 0 && h2h.get(group[k - 1]) === h2h.get(r);
			out.push(toOut(r, shared ? out[out.length - 1].position : i + k + 1));
		});
		i = j;
	}
	return out;
}

/** Champion 1st, final loser 2nd, losers of round r share 2^(R−r) + 1.
    Teams still alive have no position yet (listed first). */
function knockoutStandings<R extends { unit: Unit }>(
	rows: R[],
	played: TournamentGame[],
	finalRound: number,
	toOut: (r: R, position: number | null) => StandingRow
): StandingRow[] {
	const positioned = rows.map((r) => {
		let position: number | null = null;
		for (const g of played) {
			const side = sideOf(r.unit, g);
			if (!side) continue;
			if (g.winnerSide !== side) position = 2 ** (finalRound - g.round) + 1;
			else if (g.round === finalRound) position = 1;
		}
		return { r, position };
	});
	// Alive (null) first, then by position.
	return positioned
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map(({ r, position }) => toOut(r, position));
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/tournament`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/standings.ts src/lib/tournament/standings.test.ts
git commit -m "feat(tournament): standings with tiebreaks per style"
```

---

### Task 6: Tournament DB layer

**Files:**
- Create: `src/lib/server/db/tournaments.ts`
- Test: `src/lib/server/db/tournaments.test.ts`

**Interfaces:**
- Consumes: schema (Task 1); `generateSchedule` (Tasks 3–4); `nextSlot`, `totalRounds`, `canChangeKnockoutResult` (Task 4); types (Task 2).
- Produces:

```ts
export type Actor = { playerId: number | null; isAdmin: boolean };
export type ActionResult = { ok: true } | { ok: false; error: string };
export function canManage(t: TournamentInfo, actor: Actor): boolean;
export async function createTournament(db: DB, input: { name: string; setup: TournamentSetup; ranked: boolean; seed: number; createdBy: number }): Promise<number>;
export async function getTournaments(db: DB): Promise<TournamentData[]>;
export async function getTournament(db: DB, id: number): Promise<TournamentData | null>;
export async function recordResult(db: DB, actor: Actor, tournamentId: number, gameId: number, winner: Side): Promise<ActionResult>;
export async function clearResult(db: DB, actor: Actor, tournamentId: number, gameId: number): Promise<ActionResult>;
export async function finishTournament(db: DB, actor: Actor, id: number): Promise<ActionResult>;
export async function abandonTournament(db: DB, actor: Actor, id: number): Promise<ActionResult>;
export async function deleteTournament(db: DB, id: number): Promise<void>;
```

- [ ] **Step 1: Write failing tests**

`src/lib/server/db/tournaments.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, getAllGames, getGameHistory } from './queries';
import {
	createTournament,
	getTournament,
	getTournaments,
	recordResult,
	clearResult,
	finishTournament,
	abandonTournament,
	deleteTournament,
	type Actor
} from './tournaments';
import type { TournamentSetup } from '$lib/tournament/types';

let db: Awaited<ReturnType<typeof makeTestDb>>;
let ids: number[];
let creator: Actor;
let other: Actor;
const admin: Actor = { playerId: null, isAdmin: true };

beforeEach(async () => {
	db = await makeTestDb();
	ids = [];
	for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) ids.push((await addPlayer(db, n)).id);
	creator = { playerId: ids[0], isAdmin: false };
	other = { playerId: ids[1], isAdmin: false };
});

const setup = (over: Partial<TournamentSetup>): TournamentSetup => ({
	style: 'rotating', format: '2v2', playerIds: ids.slice(0, 4), rounds: 3, tables: 1, ...over
});
const create = (over: Partial<TournamentSetup> = {}, ranked = true) =>
	createTournament(db, { name: 'Cup', setup: setup(over), ranked, seed: 7, createdBy: ids[0] });

describe('createTournament / getTournament', () => {
	it('stores tournament, roster and every scheduled game', async () => {
		const id = await create();
		const t = (await getTournament(db, id))!;
		expect(t.tournament).toMatchObject({ name: 'Cup', style: 'rotating', status: 'live', rounds: 3, seed: 7 });
		expect(t.roster).toHaveLength(4);
		expect(t.games).toHaveLength(3);
		expect(t.games.every((g) => g.winnerSide === null && g.sideA.length === 2 && g.sideB.length === 2)).toBe(true);
	});

	it('stores team numbers and unknown knockout sides', async () => {
		const id = await create({ style: 'knockout', playerIds: ids, rounds: null });
		const t = (await getTournament(db, id))!;
		expect(new Set(t.roster.map((r) => r.teamNo))).toEqual(new Set([1, 2, 3, 4]));
		const final = t.games.find((g) => g.round === 2)!;
		expect(final.sideA).toEqual([]);
		expect(final.sideB).toEqual([]);
	});

	it('returns null for an unknown id and lists all', async () => {
		await create();
		expect(await getTournament(db, 9999)).toBeNull();
		expect(await getTournaments(db)).toHaveLength(1);
	});

	it('scheduled games stay out of ratings and history', async () => {
		await create();
		expect(await getAllGames(db)).toEqual([]);
		expect(await getGameHistory(db)).toEqual([]);
	});
});

describe('recordResult', () => {
	it('lets any signed-in player enter an unplayed match', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		expect(await recordResult(db, other, id, g.id, 'A')).toEqual({ ok: true });
		expect((await getTournament(db, id))!.games[0].winnerSide).toBe('A');
		expect(await getAllGames(db)).toHaveLength(1);
	});

	it('refuses a second entry by a non-manager (race / already entered)', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		expect(await recordResult(db, other, id, g.id, 'B')).toEqual({
			ok: false,
			error: 'Only the creator or an admin can change a result'
		});
	});

	it('lets the creator change a result', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		expect(await recordResult(db, creator, id, g.id, 'B')).toEqual({ ok: true });
		expect((await getTournament(db, id))!.games[0].winnerSide).toBe('B');
	});

	it('unranked tournament results stay out of getAllGames but appear in history', async () => {
		const id = await create({}, false);
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		expect(await getAllGames(db)).toEqual([]);
		expect(await getGameHistory(db)).toHaveLength(1);
	});

	it('refuses a knockout match whose teams are not known yet', async () => {
		const id = await create({ style: 'knockout', playerIds: ids, rounds: null });
		const final = (await getTournament(db, id))!.games.find((g) => g.round === 2)!;
		expect(await recordResult(db, creator, id, final.id, 'A')).toEqual({
			ok: false,
			error: 'The teams for this match are not known yet'
		});
	});

	it('advances knockout winners and swaps them on change', async () => {
		const id = await create({ style: 'knockout', playerIds: ids, rounds: null });
		let t = (await getTournament(db, id))!;
		const semi0 = t.games.find((g) => g.round === 1 && g.slot === 0)!;
		const semi1 = t.games.find((g) => g.round === 1 && g.slot === 1)!;
		await recordResult(db, other, id, semi0.id, 'A');
		await recordResult(db, other, id, semi1.id, 'B');
		t = (await getTournament(db, id))!;
		let final = t.games.find((g) => g.round === 2)!;
		expect(final.sideA).toEqual(semi0.sideA);
		expect(final.sideB).toEqual(semi1.sideB);

		await recordResult(db, creator, id, semi0.id, 'B');
		final = (await getTournament(db, id))!.games.find((g) => g.round === 2)!;
		expect(final.sideA).toEqual(semi0.sideB);

		await recordResult(db, other, id, final.id, 'A');
		expect(await recordResult(db, creator, id, semi0.id, 'A')).toEqual({
			ok: false,
			error: 'Clear the next-round match first'
		});
	});

	it('rejects a game from another tournament', async () => {
		const a = await create();
		const b = await create();
		const g = (await getTournament(db, b))!.games[0];
		expect((await recordResult(db, other, a, g.id, 'A')).ok).toBe(false);
	});
});

describe('clearResult', () => {
	it('is creator/admin only and resets the match', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		expect((await clearResult(db, other, id, g.id)).ok).toBe(false);
		expect(await clearResult(db, admin, id, g.id)).toEqual({ ok: true });
		const after = (await getTournament(db, id))!.games[0];
		expect(after.winnerSide).toBeNull();
		expect(after.playedAt).toBeNull();
	});

	it('removes advanced knockout winners from the next match', async () => {
		const id = await create({ style: 'knockout', playerIds: ids, rounds: null });
		const semi0 = (await getTournament(db, id))!.games.find((g) => g.round === 1 && g.slot === 0)!;
		await recordResult(db, other, id, semi0.id, 'A');
		await clearResult(db, creator, id, semi0.id);
		const final = (await getTournament(db, id))!.games.find((g) => g.round === 2)!;
		expect(final.sideA).toEqual([]);
	});
});

describe('finish / abandon / delete', () => {
	it('finishes only when every match is played, then locks', async () => {
		const id = await create({ rounds: 1 });
		const g = (await getTournament(db, id))!.games[0];
		expect(await finishTournament(db, creator, id)).toEqual({ ok: false, error: 'Not every match has a result yet' });
		await recordResult(db, other, id, g.id, 'A');
		expect((await finishTournament(db, other, id)).ok).toBe(false);
		expect(await finishTournament(db, creator, id)).toEqual({ ok: true });
		const t = (await getTournament(db, id))!;
		expect(t.tournament.status).toBe('finished');
		expect(t.tournament.finishedAt).not.toBeNull();
		expect(await clearResult(db, admin, id, g.id)).toEqual({ ok: false, error: 'This tournament is closed' });
	});

	it('abandon deletes unplayed games and keeps played ones', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		expect(await abandonTournament(db, creator, id)).toEqual({ ok: true });
		const t = (await getTournament(db, id))!;
		expect(t.tournament.status).toBe('abandoned');
		expect(t.games).toHaveLength(1);
	});

	it('delete removes the tournament and its games', async () => {
		const id = await create();
		const g = (await getTournament(db, id))!.games[0];
		await recordResult(db, other, id, g.id, 'A');
		await deleteTournament(db, id);
		expect(await getTournament(db, id)).toBeNull();
		expect(await getGameHistory(db)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/server/db/tournaments.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/server/db/tournaments.ts`:

```ts
import { eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { games, gameParticipants, tournaments, tournamentPlayers } from './schema';
import type { DB } from './queries';
import { generateSchedule } from '$lib/tournament/schedule';
import { canChangeKnockoutResult, nextSlot, totalRounds } from '$lib/tournament/advance';
import type {
	RosterEntry,
	TournamentData,
	TournamentGame,
	TournamentInfo,
	TournamentSetup
} from '$lib/tournament/types';
import type { Side } from '$lib/types';

// Every multi-row write below is ONE statement (data-modifying CTEs): the
// production neon-http driver has no transactions (see insertGame).

export type Actor = { playerId: number | null; isAdmin: boolean };
export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export function canManage(t: TournamentInfo, actor: Actor): boolean {
	return actor.isAdmin || (actor.playerId !== null && actor.playerId === t.createdBy);
}

function rowsOf(res: unknown): Array<Record<string, unknown>> {
	// db.execute() shape differs by driver: neon-http → array, pglite/pg → { rows }.
	return (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
}

/** Inserts the tournament, roster, every scheduled game and all known
    participants in a single statement. The schedule is regenerated here from
    the seed — the client's preview is never trusted. `setup` must be validated. */
export async function createTournament(
	db: DB,
	input: { name: string; setup: TournamentSetup; ranked: boolean; seed: number; createdBy: number }
): Promise<number> {
	const { setup } = input;
	const schedule = generateSchedule(setup, input.seed);
	const roster = schedule.teams
		? schedule.teams.flatMap((team, i) => team.map((player_id) => ({ player_id, team_no: i + 1 })))
		: setup.playerIds.map((player_id) => ({ player_id, team_no: null }));
	const slots = schedule.games.map((g) => ({ round: g.round, slot: g.slot }));
	const parts = schedule.games.flatMap((g) => [
		...(g.sideA ?? []).map((player_id) => ({ round: g.round, slot: g.slot, player_id, side: 'A' })),
		...(g.sideB ?? []).map((player_id) => ({ round: g.round, slot: g.slot, player_id, side: 'B' }))
	]);
	const res = await db.execute(sql`
		WITH t AS (
			INSERT INTO tournaments (name, style, format, ranked, rounds, tables, seed, created_by)
			VALUES (${input.name}, ${setup.style}::tournament_style, ${setup.format}::format, ${input.ranked},
				${setup.rounds}, ${setup.tables}, ${input.seed}, ${input.createdBy})
			RETURNING id
		), r AS (
			INSERT INTO tournament_players (tournament_id, player_id, team_no)
			SELECT t.id, x.player_id, x.team_no
			FROM t, jsonb_to_recordset(${JSON.stringify(roster)}::jsonb) AS x(player_id int, team_no int)
		), g AS (
			INSERT INTO games (tournament_id, format, ranked, round, slot, created_by)
			SELECT t.id, ${setup.format}::format, ${input.ranked}, x.round, x.slot, ${input.createdBy}
			FROM t, jsonb_to_recordset(${JSON.stringify(slots)}::jsonb) AS x(round int, slot int)
			RETURNING id, round, slot
		), p AS (
			INSERT INTO game_participants (game_id, player_id, side)
			SELECT g.id, x.player_id, x.side::side
			FROM g JOIN jsonb_to_recordset(${JSON.stringify(parts)}::jsonb)
				AS x(round int, slot int, player_id int, side text)
				ON g.round = x.round AND g.slot = x.slot
		)
		SELECT id FROM t
	`);
	return Number(rowsOf(res)[0].id);
}

function toInfo(r: typeof tournaments.$inferSelect): TournamentInfo {
	return {
		id: r.id,
		name: r.name,
		style: r.style,
		format: r.format,
		ranked: r.ranked,
		rounds: r.rounds,
		tables: r.tables,
		seed: r.seed,
		status: r.status,
		createdBy: r.createdBy,
		createdAt: r.createdAt.toISOString(),
		finishedAt: r.finishedAt?.toISOString() ?? null
	};
}

async function load(db: DB, id?: number): Promise<TournamentData[]> {
	const tRows = await (id === undefined
		? db.select().from(tournaments)
		: db.select().from(tournaments).where(eq(tournaments.id, id)));
	if (tRows.length === 0) return [];
	const tIds = tRows.map((t) => t.id);
	const [roster, gRows] = await Promise.all([
		db.select().from(tournamentPlayers).where(inArray(tournamentPlayers.tournamentId, tIds)),
		db
			.select({
				id: games.id,
				tournamentId: games.tournamentId,
				round: games.round,
				slot: games.slot,
				winnerSide: games.winnerSide,
				playedAt: games.playedAt
			})
			.from(games)
			.where(id === undefined ? isNotNull(games.tournamentId) : eq(games.tournamentId, id))
	]);
	const gIds = gRows.map((g) => g.id);
	const parts = gIds.length
		? await db
				.select({ gameId: gameParticipants.gameId, playerId: gameParticipants.playerId, side: gameParticipants.side })
				.from(gameParticipants)
				.where(inArray(gameParticipants.gameId, gIds))
		: [];
	const sides = new Map<number, { A: number[]; B: number[] }>();
	for (const p of parts) {
		const e = sides.get(p.gameId) ?? { A: [], B: [] };
		e[p.side].push(p.playerId);
		sides.set(p.gameId, e);
	}
	return tRows.map((t) => ({
		tournament: toInfo(t),
		roster: roster
			.filter((r) => r.tournamentId === t.id)
			.map((r): RosterEntry => ({ playerId: r.playerId, teamNo: r.teamNo })),
		games: gRows
			.filter((g) => g.tournamentId === t.id)
			.map((g): TournamentGame => {
				const s = sides.get(g.id) ?? { A: [], B: [] };
				return {
					id: g.id,
					round: g.round!,
					slot: g.slot!,
					winnerSide: g.winnerSide,
					playedAt: g.playedAt?.toISOString() ?? null,
					sideA: [...s.A].sort((a, b) => a - b),
					sideB: [...s.B].sort((a, b) => a - b)
				};
			})
			.sort((a, b) => a.round - b.round || a.slot - b.slot)
	}));
}

export const getTournaments = (db: DB) => load(db);

export async function getTournament(db: DB, id: number): Promise<TournamentData | null> {
	return (await load(db, id))[0] ?? null;
}

/** Shared guards for result actions. */
async function gameFor(db: DB, tournamentId: number, gameId: number) {
	const data = await getTournament(db, tournamentId);
	if (!data) return { error: 'Tournament not found' } as const;
	if (data.tournament.status !== 'live') return { error: 'This tournament is closed' } as const;
	const game = data.games.find((g) => g.id === gameId);
	if (!game) return { error: 'Match not found' } as const;
	return { data, game } as const;
}

/** The knockout match a result feeds into, if any. */
function feed(data: TournamentData, game: TournamentGame) {
	if (data.tournament.style !== 'knockout') return null;
	const next = nextSlot(game.round, game.slot, totalRounds(data.games));
	if (!next) return null;
	const target = data.games.find((g) => g.round === next.round && g.slot === next.slot);
	return target ? { id: target.id, side: next.side } : null;
}

/** Enter (unplayed: anyone signed in) or change (played: creator/admin) a result. */
export async function recordResult(
	db: DB,
	actor: Actor,
	tournamentId: number,
	gameId: number,
	winner: Side
): Promise<ActionResult> {
	const found = await gameFor(db, tournamentId, gameId);
	if ('error' in found) return fail(found.error);
	const { data, game } = found;
	if (game.sideA.length === 0 || game.sideB.length === 0) return fail('The teams for this match are not known yet');
	const isChange = game.winnerSide !== null;
	if (isChange && !canManage(data.tournament, actor)) return fail('Only the creator or an admin can change a result');
	if (isChange && game.winnerSide === winner) return OK;
	if (isChange && data.tournament.style === 'knockout' && !canChangeKnockoutResult(data.games, game))
		return fail('Clear the next-round match first');

	const winners = winner === 'A' ? game.sideA : game.sideB;
	const next = feed(data, game);
	// The guard makes a first entry atomic: if two people submit at once, only
	// one UPDATE matches `winner_side IS NULL`; the other gets zero rows.
	const guard = isChange ? sql`winner_side IS NOT NULL` : sql`winner_side IS NULL`;
	const advance = next
		? sql`, del AS (
				DELETE FROM game_participants
				WHERE game_id = ${next.id} AND side = ${next.side}::side AND EXISTS (SELECT 1 FROM upd)
			), ins AS (
				INSERT INTO game_participants (game_id, player_id, side)
				SELECT ${next.id}, v.player_id, ${next.side}::side
				FROM upd, (VALUES ${sql.join(winners.map((id) => sql`(${id}::int)`), sql`, `)}) AS v(player_id)
			)`
		: sql``;
	const res = await db.execute(sql`
		WITH upd AS (
			UPDATE games SET winner_side = ${winner}::side, played_at = COALESCE(played_at, now())
			WHERE id = ${gameId} AND tournament_id = ${tournamentId} AND ${guard}
			RETURNING id
		)${advance}
		SELECT id FROM upd
	`);
	if (rowsOf(res).length === 0) return fail('Someone already entered this result — refresh the page');
	return OK;
}

export async function clearResult(db: DB, actor: Actor, tournamentId: number, gameId: number): Promise<ActionResult> {
	const found = await gameFor(db, tournamentId, gameId);
	if ('error' in found) return fail(found.error);
	const { data, game } = found;
	if (!canManage(data.tournament, actor)) return fail('Only the creator or an admin can clear a result');
	if (game.winnerSide === null) return OK;
	if (data.tournament.style === 'knockout' && !canChangeKnockoutResult(data.games, game))
		return fail('Clear the next-round match first');
	const next = feed(data, game);
	const unadvance = next
		? sql`, del AS (
				DELETE FROM game_participants
				WHERE game_id = ${next.id} AND side = ${next.side}::side AND EXISTS (SELECT 1 FROM upd)
			)`
		: sql``;
	await db.execute(sql`
		WITH upd AS (
			UPDATE games SET winner_side = NULL, played_at = NULL
			WHERE id = ${gameId} AND tournament_id = ${tournamentId}
			RETURNING id
		)${unadvance}
		SELECT id FROM upd
	`);
	return OK;
}

async function managed(db: DB, actor: Actor, id: number) {
	const data = await getTournament(db, id);
	if (!data) return { error: 'Tournament not found' } as const;
	if (!canManage(data.tournament, actor)) return { error: 'Only the creator or an admin can do that' } as const;
	if (data.tournament.status !== 'live') return { error: 'This tournament is closed' } as const;
	return { data } as const;
}

export async function finishTournament(db: DB, actor: Actor, id: number): Promise<ActionResult> {
	const found = await managed(db, actor, id);
	if ('error' in found) return fail(found.error);
	if (found.data.games.length === 0 || found.data.games.some((g) => g.winnerSide === null))
		return fail('Not every match has a result yet');
	await db
		.update(tournaments)
		.set({ status: 'finished', finishedAt: new Date() })
		.where(sql`${tournaments.id} = ${id} AND ${tournaments.status} = 'live'`);
	return OK;
}

export async function abandonTournament(db: DB, actor: Actor, id: number): Promise<ActionResult> {
	const found = await managed(db, actor, id);
	if ('error' in found) return fail(found.error);
	await db.execute(sql`
		WITH upd AS (
			UPDATE tournaments SET status = 'abandoned', finished_at = now()
			WHERE id = ${id} AND status = 'live'
			RETURNING id
		), del AS (
			DELETE FROM games
			WHERE tournament_id = ${id} AND winner_side IS NULL AND EXISTS (SELECT 1 FROM upd)
		)
		SELECT id FROM upd
	`);
	return OK;
}

/** Admin only (caller checks). Cascades to roster, games and participants. */
export async function deleteTournament(db: DB, id: number): Promise<void> {
	await db.delete(tournaments).where(eq(tournaments.id, id));
}
```

Note: the test "refuses a second entry by a non-manager" hits the permission check before the SQL guard; the SQL guard covers the true simultaneous race. If the `feed()` target's `game_participants` delete + insert in the same statement misbehaves on pglite, split `del` to only delete rows whose `player_id` is **not** in `winners` and make `ins` insert with `ON CONFLICT DO NOTHING` — but try the plain version first.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/server/db/tournaments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/tournaments.ts src/lib/server/db/tournaments.test.ts
git commit -m "feat(tournament): db layer — create, results, finish, abandon"
```

---

### Task 7: Ranked toggle on /log, unranked + tournament badges in history, guarded delete

**Files:**
- Modify: `src/lib/server/db/queries.ts` (`deleteGame`)
- Modify: `src/routes/log/+page.server.ts`, `src/routes/log/+page.svelte`
- Modify: `src/lib/components/GameLogRow.svelte`
- Modify: `src/routes/games/+page.server.ts`, `src/routes/games/+page.svelte`
- Modify: `src/routes/players/[id]/+page.server.ts`, `src/routes/players/[id]/+page.svelte`
- Test: `src/lib/server/db/queries.test.ts`

**Interfaces:**
- Consumes: `getGameHistory`, `HistoryGame`, `insertGame({ ranked })` (Task 1).
- Produces: `deleteGame(db, id): Promise<'ok' | 'tournament'>`; `GameLogRow` props `ranked?: boolean` (default `true`), `tournament?: { id: number; name: string; round: number } | null`.

- [ ] **Step 1: Write failing test**

Append to `queries.test.ts` inside `describe('ranked and scheduled games', …)`:

```ts
	it('deleteGame refuses tournament games', async () => {
		const [a, b, c, d] = await four();
		const [t] = await db
			.insert(tournaments)
			.values({ name: 'Cup', style: 'rotating', format: '2v2', ranked: true, rounds: 1, tables: 1, seed: 1, createdBy: a.id })
			.returning();
		const id = await insertGame(db, { playedAt: '2026-01-01T10:00:00.000Z', format: '2v2', winnerSide: 'A', sideA: [a.id, b.id], sideB: [c.id, d.id] });
		await db.update(gamesTable).set({ tournamentId: t.id, round: 1, slot: 0 });
		expect(await deleteGame(db, id)).toBe('tournament');
		expect(await getGameHistory(db)).toHaveLength(1);
		const plain = await insertGame(db, { playedAt: '2026-01-02T10:00:00.000Z', format: '2v2', winnerSide: 'A', sideA: [a.id, b.id], sideB: [c.id, d.id] });
		expect(await deleteGame(db, plain)).toBe('ok');
	});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/server/db/queries.test.ts`
Expected: FAIL (`deleteGame` returns undefined).

- [ ] **Step 3: Implement `deleteGame` guard**

In `queries.ts` (add `isNull` is already imported):

```ts
/** Deletes a one-off game. Tournament games are refused: removing one would
    break its schedule/bracket — they are managed on the tournament page. */
export async function deleteGame(db: DB, id: number): Promise<'ok' | 'tournament'> {
	const rows = await db.select({ t: games.tournamentId }).from(games).where(eq(games.id, id));
	if (rows[0]?.t != null) return 'tournament';
	await db.delete(games).where(and(eq(games.id, id), isNull(games.tournamentId)));
	return 'ok';
}
```

In `src/routes/games/+page.server.ts` delete action:

```ts
		if ((await deleteGame(db, id)) === 'tournament')
			return fail(400, { error: 'Tournament games are managed on the tournament page' });
		return { ok: true };
```

- [ ] **Step 4: /log Ranked toggle**

`src/routes/log/+page.server.ts`: after parsing `sideB`, add `const ranked = form.get('ranked') !== 'false';` and pass `ranked` to `insertGame`.

`src/routes/log/+page.svelte`: add state `let ranked = $state(true);`, a hidden input `<input type="hidden" name="ranked" value={String(ranked)} />` next to the other hidden inputs, and above the date field:

```svelte
	<label class="rankedfield">
		<span>
			<span class="dlbl">Ranked</span>
			<span class="hint">Off = casual game: logged, but no Elo or stats impact</span>
		</span>
		<input type="checkbox" class="switch" bind:checked={ranked} />
	</label>
```

Styles (add to the page `<style>`):

```css
	.rankedfield {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.rankedfield .hint {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.switch {
		appearance: none;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--surface-2);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background 0.15s ease;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s ease;
	}
	.switch:checked {
		background: var(--teal);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
```

(If `.dlbl` isn't styled as a block label already in this page, reuse whatever class the "Date played" label uses.)

- [ ] **Step 5: `GameLogRow` badges**

In `src/lib/components/GameLogRow.svelte` add props:

```ts
		/** False = casual/unranked game: shows a badge. */
		ranked = true,
		/** Set when the game belongs to a tournament: shows a link to it. */
		tournament = null
```

with types `ranked?: boolean; tournament?: { id: number; name: string; round: number } | null;`, and in `.line1` after the date:

```svelte
			{#if !ranked}<span class="fmt unr">Unranked</span>{/if}
			{#if tournament}
				<a class="tlink" href={resolve('/tournaments/[id]', { id: String(tournament.id) })}
					>🏆 {tournament.name} · R{tournament.round}</a
				>
			{/if}
```

Styles:

```css
	.fmt.unr {
		background: #cbb98f;
		color: #4a3d24;
	}
	.tlink {
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--teal);
		text-decoration: none;
	}
	.tlink:hover {
		text-decoration: underline;
	}
```

Note: `resolve('/tournaments/[id]', …)` only type-checks once the route exists (Task 10). Until then `pnpm check` may flag it; that is expected — the check in this task's Step 7 runs after creating a stub: create `src/routes/tournaments/[id]/+page.svelte` containing just `<h1>Tournament</h1>` (Task 10 replaces it).

- [ ] **Step 6: Use history in /games and player page**

`src/routes/games/+page.server.ts`: replace `getAllGames` with `getGameHistory` (import + call), and add to each row `ranked: g.ranked, tournament: g.tournament`.

`src/routes/games/+page.svelte`: in the game row markup, after the date, render the same badge/link as `GameLogRow` (`{#if !g.ranked}<span class="chip">Unranked</span>{/if}` and a `🏆 {g.tournament.name} · R{g.tournament.round}` link via `resolve('/tournaments/[id]', …)`), and wrap the admin delete button in `{#if !g.tournament}`.

`src/routes/players/[id]/+page.server.ts`: add `getGameHistory(db)` to the `Promise.all` (as `historyGames`), build history from it:

```ts
	const history = playerGameLog(historyGames, id, deltaByGame).map((e) => {
		const g = historyById.get(e.gameId)!;
		return {
			gameId: e.gameId,
			playedAt: e.playedAt,
			format: e.format,
			won: e.won,
			delta: e.delta,
			ranked: g.ranked,
			tournament: g.tournament,
			teammates: e.teammateIds.map(resolve),
			opponents: e.opponentIds.map(resolve)
		};
	});
```

with `const historyById = new Map(historyGames.map((g) => [g.id, g]));` above it. (Unranked games have no entry in `deltaByGame`, so `delta` is 0.)

`src/routes/players/[id]/+page.svelte`: pass the new props and show `±0` for unranked:

```svelte
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
```

- [ ] **Step 7: Verify**

Run: `pnpm vitest run && pnpm check && pnpm lint`
Expected: all pass, 0 errors/warnings (run `pnpm format` first if Prettier complains).

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(games): ranked toggle, unranked/tournament badges, guard tournament deletes"
```

---

### Task 8: Tournaments list page + nav

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Create: `src/routes/tournaments/+page.server.ts`, `src/routes/tournaments/+page.svelte`
- Create: `src/lib/tournament/summary.ts` (list helpers only; extended in Task 11)
- Test: `src/lib/tournament/summary.test.ts`

**Interfaces:**
- Consumes: `getTournaments` (Task 6), `standings` (Task 5).
- Produces (summary.ts): `progress(data: TournamentData): { played: number; total: number; round: number | null }`; `winners(data: TournamentData): StandingRow[]` (position-1 rows; empty unless `finished`).

- [ ] **Step 1: Failing tests**

Update `src/lib/nav.test.ts`: in "always shows unconditional links" add `'Tournaments'` to the `arrayContaining` list; in "keeps a stable order" expect `['Board', 'Tournaments', 'MVP', 'Players', 'Log', 'Games']`.

`src/lib/tournament/summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { progress, winners } from './summary';
import type { TournamentData, TournamentGame, TournamentStatus } from './types';

const g = (id: number, round: number, winnerSide: 'A' | 'B' | null, a: number[], b: number[]): TournamentGame => ({
	id, round, slot: 0, sideA: a, sideB: b, winnerSide, playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null
});
const data = (status: TournamentStatus, games: TournamentGame[]): TournamentData => ({
	tournament: {
		id: 1, name: 'T', style: 'rotating', format: '2v2', ranked: true, rounds: 2, tables: 1, seed: 1,
		status, createdBy: 1, createdAt: '2026-09-29T19:00:00.000Z', finishedAt: null
	},
	roster: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
	games
});

describe('progress', () => {
	it('counts played games and the first round with an open match', () => {
		const d = data('live', [g(1, 1, 'A', [1, 2], [3, 4]), g(2, 2, null, [1, 3], [2, 4])]);
		expect(progress(d)).toEqual({ played: 1, total: 2, round: 2 });
	});
	it('round is null when everything is played', () => {
		expect(progress(data('live', [g(1, 1, 'A', [1, 2], [3, 4])])).round).toBeNull();
	});
});

describe('winners', () => {
	it('is empty unless finished', () => {
		expect(winners(data('live', [g(1, 1, 'A', [1, 2], [3, 4])]))).toEqual([]);
	});
	it('returns every position-1 row when finished', () => {
		const w = winners(data('finished', [g(1, 1, 'A', [1, 2], [3, 4])]));
		expect(w.map((r) => r.key).sort()).toEqual(['1', '2']);
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/nav.test.ts src/lib/tournament/summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement nav + summary**

`src/lib/nav.ts`: extend `NavHref` with `'/tournaments'` and insert after Board:

```ts
	{ href: '/tournaments', label: 'Tournaments', icon: '🏆' },
```

`src/lib/tournament/summary.ts`:

```ts
import { standings, type StandingRow } from './standings';
import type { TournamentData } from './types';

export function progress(data: TournamentData): { played: number; total: number; round: number | null } {
	const played = data.games.filter((g) => g.winnerSide !== null).length;
	const open = data.games.filter((g) => g.winnerSide === null).map((g) => g.round);
	return { played, total: data.games.length, round: open.length ? Math.min(...open) : null };
}

/** The champion(s) of a finished tournament (shared first place possible). */
export function winners(data: TournamentData): StandingRow[] {
	if (data.tournament.status !== 'finished') return [];
	return standings(data).filter((r) => r.position === 1);
}
```

- [ ] **Step 3b: Stub the create route**

The list page links to `/tournaments/new`, which `resolve()` only accepts once the route exists. Create `src/routes/tournaments/new/+page.svelte` containing just `<h1>New tournament</h1>` (Task 9 replaces it).

- [ ] **Step 4: List page server**

`src/routes/tournaments/+page.server.ts`:

```ts
import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import { getTournaments } from '$lib/server/db/tournaments';
import { progress, winners } from '$lib/tournament/summary';
import { creatureFor } from '$lib/creatures';
import type { PageServerLoad } from './$types';

const ORDER = { live: 0, finished: 1, abandoned: 2 } as const;

export const load: PageServerLoad = async ({ locals }) => {
	const [players, all] = await Promise.all([getPlayers(db), getTournaments(db)]);
	const byId = new Map(players.map((p) => [p.id, p]));
	const member = (id: number) => ({
		id,
		name: byId.get(id)?.name ?? `#${id}`,
		emoji: creatureFor(id, byId.get(id)?.avatar ?? null)
	});
	const tournaments = all
		.map((d) => ({
			id: d.tournament.id,
			name: d.tournament.name,
			style: d.tournament.style,
			format: d.tournament.format,
			ranked: d.tournament.ranked,
			status: d.tournament.status,
			createdAt: d.tournament.createdAt,
			playerCount: d.roster.length,
			rounds: Math.max(0, ...d.games.map((g) => g.round)),
			progress: progress(d),
			winners: winners(d).map((w) => ({ members: w.playerIds.map(member), points: w.points }))
		}))
		.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.createdAt < b.createdAt ? 1 : -1));
	return { tournaments, canCreate: locals.auth.player !== null };
};
```

- [ ] **Step 5: List page UI**

`src/routes/tournaments/+page.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();

	const STYLE = { rotating: '🔀 Rotating teams', fixed: '🛡️ Fixed teams', knockout: '🥊 Knockout' };
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<div class="head">
	<h1>🏆 Tournaments</h1>
	{#if data.canCreate}<a class="btn" href={resolve('/tournaments/new')}>+ New tournament</a>{/if}
</div>

{#if data.tournaments.length === 0}
	<p class="card">No tournaments yet.</p>
{:else}
	<div class="card list">
		{#each data.tournaments as t (t.id)}
			<a class="row" class:abandoned={t.status === 'abandoned'} href={resolve('/tournaments/[id]', { id: String(t.id) })}>
				<span class="trophy">{t.status === 'live' ? '⏳' : t.status === 'finished' ? '🏆' : '✖️'}</span>
				<span class="mid">
					<span class="name">{t.name}</span>
					<span class="meta">{fmtDate(t.createdAt)} · {STYLE[t.style]} · {t.format} · {t.playerCount} players</span>
					{#if t.status === 'live'}
						<span class="meta">
							{#if t.progress.round}Round {t.progress.round} of {t.rounds} · {/if}{t.progress.played}/{t.progress.total} games played
						</span>
					{:else if t.status === 'finished'}
						<span class="win">
							🥇
							{#each t.winners as w, i (i)}
								{#if i > 0}<span class="meta"> / </span>{/if}
								{w.members.map((m) => `${m.emoji} ${m.name}`).join(' + ')}
								{#if t.style === 'rotating'}<span class="meta">({w.points} pts)</span>{/if}
							{/each}
						</span>
					{:else}
						<span class="meta">Abandoned</span>
					{/if}
				</span>
				<span class="chips">
					{#if t.status === 'live'}<span class="chip live">● LIVE</span>{/if}
					<span class="chip" class:unr={!t.ranked}>{t.ranked ? 'Ranked' : 'Unranked'}</span>
				</span>
			</a>
		{/each}
	</div>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.btn {
		text-decoration: none;
	}
	.list {
		margin-top: 1rem;
		padding: 0.3rem 0.9rem;
	}
	.row {
		display: grid;
		grid-template-columns: 44px 1fr auto;
		gap: 0.7rem;
		align-items: center;
		padding: 0.7rem 0;
		color: var(--ink);
		text-decoration: none;
		border-top: 1px solid var(--line-card);
	}
	.row:first-child {
		border-top: 0;
	}
	.row:hover .name {
		text-decoration: underline;
	}
	.row.abandoned {
		opacity: 0.55;
	}
	.trophy {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 1.3rem;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border: 2px solid var(--edge);
	}
	.mid {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
	.name,
	.win {
		font-weight: 800;
	}
	.meta {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.chips {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-end;
	}
	.chip.live {
		background: var(--coral);
		color: #fff;
	}
	.chip.unr {
		background: #cbb98f;
		color: #4a3d24;
	}
</style>
```

(The LIVE chip on the list stays coral as in the approved mockup; only the *pending match* highlight is teal.)

- [ ] **Step 6: Verify**

Run: `pnpm vitest run && pnpm check && pnpm lint`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(tournament): list page and nav entry"
```

---

### Task 9: Create page with live draw preview

**Files:**
- Create: `src/routes/tournaments/new/+page.server.ts`, `src/routes/tournaments/new/+page.svelte`

**Interfaces:**
- Consumes: `validateSetup`, `maxTables`, `MAX_ROUNDS` (Task 2); `generateSchedule` (Tasks 3–4); `randomSeed` (Task 2); `createTournament` (Task 6); `getPlayers`, `requireAuth`.

- [ ] **Step 1: Server**

`src/routes/tournaments/new/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import { createTournament } from '$lib/server/db/tournaments';
import { validateSetup } from '$lib/tournament/validate';
import type { TournamentSetup } from '$lib/tournament/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.auth);
	const players = await getPlayers(db);
	return { players: players.filter((p) => p.isActive) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAuth(locals.auth);
		const createdBy = locals.auth.player?.id;
		if (createdBy == null) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name || name.length > 60) return fail(400, { error: 'Name must be 1–60 characters' });
		const seed = Number(form.get('seed'));
		if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 31) return fail(400, { error: 'Invalid draw' });
		const playerIds = form.getAll('playerIds').map(Number).filter(Number.isInteger);
		const active = new Set((await getPlayers(db)).filter((p) => p.isActive).map((p) => p.id));
		if (!playerIds.every((id) => active.has(id))) return fail(400, { error: 'Unknown or inactive player' });
		const input: TournamentSetup = {
			style: String(form.get('style')) as TournamentSetup['style'],
			format: String(form.get('format')) as TournamentSetup['format'],
			playerIds,
			rounds: form.get('rounds') ? Number(form.get('rounds')) : null,
			tables: Number(form.get('tables')) || 1
		};
		const v = validateSetup(input);
		if (!v.ok) return fail(400, { error: v.error });
		const id = await createTournament(db, {
			name,
			setup: v.setup,
			ranked: form.get('ranked') !== 'false',
			seed,
			createdBy
		});
		throw redirect(303, `/tournaments/${id}`);
	}
};
```

- [ ] **Step 2: UI**

`src/routes/tournaments/new/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { creatureFor } from '$lib/creatures';
	import { validateSetup, maxTables, MAX_ROUNDS } from '$lib/tournament/validate';
	import { generateSchedule } from '$lib/tournament/schedule';
	import { randomSeed } from '$lib/tournament/rng';
	import type { TournamentStyle } from '$lib/tournament/types';
	import type { Format } from '$lib/types';
	let { data, form } = $props();

	const STYLES: { v: TournamentStyle; icon: string; label: string; text: string }[] = [
		{ v: 'rotating', icon: '🔀', label: 'Rotating teams', text: 'New random teams every round. Individual points.' },
		{ v: 'fixed', icon: '🛡️', label: 'Fixed teams', text: 'Teams drawn once, everyone plays everyone.' },
		{ v: 'knockout', icon: '🥊', label: 'Knockout', text: "Lose and you're out. Bracket to a final." }
	];

	let name = $state(
		`Tournament ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
	);
	let style = $state<TournamentStyle>('rotating');
	let format = $state<Format>('2v2');
	let selected = $state<number[]>([]);
	let rounds = $state(5);
	let tables = $state(1);
	let ranked = $state(true);
	let seed = $state(randomSeed());
	let submitting = $state(false);

	const byId = $derived(new Map(data.players.map((p) => [p.id, p])));
	const label = (id: number) => {
		const p = byId.get(id);
		return p ? `${creatureFor(p.id, p.avatar)} ${p.name}` : `#${id}`;
	};
	const toggle = (id: number) =>
		(selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

	const cap = $derived(maxTables(format, selected.length));
	const result = $derived(
		validateSetup({ style, format, playerIds: selected, rounds: style === 'rotating' ? rounds : null, tables })
	);
	const schedule = $derived(result.ok ? generateSchedule(result.setup, seed) : null);
	const sitting = (round: number) => {
		if (!schedule || style !== 'rotating') return [];
		const playing = new Set(schedule.games.filter((g) => g.round === round).flatMap((g) => [...g.sideA!, ...g.sideB!]));
		return selected.filter((id) => !playing.has(id));
	};
	const previewRounds = $derived(schedule ? [...new Set(schedule.games.map((g) => g.round))] : []);
	const side = (ids: number[] | null) => (ids ? ids.map(label).join(' + ') : 'TBD');
</script>

<a class="backlink" href={resolve('/tournaments')}>← Tournaments</a>
<h1>New tournament</h1>

<form
	method="POST"
	class="card"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<input type="hidden" name="style" value={style} />
	<input type="hidden" name="format" value={format} />
	<input type="hidden" name="seed" value={seed} />
	<input type="hidden" name="ranked" value={String(ranked)} />
	{#if style === 'rotating'}<input type="hidden" name="rounds" value={rounds} />{/if}
	<input type="hidden" name="tables" value={Math.min(tables, cap)} />
	{#each selected as id (id)}<input type="hidden" name="playerIds" value={id} />{/each}

	<label class="sec" for="tname">Name</label>
	<input id="tname" class="text" name="name" bind:value={name} maxlength="60" required />

	<div class="sec">Style</div>
	<div class="styles">
		{#each STYLES as s (s.v)}
			<button type="button" class="style" class:on={style === s.v} onclick={() => (style = s.v)}>
				<b>{s.icon} {s.label}</b>{s.text}
			</button>
		{/each}
	</div>

	<div class="sec">Format</div>
	<div class="segset">
		{#each ['1v1', '2v2', '3v3'] as const as f (f)}
			<button type="button" class:on={format === f} onclick={() => (format = f)}>{f}</button>
		{/each}
	</div>

	<div class="sec">Players <span class="count">({selected.length} selected)</span></div>
	<div class="players">
		{#each data.players as p (p.id)}
			<button type="button" class="pl" class:on={selected.includes(p.id)} onclick={() => toggle(p.id)}>
				{creatureFor(p.id, p.avatar)} {p.name}
			</button>
		{/each}
	</div>

	{#if style === 'rotating'}
		<label class="field">
			<span><b>Rounds</b></span>
			<input class="num" type="number" min="1" max={MAX_ROUNDS} bind:value={rounds} />
		</label>
	{/if}
	<label class="field">
		<span><b>Matches at once</b><span class="hint">Up to {cap} with {selected.length} players</span></span>
		<input class="num" type="number" min="1" max={cap} bind:value={tables} />
	</label>
	<label class="field">
		<span><b>Ranked</b><span class="hint">Games count for Elo, board and stats</span></span>
		<input type="checkbox" class="switch" bind:checked={ranked} />
	</label>

	<div class="sec">Draw preview</div>
	{#if !result.ok}
		<p class="hint">{result.error}</p>
	{:else if schedule}
		<div class="draw">
			{#each previewRounds as r (r)}
				{#each schedule.games.filter((g) => g.round === r) as g (g.slot)}
					<div class="m">
						<b>R{r}{schedule.games.filter((x) => x.round === r).length > 1 ? ` · T${g.slot + 1}` : ''}</b>
						<span>{side(g.sideA)}</span><span class="vs">VS</span><span>{side(g.sideB)}</span>
					</div>
				{/each}
				{#if sitting(r).length}
					<div class="out">Sits out: {sitting(r).map(label).join(', ')}</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<div class="actions">
		<button type="button" class="btn secondary" onclick={() => (seed = randomSeed())} disabled={!result.ok}
			>🎲 Reshuffle</button
		>
		<button class="btn" type="submit" disabled={!result.ok || !name.trim() || submitting}>
			{#if submitting}<span class="spin" aria-hidden="true"></span> Starting…{:else}Start tournament{/if}
		</button>
	</div>
</form>

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
	}
	form {
		display: grid;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.sec {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-top: 0.6rem;
	}
	.count {
		text-transform: none;
		font-weight: 600;
	}
	.text,
	.num {
		padding: 0.45rem 0.6rem;
		border-radius: 9px;
		border: 2px solid var(--line-card);
		background: var(--bg);
		font: inherit;
		font-weight: 700;
		color: var(--ink);
	}
	.num {
		width: 4.5rem;
		text-align: center;
	}
	.styles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.5rem;
	}
	.style {
		text-align: left;
		border: 2px solid var(--line-card);
		border-radius: 12px;
		padding: 0.55rem;
		background: var(--surface);
		font: inherit;
		font-size: 0.8rem;
		color: var(--ink);
		cursor: pointer;
	}
	.style b {
		display: block;
		font-size: 0.88rem;
	}
	.style.on {
		border-color: var(--teal);
		box-shadow: 0 0 0 2px var(--teal) inset;
	}
	.players {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.pl {
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		border: 2px solid var(--line-card);
		background: var(--surface);
		font: inherit;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--ink);
		cursor: pointer;
	}
	.pl.on {
		border-color: var(--teal);
		background: #d6efe9;
	}
	.field {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-top: 0.4rem;
	}
	.hint {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.switch {
		appearance: none;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--surface-2);
		position: relative;
		cursor: pointer;
		flex: none;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s ease;
	}
	.switch:checked {
		background: var(--teal);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
	.draw {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 12px;
		padding: 0.4rem 0.7rem;
		font-size: 0.82rem;
		max-height: 22rem;
		overflow: auto;
	}
	.m {
		display: grid;
		grid-template-columns: 3.4rem 1fr auto 1fr;
		gap: 0.4rem;
		align-items: center;
		padding: 0.3rem 0;
		border-top: 1px dashed var(--line-card);
	}
	.m:first-child {
		border-top: 0;
	}
	.vs {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.7rem;
	}
	.out {
		color: var(--muted);
		font-size: 0.75rem;
		padding: 0 0 0.3rem 3.8rem;
	}
	.err {
		color: var(--danger);
		font-weight: 700;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
</style>
```

- [ ] **Step 3: Verify**

Run: `pnpm check && pnpm lint`
Expected: 0 errors / 0 warnings.

Manual: `pnpm dev --port 5199`, sign in, open `/tournaments/new`, pick 7 players with 2v2 fixed → hint shows "add 1 or remove 1"; switch to rotating → preview shows sit-outs; 🎲 changes the draw; Start redirects to `/tournaments/<id>` (stub page).

- [ ] **Step 4: Commit**

```bash
git add src/routes/tournaments/new
git commit -m "feat(tournament): create page with seeded draw preview"
```

---

### Task 10: Detail page — standings, bracket, schedule, result entry

**Files:**
- Create: `src/lib/components/TournamentMatchCard.svelte`, `src/lib/components/TournamentStandings.svelte`, `src/lib/components/KnockoutBracket.svelte`
- Create: `src/routes/tournaments/[id]/+page.server.ts`
- Replace: `src/routes/tournaments/[id]/+page.svelte` (stub from Task 7)

**Interfaces:**
- Consumes: `getTournament`, `recordResult`, `clearResult`, `finishTournament`, `abandonTournament`, `deleteTournament`, `canManage`, `Actor` (Task 6); `standings` (Task 5); `canChangeKnockoutResult`, `roundName`, `totalRounds` (Task 4); `progress` (Task 8).
- Produces view-model types used by the components (defined in the server file and imported via `PageData`):

```ts
type Member = { id: number; name: string; emoji: string };
type MatchView = {
	id: number;
	round: number;
	slot: number;
	team1: Member[]; // side A
	team2: Member[]; // side B
	/** Label when a side isn't known yet, e.g. "Winner of Semi-finals M1". */
	team1Label: string | null;
	team2Label: string | null;
	winnerSide: 'A' | 'B' | null;
	/** Result may be changed/cleared (creator/admin + knockout rule). */
	editable: boolean;
};
```

- [ ] **Step 1: Server**

`src/routes/tournaments/[id]/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin, requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import {
	abandonTournament,
	canManage,
	clearResult,
	deleteTournament,
	finishTournament,
	getTournament,
	recordResult,
	type Actor,
	type ActionResult
} from '$lib/server/db/tournaments';
import { standings } from '$lib/tournament/standings';
import { canChangeKnockoutResult, roundName, totalRounds } from '$lib/tournament/advance';
import { progress } from '$lib/tournament/summary';
import { creatureFor } from '$lib/creatures';
import type { Actions, PageServerLoad } from './$types';

const actorOf = (locals: App.Locals): Actor => ({
	playerId: locals.auth.player?.id ?? null,
	isAdmin: locals.auth.isAdmin
});

function parseId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Tournament not found');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = parseId(params.id);
	const [data, players] = await Promise.all([getTournament(db, id), getPlayers(db)]);
	if (!data) throw error(404, 'Tournament not found');
	const byId = new Map(players.map((p) => [p.id, p]));
	const member = (pid: number) => ({
		id: pid,
		name: byId.get(pid)?.name ?? `#${pid}`,
		emoji: creatureFor(pid, byId.get(pid)?.avatar ?? null)
	});
	const t = data.tournament;
	const actor = actorOf(locals);
	const manage = canManage(t, actor);
	const live = t.status === 'live';
	const total = totalRounds(data.games);
	const feederLabel = (round: number, slot: number) =>
		`Winner of ${roundName(round - 1, total)} M${slot + 1}`;

	const matches = data.games.map((g) => ({
		id: g.id,
		round: g.round,
		slot: g.slot,
		team1: g.sideA.map(member),
		team2: g.sideB.map(member),
		team1Label: g.sideA.length ? null : t.style === 'knockout' ? feederLabel(g.round, g.slot * 2) : 'TBD',
		team2Label: g.sideB.length ? null : t.style === 'knockout' ? feederLabel(g.round, g.slot * 2 + 1) : 'TBD',
		winnerSide: g.winnerSide,
		editable:
			live && manage && g.winnerSide !== null && (t.style !== 'knockout' || canChangeKnockoutResult(data.games, g))
	}));

	const rows = standings(data).map((r) => ({ ...r, members: r.playerIds.map(member) }));
	const prog = progress(data);

	return {
		tournament: { ...t, creatorName: t.createdBy != null ? (byId.get(t.createdBy)?.name ?? null) : null },
		playerCount: data.roster.length,
		totalRounds: total,
		roundNames: t.style === 'knockout' ? Array.from({ length: total }, (_, i) => roundName(i + 1, total)) : null,
		matches,
		standings: rows,
		progress: prog,
		canEnter: live && actor.playerId !== null,
		canManage: live && manage,
		canFinish: live && manage && prog.total > 0 && prog.played === prog.total,
		canDelete: locals.auth.isAdmin
	};
};

async function run(locals: App.Locals, fn: (actor: Actor) => Promise<ActionResult>) {
	requireAuth(locals.auth);
	const res = await fn(actorOf(locals));
	return res.ok ? { ok: true } : fail(400, { error: res.error });
}

const gameIdOf = async (request: Request) => {
	const form = await request.formData();
	return { gameId: Number(form.get('gameId')), winner: String(form.get('winner')) };
};

export const actions: Actions = {
	result: async ({ request, params, locals }) => {
		const id = parseId(params.id);
		const { gameId, winner } = await gameIdOf(request);
		if (winner !== 'A' && winner !== 'B') return fail(400, { error: 'Pick the winning team' });
		return run(locals, (actor) => recordResult(db, actor, id, gameId, winner));
	},
	clear: async ({ request, params, locals }) => {
		const id = parseId(params.id);
		const { gameId } = await gameIdOf(request);
		return run(locals, (actor) => clearResult(db, actor, id, gameId));
	},
	finish: async ({ params, locals }) => run(locals, (actor) => finishTournament(db, actor, parseId(params.id))),
	abandon: async ({ params, locals }) => run(locals, (actor) => abandonTournament(db, actor, parseId(params.id))),
	delete: async ({ params, locals }) => {
		requireAdmin(locals.auth);
		await deleteTournament(db, parseId(params.id));
		throw redirect(303, '/tournaments');
	}
};
```

- [ ] **Step 2: Match card component**

`src/lib/components/TournamentMatchCard.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	type Member = { id: number; name: string; emoji: string };
	type Match = {
		id: number;
		slot: number;
		team1: Member[];
		team2: Member[];
		team1Label: string | null;
		team2Label: string | null;
		winnerSide: 'A' | 'B' | null;
		editable: boolean;
	};
	let {
		match,
		showTable,
		selected,
		canEnter,
		onselect
	}: {
		match: Match;
		/** Show "Table N" (more than one match in the round). */
		showTable: boolean;
		selected: boolean;
		/** Viewer may enter results for unplayed matches (signed in, live). */
		canEnter: boolean;
		onselect: () => void;
	} = $props();

	const known = $derived(match.team1.length > 0 && match.team2.length > 0);
	// Tappable: an unplayed match with both teams (anyone signed in), or a
	// played one the viewer may change (creator/admin, knockout rule).
	const tappable = $derived(known && (match.winnerSide === null ? canEnter : match.editable));
	const names = (ms: Member[]) => ms.map((m) => `${m.emoji} ${m.name}`).join(' + ');
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<div class="m" class:sel={selected && tappable}>
	<button type="button" class="face" disabled={!tappable} onclick={onselect}>
		{#if showTable}<span class="tbl">Table {match.slot + 1}</span>{/if}
		<span class="side" class:w={match.winnerSide === 'A'} class:l={match.winnerSide === 'B'}>
			<span class="tn">Team 1</span>{match.team1Label ?? names(match.team1)}
		</span>
		<span class="vs">VS</span>
		<span class="side" class:w={match.winnerSide === 'B'} class:l={match.winnerSide === 'A'}>
			<span class="tn">Team 2</span>{match.team2Label ?? names(match.team2)}
		</span>
	</button>
	{#if selected && tappable}
		<div class="act">
			{#each ['A', 'B'] as const as side (side)}
				<form method="POST" action="?/result" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<input type="hidden" name="winner" value={side} />
					<button class="btn" class:current={match.winnerSide === side} disabled={busy}
						>Team {side === 'A' ? 1 : 2} won</button
					>
				</form>
			{/each}
			{#if match.winnerSide !== null}
				<form method="POST" action="?/clear" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<button class="btn secondary small" disabled={busy}>✏️ Clear result</button>
				</form>
			{/if}
		</div>
	{/if}
</div>

<style>
	.m {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 12px;
		margin-bottom: 0.45rem;
		transition: border-color 0.15s ease;
	}
	.m.sel {
		border-color: var(--teal);
		box-shadow: 0 0 0 2px var(--teal) inset;
	}
	.face {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0.4rem;
		align-items: center;
		width: 100%;
		padding: 0.5rem;
		background: none;
		border: 0;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.face:disabled {
		cursor: default;
	}
	.tbl {
		grid-column: 1 / 4;
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--muted);
	}
	.side {
		padding: 0.25rem 0.4rem;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.84rem;
	}
	.side.w {
		background: #cfeee2;
		color: #0b5e45;
	}
	.side.l {
		opacity: 0.55;
	}
	.tn {
		display: block;
		font-size: 0.6rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.vs {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.7rem;
	}
	.act {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		padding: 0 0.5rem 0.55rem;
	}
	.btn.current {
		outline: 3px solid var(--gold);
	}
	.btn.small {
		font-size: 0.78rem;
	}
</style>
```

- [ ] **Step 3: Standings + bracket components**

`src/lib/components/TournamentStandings.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	type Member = { id: number; name: string; emoji: string };
	type Row = { key: string; members: Member[]; position: number | null; played: number; wins: number; losses: number; points: number; winRate: number };
	let { rows, style }: { rows: Row[]; style: 'rotating' | 'fixed' } = $props();
	const medal = (p: number | null) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : (p ?? '—'));
	const pct = (w: number) => `${Math.round(w * 100)}%`;
</script>

<div class="card tbl">
	<table>
		<thead>
			<tr>
				<th>#</th><th class="l">{style === 'rotating' ? 'Player' : 'Team'}</th><th>P</th><th>W</th><th>L</th>
				<th>{style === 'rotating' ? 'Pts' : 'Win%'}</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.key)}
				<tr>
					<td class="pos">{medal(r.position)}</td>
					<td class="l">
						{#each r.members as m, i (m.id)}{#if i > 0}{' + '}{/if}<a href={resolve('/players/[id]', { id: String(m.id) })}>{m.emoji} {m.name}</a>{/each}
					</td>
					<td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td>
					<td class="pts">{style === 'rotating' ? r.points : pct(r.winRate)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if style === 'rotating'}<p class="note">Tiebreak: win% → head-to-head</p>{/if}
</div>

<style>
	.tbl {
		padding: 0.5rem 0.7rem;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	th {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		text-align: right;
		padding: 0.25rem 0.4rem;
	}
	td {
		padding: 0.4rem;
		border-top: 1px solid var(--line-card);
		text-align: right;
	}
	.l {
		text-align: left;
		font-weight: 800;
	}
	.l a {
		color: var(--ink);
		text-decoration: none;
	}
	.pos {
		text-align: center;
		font-weight: 800;
		width: 2rem;
	}
	.pts {
		font-weight: 900;
		color: var(--up);
	}
	.note {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
```

`src/lib/components/KnockoutBracket.svelte`:

```svelte
<script lang="ts">
	type Member = { id: number; name: string; emoji: string };
	type Match = { id: number; round: number; slot: number; team1: Member[]; team2: Member[]; team1Label: string | null; team2Label: string | null; winnerSide: 'A' | 'B' | null };
	let { matches, roundNames }: { matches: Match[]; roundNames: string[] } = $props();
	const names = (ms: Member[]) => ms.map((m) => `${m.emoji} ${m.name}`).join(' + ');
	const inRound = (r: number) => matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
</script>

<div class="card br" style="--cols: {roundNames.length}">
	{#each roundNames as name, i (name)}
		<div class="col">
			<div class="colh">{name}</div>
			<div class="games">
				{#each inRound(i + 1) as m (m.id)}
					<div class="bm">
						<div class:w={m.winnerSide === 'A'} class:tbd={!!m.team1Label}>{m.team1Label ?? names(m.team1)}</div>
						<div class:w={m.winnerSide === 'B'} class:tbd={!!m.team2Label}>{m.team2Label ?? names(m.team2)}</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.br {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(9rem, 1fr));
		gap: 0.6rem;
		overflow-x: auto;
	}
	.col {
		display: flex;
		flex-direction: column;
	}
	.colh {
		font-size: 0.68rem;
		text-transform: uppercase;
		font-weight: 800;
		color: var(--muted);
		text-align: center;
		margin-bottom: 0.4rem;
	}
	.games {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.6rem;
		flex: 1;
	}
	.bm {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 10px;
		font-size: 0.76rem;
		overflow: hidden;
	}
	.bm div {
		padding: 0.25rem 0.4rem;
	}
	.bm div + div {
		border-top: 1px solid var(--line-card);
	}
	.w {
		background: #cfeee2;
		font-weight: 800;
	}
	.tbd {
		color: var(--muted);
		font-style: italic;
	}
</style>
```

Byes: a round-1 slot with no game simply isn't drawn; the bye team already shows in its round-2 match.

- [ ] **Step 4: Detail page**

Replace `src/routes/tournaments/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TournamentMatchCard from '$lib/components/TournamentMatchCard.svelte';
	import TournamentStandings from '$lib/components/TournamentStandings.svelte';
	import KnockoutBracket from '$lib/components/KnockoutBracket.svelte';
	let { data, form } = $props();

	const STYLE = { rotating: '🔀 Rotating', fixed: '🛡️ Fixed teams', knockout: '🥊 Knockout' };
	const t = $derived(data.tournament);
	const fmt = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const rounds = $derived([...new Set(data.matches.map((m) => m.round))].sort((a, b) => a - b));
	const inRound = (r: number) => data.matches.filter((m) => m.round === r);
	const champs = $derived(data.standings.filter((r) => r.position === 1));
	let selectedId = $state<number | null>(null);
	const roundState = (r: number) => {
		const ms = inRound(r);
		if (ms.every((m) => m.winnerSide !== null)) return 'done';
		return r === data.progress.round ? 'now' : 'upcoming';
	};
	const pct = $derived(data.progress.total ? (100 * data.progress.played) / data.progress.total : 0);
</script>

<a class="backlink" href={resolve('/tournaments')}>← Tournaments</a>

<div class="card hero">
	<div class="top">
		<h1>{t.name}</h1>
		{#if t.status === 'live'}<span class="chip live">● LIVE</span>{:else if t.status === 'abandoned'}<span class="chip">Abandoned</span>{/if}
	</div>
	<div class="chips">
		<span class="chip">{STYLE[t.style]}</span><span class="chip">{t.format}</span>
		<span class="chip">{data.playerCount} players</span>
		{#if t.tables > 1 && t.style !== 'knockout'}<span class="chip">{t.tables} tables</span>{/if}
		<span class="chip">{t.ranked ? 'Ranked' : 'Unranked'}</span>
	</div>
	<p class="meta">Started {fmt(t.createdAt)}{#if t.creatorName} · by {t.creatorName}{/if}</p>
	{#if t.status === 'live'}
		<div class="bar"><i style="width: {pct}%"></i></div>
		<p class="meta">
			{data.progress.played} of {data.progress.total} games played{#if data.progress.round && t.style !== 'knockout'} · round {data.progress.round} of {data.totalRounds}{/if}
		</p>
	{/if}
</div>

{#if t.status === 'finished' && champs.length}
	<div class="card champ">
		<div class="big">🏆</div>
		{#each champs as c (c.key)}<div class="n">{c.members.map((m) => `${m.emoji} ${m.name}`).join(' + ')}</div>{/each}
		<div>Champion{champs.length > 1 ? 's' : ''} · {t.name}</div>
	</div>
{/if}

{#if form?.error}<p class="err">{form.error}</p>{/if}

{#if t.style === 'knockout' && data.roundNames}
	<h2>Bracket</h2>
	<KnockoutBracket matches={data.matches} roundNames={data.roundNames} />
{:else if t.style !== 'knockout'}
	<h2>{t.style === 'rotating' ? 'Standings' : 'Team standings'}</h2>
	<TournamentStandings rows={data.standings} style={t.style} />
{/if}

<h2>Schedule</h2>
<div class="card">
	{#each rounds as r (r)}
		<div class="round">
			<div class="rh">
				<span>{data.roundNames ? data.roundNames[r - 1] : `Round ${r}`}</span>
				{#if t.status === 'live'}
					{@const s = roundState(r)}
					<span class="chip" class:now={s === 'now'}>{s}</span>
				{/if}
			</div>
			{#each inRound(r) as m (m.id)}
				<TournamentMatchCard
					match={m}
					showTable={inRound(r).length > 1 && t.style !== 'knockout'}
					selected={selectedId === m.id}
					canEnter={data.canEnter}
					onselect={() => (selectedId = selectedId === m.id ? null : m.id)}
				/>
			{/each}
		</div>
	{/each}
</div>

{#if data.canManage || data.canDelete}
	<div class="manage">
		{#if data.canFinish}
			<form method="POST" action="?/finish" use:enhance><button class="btn">🏁 Finish tournament</button></form>
		{/if}
		{#if data.canManage}
			<form method="POST" action="?/abandon" use:enhance><button class="btn secondary">Abandon</button></form>
		{/if}
		{#if data.canDelete}
			<form method="POST" action="?/delete" use:enhance><button class="btn danger">Delete</button></form>
		{/if}
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
		margin-top: 0.6rem;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
	}
	.hero h1 {
		color: var(--ink);
		margin: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.4rem;
	}
	.chip.live {
		background: var(--coral);
		color: #fff;
	}
	.chip.now {
		background: var(--teal);
		color: #fff;
	}
	.meta {
		font-size: 0.82rem;
		color: var(--muted);
		margin: 0.4rem 0 0;
	}
	.bar {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
		margin-top: 0.6rem;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--teal);
	}
	.champ {
		margin-top: 0.8rem;
		text-align: center;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border-color: #a8791f;
		font-weight: 700;
	}
	.champ .big {
		font-size: 2rem;
	}
	.champ .n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.15rem;
	}
	.round + .round {
		margin-top: 0.8rem;
	}
	.rh {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 800;
		font-size: 0.88rem;
		margin-bottom: 0.4rem;
	}
	.manage {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.btn.danger {
		background: var(--danger);
		color: #fff;
	}
	.err {
		color: var(--coral);
		font-weight: 800;
	}
</style>
```

For Abandon and Delete, use the confirm pattern the `/games` page already uses for delete (a two-step "Sure?" button via `$state`) instead of a browser `confirm()` — copy it from `src/routes/games/+page.svelte` (`confirmingId` state) so the look matches.

- [ ] **Step 5: Verify**

Run: `pnpm vitest run && pnpm check && pnpm lint`
Expected: pass.

Manual (`pnpm dev --port 5199`): create a 2v2 rotating tournament with 8 players, 2 tables, 3 rounds. Tap a match → teal border + "Team 1 won / Team 2 won"; enter it; the card shows the winner, standings update. As a non-creator, tap a played match → nothing happens. As creator: change the winner, clear it. Finish button appears only after all 6 results; after finishing, the champion banner shows and matches aren't tappable. Create a 5-team knockout (10 players 2v2): bracket shows round 1 with 1 match, byes in round 2, "Winner of …" labels.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(tournament): detail page with standings, bracket and result entry"
```

---

### Task 11: Player-page tournaments section + board titles badge

**Files:**
- Modify: `src/lib/tournament/summary.ts`, `src/lib/tournament/summary.test.ts`
- Modify: `src/routes/players/[id]/+page.server.ts`, `src/routes/players/[id]/+page.svelte`
- Modify: `src/routes/+page.server.ts`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `standings`, `StandingRow` (Task 5); `getTournaments` (Task 6).
- Produces (summary.ts):

```ts
export interface PlayerTournamentEntry {
	tournament: TournamentInfo;
	position: number | null;
	/** Players (rotating) or teams (fixed/knockout). */
	fieldSize: number;
	positionLabel: string; // "2 of 8", "3–4th", "—"
	wins: number;
	losses: number;
	points: number;
	teammateIds: number[];
	gameIds: number[]; // played games this player took part in
}
export interface PlayerTournamentTotals {
	titles: number;
	podiums: number;
	played: number;
	avgFinish: number | null; // one decimal
	wins: number;
	losses: number;
	winRate: number;
	bestStyle: { style: TournamentStyle; titles: number } | null;
}
export function playerTournaments(all: TournamentData[], playerId: number): PlayerTournamentEntry[];
export function playerTournamentTotals(entries: PlayerTournamentEntry[]): PlayerTournamentTotals;
export function titleCounts(all: TournamentData[]): Map<number, number>;
```

- [ ] **Step 1: Failing tests**

Append to `src/lib/tournament/summary.test.ts` (extend imports with `playerTournaments, playerTournamentTotals, titleCounts` and `TournamentStyle`):

```ts
const td = (id: number, style: TournamentStyle, status: TournamentStatus, games: TournamentGame[], teams?: number[][]): TournamentData => ({
	tournament: {
		id, name: `T${id}`, style, format: '2v2', ranked: true, rounds: 1, tables: 1, seed: 1, status,
		createdBy: 1, createdAt: `2026-09-${10 + id}T19:00:00.000Z`, finishedAt: null
	},
	roster: teams
		? teams.flatMap((t, i) => t.map((playerId) => ({ playerId, teamNo: i + 1 })))
		: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
	games
});

describe('player tournament summary', () => {
	const rot = td(1, 'rotating', 'finished', [g(11, 1, 'A', [1, 2], [3, 4])]);
	const ko = td(2, 'knockout', 'finished', [g(21, 1, 'B', [1, 2], [3, 4])], [[1, 2], [3, 4]]);
	const live = td(3, 'rotating', 'live', [g(31, 1, 'A', [1, 3], [2, 4])]);
	const abandoned = td(4, 'rotating', 'abandoned', []);

	it('lists entries newest first, skipping abandoned and tournaments without the player', () => {
		const e = playerTournaments([rot, ko, live, abandoned], 1);
		expect(e.map((x) => x.tournament.id)).toEqual([3, 2, 1]);
		expect(e.find((x) => x.tournament.id === 1)).toMatchObject({ position: 1, positionLabel: '1 of 4', wins: 1, teammateIds: [] });
		expect(e.find((x) => x.tournament.id === 2)).toMatchObject({ position: 2, positionLabel: '2 of 2', teammateIds: [2], gameIds: [21] });
		expect(playerTournaments([rot], 99)).toEqual([]);
	});

	it('labels shared knockout places as ranges', () => {
		const big = td(5, 'knockout', 'finished', [
			{ ...g(51, 1, 'A', [1], [2]), slot: 0 },
			{ ...g(52, 1, 'A', [3], [4]), slot: 1 },
			{ ...g(53, 2, 'A', [1], [3]), slot: 0 }
		], [[1], [2], [3], [4]]);
		expect(playerTournaments([big], 2)[0].positionLabel).toBe('3–4th');
	});

	it('totals count only finished tournaments', () => {
		const t = playerTournamentTotals(playerTournaments([rot, ko, live], 1));
		expect(t).toMatchObject({ titles: 1, podiums: 2, played: 2, avgFinish: 1.5, wins: 1, losses: 1, winRate: 0.5 });
		expect(t.bestStyle).toEqual({ style: 'rotating', titles: 1 });
	});

	it('title counts credit every champion member', () => {
		const c = titleCounts([rot, ko, live]);
		expect(c.get(1)).toBe(1); // rotating win
		expect(c.get(3)).toBe(1); // knockout champs 3+4
		expect(c.get(4)).toBe(1);
		expect(c.get(2)).toBe(1); // rotating: 2 was 1's teammate → also 1 point, shared 1st
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/tournament/summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/lib/tournament/summary.ts` (extend imports: `import type { TournamentData, TournamentInfo, TournamentStyle } from './types';`):

```ts
export interface PlayerTournamentEntry {
	tournament: TournamentInfo;
	position: number | null;
	fieldSize: number;
	positionLabel: string;
	wins: number;
	losses: number;
	points: number;
	teammateIds: number[];
	gameIds: number[];
}

export interface PlayerTournamentTotals {
	titles: number;
	podiums: number;
	played: number;
	avgFinish: number | null;
	wins: number;
	losses: number;
	winRate: number;
	bestStyle: { style: TournamentStyle; titles: number } | null;
}

function label(style: TournamentStyle, position: number | null, fieldSize: number): string {
	if (position === null) return '—';
	if (style === 'knockout' && position > 2) return `${position}–${2 * (position - 1)}th`;
	return `${position} of ${fieldSize}`;
}

export function playerTournaments(all: TournamentData[], playerId: number): PlayerTournamentEntry[] {
	return all
		.filter((d) => d.tournament.status !== 'abandoned' && d.roster.some((r) => r.playerId === playerId))
		.map((d) => {
			const rows = standings(d);
			const row = rows.find((r) => r.playerIds.includes(playerId))!;
			return {
				tournament: d.tournament,
				position: row.position,
				fieldSize: rows.length,
				positionLabel: label(d.tournament.style, row.position, rows.length),
				wins: row.wins,
				losses: row.losses,
				points: row.points,
				teammateIds: row.playerIds.filter((id) => id !== playerId),
				gameIds: d.games
					.filter((g) => g.winnerSide !== null && (g.sideA.includes(playerId) || g.sideB.includes(playerId)))
					.map((g) => g.id)
			};
		})
		.sort((a, b) => (a.tournament.createdAt < b.tournament.createdAt ? 1 : -1));
}

const STYLE_ORDER: TournamentStyle[] = ['rotating', 'fixed', 'knockout'];

export function playerTournamentTotals(entries: PlayerTournamentEntry[]): PlayerTournamentTotals {
	const done = entries.filter((e) => e.tournament.status === 'finished');
	const placed = done.filter((e) => e.position !== null);
	const wins = done.reduce((s, e) => s + e.wins, 0);
	const losses = done.reduce((s, e) => s + e.losses, 0);
	const titlesBy = new Map<TournamentStyle, number>();
	for (const e of done) if (e.position === 1) titlesBy.set(e.tournament.style, (titlesBy.get(e.tournament.style) ?? 0) + 1);
	let bestStyle: PlayerTournamentTotals['bestStyle'] = null;
	for (const style of STYLE_ORDER) {
		const n = titlesBy.get(style) ?? 0;
		if (n > 0 && (!bestStyle || n > bestStyle.titles)) bestStyle = { style, titles: n };
	}
	return {
		titles: done.filter((e) => e.position === 1).length,
		podiums: done.filter((e) => e.position !== null && e.position <= 3).length,
		played: done.length,
		avgFinish: placed.length
			? Math.round((10 * placed.reduce((s, e) => s + e.position!, 0)) / placed.length) / 10
			: null,
		wins,
		losses,
		winRate: wins + losses ? wins / (wins + losses) : 0,
		bestStyle
	};
}

/** Titles per player across finished tournaments (every champion member counts). */
export function titleCounts(all: TournamentData[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const d of all)
		for (const w of winners(d)) for (const id of w.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
	return counts;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/tournament`
Expected: PASS.

- [ ] **Step 5: Player page data**

In `src/routes/players/[id]/+page.server.ts` add `getTournaments(db)` to the `Promise.all` (as `allTournaments`) and before `return`:

```ts
	const entries = playerTournaments(allTournaments, id);
	const deltaOf = (gameIds: number[]) =>
		Math.round(gameIds.reduce((s, gid) => s + (deltaByGame.get(gid) ?? 0), 0));
	const tournaments = entries.map((e) => ({
		id: e.tournament.id,
		name: e.tournament.name,
		style: e.tournament.style,
		format: e.tournament.format,
		ranked: e.tournament.ranked,
		status: e.tournament.status,
		createdAt: e.tournament.createdAt,
		position: e.position,
		positionLabel: e.positionLabel,
		wins: e.wins,
		losses: e.losses,
		points: e.points,
		teammates: e.teammateIds.map(resolve),
		// Rotating shows points; team styles show net Elo (ranked only).
		elo: e.tournament.style !== 'rotating' && e.tournament.ranked ? deltaOf(e.gameIds) : null
	}));
	const tournamentTotals = playerTournamentTotals(entries);
```

and return `tournaments, tournamentTotals`. (`deltaByGame` is the total-track map already built for history; move its declaration above this block if needed.)

- [ ] **Step 6: Player page UI**

In `src/routes/players/[id]/+page.svelte`, after the rating chart card and **before** "Recent games", add (only when `data.tournaments.length > 0`):

```svelte
{#if data.tournaments.length}
	{@const tt = data.tournamentTotals}
	<h2>🏆 Tournaments</h2>
	<div class="ttiles">
		<div class="card ttile gold"><span class="v">{tt.titles}</span><span class="k">Titles</span></div>
		<div class="card ttile"><span class="v">{tt.podiums}</span><span class="k">Podiums</span></div>
		<div class="card ttile"><span class="v">{tt.played}</span><span class="k">Played</span></div>
		<div class="card ttile"><span class="v">{tt.avgFinish ?? '—'}</span><span class="k">Avg finish</span></div>
		<div class="card ttile wide"><span class="v">{tt.wins}–{tt.losses}</span><span class="k">Tournament record · {pct(tt.winRate)}</span></div>
		<div class="card ttile wide">
			<span class="v">{tt.bestStyle ? STYLE[tt.bestStyle.style] : '—'}</span>
			<span class="k">Best style{#if tt.bestStyle} · {tt.bestStyle.titles} title{tt.bestStyle.titles > 1 ? 's' : ''}{/if}</span>
		</div>
	</div>
	<div class="card tlist">
		{#each data.tournaments as t (t.id)}
			<a class="trow" href={resolve('/tournaments/[id]', { id: String(t.id) })}>
				<span class="pos p{t.position ?? 0}" class:live={t.status === 'live'}>
					{t.position === 1 ? '🥇' : t.position === 2 ? '🥈' : t.position === 3 ? '🥉' : (t.position ?? '—')}
					<small>{t.positionLabel}</small>
				</span>
				<span class="tmid">
					<span class="tname">
						{t.name}
						{#if t.status === 'live'}<span class="chip livechip">LIVE</span>{/if}
						{#if !t.ranked}<span class="chip">Unranked</span>{/if}
					</span>
					<span class="tmeta">
						{new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {STYLE[t.style]} · {t.format}{#if t.teammates.length} · with {t.teammates.map((m) => `${m.emoji} ${m.name}`).join(', ')}{/if}
					</span>
				</span>
				<span class="trec">
					<b>{t.wins}–{t.losses}</b>
					{#if t.style === 'rotating'}<span class="tmeta">{t.points} pt{t.points === 1 ? '' : 's'}</span>
					{:else if t.elo !== null}<span class="tmeta" class:up={t.elo >= 0} class:down={t.elo < 0}>{t.elo >= 0 ? '+' : ''}{t.elo} Elo</span>{/if}
				</span>
			</a>
		{/each}
	</div>
{/if}
```

Add to the script: `const STYLE = { rotating: '🔀 Rotating', fixed: '🛡️ Fixed teams', knockout: '🥊 Knockout' };`

Styles:

```css
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
		background: linear-gradient(155deg, #edca66, #cf9a2c);
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
		padding: 0.2rem 0.8rem;
	}
	.trow {
		display: grid;
		grid-template-columns: 52px 1fr auto;
		gap: 0.7rem;
		align-items: center;
		padding: 0.6rem 0;
		border-top: 1px solid var(--line-card);
		color: var(--ink);
		text-decoration: none;
	}
	.trow:first-child {
		border-top: 0;
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
		background: linear-gradient(155deg, #edca66, #cf9a2c);
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
	.tmid {
		display: grid;
		min-width: 0;
	}
	.tname {
		font-weight: 800;
	}
	.tmeta {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.chip.livechip {
		background: var(--teal);
		color: #fff;
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
```

- [ ] **Step 7: Board titles chip**

`src/routes/+page.server.ts`: add `getTournaments(db)` to the `Promise.all` **before** the spread `...mvpCalls` (destructure order: `[players, games, allTournaments, mvpCounts = empty, weeklyMvpCounts = empty]`), compute `const titles = titleCounts(allTournaments);` and add `titles: titles.get(p.id) ?? 0` to each player row.

`src/routes/+page.svelte`: add

```ts
	const titleChips = (n: number) => (n > 0 ? [{ text: `🏆 ${n}`, tone: 'mvp' as const }] : []);
```

and append `...titleChips(r.titles)` to both chip arrays (podium items and `CreatureTile` rest).

- [ ] **Step 8: Verify**

Run: `pnpm vitest run && pnpm check && pnpm lint`
Expected: pass.

Manual: finish a tournament in dev → winner's board tile shows "🏆 1"; their player page shows the Tournaments section with tiles and the entry; a live tournament appears with LIVE chip and doesn't change the tiles.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(tournament): player tournament stats and board titles badge"
```

---

### Task 12: Docs + full verification

**Files:**
- Modify: `README.md` (Pages list + "What it tracks"), `CLAUDE.md` (Routes line)

- [ ] **Step 1: Update docs**

`README.md` → "What it tracks": add a bullet
`- **Tournaments** — rotating teams, fixed-teams round-robin or knockout, with a random seeded draw; ranked or casual. Titles show on the board and player pages.`
and "Pages": add
`- `/tournaments`, `/tournaments/new`, `/tournaments/[id]` — tournament list, create (with draw preview), and detail (standings/bracket, schedule, result entry).`
Also note under "What it tracks" that any game can be logged **unranked** (no Elo/stats impact).

`CLAUDE.md` → Routes bullet: append `, /tournaments (+ /new, /[id])`; Architecture: add `src/lib/tournament/` (pure draw/standings/summary logic) and `src/lib/server/db/tournaments.ts`.

- [ ] **Step 2: Full verification**

Run: `pnpm test && pnpm check && pnpm lint && pnpm build`
Expected: all green; `pnpm build` succeeds without `DATABASE_URL`.

- [ ] **Step 3: Migration against local Postgres**

Run: `docker compose up -d && pnpm db:migrate && pnpm db:seed`
Expected: migration 0006 applies; seed still works (existing games unaffected by the CHECKs).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: tournaments and unranked games"
```
