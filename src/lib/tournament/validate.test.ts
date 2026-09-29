import { describe, it, expect } from 'vitest';
import { validateSetup, maxTables } from './validate';
import type { TournamentSetup } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const base = (over: Partial<TournamentSetup>): TournamentSetup => ({
	style: 'rotating',
	format: '2v2',
	playerIds: ids(6),
	rounds: 5,
	tables: 1,
	...over
});

describe('validateSetup', () => {
	it('accepts a rotating setup with sit-outs', () => {
		const r = validateSetup(base({ playerIds: ids(5) }));
		expect(r.ok).toBe(true);
	});

	it('needs at least two teams worth of players', () => {
		const r = validateSetup(base({ playerIds: ids(3) }));
		expect(r).toEqual({ ok: false, error: 'Pick at least 4 players for 2v2' });
	});

	it('blocks fixed teams when players do not divide into teams', () => {
		const r = validateSetup(base({ style: 'fixed', playerIds: ids(7), rounds: null }));
		expect(r).toEqual({
			ok: false,
			error: "7 players can't be split into teams of 2 — add 1 or remove 1"
		});
	});

	it('blocks knockout 3v3 with 8 players with the right hint', () => {
		const r = validateSetup(
			base({ style: 'knockout', format: '3v3', playerIds: ids(8), rounds: null })
		);
		expect(r).toEqual({
			ok: false,
			error: "8 players can't be split into teams of 3 — add 1 or remove 2"
		});
	});

	it('rejects duplicate players', () => {
		expect(validateSetup(base({ playerIds: [1, 1, 2, 3] })).ok).toBe(false);
	});

	it('requires rounds 1..30 for rotating', () => {
		expect(validateSetup(base({ rounds: 0 })).ok).toBe(false);
		expect(validateSetup(base({ rounds: 31 })).ok).toBe(false);
		expect(validateSetup(base({ rounds: null })).ok).toBe(false);
	});

	it('drops rounds for non-rotating styles', () => {
		const r = validateSetup(base({ style: 'fixed', rounds: 9 }));
		expect(r.ok && r.setup.rounds).toBe(null);
	});

	it('caps tables at what the players allow', () => {
		expect(maxTables('2v2', 8)).toBe(2);
		expect(maxTables('2v2', 7)).toBe(1);
		const r = validateSetup(base({ playerIds: ids(8), tables: 5 }));
		expect(r.ok && r.setup.tables).toBe(2);
		const r2 = validateSetup(base({ tables: 0 }));
		expect(r2.ok && r2.setup.tables).toBe(1);
	});

	it('rejects an unknown style or format', () => {
		expect(validateSetup(base({ style: 'swiss' as never })).ok).toBe(false);
		expect(validateSetup(base({ format: '4v4' as never })).ok).toBe(false);
	});
});
