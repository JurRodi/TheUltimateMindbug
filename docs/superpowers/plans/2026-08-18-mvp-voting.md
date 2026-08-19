# MVP Voting & Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each 2v2/3v3 game, its participants vote (once, irreversibly, within 24h) for the Most Valuable Play; results resolve early when unbeatable and push notifications keep players informed. A new `/mvp` page hosts voting + results, and MVP counts surface across the app.

**Architecture:** A pure resolution engine (`src/lib/mvp/engine.ts`) decides a round's status from its votes, mirroring the existing rating engine. Server queries persist rounds/votes/subscriptions; an orchestration module (`src/lib/server/mvp.ts`) wires engine + queries + Web Push. Rounds resolve both lazily (on app use) and via a `CRON_SECRET`-guarded `/api/mvp/tick` endpoint. The `/mvp` route hosts the ballot + results; `getMvpCounts` feeds MVP markers into the board/player/team views.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Drizzle ORM (pg locally / neon-http in prod / pglite in tests), Vitest, `web-push` (new dependency), the SvelteKit native service worker.

**Spec:** `docs/superpowers/specs/2026-08-18-mvp-voting-design.md`

## Global Constraints

- **Type checking:** `pnpm check` must stay at **0 errors / 0 warnings**; `pnpm lint` clean (run `pnpm format` to autofix).
- **DB drivers:** every query takes `db: DB` first (`DB = PgDatabase<any, typeof schema>`). **No `db.transaction()`** — neon-http has no interactive transactions; use single statements or the `insertGame` CTE pattern for atomicity. Handle `db.execute()`'s two return shapes (`Array` vs `{ rows }`) when using raw SQL.
- **Migrations:** schema changes go in `src/lib/server/db/schema.ts`, then `pnpm db:generate` writes SQL into `drizzle/`. Tests apply that folder via `makeTestDb()`, so **generate before writing query tests**. Prod runs `scripts/migrate.js` in `vercel-build`.
- **Secrets:** `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `AUTH_SECRET`, `DATABASE_URL` are server-only — never `PUBLIC_`-prefixed, never sent to the browser. The VAPID **public** key is genuinely public and IS exposed as `PUBLIC_VAPID_KEY`. Update `.env.example` (tracked template) whenever adding a var.
- **Avatars:** emoji only, from `src/lib/creatures.ts` (`creatureFor(id, avatar)`); never reproduce Mindbug art.
- **Git:** repo identity `JurRodi <rodijurrien@gmail.com>`. Work on a feature branch (not `main`). Commit messages follow the repo's `type(scope): summary` convention (see `git log`). Per CLAUDE.md the repo commits only when asked — confirm with the user before the first commit.
- **Auth:** gate write actions with `requireAuth(locals.auth)` / `requireAdmin`; the acting player is `locals.auth.player` (has `id`, `email`, `isAdmin`).

---

### Task 1: Schema & migration for rounds, votes, subscriptions

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create (generated): `drizzle/0003_*.sql` via `pnpm db:generate`
- Test: `src/lib/server/db/mvp-schema.test.ts`

**Interfaces:**
- Produces: table objects `mvpRounds`, `mvpVotes`, `pushSubscriptions` and `mvpStatusEnum` exported from `schema.ts`. Columns per the spec's data-model tables.

- [ ] **Step 1: Add the enum + tables to `schema.ts`** (after `gameParticipants`, before `export * from './auth-schema'`):

```ts
export const mvpStatusEnum = pgEnum('mvp_status', ['open', 'decided', 'void']);

export const mvpRounds = pgTable('mvp_rounds', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id')
		.notNull()
		.unique()
		.references(() => games.id, { onDelete: 'cascade' }),
	deadline: timestamp('deadline', { withTimezone: true }).notNull(),
	status: mvpStatusEnum('status').notNull().default('open'),
	decidedAt: timestamp('decided_at', { withTimezone: true }),
	openNotifiedAt: timestamp('open_notified_at', { withTimezone: true }),
	reminderNotifiedAt: timestamp('reminder_notified_at', { withTimezone: true }),
	resultNotifiedAt: timestamp('result_notified_at', { withTimezone: true })
});

export const mvpVotes = pgTable(
	'mvp_votes',
	{
		id: serial('id').primaryKey(),
		gameId: integer('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		voterId: integer('voter_id')
			.notNull()
			.references(() => players.id),
		nomineeId: integer('nominee_id')
			.notNull()
			.references(() => players.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique('mvp_votes_game_voter').on(t.gameId, t.voterId)]
);

export const pushSubscriptions = pgTable('push_subscriptions', {
	id: serial('id').primaryKey(),
	playerId: integer('player_id')
		.notNull()
		.references(() => players.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
```

Ensure `pgEnum, pgTable, serial, integer, text, timestamp, unique` are imported from `drizzle-orm/pg-core` at the top (add `unique` if missing).

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0003_*.sql` creating the enum + three tables. Skim it: `mvp_rounds.game_id` UNIQUE, `mvp_votes` has a UNIQUE on `(game_id, voter_id)`, `push_subscriptions.endpoint` UNIQUE.

- [ ] **Step 3: Write the failing round-trip test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, insertGame } from './queries';
import { mvpRounds, mvpVotes, pushSubscriptions } from './schema';
import { eq } from 'drizzle-orm';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => { db = await makeTestDb(); });

describe('mvp schema', () => {
	it('stores a round, votes with a unique ballot, and subscriptions', async () => {
		const a = await addPlayer(db, 'Ada');
		const b = await addPlayer(db, 'Bo');
		const gameId = await insertGame(db, {
			playedAt: new Date().toISOString(), format: '2v2', winnerSide: 'A',
			sideA: [a.id, b.id], sideB: [a.id, b.id] // reuse ok for a schema test
		});
		await db.insert(mvpRounds).values({ gameId, deadline: new Date().toISOString() });
		await db.insert(mvpVotes).values({ gameId, voterId: a.id, nomineeId: b.id });
		await expect(
			db.insert(mvpVotes).values({ gameId, voterId: a.id, nomineeId: a.id })
		).rejects.toBeTruthy(); // unique(game_id, voter_id)
		await db.insert(pushSubscriptions).values({
			playerId: a.id, endpoint: 'https://push/1', p256dh: 'k', auth: 't'
		});
		const rounds = await db.select().from(mvpRounds).where(eq(mvpRounds.gameId, gameId));
		expect(rounds[0].status).toBe('open');
	});
});
```

- [ ] **Step 4: Run it**

Run: `pnpm test -- src/lib/server/db/mvp-schema.test.ts`
Expected: PASS (migration applied by `makeTestDb`). If the unique assertion fails, the migration wasn't generated correctly — re-check Step 2.

- [ ] **Step 5: `pnpm check` then commit**

```bash
git add src/lib/server/db/schema.ts drizzle/ src/lib/server/db/mvp-schema.test.ts
git commit -m "feat(mvp): schema for rounds, votes, push subscriptions"
```

---

### Task 2: Pure resolution engine

**Files:**
- Create: `src/lib/mvp/engine.ts`
- Test: `src/lib/mvp/engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Vote = { voterId: number; nomineeId: number };
  export type RoundStatus = 'open' | 'decided' | 'void';
  export type RoundInput = {
    participantIds: number[];
    eligibleVoterIds: number[];
    votes: Vote[];
    deadline: string; // ISO
    now: string;      // ISO
  };
  export type RoundResult = { status: RoundStatus; winners: number[]; quorumMet: boolean; quorum: number };
  export function resolveRound(input: RoundInput): RoundResult;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { resolveRound, type RoundInput } from './engine';

const base = (o: Partial<RoundInput>): RoundInput => ({
	participantIds: [1, 2, 3, 4],
	eligibleVoterIds: [1, 2, 3, 4],
	votes: [],
	deadline: '2026-08-19T00:00:00.000Z',
	now: '2026-08-18T00:00:00.000Z',
	...o
});

describe('resolveRound', () => {
	it('quorum is ceil(P/2): 2 for 2v2, 3 for 3v3', () => {
		expect(resolveRound(base({})).quorum).toBe(2);
		expect(resolveRound(base({ participantIds: [1,2,3,4,5,6], eligibleVoterIds: [1,2,3,4,5,6] })).quorum).toBe(3);
	});
	it('stays open below quorum before the deadline', () => {
		const r = resolveRound(base({ votes: [{ voterId: 1, nomineeId: 2 }] }));
		expect(r.status).toBe('open');
		expect(r.quorumMet).toBe(false);
	});
	it('closes early when the leader is mathematically unbeatable', () => {
		// P=4, quorum 2. 3 votes for #2, one voter (id 4) left -> 3 > 0 + 1.
		const r = resolveRound(base({
			votes: [
				{ voterId: 1, nomineeId: 2 }, { voterId: 2, nomineeId: 2 }, { voterId: 3, nomineeId: 2 }
			]
		}));
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2]);
	});
	it('stays open when the leader is still catchable', () => {
		// 2 votes #2, 1 vote #3, voter 4 remains -> 2 > 1 + 1 is false.
		const r = resolveRound(base({
			votes: [
				{ voterId: 1, nomineeId: 2 }, { voterId: 2, nomineeId: 2 }, { voterId: 3, nomineeId: 3 }
			]
		}));
		expect(r.status).toBe('open');
	});
	it('decides at the deadline with a clear winner', () => {
		const r = resolveRound(base({
			now: '2026-08-19T00:00:01.000Z',
			votes: [{ voterId: 1, nomineeId: 2 }, { voterId: 2, nomineeId: 3 }, { voterId: 3, nomineeId: 2 }]
		}));
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2]);
	});
	it('produces co-MVPs on a deadline tie', () => {
		const r = resolveRound(base({
			now: '2026-08-19T00:00:01.000Z',
			votes: [{ voterId: 1, nomineeId: 2 }, { voterId: 2, nomineeId: 3 }]
		}));
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2, 3]);
	});
	it('voids at the deadline without quorum', () => {
		const r = resolveRound(base({ now: '2026-08-19T00:00:01.000Z', votes: [{ voterId: 1, nomineeId: 2 }] }));
		expect(r.status).toBe('void');
		expect(r.winners).toEqual([]);
	});
	it('can never reach quorum when too few are eligible -> void at deadline', () => {
		// P=4 (quorum 2) but only 1 eligible voter.
		const r = resolveRound(base({
			eligibleVoterIds: [1], now: '2026-08-19T00:00:01.000Z',
			votes: [{ voterId: 1, nomineeId: 2 }]
		}));
		expect(r.status).toBe('void');
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/mvp/engine.test.ts`
Expected: FAIL — `resolveRound` not defined.

- [ ] **Step 3: Implement `engine.ts`**

```ts
export type Vote = { voterId: number; nomineeId: number };
export type RoundStatus = 'open' | 'decided' | 'void';
export type RoundInput = {
	participantIds: number[];
	eligibleVoterIds: number[];
	votes: Vote[];
	deadline: string;
	now: string;
};
export type RoundResult = { status: RoundStatus; winners: number[]; quorumMet: boolean; quorum: number };

export function resolveRound(input: RoundInput): RoundResult {
	const { participantIds, eligibleVoterIds, votes, deadline, now } = input;
	const quorum = Math.ceil(participantIds.length / 2);
	const quorumMet = votes.length >= quorum;

	const tally = new Map<number, number>();
	for (const v of votes) tally.set(v.nomineeId, (tally.get(v.nomineeId) ?? 0) + 1);
	const counts = [...tally.values()].sort((a, b) => b - a);
	const top = counts[0] ?? 0;
	const second = counts[1] ?? 0;
	const winnersAtTop = () =>
		[...tally.entries()].filter(([, c]) => c === top).map(([id]) => id).sort((a, b) => a - b);

	const voted = new Set(votes.map((v) => v.voterId));
	const remaining = eligibleVoterIds.filter((id) => !voted.has(id)).length;
	const pastDeadline = new Date(now).getTime() >= new Date(deadline).getTime();

	if (quorumMet && top > second + remaining)
		return { status: 'decided', winners: winnersAtTop(), quorumMet, quorum };
	if (pastDeadline)
		return quorumMet
			? { status: 'decided', winners: winnersAtTop(), quorumMet, quorum }
			: { status: 'void', winners: [], quorumMet, quorum };
	return { status: 'open', winners: [], quorumMet, quorum };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/mvp/engine.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: `pnpm check` then commit**

```bash
git add src/lib/mvp/
git commit -m "feat(mvp): pure round-resolution engine"
```

---

### Task 3: Round & vote write queries

**Files:**
- Modify: `src/lib/server/db/queries.ts`
- Test: `src/lib/server/db/mvp-queries.test.ts`

**Interfaces:**
- Consumes: `mvpRounds`, `mvpVotes` (Task 1); `resolveRound` types (Task 2).
- Produces (exported from `queries.ts`):
  ```ts
  export type DB = PgDatabase<any, typeof schema>; // change local `type DB` to exported
  export type RoundWithVotes = {
    round: typeof mvpRounds.$inferSelect;
    participantIds: number[];
    votes: { voterId: number; nomineeId: number }[];
  } | null;
  export function createMvpRound(db: DB, input: { gameId: number; deadline: string }): Promise<void>;
  export function getRoundWithVotes(db: DB, gameId: number): Promise<RoundWithVotes>;
  export function castVote(db: DB, input: { gameId: number; voterId: number; nomineeId: number }): Promise<'ok' | 'duplicate'>;
  export function closeRound(db: DB, gameId: number, status: 'decided' | 'void'): Promise<void>;
  export function markRoundNotified(db: DB, gameId: number, which: 'open' | 'reminder' | 'result'): Promise<void>;
  ```

- [ ] **Step 1: Export the `DB` type** — change `type DB = ...` at `queries.ts:12` to `export type DB = ...`. Add imports: `import { mvpRounds, mvpVotes } from './schema';` alongside the existing schema imports, and ensure `and` is imported from `drizzle-orm`.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, insertGame } from './queries';
import {
	createMvpRound, getRoundWithVotes, castVote, closeRound, markRoundNotified
} from './queries';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => { db = await makeTestDb(); });

async function setup2v2() {
	const [a, b, c, d] = await Promise.all(['A','B','C','D'].map((n) => addPlayer(db, n)));
	const gameId = await insertGame(db, {
		playedAt: '2026-08-18T10:00:00.000Z', format: '2v2', winnerSide: 'A',
		sideA: [a.id, b.id], sideB: [c.id, d.id]
	});
	return { gameId, a, b, c, d };
}

describe('mvp round/vote queries', () => {
	it('creates a round and reads it with participants', async () => {
		const { gameId, a, b, c, d } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('open');
		expect(rw?.participantIds.sort()).toEqual([a.id, b.id, c.id, d.id].sort());
		expect(rw?.votes).toEqual([]);
	});
	it('accepts one ballot and rejects a duplicate from the same voter', async () => {
		const { gameId, a, b, c } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		expect(await castVote(db, { gameId, voterId: a.id, nomineeId: b.id })).toBe('ok');
		expect(await castVote(db, { gameId, voterId: a.id, nomineeId: c.id })).toBe('duplicate');
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.votes).toEqual([{ voterId: a.id, nomineeId: b.id }]);
	});
	it('closes a round and stamps notification times', async () => {
		const { gameId } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		await markRoundNotified(db, gameId, 'open');
		await closeRound(db, gameId, 'decided');
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('decided');
		expect(rw?.round.decidedAt).toBeTruthy();
		expect(rw?.round.openNotifiedAt).toBeTruthy();
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test -- src/lib/server/db/mvp-queries.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 4: Implement the queries** (append to `queries.ts`):

```ts
export type RoundWithVotes = {
	round: typeof mvpRounds.$inferSelect;
	participantIds: number[];
	votes: { voterId: number; nomineeId: number }[];
} | null;

export async function createMvpRound(
	db: DB, input: { gameId: number; deadline: string }
): Promise<void> {
	await db.insert(mvpRounds).values({ gameId: input.gameId, deadline: new Date(input.deadline) });
}

export async function getRoundWithVotes(db: DB, gameId: number): Promise<RoundWithVotes> {
	const rounds = await db.select().from(mvpRounds).where(eq(mvpRounds.gameId, gameId));
	if (rounds.length === 0) return null;
	const parts = await db
		.select({ playerId: gameParticipants.playerId })
		.from(gameParticipants)
		.where(eq(gameParticipants.gameId, gameId));
	const votes = await db
		.select({ voterId: mvpVotes.voterId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(eq(mvpVotes.gameId, gameId));
	return { round: rounds[0], participantIds: parts.map((p) => p.playerId), votes };
}

export async function castVote(
	db: DB, input: { gameId: number; voterId: number; nomineeId: number }
): Promise<'ok' | 'duplicate'> {
	const inserted = await db
		.insert(mvpVotes)
		.values(input)
		.onConflictDoNothing({ target: [mvpVotes.gameId, mvpVotes.voterId] })
		.returning({ id: mvpVotes.id });
	return inserted.length > 0 ? 'ok' : 'duplicate';
}

export async function closeRound(db: DB, gameId: number, status: 'decided' | 'void'): Promise<void> {
	await db
		.update(mvpRounds)
		.set({ status, decidedAt: new Date() })
		.where(eq(mvpRounds.gameId, gameId));
}

export async function markRoundNotified(
	db: DB, gameId: number, which: 'open' | 'reminder' | 'result'
): Promise<void> {
	const col = which === 'open' ? { openNotifiedAt: new Date() }
		: which === 'reminder' ? { reminderNotifiedAt: new Date() }
		: { resultNotifiedAt: new Date() };
	await db.update(mvpRounds).set(col).where(eq(mvpRounds.gameId, gameId));
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test -- src/lib/server/db/mvp-queries.test.ts`
Expected: PASS.

- [ ] **Step 6: `pnpm check` then commit**

```bash
git add src/lib/server/db/queries.ts src/lib/server/db/mvp-queries.test.ts
git commit -m "feat(mvp): round and vote write queries"
```

---

### Task 4: Read queries (open rounds, results, MVP counts)

**Files:**
- Modify: `src/lib/server/db/queries.ts`
- Test: `src/lib/server/db/mvp-queries.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3 queries.
- Produces:
  ```ts
  export type OpenRound = { gameId: number; format: Format; playedAt: string; deadline: string;
    side: Side; us: { id: number; name: string; emoji: string }[]; them: { id: number; name: string; emoji: string }[] };
  export function getOpenRoundsForPlayer(db: DB, playerId: number): Promise<OpenRound[]>;
  export type MvpResult = { gameId: number; format: Format; playedAt: string; status: 'decided' | 'void';
    winners: { id: number; name: string; emoji: string }[]; topVotes: number };
  export function getRecentResults(db: DB, limit: number): Promise<MvpResult[]>;
  export function getMvpCounts(db: DB): Promise<Map<number, number>>; // playerId -> MVP wins
  ```

- [ ] **Step 1: Write the failing tests** (append to `mvp-queries.test.ts`):

```ts
import {
	getOpenRoundsForPlayer, getRecentResults, getMvpCounts
} from './queries';

describe('mvp read queries', () => {
	it('lists open rounds a player has not voted in, with sides split', async () => {
		const { gameId, a, b, c, d } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		const openForA = await getOpenRoundsForPlayer(db, a.id);
		expect(openForA).toHaveLength(1);
		expect(openForA[0].us.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
		expect(openForA[0].them.map((p) => p.id).sort()).toEqual([c.id, d.id].sort());
		await castVote(db, { gameId, voterId: a.id, nomineeId: b.id });
		expect(await getOpenRoundsForPlayer(db, a.id)).toHaveLength(0); // already voted
	});
	it('reports decided results with winners and top vote count, and MVP counts', async () => {
		const { gameId, a, b, c, d } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		await castVote(db, { gameId, voterId: c.id, nomineeId: a.id });
		await castVote(db, { gameId, voterId: d.id, nomineeId: a.id });
		await closeRound(db, gameId, 'decided');
		const results = await getRecentResults(db, 10);
		expect(results[0].winners.map((w) => w.id)).toEqual([a.id]);
		expect(results[0].topVotes).toBe(2);
		const counts = await getMvpCounts(db);
		expect(counts.get(a.id)).toBe(1);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/server/db/mvp-queries.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement.** Add a private helper to build member objects and the three functions. `getRecentResults`/`getMvpCounts` recompute winners from the stored votes of closed rounds (source of truth), using the same "nominees tied at max" rule as the engine.

```ts
import { creatureFor } from '$lib/creatures';
import { desc, inArray } from 'drizzle-orm';

type Member = { id: number; name: string; emoji: string };
async function membersByGame(db: DB, gameIds: number[]) {
	if (gameIds.length === 0) return new Map<number, { playerId: number; side: Side; name: string }[]>();
	const rows = await db
		.select({ gameId: gameParticipants.gameId, playerId: gameParticipants.playerId,
			side: gameParticipants.side, name: players.name, avatar: players.avatar })
		.from(gameParticipants)
		.innerJoin(players, eq(players.id, gameParticipants.playerId))
		.where(inArray(gameParticipants.gameId, gameIds));
	const map = new Map<number, { playerId: number; side: Side; name: string; emoji: string }[]>();
	for (const r of rows) {
		const list = map.get(r.gameId) ?? [];
		list.push({ playerId: r.playerId, side: r.side, name: r.name, emoji: creatureFor(r.playerId, r.avatar) });
		map.set(r.gameId, list);
	}
	return map;
}

function winnersFromVotes(votes: { nomineeId: number }[]): { ids: number[]; top: number } {
	const tally = new Map<number, number>();
	for (const v of votes) tally.set(v.nomineeId, (tally.get(v.nomineeId) ?? 0) + 1);
	const top = Math.max(0, ...tally.values());
	const ids = [...tally.entries()].filter(([, c]) => c === top).map(([id]) => id);
	return { ids, top };
}

export type OpenRound = {
	gameId: number; format: Format; playedAt: string; deadline: string;
	side: Side; us: Member[]; them: Member[];
};
export async function getOpenRoundsForPlayer(db: DB, playerId: number): Promise<OpenRound[]> {
	// rounds still open, for games this player participated in, where they have not voted.
	const rows = await db
		.select({ gameId: mvpRounds.gameId, deadline: mvpRounds.deadline,
			format: games.format, playedAt: games.playedAt, side: gameParticipants.side })
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.innerJoin(gameParticipants, and(
			eq(gameParticipants.gameId, mvpRounds.gameId),
			eq(gameParticipants.playerId, playerId)
		))
		.where(eq(mvpRounds.status, 'open'));
	if (rows.length === 0) return [];
	const voted = await db
		.select({ gameId: mvpVotes.gameId })
		.from(mvpVotes)
		.where(and(inArray(mvpVotes.gameId, rows.map((r) => r.gameId)), eq(mvpVotes.voterId, playerId)));
	const votedSet = new Set(voted.map((v) => v.gameId));
	const pending = rows.filter((r) => !votedSet.has(r.gameId));
	const members = await membersByGame(db, pending.map((r) => r.gameId));
	return pending.map((r) => {
		const all = members.get(r.gameId) ?? [];
		return {
			gameId: r.gameId, format: r.format, playedAt: r.playedAt.toISOString(),
			deadline: r.deadline.toISOString(), side: r.side,
			us: all.filter((m) => m.side === r.side).map(({ id, name, emoji }) => ({ id, name, emoji })),
			them: all.filter((m) => m.side !== r.side).map(({ id, name, emoji }) => ({ id, name, emoji }))
		};
	});
	// note: membersByGame returns objects keyed playerId; map to {id,name,emoji} above.
}

export type MvpResult = {
	gameId: number; format: Format; playedAt: string; status: 'decided' | 'void';
	winners: Member[]; topVotes: number;
};
export async function getRecentResults(db: DB, limit: number): Promise<MvpResult[]> {
	const rounds = await db
		.select({ gameId: mvpRounds.gameId, status: mvpRounds.status,
			format: games.format, playedAt: games.playedAt })
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.where(inArray(mvpRounds.status, ['decided', 'void']))
		.orderBy(desc(mvpRounds.decidedAt))
		.limit(limit);
	if (rounds.length === 0) return [];
	const allVotes = await db
		.select({ gameId: mvpVotes.gameId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(inArray(mvpVotes.gameId, rounds.map((r) => r.gameId)));
	const members = await membersByGame(db, rounds.map((r) => r.gameId));
	return rounds.map((r) => {
		const votes = allVotes.filter((v) => v.gameId === r.gameId);
		const { ids, top } = winnersFromVotes(votes);
		const mem = members.get(r.gameId) ?? [];
		return {
			gameId: r.gameId, format: r.format, playedAt: r.playedAt.toISOString(),
			status: r.status as 'decided' | 'void',
			winners: mem.filter((m) => ids.includes(m.playerId)).map(({ id, name, emoji }) => ({ id, name, emoji })),
			topVotes: top
		};
	});
}

export async function getMvpCounts(db: DB): Promise<Map<number, number>> {
	const decided = await db
		.select({ gameId: mvpRounds.gameId })
		.from(mvpRounds)
		.where(eq(mvpRounds.status, 'decided'));
	const counts = new Map<number, number>();
	if (decided.length === 0) return counts;
	const votes = await db
		.select({ gameId: mvpVotes.gameId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(inArray(mvpVotes.gameId, decided.map((d) => d.gameId)));
	for (const d of decided) {
		const { ids } = winnersFromVotes(votes.filter((v) => v.gameId === d.gameId));
		for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}
```

> Note for the implementer: `membersByGame` builds `{ playerId, side, name, emoji }`; where the interface returns `Member` (`{ id, name, emoji }`) map `playerId → id` as shown. Fix the `us`/`them` mapping so the objects are `{ id, name, emoji }` (the `.map(({ id... }))` above assumes a rename — adjust to read `m.playerId`). Keep types clean for `pnpm check`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/server/db/mvp-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: `pnpm check` then commit**

```bash
git add src/lib/server/db/queries.ts src/lib/server/db/mvp-queries.test.ts
git commit -m "feat(mvp): read queries for open rounds, results, MVP counts"
```

---

### Task 5: Push subscription queries + Web Push wrapper

**Files:**
- Modify: `src/lib/server/db/queries.ts`, `package.json`, `.env.example`
- Create: `src/lib/server/push.ts`
- Test: `src/lib/server/db/mvp-queries.test.ts` (extend, subscription CRUD only)

**Interfaces:**
- Produces (queries):
  ```ts
  export function savePushSubscription(db: DB, input: { playerId: number; endpoint: string; p256dh: string; auth: string }): Promise<void>;
  export function deletePushSubscription(db: DB, endpoint: string): Promise<void>;
  export function getSubscriptionsForPlayers(db: DB, ids: number[]): Promise<{ endpoint: string; p256dh: string; auth: string }[]>;
  ```
- Produces (push):
  ```ts
  export type PushPayload = { title: string; body: string; url: string };
  export function sendToPlayers(db: DB, playerIds: number[], payload: PushPayload): Promise<void>;
  ```

- [ ] **Step 1: Add the dependency**

Run: `pnpm add web-push && pnpm add -D @types/web-push`
Expected: `web-push` in `dependencies`.

- [ ] **Step 2: Add env vars to `.env.example`**

```
# Web Push (VAPID). Generate with: npx web-push generate-vapid-keys
PUBLIC_VAPID_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
# Shared secret guarding POST /api/mvp/tick (Vercel Cron sends it as a Bearer token)
CRON_SECRET=
```

- [ ] **Step 3: Write the failing subscription-CRUD test** (append to `mvp-queries.test.ts`):

```ts
import { savePushSubscription, deletePushSubscription, getSubscriptionsForPlayers } from './queries';

describe('push subscription queries', () => {
	it('saves, reads by player, upserts by endpoint, and deletes', async () => {
		const a = await addPlayer(db, 'Ada');
		await savePushSubscription(db, { playerId: a.id, endpoint: 'https://p/1', p256dh: 'k1', auth: 't1' });
		await savePushSubscription(db, { playerId: a.id, endpoint: 'https://p/1', p256dh: 'k2', auth: 't2' }); // same endpoint -> upsert
		const subs = await getSubscriptionsForPlayers(db, [a.id]);
		expect(subs).toHaveLength(1);
		expect(subs[0].p256dh).toBe('k2');
		await deletePushSubscription(db, 'https://p/1');
		expect(await getSubscriptionsForPlayers(db, [a.id])).toHaveLength(0);
	});
});
```

- [ ] **Step 4: Run to verify failure** — `pnpm test -- src/lib/server/db/mvp-queries.test.ts` → FAIL.

- [ ] **Step 5: Implement subscription queries** (append to `queries.ts`, import `pushSubscriptions` from schema):

```ts
export async function savePushSubscription(
	db: DB, input: { playerId: number; endpoint: string; p256dh: string; auth: string }
): Promise<void> {
	await db.insert(pushSubscriptions).values(input)
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { playerId: input.playerId, p256dh: input.p256dh, auth: input.auth }
		});
}
export async function deletePushSubscription(db: DB, endpoint: string): Promise<void> {
	await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
export async function getSubscriptionsForPlayers(
	db: DB, ids: number[]
): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
	if (ids.length === 0) return [];
	return db.select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
		.from(pushSubscriptions).where(inArray(pushSubscriptions.playerId, ids));
}
```

- [ ] **Step 6: Run to verify pass** — PASS.

- [ ] **Step 7: Implement `push.ts`** (no unit test — it wraps the external `web-push`; it is exercised via orchestration in Task 6 with a stub):

```ts
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { deletePushSubscription, getSubscriptionsForPlayers, type DB } from './db/queries';

let configured = false;
function configure() {
	if (configured) return;
	if (!env.VAPID_PRIVATE_KEY || !pub.PUBLIC_VAPID_KEY) return;
	webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', pub.PUBLIC_VAPID_KEY, env.VAPID_PRIVATE_KEY);
	configured = true;
}

export type PushPayload = { title: string; body: string; url: string };

export async function sendToPlayers(db: DB, playerIds: number[], payload: PushPayload): Promise<void> {
	configure();
	if (!configured) return; // push not set up in this environment — no-op
	const subs = await getSubscriptionsForPlayers(db, playerIds);
	await Promise.all(subs.map(async (s) => {
		try {
			await webpush.sendNotification(
				{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
				JSON.stringify(payload)
			);
		} catch (err) {
			const code = (err as { statusCode?: number }).statusCode;
			if (code === 404 || code === 410) await deletePushSubscription(db, s.endpoint); // gone
			else console.error('[push] send failed', code);
		}
	}));
}
```

- [ ] **Step 8: `pnpm check` (add `@types/web-push` resolves types) then commit**

```bash
git add package.json pnpm-lock.yaml .env.example src/lib/server/push.ts src/lib/server/db/queries.ts src/lib/server/db/mvp-queries.test.ts
git commit -m "feat(mvp): push subscription store and web-push wrapper"
```

---

### Task 6: Orchestration — open/recompute/tick

**Files:**
- Create: `src/lib/server/mvp.ts`
- Test: `src/lib/server/mvp.test.ts`

**Interfaces:**
- Consumes: engine (Task 2), queries (Tasks 3–5), `sendToPlayers` (Task 5).
- Produces:
  ```ts
  export function onGameLogged(db: DB, gameId: number, format: Format, playedAt: string, now?: Date): Promise<void>;
  export function recomputeAfterVote(db: DB, gameId: number, now?: Date): Promise<void>;
  export function processTick(db: DB, now?: Date): Promise<void>;
  ```
- Constants: round window = 24h; reminder window = fires when `< 4h` remain and not yet reminded.

The `now?` params (default `new Date()`) make the module testable without mocking the clock. `sendToPlayers` is a no-op when push env is unset, so tests run without VAPID keys and simply assert DB state transitions.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './db/test-db';
import { addPlayer, insertGame, getRoundWithVotes, castVote, createMvpRound } from './db/queries';
import { onGameLogged, recomputeAfterVote, processTick } from './mvp';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => { db = await makeTestDb(); });

async function game2v2() {
	const [a, b, c, d] = await Promise.all(['A','B','C','D'].map((n) => addPlayer(db, n)));
	const gameId = await insertGame(db, { playedAt: '2026-08-18T10:00:00.000Z', format: '2v2',
		winnerSide: 'A', sideA: [a.id, b.id], sideB: [c.id, d.id] });
	return { gameId, a, b, c, d };
}

describe('mvp orchestration', () => {
	it('onGameLogged opens a round for 2v2 with a 24h deadline', async () => {
		const { gameId } = await game2v2();
		await onGameLogged(db, gameId, '2v2', '2026-08-18T10:00:00.000Z', new Date('2026-08-18T10:00:00.000Z'));
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('open');
		expect(new Date(rw!.round.deadline).toISOString()).toBe('2026-08-19T10:00:00.000Z');
	});
	it('onGameLogged skips 1v1', async () => {
		const [a, b] = await Promise.all(['A','B'].map((n) => addPlayer(db, n)));
		const gameId = await insertGame(db, { playedAt: '2026-08-18T10:00:00.000Z', format: '1v1', winnerSide: 'A', sideA: [a.id], sideB: [b.id] });
		await onGameLogged(db, gameId, '1v1', '2026-08-18T10:00:00.000Z');
		expect(await getRoundWithVotes(db, gameId)).toBeNull();
	});
	it('recomputeAfterVote closes early when unbeatable', async () => {
		const { gameId, a, b, c, d } = await game2v2();
		await onGameLogged(db, gameId, '2v2', '2026-08-18T10:00:00.000Z', new Date('2026-08-18T10:00:00.000Z'));
		await castVote(db, { gameId, voterId: a.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: b.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: d.id, nomineeId: c.id }); // 3/4 for c, only 1 voter left
		await recomputeAfterVote(db, gameId, new Date('2026-08-18T12:00:00.000Z'));
		expect((await getRoundWithVotes(db, gameId))?.round.status).toBe('decided');
	});
	it('processTick voids an overdue round without quorum', async () => {
		const { gameId } = await game2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		await processTick(db, new Date('2026-08-20T10:00:00.000Z'));
		expect((await getRoundWithVotes(db, gameId))?.round.status).toBe('void');
	});
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement `mvp.ts`**

```ts
import type { Format } from '$lib/types';
import { resolveRound } from '$lib/mvp/engine';
import {
	createMvpRound, getRoundWithVotes, closeRound, markRoundNotified,
	getSubscriptionsForPlayers, type DB
} from './db/queries';
import { db as _db } from './db';
import { eq, inArray } from 'drizzle-orm';
import { mvpRounds } from './db/schema';
import { sendToPlayers } from './push';
import { getPlayerEmailsForGame } from './db/queries'; // see note below

const WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_MS = 4 * 60 * 60 * 1000;

// Which participants can actually vote = those whose player row has an email
// (a login). Add a small query `eligibleVoterIds(db, gameId)` in queries.ts:
//   select gp.player_id from game_participants gp
//   join players p on p.id = gp.player_id
//   where gp.game_id = $1 and p.email is not null
// Returns number[]. (Implement it in queries.ts; the engine needs it.)

export async function onGameLogged(
	db: DB, gameId: number, format: Format, playedAt: string, now: Date = new Date()
): Promise<void> {
	if (format !== '2v2' && format !== '3v3') return;
	const deadline = new Date(now.getTime() + WINDOW_MS).toISOString();
	await createMvpRound(db, { gameId, deadline });
	const rw = await getRoundWithVotes(db, gameId);
	if (!rw) return;
	await sendToPlayers(db, rw.participantIds, {
		title: 'Vote for the MVP!', body: 'Who was the standout player? You have 24h.', url: '/mvp'
	});
	await markRoundNotified(db, gameId, 'open');
}

async function resolveOne(db: DB, gameId: number, now: Date) {
	const rw = await getRoundWithVotes(db, gameId);
	if (!rw || rw.round.status !== 'open') return;
	const eligible = await eligibleVoterIds(db, gameId);
	const res = resolveRound({
		participantIds: rw.participantIds, eligibleVoterIds: eligible,
		votes: rw.votes, deadline: rw.round.deadline.toISOString(), now: now.toISOString()
	});
	if (res.status === 'open') return { rw, res };
	await closeRound(db, gameId, res.status);
	if (!rw.round.resultNotifiedAt) {
		const body = res.status === 'void' ? 'Not enough votes — no MVP this time.'
			: `The MVP has been decided! See who won.`;
		await sendToPlayers(db, rw.participantIds, { title: 'MVP result', body, url: '/mvp' });
		await markRoundNotified(db, gameId, 'result');
	}
	return { rw, res };
}

export async function recomputeAfterVote(db: DB, gameId: number, now: Date = new Date()): Promise<void> {
	await resolveOne(db, gameId, now);
}

export async function processTick(db: DB, now: Date = new Date()): Promise<void> {
	const open = await db.select({ gameId: mvpRounds.gameId, deadline: mvpRounds.deadline,
		reminderNotifiedAt: mvpRounds.reminderNotifiedAt })
		.from(mvpRounds).where(eq(mvpRounds.status, 'open'));
	for (const r of open) {
		const outcome = await resolveOne(db, r.gameId, now);
		if (!outcome) continue; // was closed
		// still open -> maybe remind
		const msLeft = r.deadline.getTime() - now.getTime();
		if (msLeft > 0 && msLeft <= REMINDER_MS && !r.reminderNotifiedAt) {
			const rw = await getRoundWithVotes(db, r.gameId);
			if (rw) {
				const votedIds = new Set(rw.votes.map((v) => v.voterId));
				const notVoted = (await eligibleVoterIds(db, r.gameId)).filter((id) => !votedIds.has(id));
				await sendToPlayers(db, notVoted, { title: 'MVP vote closing soon',
					body: 'A few hours left to vote for the MVP.', url: '/mvp' });
				await markRoundNotified(db, r.gameId, 'reminder');
			}
		}
	}
}
```

Also add `eligibleVoterIds` to `queries.ts`:

```ts
export async function eligibleVoterIds(db: DB, gameId: number): Promise<number[]> {
	const rows = await db
		.select({ playerId: gameParticipants.playerId })
		.from(gameParticipants)
		.innerJoin(players, eq(players.id, gameParticipants.playerId))
		.where(and(eq(gameParticipants.gameId, gameId), isNotNull(players.email)));
	return rows.map((r) => r.playerId);
}
```

(import `isNotNull` from `drizzle-orm`.) Remove the unused `_db`/`inArray` imports the scaffold above lists if the final code doesn't use them — keep `pnpm check` clean.

- [ ] **Step 4: Run to verify pass** — `pnpm test -- src/lib/server/mvp.test.ts` → PASS.

- [ ] **Step 5: `pnpm check` then commit**

```bash
git add src/lib/server/mvp.ts src/lib/server/mvp.test.ts src/lib/server/db/queries.ts
git commit -m "feat(mvp): orchestration for open/recompute/tick with push"
```

---

### Task 7: Service worker push handlers

**Files:**
- Modify: `src/service-worker.ts`

**Interfaces:** none exported — adds `push` and `notificationclick` event listeners.

- [ ] **Step 1: Add the handlers** at the end of `service-worker.ts` (the file already has `install`/`activate`/`fetch`; keep those). The SvelteKit SW runs as a `ServiceWorkerGlobalScope`:

```ts
// --- Web Push (MVP voting) ---
sw.addEventListener('push', (event) => {
	const data = (() => { try { return event.data?.json() ?? {}; } catch { return {}; } })() as {
		title?: string; body?: string; url?: string;
	};
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Mindbug', {
			body: data.body ?? '',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url ?? '/mvp' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data as { url?: string })?.url ?? '/mvp';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const c of clients) {
				if (c.url.includes(url) && 'focus' in c) return c.focus();
			}
			return sw.clients.openWindow(url);
		})
	);
});
```

> The existing file aliases the global as `self` with a typed cast (check the top of `service-worker.ts`); reuse that alias name — if it's `self`, use `self.addEventListener` / `self.registration` / `self.clients` instead of `sw`. Match the file's existing icon path under `static/icons/` (Explore reported 192/512 icons there).

- [ ] **Step 2: Verify type-check**

Run: `pnpm check`
Expected: 0 errors. (Service workers aren't unit-tested here; correctness is verified manually in Task 12's smoke test.)

- [ ] **Step 3: Commit**

```bash
git add src/service-worker.ts
git commit -m "feat(mvp): service worker push + notificationclick handlers"
```

---

### Task 8: Subscribe/unsubscribe endpoints + client helper

**Files:**
- Create: `src/routes/api/push/subscribe/+server.ts`, `src/routes/api/push/unsubscribe/+server.ts`, `src/lib/push-client.ts`

**Interfaces:**
- Endpoints accept JSON. Subscribe body: `{ endpoint, keys: { p256dh, auth } }` (the raw `PushSubscription.toJSON()`). Both `requireAuth`.
- `push-client.ts` produces:
  ```ts
  export function pushSupported(): boolean;
  export function getPushState(): Promise<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>;
  export function enablePush(): Promise<boolean>; // requests permission + subscribes + POSTs
  export function disablePush(): Promise<void>;
  ```

- [ ] **Step 1: Implement `subscribe/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { savePushSubscription } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAuth(locals.auth);
	const player = locals.auth.player!;
	const sub = await request.json().catch(() => null) as
		{ endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
	if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw error(400, 'Invalid subscription');
	await savePushSubscription(db, {
		playerId: player.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth
	});
	return json({ ok: true });
};
```

- [ ] **Step 2: Implement `unsubscribe/+server.ts`**

```ts
import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { deletePushSubscription } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAuth(locals.auth);
	const { endpoint } = await request.json().catch(() => ({})) as { endpoint?: string };
	if (endpoint) await deletePushSubscription(db, endpoint);
	return json({ ok: true });
};
```

- [ ] **Step 3: Implement `push-client.ts`**

```ts
import { env } from '$env/dynamic/public';

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
	return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushState() {
	if (!pushSupported()) return 'unsupported' as const;
	if (Notification.permission === 'denied') return 'denied' as const;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	return sub ? ('subscribed' as const) : ('unsubscribed' as const);
}

export async function enablePush(): Promise<boolean> {
	if (!pushSupported()) return false;
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') return false;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(env.PUBLIC_VAPID_KEY)
	});
	const res = await fetch('/api/push/subscribe', {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON())
	});
	return res.ok;
}

export async function disablePush(): Promise<void> {
	if (!pushSupported()) return;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	if (sub) {
		await fetch('/api/push/unsubscribe', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: sub.endpoint })
		});
		await sub.unsubscribe();
	}
}
```

- [ ] **Step 4: `pnpm check` then commit**

```bash
git add src/routes/api/push/ src/lib/push-client.ts
git commit -m "feat(mvp): push subscribe/unsubscribe endpoints and client helper"
```

---

### Task 9: Notification UI — toggle + banner

**Files:**
- Create: `src/lib/components/NotificationToggle.svelte`, `src/lib/components/EnablePushBanner.svelte`
- Modify: `src/routes/account/+page.svelte`, `src/routes/+layout.svelte`, `src/routes/+layout.server.ts`

**Interfaces:**
- `NotificationToggle` — self-contained; uses `push-client.ts`; shows current state and an enable/disable button.
- `EnablePushBanner` — dismissible (localStorage key `mb_push_dismissed`); rendered only when a player is logged in and state is `unsubscribed`.

- [ ] **Step 1: `NotificationToggle.svelte`** (Svelte 5 runes; match `.btn`/`.card` styling from `app.css`):

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { getPushState, enablePush, disablePush, pushSupported } from '$lib/push-client';
	let state = $state<'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('loading');
	let busy = $state(false);
	onMount(async () => { state = pushSupported() ? await getPushState() : 'unsupported'; });
	async function toggle() {
		busy = true;
		if (state === 'subscribed') { await disablePush(); state = 'unsubscribed'; }
		else { state = (await enablePush()) ? 'subscribed' : await getPushState(); }
		busy = false;
	}
</script>

{#if state === 'unsupported'}
	<p class="muted">Push notifications aren't supported on this device/browser.</p>
{:else if state === 'denied'}
	<p class="muted">Notifications are blocked. Enable them in your browser settings, then reload.</p>
{:else}
	<button class="btn" onclick={toggle} disabled={busy || state === 'loading'}>
		{#if busy}<span class="spin"></span>{/if}
		{state === 'subscribed' ? 'Turn off notifications' : 'Enable notifications'}
	</button>
{/if}

<style>
	.muted { color: var(--muted); font-size: 0.85rem; }
</style>
```

- [ ] **Step 2: `EnablePushBanner.svelte`** (gold banner from the mockup; inline SVG bell; dismiss persists):

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { getPushState, enablePush, pushSupported } from '$lib/push-client';
	let show = $state(false);
	onMount(async () => {
		if (!pushSupported()) return;
		if (localStorage.getItem('mb_push_dismissed') === '1') return;
		show = (await getPushState()) === 'unsubscribed';
	});
	function dismiss() { localStorage.setItem('mb_push_dismissed', '1'); show = false; }
	async function enable() { if (await enablePush()) show = false; }
</script>

{#if show}
	<div class="pushbanner">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a2b06" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
		<span class="txt">Get notified when it's time to vote for the MVP.</span>
		<button class="btn small" onclick={enable}>Enable</button>
		<button class="x" aria-label="Dismiss" onclick={dismiss}>✕</button>
	</div>
{/if}

<style>
	.pushbanner { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.9rem; border-radius: 14px; background: var(--gold-grad); color: #3a2b06; margin-bottom: 1rem; box-shadow: 0 4px 0 rgba(0,0,0,0.2); }
	.txt { flex: 1; font-family: var(--display); font-weight: 800; font-size: 0.88rem; }
	.btn.small { background: #3a2b06; padding: 0.45rem 0.8rem; }
	.x { border: none; background: transparent; color: #3a2b06; cursor: pointer; font-weight: 800; opacity: 0.65; }
</style>
```

- [ ] **Step 3: Mount them.** In `account/+page.svelte` add a settings card that renders `<NotificationToggle />` under a "Notifications" heading. In `+layout.svelte`, render `<EnablePushBanner />` inside `.wrap` above `{@render children()}`, but only when logged in — read a `me`/`player` flag from `page.data` (the layout server load already surfaces auth; if not, add `player: locals.auth.player && { id, name, avatar }` to `+layout.server.ts` return, mirroring how `Nav.svelte` reads `page.data.me`).

- [ ] **Step 4: `pnpm check` then commit**

```bash
git add src/lib/components/NotificationToggle.svelte src/lib/components/EnablePushBanner.svelte src/routes/account/+page.svelte src/routes/+layout.svelte src/routes/+layout.server.ts
git commit -m "feat(mvp): notification toggle and enable banner"
```

---

### Task 10: The `/mvp` page + Nav item

**Files:**
- Create: `src/routes/mvp/+page.server.ts`, `src/routes/mvp/+page.svelte`
- Modify: `src/lib/components/Nav.svelte`

**Interfaces:**
- Consumes: `getOpenRoundsForPlayer`, `getRecentResults`, `getMvpCounts`, `getPlayers` (for names on the leaderboard), `castVote`, `recomputeAfterVote`, `processTick`.
- Load returns `{ openRounds, results, leaderboard }`; a `vote` action.

- [ ] **Step 1: Implement `+page.server.ts`**

```ts
import { fail } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import {
	getOpenRoundsForPlayer, getRecentResults, getMvpCounts, getPlayers,
	getRoundWithVotes, castVote
} from '$lib/server/db/queries';
import { processTick, recomputeAfterVote } from '$lib/server/mvp';
import { creatureFor } from '$lib/creatures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	await processTick(db); // lazy resolution: close overdue rounds on visit
	const player = locals.auth.player;
	const [results, counts, players] = await Promise.all([
		getRecentResults(db, 20), getMvpCounts(db), getPlayers(db)
	]);
	const openRounds = player ? await getOpenRoundsForPlayer(db, player.id) : [];
	const leaderboard = players
		.map((p) => ({ id: p.id, name: p.name, emoji: creatureFor(p.id, p.avatar), mvps: counts.get(p.id) ?? 0 }))
		.filter((p) => p.mvps > 0)
		.sort((a, b) => b.mvps - a.mvps);
	return { openRounds, results, leaderboard, me: player?.id ?? null };
};

export const actions: Actions = {
	vote: async ({ request, locals }) => {
		requireAuth(locals.auth);
		const voterId = locals.auth.player!.id;
		const form = await request.formData();
		const gameId = Number(form.get('gameId'));
		const nomineeId = Number(form.get('nomineeId'));
		if (!gameId || !nomineeId) return fail(400, { error: 'Pick a player' });
		const rw = await getRoundWithVotes(db, gameId);
		if (!rw || rw.round.status !== 'open') return fail(400, { error: 'Voting has closed for this game' });
		if (!rw.participantIds.includes(voterId)) return fail(403, { error: 'You did not play this game' });
		if (!rw.participantIds.includes(nomineeId) || nomineeId === voterId)
			return fail(400, { error: 'Invalid MVP pick' });
		const outcome = await castVote(db, { gameId, voterId, nomineeId });
		if (outcome === 'duplicate') return fail(400, { error: 'You already voted' });
		await recomputeAfterVote(db, gameId);
		return { voted: gameId };
	}
};
```

- [ ] **Step 2: Implement `+page.svelte`** — render the three sections from the approved mockup (`Main.dc.html`). Key rules to honor: candidate buttons exclude `me`; a finality warning shows before submit; the button reads **Cast final vote**; after `form?.voted === round.gameId`, replace that card with a **locked-in** confirmation showing NO tally. Results feed shows `topVotes` (closed rounds only). Leaderboard uses `CreatureTile` with `powerLabel="MVPS"` and `king` on index 0.

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import CreatureTile from '$lib/components/CreatureTile.svelte';
	import EnablePushBanner from '$lib/components/EnablePushBanner.svelte';
	let { data, form } = $props();
	const countdown = (iso: string) => {
		const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3.6e6));
		return `${h}h left`;
	};
	let picked = $state<Record<number, number | undefined>>({});
</script>

<h1>Most Valuable Play</h1>
<EnablePushBanner />

{#if data.openRounds.length}
	<h2>Awaiting your vote</h2>
	{#each data.openRounds as r (r.gameId)}
		{#if form?.voted === r.gameId}
			<div class="card locked">Vote locked in — everyone's votes stay hidden until voting closes.</div>
		{:else}
			<form method="POST" action="?/vote" use:enhance class="card ballot">
				<input type="hidden" name="gameId" value={r.gameId} />
				<div class="top"><span class="fmt">{r.format}</span><span class="cd">{countdown(r.deadline)}</span></div>
				<div class="matchup">
					{#each r.us as p (p.id)}<span class="you">{p.emoji} {p.name}</span>{/each}
					vs
					{#each r.them as p (p.id)}<span>{p.emoji} {p.name}</span>{/each}
				</div>
				<div class="q">Who was the MVP?</div>
				<div class="cands">
					{#each [...r.us, ...r.them].filter((p) => p.id !== data.me) as p (p.id)}
						<label class="cand" class:on={picked[r.gameId] === p.id}>
							<input type="radio" name="nomineeId" value={p.id} bind:group={picked[r.gameId]} hidden />
							<span class="av">{p.emoji}</span>{p.name}
						</label>
					{/each}
				</div>
				<div class="warn">⚠ One vote each — final and can't be changed.</div>
				<button class="btn" type="submit" disabled={!picked[r.gameId]}>Cast final vote</button>
			</form>
		{/if}
	{/each}
{/if}

{#if data.results.length}
	<h2>Recent MVPs</h2>
	{#each data.results as res (res.gameId)}
		<div class="card result">
			{#if res.status === 'void'}
				<span class="muted">{res.format} · no MVP (not enough votes)</span>
			{:else}
				<span class="winners">{#each res.winners as w (w.id)}{w.emoji} {w.name} {/each}</span>
				<span class="chip mvp">{res.winners.length > 1 ? 'CO-MVP' : 'MVP'}</span>
				<span class="votes">{res.topVotes} {res.topVotes === 1 ? 'vote' : 'votes'}</span>
			{/if}
		</div>
	{/each}
{/if}

{#if data.leaderboard.length}
	<h2>MVP leaderboard</h2>
	{#each data.leaderboard as p, i (p.id)}
		<CreatureTile rank={i + 1} emoji={p.emoji} name={p.name} power={p.mvps} powerLabel="MVPS" king={i === 0}
			href={`/players/${p.id}`} />
	{/each}
{/if}

{#if form?.error}<p class="err">{form.error}</p>{/if}

<style>
	/* Follow app.css tokens; see Main.dc.html mockup for the exact look.
	   .ballot spacing, .cand pill styling (gold when .on), .warn amber box, etc. */
	.card + .card, h2 { margin-top: 1rem; }
	.cands { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0; }
	.cand { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem; border-radius: 999px; background: #fff; border: 2px solid var(--line-card); cursor: pointer; font-weight: 700; }
	.cand.on { background: var(--gold-2); border-color: var(--gold); font-weight: 800; }
	.warn { background: #f6ecd0; border: 1.5px solid var(--edge); color: #8a6414; font-weight: 800; font-size: 0.78rem; border-radius: 10px; padding: 0.5rem 0.65rem; margin: 0.6rem 0; }
	.err { color: var(--down); font-weight: 700; }
</style>
```

> The implementer should flesh the markup/styles to match `Main.dc.html` precisely (matchup win-highlighting, countdown pill, result card layout). Behavior above is the contract; visuals come from the mockup.

- [ ] **Step 3: Add the Nav item.** In `Nav.svelte`, add `const mvp = { href: '/mvp', label: 'MVP', icon: '⭐' } as const;` and include it in both link arrays: `page.data.isAdmin ? [board, mvp, players, log, games] : [board, mvp, log]`. (Icon is emoji to match the other nav items, which use emoji; the star SVG in the mockup was illustrative.)

- [ ] **Step 4: `pnpm check`, `pnpm lint`, then commit**

```bash
git add src/routes/mvp/ src/lib/components/Nav.svelte
git commit -m "feat(mvp): voting page, results feed, MVP leaderboard, nav item"
```

---

### Task 11: Cron endpoint, vercel.json, and wiring into /log

**Files:**
- Create: `src/routes/api/mvp/tick/+server.ts`, `vercel.json`
- Modify: `src/routes/log/+page.server.ts`

**Interfaces:** `GET/POST /api/mvp/tick` runs `processTick`, guarded by `CRON_SECRET`.

- [ ] **Step 1: Implement the tick endpoint**

```ts
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { processTick } from '$lib/server/mvp';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request }) => {
	// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
	const auth = request.headers.get('authorization');
	if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) throw error(401, 'Unauthorized');
	await processTick(db);
	return json({ ok: true });
};
export const GET = handler;
export const POST = handler;
```

- [ ] **Step 2: Add `vercel.json`** (Hobby-safe daily default; a comment in the spec explains tightening on Pro):

```json
{
	"crons": [{ "path": "/api/mvp/tick", "schedule": "0 * * * *" }]
}
```

> `0 * * * *` is hourly. On **Hobby**, Vercel restricts crons to **once per day** — if deploy is rejected, change to `"0 9 * * *"` (daily 09:00 UTC); lazy resolution still closes rounds on app use. On **Pro**, tighten to `"*/10 * * * *"` for punctual reminders.

- [ ] **Step 3: Wire `onGameLogged` into the log action.** In `log/+page.server.ts`, capture the id and call the orchestrator before redirect:

```ts
import { onGameLogged } from '$lib/server/mvp';
// ...inside the default action, replace `await insertGame(...)` with:
const gameId = await insertGame(db, { playedAt, format, winnerSide, sideA, sideB });
await onGameLogged(db, gameId, format, playedAt);
throw redirect(303, '/?saved=game');
```

- [ ] **Step 4: `pnpm check` then commit**

```bash
git add src/routes/api/mvp/ vercel.json src/routes/log/+page.server.ts
git commit -m "feat(mvp): cron tick endpoint, schedule, and open-round on game log"
```

---

### Task 12: MVP counts across the app

**Files:**
- Modify: `src/lib/components/CreatureTile.svelte` (already supports `chips` — no change needed if the board passes an MVP chip), the board loader `src/routes/+page.server.ts`, `src/routes/players/[id]/+page.server.ts` & `+page.svelte`, `src/routes/teams/[id]/+page.server.ts` & `+page.svelte`.

**Interfaces:** each loader calls `getMvpCounts(db)` once and passes counts to the view; views render a gold ★ chip/stat.

- [ ] **Step 1: Board leaderboard chip.** In `+page.server.ts`, load `getMvpCounts(db)` and, when building each player row for the Players view, append a chip `{ text: `★ ${n} MVP` }` when `n > 0`. `CreatureTile` already renders `chips` — add a `.chip.mvp` gold style in `app.css`:

```css
.chip.mvp { background: var(--gold-grad); color: #3a2b06; }
```

- [ ] **Step 2: Player-detail hero stat.** In `players/[id]/+page.server.ts` add `mvps: (await getMvpCounts(db)).get(playerId) ?? 0` to the returned data. In `+page.svelte`, add a `.stat` to the `.statrow`:

```svelte
{#if data.mvps > 0}
	<div class="stat"><span class="n">★ {data.mvps}</span><span class="l">MVPs</span></div>
{/if}
```

- [ ] **Step 3: Team-detail.** In `teams/[id]/+page.server.ts`, compute the combined MVP count for the team's members (`sum of counts.get(id)`), pass it through, and render a `★ N MVP` chip near the team header in `+page.svelte`, matching the board chip.

- [ ] **Step 4: Manual smoke test** (documented, not automated):

```
1. pnpm dev
2. Log a 2v2 game at /log.
3. Visit /mvp — an "Awaiting your vote" card appears; vote; confirm the locked-in state (no tally).
4. With a 2nd logged-in participant, vote so quorum + unbeatable -> round closes; result appears in "Recent MVPs".
5. Confirm ★ MVP shows on the board tile and the winner's /players/[id] hero.
6. (Push) with VAPID keys set, Enable notifications on /account, log a game, confirm the browser notification.
```

- [ ] **Step 5: `pnpm check`, `pnpm lint`, `pnpm test`, then commit**

```bash
git add src/routes/+page.server.ts src/routes/players/ src/routes/teams/ src/app.css
git commit -m "feat(mvp): surface MVP counts on board, player, and team views"
```

---

## Self-Review

**Spec coverage:**
- Scope 2v2/3v3 only → Task 6 `onGameLogged` guard + test. ✓
- Ballot excludes self, cross-side allowed → Task 10 candidate filter + vote-action validation. ✓
- Eligibility = has login → Task 6 `eligibleVoterIds` (email not null). ✓
- Quorum ⌈P/2⌉ of all participants; can-never-decide → void → Task 2 engine + tests. ✓
- Irreversible one vote → Task 1 unique constraint + Task 3 `castVote` 'duplicate' + Task 10 action. ✓
- Secrecy (no tally until close) → Task 10 (no tally in ballot/locked state; results only for closed rounds). ✓
- Close-early-when-unbeatable, co-MVP ties → Task 2 engine + tests. ✓
- Push on open/result/reminder → Task 6 orchestration; Tasks 7/8 SW+subscribe. ✓
- `/mvp` page (ballot/results/leaderboard) → Task 10. ✓
- MVP stats elsewhere → Task 12. ✓
- Cron + lazy resolution (Decision C) → Task 10 load `processTick` + Task 11 cron. ✓
- VAPID/CRON env, `PUBLIC_` only for public key → Tasks 5/8/11 + `.env.example`. ✓

**Placeholder scan:** No "TBD"/"add error handling" — validation is spelled out in Task 10's action; the two "flesh to match mockup" notes are visual-polish pointers to the approved `Main.dc.html`, with the behavioral contract given in code. Acceptable (visual fidelity source is the committed mockup).

**Type consistency:** `DB` exported once (Task 3) and reused (Tasks 4–6, 8, 10, 11). `resolveRound`/`RoundInput`/`RoundResult` stable (Task 2 → 6). `getMvpCounts` returns `Map<number, number>` everywhere (Tasks 4, 10, 12). `castVote` returns `'ok' | 'duplicate'` (Tasks 3, 10). `sendToPlayers(db, ids, payload)` stable (Tasks 5, 6). `OpenRound`/`MvpResult` consumed by Task 10 as defined in Task 4.

## Notes for the executor
- Run each task's tests in isolation first, then `pnpm test` before the final commit of a task.
- Task 4's `membersByGame`/`us`/`them` mapping has an intentional call-out: make the returned objects `{ id, name, emoji }` (map `playerId → id`); don't ship the `playerId` key in the public shape.
- Keep `pnpm check` at 0/0 after every task — the neon-http `any` HKT is the only sanctioned `any`.
