import { describe, it, expect } from 'vitest';
import { expectedScore, DEFAULT_CONFIG } from './engine';

describe('expectedScore', () => {
	it('is 0.5 for equal ratings', () => {
		expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
	});

	it('is ~0.76 when 200 points higher', () => {
		expect(expectedScore(1200, 1000)).toBeCloseTo(0.7597, 3);
	});

	it('is symmetric: E_A + E_B = 1', () => {
		const a = expectedScore(1337, 1010);
		const b = expectedScore(1010, 1337);
		expect(a + b).toBeCloseTo(1, 10);
	});
});

describe('DEFAULT_CONFIG', () => {
	it('starts at 1000 with K=24', () => {
		expect(DEFAULT_CONFIG).toEqual({ startRating: 1000, k: 24 });
	});
});

import { computeTrack } from './engine';
import type { GameInput } from '$lib/types';

const g = (
	over: Partial<GameInput> & Pick<GameInput, 'id' | 'playedAt' | 'winnerSide' | 'sideA' | 'sideB'>
): GameInput => ({
	format: '2v2',
	...over
});

describe('computeTrack', () => {
	it('returns empty state for no games', () => {
		const r = computeTrack([]);
		expect(r.current).toEqual({});
		expect(r.history).toEqual([]);
	});

	it('applies a symmetric ±K delta for an even 2v2 (all start equal)', () => {
		const r = computeTrack([
			g({ id: 1, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		]);
		// equal ratings => E = 0.5 => delta = 24 * (1 - 0.5) = 12 for winners, -12 for losers
		expect(r.current[1]).toBeCloseTo(1012, 6);
		expect(r.current[2]).toBeCloseTo(1012, 6);
		expect(r.current[3]).toBeCloseTo(988, 6);
		expect(r.current[4]).toBeCloseTo(988, 6);
	});

	it('records a chronological history snapshot per participant per game', () => {
		const r = computeTrack([
			g({ id: 7, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		]);
		expect(r.history).toHaveLength(4);
		const p1 = r.history.find((h) => h.playerId === 1)!;
		expect(p1).toMatchObject({ gameId: 7, ratingBefore: 1000, ratingAfter: 1012, delta: 12 });
	});

	it('processes games in chronological order regardless of input order', () => {
		const later = g({
			id: 2,
			playedAt: '2026-01-02T10:00:00Z',
			winnerSide: 'B',
			sideA: [1, 2],
			sideB: [3, 4]
		});
		const earlier = g({
			id: 1,
			playedAt: '2026-01-01T10:00:00Z',
			winnerSide: 'A',
			sideA: [1, 2],
			sideB: [3, 4]
		});
		const r = computeTrack([later, earlier]);
		// game1: 1&2 -> 1012, 3&4 -> 988. game2: B wins; teamA=1012, teamB=988
		// E_A = 1/(1+10^((988-1012)/400)) ≈ 0.5345; A loses => delta_A = 24*(0-0.5345) ≈ -12.83
		expect(r.current[1]).toBeCloseTo(1012 - 12.828, 2);
		expect(r.current[3]).toBeCloseTo(988 + 12.828, 2);
	});

	it('does not mutate the input array', () => {
		const games = [
			g({ id: 2, playedAt: '2026-01-02T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] }),
			g({ id: 1, playedAt: '2026-01-01T10:00:00Z', winnerSide: 'A', sideA: [1, 2], sideB: [3, 4] })
		];
		computeTrack(games);
		expect(games[0].id).toBe(2);
	});
});

import { computeRatings } from './engine';

describe('computeRatings', () => {
	it('computes three independent tracks filtered by format', () => {
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
				format: '3v3',
				winnerSide: 'A',
				sideA: [1, 2, 5],
				sideB: [3, 4, 6]
			}
		];
		const r = computeRatings(games);
		// total sees both games; 2v2 sees only game 1; 3v3 sees only game 2
		expect(Object.keys(r['2v2'].current).sort()).toEqual(['1', '2', '3', '4']);
		expect(Object.keys(r['3v3'].current).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
		// player 5 only exists in 3v3 and total, never in 2v2
		expect(r['2v2'].current[5]).toBeUndefined();
		expect(r['3v3'].current[5]).toBeGreaterThan(1000);
		expect(r.total.current[5]).toBeGreaterThan(1000);
	});
});

describe('1v1 (length-1 sides)', () => {
	it('rates a 1v1 as a standard head-to-head', () => {
		const r = computeTrack([
			g({
				id: 1,
				playedAt: '2026-01-01T10:00:00Z',
				format: '1v1',
				winnerSide: 'A',
				sideA: [1],
				sideB: [2]
			})
		]);
		expect(r.current[1]).toBeCloseTo(1012, 6);
		expect(r.current[2]).toBeCloseTo(988, 6);
	});

	it('computeRatings isolates the 1v1 track while total sees all games', () => {
		const games = [
			g({
				id: 1,
				playedAt: '2026-01-01T10:00:00Z',
				format: '1v1',
				winnerSide: 'A',
				sideA: [1],
				sideB: [2]
			}),
			g({
				id: 2,
				playedAt: '2026-01-02T10:00:00Z',
				format: '2v2',
				winnerSide: 'A',
				sideA: [1, 3],
				sideB: [2, 4]
			})
		];
		const r = computeRatings(games);
		expect(
			Object.keys(r['1v1'].current)
				.map(Number)
				.sort((a, b) => a - b)
		).toEqual([1, 2]);
		expect(r['1v1'].history).toHaveLength(2);
		expect(r.total.history).toHaveLength(6);
	});
});
