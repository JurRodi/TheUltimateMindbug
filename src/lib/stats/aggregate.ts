import type { GameInput, Format, Track, DateRange } from '$lib/types';

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
	/** Longest run of consecutive wins ever (≥0). */
	longestWinStreak: number;
	/** Longest run of consecutive losses ever (≥0). */
	longestLossStreak: number;
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

	// Longest win/loss runs across the whole (chronological) history.
	let longestWinStreak = 0;
	let longestLossStreak = 0;
	let runWins = 0;
	let runLosses = 0;
	for (const { won } of relevant) {
		if (won) {
			runWins++;
			runLosses = 0;
			if (runWins > longestWinStreak) longestWinStreak = runWins;
		} else {
			runLosses++;
			runWins = 0;
			if (runLosses > longestLossStreak) longestLossStreak = runLosses;
		}
	}

	return {
		playerId,
		games: total,
		wins,
		losses,
		winRate: total === 0 ? 0 : wins / total,
		streak,
		longestWinStreak,
		longestLossStreak
	};
}

export function allPlayerStats(
	games: GameInput[],
	playerIds: number[],
	opts: StatsOpts
): PlayerStats[] {
	return playerIds.map((id) => playerStats(games, id, opts));
}

/** One row of a player's game history, resolved to ids (names/avatars are joined later). */
export interface GameLogEntry {
	gameId: number;
	playedAt: string;
	format: Format;
	won: boolean;
	/** Total-track rating change for this player in this game (rounded), or 0 if unknown. */
	delta: number;
	/** Player's own side members, excluding the player. */
	teammateIds: number[];
	/** Player ids on the opposing side. */
	opponentIds: number[];
}

/**
 * The player's full game history, newest first, for the "Recent games" list.
 * `deltaByGame` maps gameId -> the player's rating change on the chosen track
 * (typically the 'total' track); missing entries fall back to 0.
 */
export function playerGameLog(
	games: GameInput[],
	playerId: number,
	deltaByGame: Map<number, number>
): GameLogEntry[] {
	return games
		.filter((g) => g.sideA.includes(playerId) || g.sideB.includes(playerId))
		.map((g) => {
			const onA = g.sideA.includes(playerId);
			const mySide = onA ? g.sideA : g.sideB;
			const oppSide = onA ? g.sideB : g.sideA;
			return {
				gameId: g.id,
				playedAt: g.playedAt,
				format: g.format,
				won: g.winnerSide === (onA ? 'A' : 'B'),
				delta: Math.round(deltaByGame.get(g.id) ?? 0),
				teammateIds: mySide.filter((id) => id !== playerId),
				opponentIds: [...oppSide]
			};
		})
		.sort((a, b) =>
			a.playedAt === b.playedAt ? b.gameId - a.gameId : a.playedAt < b.playedAt ? 1 : -1
		);
}
