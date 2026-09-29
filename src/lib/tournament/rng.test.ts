import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle } from './rng';

describe('rng', () => {
	it('is deterministic per seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
	});

	it('returns values in [0, 1)', () => {
		const r = mulberry32(7);
		for (let i = 0; i < 1000; i++) {
			const v = r();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('shuffle is a permutation and does not mutate input', () => {
		const input = [1, 2, 3, 4, 5, 6];
		const out = shuffle(input, mulberry32(1));
		expect([...out].sort()).toEqual(input);
		expect(input).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('different seeds give different orders', () => {
		const input = Array.from({ length: 10 }, (_, i) => i);
		expect(shuffle(input, mulberry32(1))).not.toEqual(shuffle(input, mulberry32(2)));
	});
});
