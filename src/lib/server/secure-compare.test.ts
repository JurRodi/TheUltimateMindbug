import { describe, it, expect } from 'vitest';
import { safeEqual } from './secure-compare';

describe('safeEqual', () => {
	it('is true for identical strings', () => {
		expect(safeEqual('Bearer secret-token', 'Bearer secret-token')).toBe(true);
		expect(safeEqual('', '')).toBe(true);
	});
	it('is false for different strings of equal length', () => {
		expect(safeEqual('Bearer aaaaaa', 'Bearer bbbbbb')).toBe(false);
	});
	it('is false for length mismatch without throwing', () => {
		expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
	});
	it('handles multi-byte characters', () => {
		expect(safeEqual('tokén', 'tokén')).toBe(true);
		expect(safeEqual('tokén', 'token')).toBe(false);
	});
});
