import type { GameInput, Track, DateRange } from '$lib/types';

export interface StatsOpts {
	track: Track;
	range: DateRange;
	now: Date;
}

export interface PlayerStats {
	playerId: number;
	games: number;
	wins: number;
	losses: number;
	/** [0,1]; 0 when no games. */
	winRate: number;
	/** Signed current streak: >0 win streak, <0 loss streak, 0 = no games. */
	streak: number;
}

function rangeStart(range: DateRange, now: Date): number {
	if (range === 'all') return -Infinity;
	const days = range === 'week' ? 7 : 30;
	return now.getTime() - days * 24 * 60 * 60 * 1000;
}

export function filterGames(games: GameInput[], opts: StatsOpts): GameInput[] {
	const start = rangeStart(opts.range, opts.now);
	return games.filter((g) => {
		if (opts.track !== 'total' && g.format !== opts.track) return false;
		return new Date(g.playedAt).getTime() >= start;
	});
}

function playerGames(games: GameInput[], playerId: number): { game: GameInput; won: boolean }[] {
	return games
		.filter((g) => g.sideA.includes(playerId) || g.sideB.includes(playerId))
		.map((g) => ({
			game: g,
			won: (g.winnerSide === 'A' ? g.sideA : g.sideB).includes(playerId)
		}))
		.sort((a, b) =>
			a.game.playedAt === b.game.playedAt
				? a.game.id - b.game.id
				: a.game.playedAt < b.game.playedAt
					? -1
					: 1
		);
}

export function playerStats(games: GameInput[], playerId: number, opts: StatsOpts): PlayerStats {
	const relevant = playerGames(filterGames(games, opts), playerId);
	const wins = relevant.filter((r) => r.won).length;
	const total = relevant.length;
	const losses = total - wins;

	let streak = 0;
	for (let i = relevant.length - 1; i >= 0; i--) {
		const won = relevant[i].won;
		if (i === relevant.length - 1) streak = won ? 1 : -1;
		else if (won && streak > 0) streak++;
		else if (!won && streak < 0) streak--;
		else break;
	}

	return {
		playerId,
		games: total,
		wins,
		losses,
		winRate: total === 0 ? 0 : wins / total,
		streak
	};
}

export function allPlayerStats(
	games: GameInput[],
	playerIds: number[],
	opts: StatsOpts
): PlayerStats[] {
	return playerIds.map((id) => playerStats(games, id, opts));
}
