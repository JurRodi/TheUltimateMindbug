import type { GameInput } from '$lib/types';
import { filterGames, type StatsOpts } from './aggregate';

export interface TeamRecord {
	/** Sorted ascending. */
	playerIds: number[];
	games: number;
	wins: number;
	losses: number;
	winRate: number;
}

export function teamStats(games: GameInput[], opts: StatsOpts): TeamRecord[] {
	const acc = new Map<string, { playerIds: number[]; games: number; wins: number }>();

	const record = (ids: number[], won: boolean) => {
		const sorted = [...ids].sort((a, b) => a - b);
		const key = sorted.join('-');
		const entry = acc.get(key) ?? { playerIds: sorted, games: 0, wins: 0 };
		entry.games++;
		if (won) entry.wins++;
		acc.set(key, entry);
	};

	for (const g of filterGames(games, opts)) {
		record(g.sideA, g.winnerSide === 'A');
		record(g.sideB, g.winnerSide === 'B');
	}

	return [...acc.values()]
		.map((e) => ({
			playerIds: e.playerIds,
			games: e.games,
			wins: e.wins,
			losses: e.games - e.wins,
			winRate: e.games === 0 ? 0 : e.wins / e.games
		}))
		.sort((a, b) => (b.games !== a.games ? b.games - a.games : b.winRate - a.winRate));
}
