import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import {
	addPlayer,
	getPlayers,
	getPlayer,
	setPlayerActive,
	insertGame,
	getAllGames,
	getGameHistory,
	getGamesMeta,
	deleteGame,
	getPlayerByEmail,
	getPlayersForAdmin,
	updatePlayerAuth,
	updatePlayerProfile
} from './queries';
import { games as gamesTable, tournaments } from './schema';

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

	it('records createdBy when supplied and reads it via getGamesMeta', async () => {
		const [a, b, c, d, entrant] = await Promise.all([
			addPlayer(db, 'A'),
			addPlayer(db, 'B'),
			addPlayer(db, 'C'),
			addPlayer(db, 'D'),
			addPlayer(db, 'Entrant')
		]);
		const id = await insertGame(db, {
			playedAt: '2026-01-01T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id],
			createdBy: entrant.id
		});
		const meta = await getGamesMeta(db);
		expect(meta).toHaveLength(1);
		expect(meta[0]).toMatchObject({ id, createdBy: entrant.id });
		expect(typeof meta[0].createdAt).toBe('string');
	});

	it('leaves createdBy null when omitted', async () => {
		const [a, b, c, d] = await Promise.all([
			addPlayer(db, 'A'),
			addPlayer(db, 'B'),
			addPlayer(db, 'C'),
			addPlayer(db, 'D')
		]);
		await insertGame(db, {
			playedAt: '2026-01-01T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id]
		});
		const meta = await getGamesMeta(db);
		expect(meta[0].createdBy).toBeNull();
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

	it('updatePlayerProfile trims the name and clears a blank avatar', async () => {
		const db = await makeTestDb();
		const p = await addPlayer(db, 'Sam', '🦍');
		await updatePlayerProfile(db, p.id, { name: '  Samuel  ', avatar: '🦁' });
		let got = await getPlayer(db, p.id);
		expect(got?.name).toBe('Samuel');
		expect(got?.avatar).toBe('🦁');
		// A blank avatar clears back to null (deterministic fallback); email/admin untouched.
		await updatePlayerProfile(db, p.id, { avatar: '' });
		got = await getPlayer(db, p.id);
		expect(got?.avatar).toBeNull();
		expect(got?.name).toBe('Samuel');
	});

	it('updatePlayerProfile surfaces a duplicate-name conflict', async () => {
		const db = await makeTestDb();
		await addPlayer(db, 'Taken');
		const p = await addPlayer(db, 'Mine');
		await expect(updatePlayerProfile(db, p.id, { name: 'Taken' })).rejects.toBeTruthy();
	});

	it('rejects an avatar outside the allow-list before it reaches the DB', async () => {
		const db = await makeTestDb();
		await expect(addPlayer(db, 'Mallory', '🍕')).rejects.toThrow(/invalid avatar/i);
		const p = await addPlayer(db, 'Trent', '🦍');
		await expect(updatePlayerProfile(db, p.id, { avatar: '🍕' })).rejects.toThrow(
			/invalid avatar/i
		);
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

describe('ranked and scheduled games', () => {
	async function four() {
		return Promise.all(['A', 'B', 'C', 'D'].map((n) => addPlayer(db, n)));
	}

	it('getAllGames excludes unranked games; getGameHistory keeps them', async () => {
		const [a, b, c, d] = await four();
		await insertGame(db, {
			playedAt: '2026-01-01T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id]
		});
		const casual = await insertGame(db, {
			playedAt: '2026-01-02T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'B',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id],
			ranked: false
		});
		expect((await getAllGames(db)).map((g) => g.id)).not.toContain(casual);
		const history = await getGameHistory(db);
		expect(history).toHaveLength(2);
		expect(history.find((g) => g.id === casual)).toMatchObject({
			ranked: false,
			tournament: null
		});
	});

	it('getAllGames and getGameHistory exclude scheduled tournament games', async () => {
		const [a] = await four();
		const [t] = await db
			.insert(tournaments)
			.values({
				name: 'Cup',
				style: 'knockout',
				format: '2v2',
				ranked: true,
				tables: 1,
				seed: 1,
				createdBy: a.id
			})
			.returning();
		await db.insert(gamesTable).values({ format: '2v2', tournamentId: t.id, round: 1, slot: 0 });
		expect(await getAllGames(db)).toEqual([]);
		expect(await getGameHistory(db)).toEqual([]);
	});

	it('getGameHistory attaches tournament name and round', async () => {
		const [a, b, c, d] = await four();
		const [t] = await db
			.insert(tournaments)
			.values({
				name: 'Cup',
				style: 'knockout',
				format: '2v2',
				ranked: true,
				tables: 1,
				seed: 1,
				createdBy: a.id
			})
			.returning();
		const id = await insertGame(db, {
			playedAt: '2026-01-01T10:00:00.000Z',
			format: '2v2',
			winnerSide: 'A',
			sideA: [a.id, b.id],
			sideB: [c.id, d.id]
		});
		await db.update(gamesTable).set({ tournamentId: t.id, round: 2, slot: 0 });
		const [g] = await getGameHistory(db);
		expect(g).toMatchObject({ id, tournament: { id: t.id, name: 'Cup', round: 2 } });
	});
});
