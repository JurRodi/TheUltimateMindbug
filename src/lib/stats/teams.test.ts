import { describe, it, expect } from 'vitest';
import { teamStats } from './teams';
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
