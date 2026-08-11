# Games Pagination + Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Paginate the admin `/games` page (12/page, Prev/Next) and filter it by date (presets All/Today/Week/Month + custom From–To), URL-driven.

**Architecture:** A pure `paginateByDate` helper (date-window + clamp + slice), consumed by the `/games` load which maps URL params to a window. UI gains a filter bar + pager. No DB change.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Vitest.

## Global Constraints

- URL params: `range` (all|today|week|month, rolling windows), `from`/`to` (YYYY-MM-DD, wins over range), `page` (1-based, clamped). Changing a filter resets page to 1.
- No new SQL; `getAllGames` stays the source. Admin-only (`requireAdmin`) unchanged.
- `pnpm check` 0/0, `pnpm lint` clean, suite green.

---

### Task 1: `paginateByDate` pure helper

**Files:**
- Create: `src/lib/stats/paginate.ts`
- Test: `src/lib/stats/paginate.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/stats/paginate.test.ts`:

```ts
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
		expect(paginateByDate(rows, { start: '2026-01-04', end: null, page: 1, size: 20 }).total).toBe(2);
		expect(paginateByDate(rows, { start: null, end: '2026-01-02', page: 1, size: 20 }).total).toBe(2);
	});
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm exec vitest run src/lib/stats/paginate.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/stats/paginate.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/lib/stats/paginate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/paginate.ts src/lib/stats/paginate.test.ts
git commit -m "feat(stats): paginateByDate helper (date window + page slice)"
```

---

### Task 2: Games load — window + pagination

**Files:**
- Modify: `src/routes/games/+page.server.ts`

- [ ] **Step 1: Map params to a window and paginate**

Replace the `load` (keep the `actions.delete` block unchanged). The resolved
`rows` are built as today, then:

```ts
import { paginateByDate } from '$lib/stats/paginate';

const PAGE_SIZE = 12;

export const load: PageServerLoad = async ({ cookies, url }) => {
	requireAdmin(cookies);
	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (id: number) => ({
		name: nameById.get(id) ?? `#${id}`,
		emoji: creatureFor(id, avatarById.get(id))
	});
	const rows = [...games]
		.sort((a, b) => (a.playedAt === b.playedAt ? b.id - a.id : a.playedAt < b.playedAt ? 1 : -1))
		.map((g) => ({
			id: g.id,
			playedAt: g.playedAt,
			format: g.format,
			winnerSide: g.winnerSide,
			sideA: g.sideA.map(resolve),
			sideB: g.sideB.map(resolve)
		}));

	// Date window: a custom from/to wins over a preset range (rolling windows).
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	let range = url.searchParams.get('range') ?? 'all';
	let start: string | null = null;
	let end: string | null = null;
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const dayMs = 86_400_000;
	const now = new Date();
	if (fromParam || toParam) {
		range = 'custom';
		start = fromParam || null;
		end = toParam || null;
	} else if (range === 'today') {
		start = iso(now);
		end = iso(now);
	} else if (range === 'week') start = iso(new Date(now.getTime() - 6 * dayMs));
	else if (range === 'month') start = iso(new Date(now.getTime() - 29 * dayMs));
	else range = 'all';

	const paged = paginateByDate(rows, {
		start,
		end,
		page: Number(url.searchParams.get('page')) || 1,
		size: PAGE_SIZE
	});

	return {
		games: paged.items,
		page: paged.page,
		pageCount: paged.pageCount,
		total: paged.total,
		range,
		from: fromParam ?? '',
		to: toParam ?? ''
	};
};
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm check && pnpm lint`

```bash
git add src/routes/games/+page.server.ts
git commit -m "feat(games): date-window + pagination in the load"
```

---

### Task 3: Games page — filter bar + pager

**Files:**
- Modify: `src/routes/games/+page.svelte`

- [ ] **Step 1: Add filter/pager state + nav helpers**

In `<script>`, after `let { data } = $props();`:

```ts
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const presets = [
		{ v: 'all', l: 'All' },
		{ v: 'today', l: 'Today' },
		{ v: 'week', l: 'Week' },
		{ v: 'month', l: 'Month' }
	];
	let customFrom = $state(data.from);
	let customTo = $state(data.to);

	function nav(qs: string) {
		goto(resolve(qs ? `/games?${qs}` : '/games'), { keepFocus: true, noScroll: true });
	}
	function selectPreset(r: string) {
		nav(r === 'all' ? '' : `range=${r}`);
	}
	function applyCustom() {
		const p = new URLSearchParams();
		if (customFrom) p.set('from', customFrom);
		if (customTo) p.set('to', customTo);
		nav(p.toString());
	}
	function clearFilter() {
		customFrom = '';
		customTo = '';
		nav('');
	}
	function pageHref(n: number) {
		const p = new URLSearchParams();
		if (data.range && data.range !== 'all' && data.range !== 'custom') p.set('range', data.range);
		if (data.from) p.set('from', data.from);
		if (data.to) p.set('to', data.to);
		p.set('page', String(n));
		return resolve(`/games?${p.toString()}`);
	}
	const filtered = $derived(data.range !== 'all');
```

- [ ] **Step 2: Render the filter bar** (below the `<p class="sub">`, above the `{#if}`)

```svelte
<div class="filters">
	<div class="segset">
		{#each presets as o (o.v)}
			<button class:on={data.range === o.v} onclick={() => selectPreset(o.v)}>{o.l}</button>
		{/each}
	</div>
	<div class="range">
		<label>From <input type="date" bind:value={customFrom} onchange={applyCustom} /></label>
		<label>To <input type="date" bind:value={customTo} onchange={applyCustom} /></label>
		{#if data.range === 'custom'}
			<button class="clear" onclick={clearFilter}>Clear</button>
		{/if}
	</div>
</div>
```

- [ ] **Step 3: Adapt the empty state + add the pager**

Change the empty-state text to be filter-aware, and add the pager after the
`</div>` that closes `.log`:

```svelte
{#if data.games.length === 0}
	<p class="card">{filtered ? 'No games match this filter.' : 'No games logged yet.'}</p>
{:else}
	<div class="log"> ... existing rows ... </div>

	<div class="pager">
		{#if data.page > 1}
			<a class="pbtn" href={pageHref(data.page - 1)}>‹ Prev</a>
		{:else}
			<span class="pbtn disabled">‹ Prev</span>
		{/if}
		<span class="pmeta">Page {data.page} of {data.pageCount} · {data.total} games</span>
		{#if data.page < data.pageCount}
			<a class="pbtn" href={pageHref(data.page + 1)}>Next ›</a>
		{:else}
			<span class="pbtn disabled">Next ›</span>
		{/if}
	</div>
{/if}
```

- [ ] **Step 4: Styles** (append to `<style>`)

```css
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 0.9rem;
		margin-bottom: 1rem;
	}
	.range {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.range label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--onmat-muted);
	}
	.range input {
		padding: 0.3rem 0.4rem;
		border-radius: 8px;
		border: 1.5px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-size: 0.8rem;
	}
	.clear {
		border: none;
		background: rgba(0, 0, 0, 0.24);
		color: var(--onmat-muted);
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.72rem;
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		margin-top: 1rem;
	}
	.pbtn {
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.8rem;
		color: var(--onmat);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.24);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
	}
	.pbtn.disabled {
		opacity: 0.4;
	}
	.pmeta {
		font-size: 0.78rem;
		color: var(--onmat-muted);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
```

- [ ] **Step 5: Verify**

Run: `pnpm check && pnpm lint`
Expected: clean. Manual (admin): presets + custom range filter the list and reset to page 1; Prev/Next move pages and disable at ends; deleting a game keeps the active filter.

- [ ] **Step 6: Commit**

```bash
git add src/routes/games/+page.svelte
git commit -m "feat(games): date filter bar and Prev/Next pager"
```

---

## Self-Review

- **Spec coverage:** pure helper + tests (T1), window mapping + pagination in load (T2), preset+custom filter bar and pager UI (T3). Covered.
- **Placeholder scan:** none.
- **Type consistency:** `paginateByDate`/`Paged`/`PageOpts` (T1) consumed by the load (T2); load returns `{ games, page, pageCount, total, range, from, to }` (T2) consumed by the page (T3); `data.range === 'custom'` sentinel set by T2 and read by T3.
