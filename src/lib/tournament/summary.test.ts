import { describe, it, expect } from 'vitest';
import {
	progress,
	winners,
	playerTournaments,
	playerTournamentTotals,
	titleCounts
} from './summary';
import type { TournamentData, TournamentGame, TournamentStatus, TournamentStyle } from './types';

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

const td = (
	id: number,
	style: TournamentStyle,
	status: TournamentStatus,
	games: TournamentGame[],
	teams?: number[][]
): TournamentData => ({
	tournament: {
		id,
		name: `T${id}`,
		style,
		format: '2v2',
		ranked: true,
		rounds: 1,
		tables: 1,
		seed: 1,
		status,
		createdBy: 1,
		createdAt: `2026-09-${10 + id}T19:00:00.000Z`,
		finishedAt: null
	},
	roster: teams
		? teams.flatMap((t, i) => t.map((playerId) => ({ playerId, teamNo: i + 1 })))
		: [1, 2, 3, 4].map((playerId) => ({ playerId, teamNo: null })),
	games
});

describe('player tournament summary', () => {
	const rot = td(1, 'rotating', 'finished', [g(11, 1, 'A', [1, 2], [3, 4])]);
	const ko = td(
		2,
		'knockout',
		'finished',
		[g(21, 1, 'B', [1, 2], [3, 4])],
		[
			[1, 2],
			[3, 4]
		]
	);
	const live = td(3, 'rotating', 'live', [g(31, 1, 'A', [1, 3], [2, 4])]);
	const abandoned = td(4, 'rotating', 'abandoned', []);

	it('lists entries newest first, skipping abandoned and tournaments without the player', () => {
		const e = playerTournaments([rot, ko, live, abandoned], 1);
		expect(e.map((x) => x.tournament.id)).toEqual([3, 2, 1]);
		expect(e.find((x) => x.tournament.id === 1)).toMatchObject({
			position: 1,
			positionLabel: '1 of 4',
			wins: 1,
			teammateIds: []
		});
		expect(e.find((x) => x.tournament.id === 2)).toMatchObject({
			position: 2,
			positionLabel: '2 of 2',
			teammateIds: [2],
			gameIds: [21]
		});
		expect(playerTournaments([rot], 99)).toEqual([]);
	});

	it('labels shared knockout places as ranges', () => {
		const big = td(
			5,
			'knockout',
			'finished',
			[
				{ ...g(51, 1, 'A', [1], [2]), slot: 0 },
				{ ...g(52, 1, 'A', [3], [4]), slot: 1 },
				{ ...g(53, 2, 'A', [1], [3]), slot: 0 }
			],
			[[1], [2], [3], [4]]
		);
		expect(playerTournaments([big], 2)[0].positionLabel).toBe('3–4th');
	});

	it('totals count only finished tournaments', () => {
		const t = playerTournamentTotals(playerTournaments([rot, ko, live], 1));
		expect(t).toMatchObject({
			titles: 1,
			podiums: 2,
			played: 2,
			avgFinish: 1.5,
			wins: 1,
			losses: 1,
			winRate: 0.5
		});
		expect(t.bestStyle).toEqual({ style: 'rotating', titles: 1 });
	});

	it('title counts credit every champion member', () => {
		const c = titleCounts([rot, ko, live]);
		expect(c.get(1)).toBe(1); // rotating win
		expect(c.get(3)).toBe(1); // knockout champs 3+4
		expect(c.get(4)).toBe(1);
		expect(c.get(2)).toBe(1); // rotating: 2 was 1's teammate → also 1 point, shared 1st
	});
});
