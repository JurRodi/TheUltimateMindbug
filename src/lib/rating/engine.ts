import type { GameInput } from '$lib/types';

export interface RatingConfig {
	startRating: number;
	k: number;
}

export const DEFAULT_CONFIG: RatingConfig = { startRating: 1000, k: 24 };

/** Standard Elo expected score for player/team A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface Snapshot {
	gameId: number;
	playedAt: string;
	playerId: number;
	ratingBefore: number;
	ratingAfter: number;
	delta: number;
}

export interface TrackResult {
	/** playerId -> current rating. Only contains players who have played in this track. */
	current: Record<number, number>;
	/** One snapshot per participant per game, in chronological order. */
	history: Snapshot[];
}

function chronological(games: GameInput[]): GameInput[] {
	return [...games].sort((a, b) =>
		a.playedAt === b.playedAt ? a.id - b.id : a.playedAt < b.playedAt ? -1 : 1
	);
}

export function computeTrack(games: GameInput[], config: RatingConfig = DEFAULT_CONFIG): TrackResult {
	const current: Record<number, number> = {};
	const history: Snapshot[] = [];
	const ratingOf = (id: number) => current[id] ?? config.startRating;

	for (const game of chronological(games)) {
		const teamA = game.sideA.reduce((s, id) => s + ratingOf(id), 0) / game.sideA.length;
		const teamB = game.sideB.reduce((s, id) => s + ratingOf(id), 0) / game.sideB.length;
		const eA = expectedScore(teamA, teamB);
		const actualA = game.winnerSide === 'A' ? 1 : 0;
		const deltaA = config.k * (actualA - eA);
		const deltaB = config.k * (1 - actualA - (1 - eA));

		const apply = (ids: number[], delta: number) => {
			for (const id of ids) {
				const before = ratingOf(id);
				const after = before + delta;
				current[id] = after;
				history.push({
					gameId: game.id,
					playedAt: game.playedAt,
					playerId: id,
					ratingBefore: before,
					ratingAfter: after,
					delta
				});
			}
		};

		apply(game.sideA, deltaA);
		apply(game.sideB, deltaB);
	}

	return { current, history };
}

export interface RatingResult {
	total: TrackResult;
	'2v2': TrackResult;
	'3v3': TrackResult;
}

export function computeRatings(games: GameInput[], config: RatingConfig = DEFAULT_CONFIG): RatingResult {
	return {
		total: computeTrack(games, config),
		'2v2': computeTrack(games.filter((g) => g.format === '2v2'), config),
		'3v3': computeTrack(games.filter((g) => g.format === '3v3'), config)
	};
}
