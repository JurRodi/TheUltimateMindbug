import { describe, it, expect } from 'vitest';
import { generateSchedule } from './schedule';
import type { Schedule, TournamentSetup } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const rotating = (
	n: number,
	rounds: number,
	tables = 1,
	format: TournamentSetup['format'] = '2v2'
): TournamentSetup => ({
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
		expect(s.games.map((g) => `${g.round}:${g.slot}`)).toEqual([
			'1:0',
			'1:1',
			'2:0',
			'2:1',
			'3:0',
			'3:1',
			'4:0',
			'4:1'
		]);
	});

	it('never puts a player twice in one round', () => {
		const s = generateSchedule(rotating(9, 6, 2), 3);
		for (let r = 1; r <= 6; r++) {
			const inRound = s.games
				.filter((g) => g.round === r)
				.flatMap((g) => [...g.sideA!, ...g.sideB!]);
			expect(new Set(inRound).size).toBe(inRound.length);
		}
	});

	it('rotates sit-outs fairly (games played differ by at most 1)', () => {
		for (const [n, rounds] of [
			[5, 5],
			[6, 5],
			[7, 3],
			[10, 7]
		]) {
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

const teamStyle = (
	style: 'fixed' | 'knockout',
	n: number,
	tables = 1,
	format: TournamentSetup['format'] = '2v2'
): TournamentSetup => ({
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
		expect(s.games).toEqual([
			{ round: 1, slot: 0, sideA: expect.any(Array), sideB: expect.any(Array) }
		]);
	});
});
