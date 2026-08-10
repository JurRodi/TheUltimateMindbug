import { describe, it, expect } from 'vitest';
import { teamStats, teamGameLog, teamNetSeries, teamStreak } from './teams';
import type { GameInput } from '$lib/types';

const NOW = new Date('2026-02-01T12:00:00Z');

const games: GameInput[] = [
	{
		id: 1,
		playedAt: '2026-01-01T10:00:00Z',
		format: '2v2',
		winnerSide: 'A',
		sideA: [1, 2],
		sideB: [3, 4]
	},
	{
		id: 2,
		playedAt: '2026-01-02T10:00:00Z',
		format: '2v2',
		winnerSide: 'A',
		sideA: [3, 4],
		sideB: [2, 1]
	}
];

describe('teamStats', () => {
	it('aggregates a line-up across games regardless of side order', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		const team12 = rows.find((r) => r.playerIds.join('-') === '1-2')!;
		// [1,2] won game1 (side A) and lost game2 (side B)
		expect(team12).toMatchObject({ games: 2, wins: 1, losses: 1 });
		expect(team12.winRate).toBeCloseTo(0.5, 6);
	});

	it('normalizes player id order within a line-up', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		expect(
			rows.every((r) => r.playerIds.join(',') === [...r.playerIds].sort((a, b) => a - b).join(','))
		).toBe(true);
	});

	it('sorts by games desc then winRate desc', () => {
		const rows = teamStats(games, { track: 'total', range: 'all', now: NOW });
		for (let i = 1; i < rows.length; i++) {
			const prev = rows[i - 1];
			const cur = rows[i];
			expect(
				prev.games > cur.games || (prev.games === cur.games && prev.winRate >= cur.winRate)
			).toBe(true);
		}
	});
});

describe('team history helpers', () => {
	it('teamNetSeries walks running net oldest-first', () => {
		// [1,2]: game1 W (+1), game2 L (0)
		expect(teamNetSeries(games, [2, 1])).toEqual([
			{ playedAt: '2026-01-01T10:00:00Z', net: 1 },
			{ playedAt: '2026-01-02T10:00:00Z', net: 0 }
		]);
	});

	it('teamGameLog returns newest-first with netAfter and opponents', () => {
		const log = teamGameLog(games, [1, 2]);
		expect(log.map((e) => e.gameId)).toEqual([2, 1]);
		expect(log[0]).toMatchObject({ won: false, netAfter: 0, opponentIds: [3, 4] });
		expect(log[1]).toMatchObject({ won: true, netAfter: 1, opponentIds: [3, 4] });
	});

	it('matches on the exact lineup, not a superset', () => {
		const extra: GameInput[] = [
			...games,
			{
				id: 3,
				playedAt: '2026-01-03T10:00:00Z',
				format: '3v3',
				winnerSide: 'A',
				sideA: [1, 2, 5],
				sideB: [3, 4, 6]
			}
		];
		// [1,2] (2-player team) must NOT pick up the 3-player game
		expect(teamGameLog(extra, [1, 2]).map((e) => e.gameId)).toEqual([2, 1]);
		expect(teamGameLog(extra, [1, 2, 5]).map((e) => e.gameId)).toEqual([3]);
	});

	it('teamStreak is signed from the most recent games', () => {
		// [1,2]: game1 W, game2 L -> current streak -1
		expect(teamStreak(games, [1, 2])).toBe(-1);
		// [3,4]: game1 L, game2 W -> current streak +1
		expect(teamStreak(games, [3, 4])).toBe(1);
		expect(teamStreak(games, [9, 9])).toBe(0);
	});
});

describe('teamStats ignores solo (1v1) sides', () => {
	it('never produces a one-player team', () => {
		const withSolo: GameInput[] = [
			...games,
			{
				id: 3,
				playedAt: '2026-01-03T10:00:00Z',
				format: '1v1',
				winnerSide: 'A',
				sideA: [1],
				sideB: [2]
			}
		];
		const rows = teamStats(withSolo, { track: 'total', range: 'all', now: NOW });
		expect(rows.every((r) => r.playerIds.length >= 2)).toBe(true);
	});
});
