import { describe, it, expect } from 'vitest';
import { CREATURES, creatureFor, isValidAvatar } from './creatures';

describe('isValidAvatar', () => {
	it('accepts null (cleared → deterministic fallback)', () => {
		expect(isValidAvatar(null)).toBe(true);
	});
	it('accepts every emoji in the allow-list', () => {
		for (const c of CREATURES) expect(isValidAvatar(c)).toBe(true);
	});
	it('rejects anything not in the allow-list', () => {
		expect(isValidAvatar('🍕')).toBe(false);
		expect(isValidAvatar('not-an-emoji')).toBe(false);
		expect(isValidAvatar('')).toBe(false);
		expect(isValidAvatar('<script>')).toBe(false);
	});
});

describe('creatureFor', () => {
	it('returns the chosen avatar when set', () => {
		expect(creatureFor(1, '🦍')).toBe('🦍');
	});
	it('falls back deterministically when unset', () => {
		expect(creatureFor(0, null)).toBe(CREATURES[0]);
		expect(creatureFor(1, undefined)).toBe(CREATURES[1]);
	});
});
