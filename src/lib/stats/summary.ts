import type { GameInput, Track } from '$lib/types';
import type { Snapshot } from '$lib/rating/engine';

export interface WeekSummary {
	/** Games played in the current track over the last 7 days. */
	gamesThisWeek: number;
	/** gamesThisWeek minus the count for the 7 days before that (signed). */
	gamesDelta: number;
	/** Player with the largest positive rating gain this week, or null. */
	biggestClimb: { playerId: number; gain: number } | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Summary stats for the board's "This week" card. `history` should be the
 * chosen track's snapshot history (already format-specific); `games` is the
 * full set — counts are filtered by `track` here.
 */
export function weekSummary(
	games: GameInput[],
	history: Snapshot[],
	track: Track,
	now: Date
): WeekSummary {
	const end = now.getTime();
	const weekStart = end - WEEK_MS;
	const prevStart = end - 2 * WEEK_MS;
	const at = (iso: string) => new Date(iso).getTime();
	const inTrack = (g: GameInput) => track === 'total' || g.format === track;

	let gamesThisWeek = 0;
	let gamesPrevWeek = 0;
	for (const g of games) {
		if (!inTrack(g)) continue;
		const t = at(g.playedAt);
		if (t >= weekStart && t <= end) gamesThisWeek++;
		else if (t >= prevStart && t < weekStart) gamesPrevWeek++;
	}

	const gains = new Map<number, number>();
	for (const s of history) {
		const t = at(s.playedAt);
		if (t >= weekStart && t <= end) {
			gains.set(s.playerId, (gains.get(s.playerId) ?? 0) + s.delta);
		}
	}
	let biggestClimb: { playerId: number; gain: number } | null = null;
	for (const [playerId, gain] of gains) {
		if (gain > 0 && (biggestClimb === null || gain > biggestClimb.gain)) {
			biggestClimb = { playerId, gain };
		}
	}

	return { gamesThisWeek, gamesDelta: gamesThisWeek - gamesPrevWeek, biggestClimb };
}
