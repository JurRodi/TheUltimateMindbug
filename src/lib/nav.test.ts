import { describe, it, expect } from 'vitest';
import { navLinks } from './nav';
import type { Flags } from './flags';

const on: Flags = { mvp: true };
const off: Flags = { mvp: false };

const labels = (opts: { isAdmin: boolean; flags: Flags }) => navLinks(opts).map((l) => l.label);

describe('navLinks', () => {
	it('shows admin-only links only to admins', () => {
		expect(labels({ isAdmin: true, flags: on })).toContain('Players');
		expect(labels({ isAdmin: false, flags: on })).not.toContain('Players');
	});

	it('shows a flagged link only when its flag is on', () => {
		expect(labels({ isAdmin: false, flags: on })).toContain('MVP');
		expect(labels({ isAdmin: false, flags: off })).not.toContain('MVP');
	});

	it('always shows unconditional links', () => {
		for (const ctx of [
			{ isAdmin: true, flags: on },
			{ isAdmin: false, flags: off }
		]) {
			expect(labels(ctx)).toEqual(expect.arrayContaining(['Board', 'Log', 'Games']));
		}
	});

	it('keeps a stable order', () => {
		expect(labels({ isAdmin: true, flags: on })).toEqual([
			'Board',
			'MVP',
			'Players',
			'Log',
			'Games'
		]);
	});
});
