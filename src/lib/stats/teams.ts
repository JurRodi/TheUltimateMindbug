import type { GameInput, Format } from '$lib/types';
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

const keyOf = (ids: number[]) => [...ids].sort((a, b) => a - b).join('-');

/** The team's games in chronological order, with win flag + opponents. */
function teamGamesChrono(
	games: GameInput[],
	playerIds: number[]
): { game: GameInput; won: boolean; opponentIds: number[] }[] {
	const key = keyOf(playerIds);
	return games
		.filter((g) => keyOf(g.sideA) === key || keyOf(g.sideB) === key)
		.map((g) => {
			const onA = keyOf(g.sideA) === key;
			return {
				game: g,
				won: g.winnerSide === (onA ? 'A' : 'B'),
				opponentIds: [...(onA ? g.sideB : g.sideA)]
			};
		})
		.sort((a, b) =>
			a.game.playedAt === b.game.playedAt
				? a.game.id - b.game.id
				: a.game.playedAt < b.game.playedAt
					? -1
					: 1
		);
}

export interface TeamGameLogEntry {
	gameId: number;
	playedAt: string;
	format: Format;
	won: boolean;
	opponentIds: number[];
	/** Running net record (cumulative wins − losses) after this game. */
	netAfter: number;
}

/** The team's games, newest first, with running net record per game. */
export function teamGameLog(games: GameInput[], playerIds: number[]): TeamGameLogEntry[] {
	let net = 0;
	const chrono = teamGamesChrono(games, playerIds).map((r) => {
		net += r.won ? 1 : -1;
		return {
			gameId: r.game.id,
			playedAt: r.game.playedAt,
			format: r.game.format,
			won: r.won,
			opponentIds: r.opponentIds,
			netAfter: net
		};
	});
	return chrono.reverse();
}

export interface TeamNetPoint {
	playedAt: string;
	net: number;
}

/** Running net record, oldest → newest, for the trend chart. */
export function teamNetSeries(games: GameInput[], playerIds: number[]): TeamNetPoint[] {
	let net = 0;
	return teamGamesChrono(games, playerIds).map((r) => {
		net += r.won ? 1 : -1;
		return { playedAt: r.game.playedAt, net };
	});
}

/** Signed current streak: >0 win streak, <0 loss streak, 0 = no games. */
export function teamStreak(games: GameInput[], playerIds: number[]): number {
	const chrono = teamGamesChrono(games, playerIds);
	let streak = 0;
	for (let i = chrono.length - 1; i >= 0; i--) {
		const won = chrono[i].won;
		if (i === chrono.length - 1) streak = won ? 1 : -1;
		else if (won && streak > 0) streak++;
		else if (!won && streak < 0) streak--;
		else break;
	}
	return streak;
}
