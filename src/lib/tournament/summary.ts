import { standings, type StandingRow } from './standings';
import type { TournamentData } from './types';

export function progress(data: TournamentData): {
	played: number;
	total: number;
	round: number | null;
} {
	const played = data.games.filter((g) => g.winnerSide !== null).length;
	const open = data.games.filter((g) => g.winnerSide === null).map((g) => g.round);
	return { played, total: data.games.length, round: open.length ? Math.min(...open) : null };
}

/** The champion(s) of a finished tournament (shared first place possible). */
export function winners(data: TournamentData): StandingRow[] {
	if (data.tournament.status !== 'finished') return [];
	return standings(data).filter((r) => r.position === 1);
}
