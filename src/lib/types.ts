export type Side = 'A' | 'B';
export type Format = '1v1' | '2v2' | '3v3';
/** Rating/leaderboard track. 'total' = all games; '1v1'/'2v2'/'3v3' = format-filtered. */
export type Track = 'total' | '1v1' | '2v2' | '3v3';
export type DateRange = 'week' | 'month' | 'all';

/** A single logged game, already shaped for the pure engine/stats layers. */
export interface GameInput {
	id: number;
	/** ISO-8601 timestamp string; sortable ascending for chronological order. */
	playedAt: string;
	format: Format;
	winnerSide: Side;
	/** Player ids on each side. Length 2 for 2v2, 3 for 3v3. */
	sideA: number[];
	sideB: number[];
}

export interface Player {
	id: number;
	name: string;
	/** A single emoji creature avatar, or null to use a deterministic fallback. */
	avatar: string | null;
	isActive: boolean;
	/** ISO-8601 timestamp string. */
	createdAt: string;
}
