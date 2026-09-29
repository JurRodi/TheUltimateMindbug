import { describe, it, expect } from 'vitest';
import { progress, winners } from './summary';
import type { TournamentData, TournamentGame, TournamentStatus } from './types';

const g = (
	id: number,
	round: number,
	winnerSide: 'A' | 'B' | null,
	a: number[],
	b: number[]
): TournamentGame => ({
	id,
	round,
	slot: 0,
	sideA: a,
	sideB: b,
	winnerSide,
	playedAt: winnerSide ? '2026-09-29T20:00:00.000Z' : null
});
const data = (status: TournamentStatus, games: TournamentGame[]): TournamentData => ({
	tournament: {
		id: 1,
		name: 'T',
		style: 'rotating',
		format: '2v2',
		ranked: true,
		rounds: 2,
		tables: 1,
		seed: 1,
		status,
		createdBy: 1,
		createdAt: '2026-09-29T19:00:00.000Z',
		finishedAt: null
	},
	roster: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
	games
});

describe('progress', () => {
	it('counts played games and the first round with an open match', () => {
		const d = data('live', [g(1, 1, 'A', [1, 2], [3, 4]), g(2, 2, null, [1, 3], [2, 4])]);
		expect(progress(d)).toEqual({ played: 1, total: 2, round: 2 });
	});
	it('round is null when everything is played', () => {
		expect(progress(data('live', [g(1, 1, 'A', [1, 2], [3, 4])])).round).toBeNull();
	});
});

describe('winners', () => {
	it('is empty unless finished', () => {
		expect(winners(data('live', [g(1, 1, 'A', [1, 2], [3, 4])]))).toEqual([]);
	});
	it('returns every position-1 row when finished', () => {
		const w = winners(data('finished', [g(1, 1, 'A', [1, 2], [3, 4])]));
		expect(w.map((r) => r.key).sort()).toEqual(['1', '2']);
	});
});
