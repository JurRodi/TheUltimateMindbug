import { describe, it, expect } from 'vitest';
import { filterGames, playerStats, allPlayerStats, playerGameLog } from './aggregate';
import type { GameInput } from '$lib/types';

const NOW = new Date('2026-01-31T12:00:00Z');

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
		playedAt: '2026-01-15T10:00:00Z',
		format: '3v3',
		winnerSide: 'B',
		sideA: [1, 2, 5],
		sideB: [3, 4, 6]
	},
	{
		id: 3,
		playedAt: '2026-01-30T10:00:00Z',
		format: '2v2',
		winnerSide: 'B',
		sideA: [1, 2],
		sideB: [4, 6]
	}
];

describe('filterGames', () => {
	it('filters by format track', () => {
		expect(filterGames(games, { track: '2v2', range: 'all', now: NOW }).map((g) => g.id)).toEqual([
			1, 3
		]);
		expect(filterGames(games, { track: '3v3', range: 'all', now: NOW }).map((g) => g.id)).toEqual([
			2
		]);
		expect(filterGames(games, { track: 'total', range: 'all', now: NOW }).map((g) => g.id)).toEqual(
			[1, 2, 3]
		);
	});

	it('filters by date range (week = last 7 days, month = last 30 days)', () => {
		expect(
			filterGames(games, { track: 'total', range: 'week', now: NOW }).map((g) => g.id)
		).toEqual([3]);
		expect(
			filterGames(games, { track: 'total', range: 'month', now: NOW }).map((g) => g.id)
		).toEqual([2, 3]);
	});
});

describe('playerStats', () => {
	it('counts wins/losses/winRate for a player across all games', () => {
		// player 1: game1 sideA wins (W), game2 sideA loses (L), game3 sideA loses (L)
		const s = playerStats(games, 1, { track: 'total', range: 'all', now: NOW });
		expect(s).toMatchObject({ playerId: 1, games: 3, wins: 1, losses: 2 });
		expect(s.winRate).toBeCloseTo(1 / 3, 6);
	});

	it('returns zeros and winRate 0 for a player with no games in filter', () => {
		const s = playerStats(games, 5, { track: '2v2', range: 'all', now: NOW });
		expect(s).toEqual({ playerId: 5, games: 0, wins: 0, losses: 0, winRate: 0, streak: 0 });
	});

	it('computes a signed current streak (most recent games)', () => {
		// player 4: game1 L, game2 W, game3 W -> current streak +2
		expect(playerStats(games, 4, { track: 'total', range: 'all', now: NOW }).streak).toBe(2);
		// player 2: game1 W, game2 L, game3 L -> current streak -2
		expect(playerStats(games, 2, { track: 'total', range: 'all', now: NOW }).streak).toBe(-2);
	});
});

describe('allPlayerStats', () => {
	it('returns one entry per requested player id', () => {
		const rows = allPlayerStats(games, [1, 2, 3, 4], { track: 'total', range: 'all', now: NOW });
		expect(rows.map((r) => r.playerId)).toEqual([1, 2, 3, 4]);
	});
});

describe('playerGameLog', () => {
	const deltaByGame = new Map<number, number>([
		[1, 12],
		[3, -5]
		// game 2 intentionally omitted to exercise the 0 fallback
	]);

	it('returns the player’s games newest-first with resolved sides and deltas', () => {
		const log = playerGameLog(games, 1, deltaByGame);
		expect(log.map((e) => e.gameId)).toEqual([3, 2, 1]);

		const [g3, g2, g1] = log;
		expect(g3).toMatchObject({
			format: '2v2',
			won: false,
			delta: -5,
			teammateIds: [2],
			opponentIds: [4, 6]
		});
		// game 2: player 1 on sideA (lost), delta falls back to 0
		expect(g2).toMatchObject({
			format: '3v3',
			won: false,
			delta: 0,
			teammateIds: [2, 5],
			opponentIds: [3, 4, 6]
		});
		expect(g1).toMatchObject({
			format: '2v2',
			won: true,
			delta: 12,
			teammateIds: [2],
			opponentIds: [3, 4]
		});
	});

	it('omits games the player did not play in', () => {
		// player 5 only appears in game 2
		const log = playerGameLog(games, 5, deltaByGame);
		expect(log.map((e) => e.gameId)).toEqual([2]);
		expect(log[0].teammateIds).toEqual([1, 2]);
		expect(log[0].opponentIds).toEqual([3, 4, 6]);
	});
});
