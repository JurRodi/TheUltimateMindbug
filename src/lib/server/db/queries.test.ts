import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import {
	addPlayer,
	getPlayers,
	getPlayer,
	setPlayerActive,
	insertGame,
	getAllGames,
	deleteGame,
	getPlayerByEmail,
	getPlayersForAdmin,
	updatePlayerAuth
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

describe('player identity queries', () => {
	it('resolves a player by email, case-insensitively', async () => {
		const db = await makeTestDb();
		await addPlayer(db, 'Jur', null, 'Jur@Example.com');
		const hit = await getPlayerByEmail(db, 'jur@example.com');
		expect(hit?.name).toBe('Jur');
		expect(hit?.email).toBe('jur@example.com'); // stored lowercased
		expect(await getPlayerByEmail(db, 'nobody@example.com')).toBeNull();
	});

	it('updatePlayerAuth sets email and admin independently', async () => {
		const db = await makeTestDb();
		const p = await addPlayer(db, 'Sam');
		expect(p.email).toBeNull();
		expect(p.isAdmin).toBe(false);
		await updatePlayerAuth(db, p.id, { email: 'SAM@x.com' });
		await updatePlayerAuth(db, p.id, { isAdmin: true });
		const [got] = await getPlayersForAdmin(db);
		expect(got.email).toBe('sam@x.com');
		expect(got.isAdmin).toBe(true);
	});
});

describe('deleteGame', () => {
	it('removes the game (participants cascade)', async () => {
		const a = await addPlayer(db, 'Ada');
		const b = await addPlayer(db, 'Bo');
		const gid = await insertGame(db, {
			playedAt: '2026-01-01T10:00:00Z',
			format: '1v1',
			winnerSide: 'A',
			sideA: [a.id],
			sideB: [b.id]
		});
		expect((await getAllGames(db)).map((game) => game.id)).toContain(gid);
		await deleteGame(db, gid);
		expect((await getAllGames(db)).map((game) => game.id)).not.toContain(gid);
	});
});
