import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './db/test-db';
import {
	addPlayer,
	insertGame,
	getRoundWithVotes,
	castVote,
	createMvpRound,
	getRecentResults
} from './db/queries';
import { onGameLogged, recomputeAfterVote, processTick } from './mvp';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
	db = await makeTestDb();
});

async function game2v2() {
	const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n)));
	const gameId = await insertGame(db, {
		playedAt: '2026-08-18T10:00:00.000Z',
		format: '2v2',
		winnerSide: 'A',
		sideA: [a.id, b.id],
		sideB: [c.id, d.id]
	});
	return { gameId, a, b, c, d };
}

/** Same as game2v2, but every participant has a login (email), so
    eligibleVoterIds returns all four and "unbeatable" resolution has a real
    outstanding eligible voter to account for, not a trivially-empty set. */
async function game2v2WithEmails() {
	const [a, b, c, d] = await Promise.all(
		['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n, null, `${n.toLowerCase()}@example.com`))
	);
	const gameId = await insertGame(db, {
		playedAt: '2026-08-18T10:00:00.000Z',
		format: '2v2',
		winnerSide: 'A',
		sideA: [a.id, b.id],
		sideB: [c.id, d.id]
	});
	return { gameId, a, b, c, d };
}

describe('mvp orchestration', () => {
	it('onGameLogged opens a round for 2v2 with a 24h deadline', async () => {
		const { gameId } = await game2v2();
		await onGameLogged(
			db,
			gameId,
			'2v2',
			'2026-08-18T10:00:00.000Z',
			new Date('2026-08-18T10:00:00.000Z')
		);
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('open');
		expect(new Date(rw!.round.deadline).toISOString()).toBe('2026-08-19T10:00:00.000Z');
	});
	it('onGameLogged skips 1v1', async () => {
		const [a, b] = await Promise.all(['A', 'B'].map((n) => addPlayer(db, n)));
		const gameId = await insertGame(db, {
			playedAt: '2026-08-18T10:00:00.000Z',
			format: '1v1',
			winnerSide: 'A',
			sideA: [a.id],
			sideB: [b.id]
		});
		await onGameLogged(db, gameId, '1v1', '2026-08-18T10:00:00.000Z');
		expect(await getRoundWithVotes(db, gameId)).toBeNull();
	});
	it('recomputeAfterVote closes early when unbeatable', async () => {
		const { gameId, a, b, c, d } = await game2v2();
		await onGameLogged(
			db,
			gameId,
			'2v2',
			'2026-08-18T10:00:00.000Z',
			new Date('2026-08-18T10:00:00.000Z')
		);
		await castVote(db, { gameId, voterId: a.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: b.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: d.id, nomineeId: c.id }); // 3/4 for c, only 1 voter left
		await recomputeAfterVote(db, gameId, new Date('2026-08-18T12:00:00.000Z'));
		expect((await getRoundWithVotes(db, gameId))?.round.status).toBe('decided');
	});
	it('recomputeAfterVote closes early as unbeatable with a real outstanding eligible voter', async () => {
		const { gameId, a, b, c, d } = await game2v2WithEmails();
		await onGameLogged(
			db,
			gameId,
			'2v2',
			'2026-08-18T10:00:00.000Z',
			new Date('2026-08-18T10:00:00.000Z')
		);
		// 3/4 eligible voters (all have logins) go for c; d hasn't voted yet, so
		// eligibleVoterIds' "remaining" is 1 — a genuine outstanding voter — and
		// c is still unbeatable (top=3 > second=0 + remaining=1).
		await castVote(db, { gameId, voterId: a.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: b.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: d.id, nomineeId: c.id });
		await recomputeAfterVote(db, gameId, new Date('2026-08-18T12:00:00.000Z'));
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('decided');
		const [result] = await getRecentResults(db, 10);
		expect(result.winners.map((w) => w.id)).toEqual([c.id]);
	});
	it('processTick does not send a spurious reminder for a round that closes early this tick', async () => {
		const { gameId, a, b, c, d } = await game2v2WithEmails();
		const now = new Date('2026-08-18T10:00:00.000Z');
		// Deadline is only 1h out — inside the 4h reminder window — but the
		// round is about to close early as unbeatable this same tick, so no
		// reminder should ever be considered for it.
		await createMvpRound(db, { gameId, deadline: '2026-08-18T11:00:00.000Z' });
		await castVote(db, { gameId, voterId: a.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: b.id, nomineeId: c.id });
		await castVote(db, { gameId, voterId: d.id, nomineeId: c.id }); // 3/4, unbeatable
		await processTick(db, now);
		const rw = await getRoundWithVotes(db, gameId);
		expect(rw?.round.status).toBe('decided');
		expect(rw?.round.resultNotifiedAt).toBeTruthy();
		expect(rw?.round.reminderNotifiedAt).toBeNull();
	});
	it('processTick voids an overdue round without quorum', async () => {
		const { gameId } = await game2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		await processTick(db, new Date('2026-08-20T10:00:00.000Z'));
		expect((await getRoundWithVotes(db, gameId))?.round.status).toBe('void');
	});
});
