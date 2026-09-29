import { describe, it, expect } from 'vitest';
import { FLAGS, FLAG_KEYS, resolveFlags, isFlagKey, type Flags } from './flags';

describe('FLAGS registry', () => {
	it('exposes every flag key', () => {
		expect(FLAG_KEYS).toEqual(Object.keys(FLAGS));
	});
});

describe('isFlagKey', () => {
	it('recognises known keys and rejects others', () => {
		expect(isFlagKey('mvp')).toBe(true);
		expect(isFlagKey('nope')).toBe(false);
		expect(isFlagKey('')).toBe(false);
	});
});

describe('resolveFlags', () => {
	it('falls back to each flag default when no rows are stored', () => {
		const flags = resolveFlags([]);
		for (const key of FLAG_KEYS) {
			expect(flags[key]).toBe(FLAGS[key].default);
		}
	});

	it('applies a stored value over the default', () => {
		// mvp defaults off; a stored "true" turns it on.
		expect(resolveFlags([{ key: 'mvp', value: 'true' }]).mvp).toBe(true);
		expect(resolveFlags([{ key: 'mvp', value: 'false' }]).mvp).toBe(false);
	});

	it('treats any non-"true" stored value as off', () => {
		expect(resolveFlags([{ key: 'mvp', value: '1' }]).mvp).toBe(false);
		expect(resolveFlags([{ key: 'mvp', value: '' }]).mvp).toBe(false);
	});

	it('ignores rows for unknown keys', () => {
		const flags: Flags = resolveFlags([{ key: 'ghost', value: 'true' }]);
		expect('ghost' in flags).toBe(false);
		expect(Object.keys(flags)).toEqual(FLAG_KEYS);
	});
});
