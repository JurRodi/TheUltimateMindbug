export interface RatingConfig {
	startRating: number;
	k: number;
}

export const DEFAULT_CONFIG: RatingConfig = { startRating: 1000, k: 24 };

/** Standard Elo expected score for player/team A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
