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
	style: 'rotating',
	format: '2v2',
	playerIds: ids.slice(0, 4),
	rounds: 3,
	tables: 1,
	...over
});
const create = (over: Partial<TournamentSetup> = {}, ranked = true) =>
	createTournament(db, { name: 'Cup', setup: setup(over), ranked, seed: 7, createdBy: ids[0] });

describe('createTournament / getTournament', () => {
	it('stores tournament, roster and every scheduled game', async () => {
		const id = await create();
		const t = (await getTournament(db, id))!;
		expect(t.tournament).toMatchObject({
			name: 'Cup',
			style: 'rotating',
			status: 'live',
			rounds: 3,
			seed: 7
		});
		expect(t.roster).toHaveLength(4);
		expect(t.games).toHaveLength(3);
		expect(
			t.games.every((g) => g.winnerSide === null && g.sideA.length === 2 && g.sideB.length === 2)
		).toBe(true);
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
		expect(await finishTournament(db, creator, id)).toEqual({
			ok: false,
			error: 'Not every match has a result yet'
		});
		await recordResult(db, other, id, g.id, 'A');
		expect((await finishTournament(db, other, id)).ok).toBe(false);
		expect(await finishTournament(db, creator, id)).toEqual({ ok: true });
		const t = (await getTournament(db, id))!;
		expect(t.tournament.status).toBe('finished');
		expect(t.tournament.finishedAt).not.toBeNull();
		expect(await clearResult(db, admin, id, g.id)).toEqual({
			ok: false,
			error: 'This tournament is closed'
		});
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
