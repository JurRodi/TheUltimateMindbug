import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import {
	addPlayer,
	getPlayers,
	getPlayer,
	setPlayerActive,
	insertGame,
	getAllGames
} from './queries';

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
