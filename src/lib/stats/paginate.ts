export interface PageOpts {
	/** Inclusive lower bound YYYY-MM-DD, or null for unbounded. */
	start: string | null;
	/** Inclusive upper bound YYYY-MM-DD, or null for unbounded. */
	end: string | null;
	/** Requested 1-based page (may be out of range). */
	page: number;
	size: number;
}

export interface Paged<T> {
	items: T[];
	/** Clamped to [1, pageCount]. */
	page: number;
	/** Always >= 1. */
	pageCount: number;
	/** Count after date filtering. */
	total: number;
}

/**
 * Filter rows to the inclusive date window, then slice one page. Rows must
 * already be ordered as they should display (e.g. newest-first). Date compare
 * is on `playedAt.slice(0, 10)` — string comparison of ISO `YYYY-MM-DD` is
 * chronological.
 */
export function paginateByDate<T extends { playedAt: string }>(
	rows: T[],
	opts: PageOpts
): Paged<T> {
	const filtered = rows.filter((r) => {
		const d = r.playedAt.slice(0, 10);
		if (opts.start && d < opts.start) return false;
		if (opts.end && d > opts.end) return false;
		return true;
	});
	const total = filtered.length;
	const pageCount = Math.max(1, Math.ceil(total / opts.size));
	const page = Math.min(Math.max(1, opts.page), pageCount);
	const items = filtered.slice((page - 1) * opts.size, page * opts.size);
	return { items, page, pageCount, total };
}
