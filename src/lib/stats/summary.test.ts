import { describe, expect, test } from 'vitest';
import { computeTrack } from '$lib/rating/engine';
import { weekSummary } from './summary';
import type { GameInput } from '$lib/types';

// Fixed "now" so the 7-day windows are deterministic.
const NOW = new Date('2026-08-10T12:00:00Z');

const game = (
	id: number,
	playedAt: string,
	sideA: number[],
	sideB: number[],
	winnerSide: 'A' | 'B'
): GameInput => ({ id, playedAt, format: '2v2', winnerSide, sideA, sideB });

describe('weekSummary', () => {
	// Players 5-8 play the older games so players 1-4 enter "this week" at the
	// base rating of 1000 — keeps the climb math easy to assert.
	const games: GameInput[] = [
		game(1, '2026-07-01T12:00:00Z', [5, 6], [7, 8], 'A'), // long ago
		game(2, '2026-07-30T12:00:00Z', [5, 6], [7, 8], 'A'), // previous week
		game(3, '2026-08-06T12:00:00Z', [1, 2], [3, 4], 'A'), // this week
		game(4, '2026-08-09T12:00:00Z', [1, 3], [2, 4], 'A') // this week
	];
	const history = computeTrack(games).history;

	test('counts games this week and the delta vs the previous week', () => {
		const s = weekSummary(games, history, 'total', NOW);
		expect(s.gamesThisWeek).toBe(2); // games 3 and 4
		expect(s.gamesDelta).toBe(1); // 2 this week - 1 previous week
	});

	test('biggest climb is the player who gained the most rating this week', () => {
		const s = weekSummary(games, history, 'total', NOW);
		// Game 3: 1,2 win (+12 each). Game 4: 1,3 win. Player 1 wins both → +24.
		expect(s.biggestClimb?.playerId).toBe(1);
		expect(Math.round(s.biggestClimb!.gain)).toBe(24);
	});

	test('respects the format track when counting games', () => {
		const mixed: GameInput[] = [
			{ ...game(10, '2026-08-07T12:00:00Z', [1, 2], [3, 4], 'A'), format: '3v3' },
			game(11, '2026-08-08T12:00:00Z', [1, 2], [3, 4], 'A') // 2v2
		];
		const s = weekSummary(mixed, computeTrack(mixed).history, '2v2', NOW);
		expect(s.gamesThisWeek).toBe(1); // only the 2v2 game
	});

	test('no climb returns null', () => {
		const s = weekSummary([], [], 'total', NOW);
		expect(s.gamesThisWeek).toBe(0);
		expect(s.gamesDelta).toBe(0);
		expect(s.biggestClimb).toBeNull();
	});
});
