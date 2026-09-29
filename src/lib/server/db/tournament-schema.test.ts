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
		.values({
			name: 'T',
			style: 'rotating',
			format: '2v2',
			ranked: true,
			rounds: 3,
			tables: 1,
			seed: 1,
			createdBy: p.id
		})
		.returning();
	return t;
}

describe('games check constraints', () => {
	it('rejects an unplayed game outside a tournament', async () => {
		await expect(db.insert(games).values({ format: '2v2' })).rejects.toBeTruthy();
	});

	it('allows an unplayed game inside a tournament', async () => {
		const t = await tournament();
		const [g] = await db
			.insert(games)
			.values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 })
			.returning();
		expect(g.winnerSide).toBeNull();
		expect(g.ranked).toBe(true);
	});

	it('rejects a winner without played_at', async () => {
		const t = await tournament();
		await expect(
			db
				.insert(games)
				.values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0, winnerSide: 'A' })
		).rejects.toBeTruthy();
	});

	it('rejects round/slot on a non-tournament game', async () => {
		await expect(
			db
				.insert(games)
				.values({ format: '2v2', winnerSide: 'A', playedAt: new Date(), round: 1, slot: 0 })
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
