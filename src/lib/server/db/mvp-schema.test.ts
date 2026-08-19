import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, insertGame } from './queries';
import { mvpRounds, mvpVotes, pushSubscriptions } from './schema';
import { eq } from 'drizzle-orm';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
	db = await makeTestDb();
});

describe('mvp schema', () => {
	it('stores a round, votes with a unique ballot, and subscriptions', async () => {
		const a = await addPlayer(db, 'Ada');
		const b = await addPlayer(db, 'Bo');
		const gameId = await insertGame(db, {
			playedAt: new Date().toISOString(),
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [a.id, b.id] // reuse ok for a schema test
		});
		await db.insert(mvpRounds).values({ gameId, deadline: new Date() });
		await db.insert(mvpVotes).values({ gameId, voterId: a.id, nomineeId: b.id });
		await expect(
			db.insert(mvpVotes).values({ gameId, voterId: a.id, nomineeId: a.id })
		).rejects.toBeTruthy(); // unique(game_id, voter_id)
		await db.insert(pushSubscriptions).values({
			playerId: a.id,
			endpoint: 'https://push/1',
			p256dh: 'k',
			auth: 't'
		});
		const rounds = await db.select().from(mvpRounds).where(eq(mvpRounds.gameId, gameId));
		expect(rounds[0].status).toBe('open');
	});
});
