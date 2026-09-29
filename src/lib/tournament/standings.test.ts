import { describe, it, expect } from 'vitest';
import { standings } from './standings';
import type { TournamentData, TournamentGame, TournamentInfo, TournamentStyle } from './types';

let nextId = 1;
const game = (
	round: number,
	slot: number,
	sideA: number[],
	sideB: number[],
	winnerSide: 'A' | 'B' | null
): TournamentGame => ({
	id: nextId++,
	round,
	slot,
	sideA,
	sideB,
	winnerSide,
	playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null
});
const info = (style: TournamentStyle): TournamentInfo => ({
	id: 1,
	name: 'T',
	style,
	format: style === 'knockout' ? '1v1' : '2v2',
	ranked: true,
	rounds: null,
	tables: 1,
	seed: 1,
	status: 'live',
	createdBy: 1,
	createdAt: '2026-09-29T19:00:00.000Z',
	finishedAt: null
});
const pos = (rows: ReturnType<typeof standings>) =>
	Object.fromEntries(rows.map((r) => [r.key, r.position]));

describe('standings — rotating', () => {
	it('ranks by points, then win%, sharing unresolved ties', () => {
		const data: TournamentData = {
			tournament: info('rotating'),
			roster: [1, 2, 3, 4, 5].map((playerId) => ({ playerId, teamNo: null })),
			games: [
				game(1, 0, [1, 2], [3, 4], 'A'), // 5 sits out
				game(2, 0, [1, 5], [2, 3], 'A'), // 4 sits out
				game(3, 0, [4, 5], [1, 3], 'B') // 2 sits out
			]
		};
		const rows = standings(data);
		// 1: 3 pts; 5: 1 pt (1/2); 2: 1 pt (1/2); 3: 1 pt (1/3); 4: 0 pts
		expect(rows[0]).toMatchObject({ key: '1', position: 1, points: 3, played: 3 });
		expect(pos(rows)['4']).toBe(5);
		expect(pos(rows)['3']).toBe(4);
		// 2 and 5 tie on points + win%; head-to-head: game 2 had 5 beating 2 → 5 ahead.
		expect(pos(rows)['5']).toBe(2);
		expect(pos(rows)['2']).toBe(3);
	});

	it('includes players who have not played yet', () => {
		const data: TournamentData = {
			tournament: info('rotating'),
			roster: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
			games: [game(1, 0, [1, 2], [3, 4], null)]
		};
		const rows = standings(data);
		expect(rows).toHaveLength(4);
		expect(rows.every((r) => r.position === 1 && r.played === 0)).toBe(true);
	});
});

describe('standings — fixed', () => {
	it('ranks teams by wins with head-to-head tiebreak', () => {
		const data: TournamentData = {
			tournament: info('fixed'),
			roster: [
				{ playerId: 1, teamNo: 1 },
				{ playerId: 2, teamNo: 1 },
				{ playerId: 3, teamNo: 2 },
				{ playerId: 4, teamNo: 2 },
				{ playerId: 5, teamNo: 3 },
				{ playerId: 6, teamNo: 3 }
			],
			games: [
				game(1, 0, [1, 2], [3, 4], 'A'),
				game(2, 0, [3, 4], [5, 6], 'A'),
				game(3, 0, [5, 6], [1, 2], 'A')
			]
		};
		const rows = standings(data);
		// All 1–1; circular h2h → all share 1st.
		expect(rows.map((r) => r.position)).toEqual([1, 1, 1]);
		expect(rows[0].teamNo).not.toBeNull();
	});
});

describe('standings — knockout', () => {
	it('places champion, runner-up and shared semi-finalists', () => {
		const data: TournamentData = {
			tournament: info('knockout'),
			roster: [1, 2, 3, 4].map((playerId, i) => ({ playerId, teamNo: i + 1 })),
			games: [game(1, 0, [1], [2], 'A'), game(1, 1, [3], [4], 'B'), game(2, 0, [1], [4], 'B')]
		};
		expect(pos(standings(data))).toEqual({ '4': 1, '1': 2, '2': 3, '3': 3 });
	});

	it('leaves alive teams without a position while live', () => {
		const data: TournamentData = {
			tournament: info('knockout'),
			roster: [1, 2, 3, 4].map((playerId, i) => ({ playerId, teamNo: i + 1 })),
			games: [game(1, 0, [1], [2], 'A'), game(1, 1, [3], [4], null), game(2, 0, [1], [], null)]
		};
		const p = pos(standings(data));
		expect(p['2']).toBe(3);
		expect(p['1']).toBeNull();
		expect(p['3']).toBeNull();
	});
});
