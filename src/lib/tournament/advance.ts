import type { Side } from '$lib/types';
import type { TournamentGame } from './types';

/** Knockout wiring: (round r, slot i) feeds (r + 1, ⌊i / 2⌋) as side A when i
    is even, side B when odd. Null after the final. */
export function nextSlot(
	round: number,
	slot: number,
	totalRounds: number
): { round: number; slot: number; side: Side } | null {
	if (round >= totalRounds) return null;
	return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'A' : 'B' };
}

export function totalRounds(games: { round: number }[]): number {
	return games.reduce((m, g) => Math.max(m, g.round), 0);
}

/** A knockout result may change only while the match it feeds is unplayed. */
export function canChangeKnockoutResult(games: TournamentGame[], game: TournamentGame): boolean {
	const next = nextSlot(game.round, game.slot, totalRounds(games));
	if (!next) return true;
	const target = games.find((g) => g.round === next.round && g.slot === next.slot);
	return !target || target.winnerSide === null;
}

export function roundName(round: number, total: number): string {
	const fromEnd = total - round;
	if (fromEnd === 0) return 'Final';
	if (fromEnd === 1) return 'Semi-finals';
	if (fromEnd === 2) return 'Quarter-finals';
	return `Round ${round}`;
}
