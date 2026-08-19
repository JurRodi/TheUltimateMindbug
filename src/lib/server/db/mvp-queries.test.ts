import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { addPlayer, insertGame } from './queries';
import {
	createMvpRound,
	getRoundWithVotes,
	castVote,
	closeRound,
	markRoundNotified,
	claimRoundNotification,
	getOpenRoundsForPlayer,
	getMyOpenVotes,
	getRecentResults,
	getMvpCounts,
	savePushSubscription,
	deletePushSubscription,
	deletePushSubscriptionForPlayer,
	getSubscriptionsForPlayers
} from './queries';

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
	db = await makeTestDb();
});

async function setup2v2() {
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
	it('claims a notification exactly once', async () => {
		const { gameId } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		expect(await claimRoundNotification(db, gameId, 'result')).toBe(true);
		expect(await claimRoundNotification(db, gameId, 'result')).toBe(false);
	});
});

describe('mvp read queries', () => {
	it('lists open rounds a player has not voted in, with sides split', async () => {
		const { gameId, a, b, c, d } = await setup2v2();
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });
		const openForA = await getOpenRoundsForPlayer(db, a.id);
		expect(openForA).toHaveLength(1);
		expect(openForA[0].us.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
		expect(openForA[0].them.map((p) => p.id).sort()).toEqual([c.id, d.id].sort());
		// a is on side A, and side A won this game, so the round should report
		// that outcome to distinguish it from a round the voter's side lost.
		expect(openForA[0].side).toBe('A');
		expect(openForA[0].winnerSide).toBe('A');
		await castVote(db, { gameId, voterId: a.id, nomineeId: b.id });
		expect(await getOpenRoundsForPlayer(db, a.id)).toHaveLength(0); // already voted
	});
	it('reports decided results with winners and top vote count, and MVP counts', async () => {
		const { gameId, a, c, d } = await setup2v2();
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

describe('push subscription queries', () => {
	it('saves, reads by player, upserts by endpoint, and deletes', async () => {
		const a = await addPlayer(db, 'Ada');
		await savePushSubscription(db, {
			playerId: a.id,
			endpoint: 'https://p/1',
			p256dh: 'k1',
			auth: 't1'
		});
		await savePushSubscription(db, {
			playerId: a.id,
			endpoint: 'https://p/1',
			p256dh: 'k2',
			auth: 't2'
		}); // same endpoint -> upsert
		const subs = await getSubscriptionsForPlayers(db, [a.id]);
		expect(subs).toHaveLength(1);
		expect(subs[0].p256dh).toBe('k2');
		await deletePushSubscription(db, 'https://p/1');
		expect(await getSubscriptionsForPlayers(db, [a.id])).toHaveLength(0);
	});

	it('scopes delete-for-player to the owning player', async () => {
		const a = await addPlayer(db, 'Ada');
		const b = await addPlayer(db, 'Bea');
		await savePushSubscription(db, {
			playerId: a.id,
			endpoint: 'https://p/a',
			p256dh: 'ka',
			auth: 'ta'
		});
		await savePushSubscription(db, {
			playerId: b.id,
			endpoint: 'https://p/b',
			p256dh: 'kb',
			auth: 'tb'
		});

		// Wrong owner: b can't delete a's subscription by knowing its endpoint.
		await deletePushSubscriptionForPlayer(db, 'https://p/a', b.id);
		expect(await getSubscriptionsForPlayers(db, [a.id])).toHaveLength(1);

		// Correct owner: a can delete their own.
		await deletePushSubscriptionForPlayer(db, 'https://p/a', a.id);
		expect(await getSubscriptionsForPlayers(db, [a.id])).toHaveLength(0);
		expect(await getSubscriptionsForPlayers(db, [b.id])).toHaveLength(1);
	});
});

describe('getMyOpenVotes', () => {
	it('returns open rounds the player voted in (with their pick), and moves them out of the pending list', async () => {
		const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n)));
		const gameId = await insertGame(db, {
			playedAt: '2026-08-18T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id]
		});
		await createMvpRound(db, { gameId, deadline: '2026-08-19T10:00:00.000Z' });

		// Before voting: pending for a, and getMyOpenVotes is empty.
		expect(await getMyOpenVotes(db, a.id)).toHaveLength(0);
		expect(await getOpenRoundsForPlayer(db, a.id)).toHaveLength(1);

		await castVote(db, { gameId, voterId: a.id, nomineeId: c.id });

		// After voting: no longer pending, now under "voted" with the right pick.
		expect(await getOpenRoundsForPlayer(db, a.id)).toHaveLength(0);
		const voted = await getMyOpenVotes(db, a.id);
		expect(voted).toHaveLength(1);
		expect(voted[0].myVote?.id).toBe(c.id);
		expect(voted[0].us.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());

		// b hasn't voted, so nothing shows in their voted list.
		expect(await getMyOpenVotes(db, b.id)).toHaveLength(0);
	});
});

describe('getMvpCounts since', () => {
	it('counts only MVPs from games played on/after `since`', async () => {
		const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n)));
		const decideWin = async (playedAt: string) => {
			const gameId = await insertGame(db, {
				playedAt,
				format: '2v2',
				winnerSide: 'A',
				sideA: [a.id, b.id],
				sideB: [c.id, d.id]
			});
			await createMvpRound(db, { gameId, deadline: playedAt });
			await castVote(db, { gameId, voterId: c.id, nomineeId: a.id });
			await castVote(db, { gameId, voterId: d.id, nomineeId: a.id });
			await closeRound(db, gameId, 'decided');
		};
		await decideWin('2020-01-01T00:00:00.000Z'); // old
		await decideWin('2026-08-18T00:00:00.000Z'); // recent

		expect((await getMvpCounts(db)).get(a.id)).toBe(2); // all-time
		expect((await getMvpCounts(db, '2026-01-01T00:00:00.000Z')).get(a.id)).toBe(1); // recent only
	});
});
