import { describe, it, expect } from 'vitest';
import { expectedScore, DEFAULT_CONFIG } from './engine';

describe('expectedScore', () => {
	it('is 0.5 for equal ratings', () => {
		expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
	});

	it('is ~0.76 when 200 points higher', () => {
		expect(expectedScore(1200, 1000)).toBeCloseTo(0.7597, 3);
	});

	it('is symmetric: E_A + E_B = 1', () => {
		const a = expectedScore(1337, 1010);
		const b = expectedScore(1010, 1337);
		expect(a + b).toBeCloseTo(1, 10);
	});
});

describe('DEFAULT_CONFIG', () => {
	it('starts at 1000 with K=24', () => {
		expect(DEFAULT_CONFIG).toEqual({ startRating: 1000, k: 24 });
	});
});
