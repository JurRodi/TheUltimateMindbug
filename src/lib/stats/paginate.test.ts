import { describe, it, expect } from 'vitest';
import { paginateByDate } from './paginate';

const rows = [
	{ playedAt: '2026-01-05T10:00:00Z', id: 5 },
	{ playedAt: '2026-01-04T10:00:00Z', id: 4 },
	{ playedAt: '2026-01-03T10:00:00Z', id: 3 },
	{ playedAt: '2026-01-02T10:00:00Z', id: 2 },
	{ playedAt: '2026-01-01T10:00:00Z', id: 1 }
];

describe('paginateByDate', () => {
	it('slices a page and reports totals with no date bounds', () => {
		const r = paginateByDate(rows, { start: null, end: null, page: 1, size: 2 });
		expect(r.items.map((x) => x.id)).toEqual([5, 4]);
		expect(r).toMatchObject({ page: 1, pageCount: 3, total: 5 });
	});

	it('clamps an out-of-range page (0 -> 1, huge -> last)', () => {
		expect(paginateByDate(rows, { start: null, end: null, page: 0, size: 2 }).page).toBe(1);
		const last = paginateByDate(rows, { start: null, end: null, page: 99, size: 2 });
		expect(last.page).toBe(3);
		expect(last.items.map((x) => x.id)).toEqual([1]);
	});

	it('filters to an inclusive date window before paginating', () => {
		const r = paginateByDate(rows, { start: '2026-01-02', end: '2026-01-04', page: 1, size: 20 });
		expect(r.items.map((x) => x.id)).toEqual([4, 3, 2]);
		expect(r.total).toBe(3);
	});

	it('treats a null bound as unbounded on that side', () => {
		expect(paginateByDate(rows, { start: '2026-01-04', end: null, page: 1, size: 20 }).total).toBe(
			2
		);
		expect(paginateByDate(rows, { start: null, end: '2026-01-02', page: 1, size: 20 }).total).toBe(
			2
		);
	});
});
