import { describe, it, expect } from 'vitest';
import { nextSlot, totalRounds, canChangeKnockoutResult, roundName } from './advance';
import type { TournamentGame } from './types';

const g = (round: number, slot: number, winnerSide: 'A' | 'B' | null): TournamentGame => ({
	id: round * 10 + slot,
	round,
	slot,
	winnerSide,
	playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null,
	sideA: [1],
	sideB: [2]
});

describe('advance', () => {
	it('maps slots to the next round and side', () => {
		expect(nextSlot(1, 0, 3)).toEqual({ round: 2, slot: 0, side: 'A' });
		expect(nextSlot(1, 3, 3)).toEqual({ round: 2, slot: 1, side: 'B' });
		expect(nextSlot(3, 0, 3)).toBeNull();
	});

	it('counts rounds', () => {
		expect(totalRounds([g(1, 0, null), g(2, 0, null)])).toBe(2);
		expect(totalRounds([])).toBe(0);
	});

	it('allows changing a result only while the next match is unplayed', () => {
		const semi = g(1, 0, 'A');
		expect(canChangeKnockoutResult([semi, g(1, 1, 'B'), g(2, 0, null)], semi)).toBe(true);
		expect(canChangeKnockoutResult([semi, g(1, 1, 'B'), g(2, 0, 'A')], semi)).toBe(false);
		const final = g(2, 0, 'A');
		expect(canChangeKnockoutResult([semi, final], final)).toBe(true);
	});

	it('names rounds from the final backwards', () => {
		expect(roundName(3, 3)).toBe('Final');
		expect(roundName(2, 3)).toBe('Semi-finals');
		expect(roundName(1, 3)).toBe('Quarter-finals');
		expect(roundName(1, 4)).toBe('Round 1');
	});
});
