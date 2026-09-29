import { teamSize, type TournamentSetup } from './types';
import type { Format } from '$lib/types';

export const MAX_ROUNDS = 30;
const STYLES = ['rotating', 'fixed', 'knockout'];
const FORMATS = ['1v1', '2v2', '3v3'];

/** Most matches that can run at once with this many players. */
export function maxTables(format: Format, playerCount: number): number {
	return Math.max(1, Math.floor(playerCount / (2 * teamSize(format))));
}

export type ValidationResult = { ok: true; setup: TournamentSetup } | { ok: false; error: string };

/** Checks a create-form setup and normalises it (rounds dropped for team
    styles, tables clamped to 1..maxTables). */
export function validateSetup(input: TournamentSetup): ValidationResult {
	const fail = (error: string): ValidationResult => ({ ok: false, error });
	if (!STYLES.includes(input.style)) return fail('Pick a style');
	if (!FORMATS.includes(input.format)) return fail('Pick a format');
	const size = teamSize(input.format);
	const n = input.playerIds.length;
	if (new Set(input.playerIds).size !== n) return fail('A player was picked twice');
	if (n < 2 * size) return fail(`Pick at least ${2 * size} players for ${input.format}`);
	if (input.style !== 'rotating' && n % size !== 0) {
		const extra = n % size;
		return fail(
			`${n} players can't be split into teams of ${size} — add ${size - extra} or remove ${extra}`
		);
	}
	let rounds: number | null = null;
	if (input.style === 'rotating') {
		if (!Number.isInteger(input.rounds) || input.rounds! < 1 || input.rounds! > MAX_ROUNDS)
			return fail(`Rounds must be between 1 and ${MAX_ROUNDS}`);
		rounds = input.rounds;
	}
	const wanted = Number.isFinite(input.tables) ? Math.floor(input.tables) : 1;
	const tables = Math.min(Math.max(1, wanted), maxTables(input.format, n));
	return { ok: true, setup: { ...input, rounds, tables } };
}
