# Games Page — Pagination + Date Filter — Design

**Date:** 2026-08-11
**Status:** Approved (design discussion)

## Goal

Make the admin `/games` page scale and stay navigable as the game log grows:
paginate it (12 per page, Prev/Next) and let an admin filter by date — quick
presets (All / Today / Week / Month) plus an optional custom From–To range.

## Approach

URL-query-param driven, matching the board's existing filter idiom
(bookmarkable, refresh-safe). The server reads the params, filters + slices the
already-loaded game list, and returns one page. No new SQL and no DB change —
`getAllGames` is still the source (the app already loads the full log every
request for the rating engine). If the log ever gets genuinely huge, the
in-memory slice can be swapped for a `LIMIT/OFFSET` query without touching the
UI.

## URL params

- `range` = `all` (default) | `today` | `week` | `month` — a **rolling** window
  (today / last 7 / 30 days), consistent with the board's `DateRange` semantics.
- `from` / `to` = `YYYY-MM-DD` — a custom window. **If either is present it wins
  over `range`** (the active state becomes "custom").
- `page` = 1-based page number; clamped to `[1, pageCount]`.

Changing any filter resets to page 1; paging preserves the active filter.

## Pure helper (testable) — `src/lib/stats/paginate.ts`

```ts
export interface PageOpts {
  start: string | null; // inclusive YYYY-MM-DD, or null = no lower bound
  end: string | null;   // inclusive YYYY-MM-DD, or null = no upper bound
  page: number;         // requested 1-based page (may be out of range)
  size: number;
}
export interface Paged<T> {
  items: T[];
  page: number;      // clamped
  pageCount: number; // >= 1
  total: number;     // count after date filtering
}
/** Filter rows to the inclusive date window then slice one page.
    Rows must already be ordered as they should display (newest-first). */
export function paginateByDate<T extends { playedAt: string }>(
  rows: T[],
  opts: PageOpts
): Paged<T>;
```

Date comparison is on `playedAt.slice(0, 10)` (string compare on ISO
`YYYY-MM-DD` is chronological). Page is clamped: `min(max(1, page), pageCount)`,
`pageCount = max(1, ceil(total / size))`.

## Server load (`src/routes/games/+page.server.ts`)

- `requireAdmin`, `getAllGames` + `getPlayers`, resolve to display rows, sort
  **newest-first** (as today).
- Resolve the window: if `from`/`to` present → custom (`start=from||null`,
  `end=to||null`, active preset = none); else map `range` to a rolling window
  via `now` (`week`→now−6d, `month`→now−29d, else no bounds).
- `paginateByDate(rows, { start, end, page: Number(page)||1, size: 12 })`.
- Return `{ games: items, page, pageCount, total, range, from, to }`.
- `actions.delete` unchanged (`requireAdmin` + `deleteGame`).

## Page UI (`src/routes/games/+page.svelte`)

- **Filter bar**: a `.segset` of presets (All / Today / Week / Month) — the
  active one highlighted (`range`, when not custom) — plus two `<input
  type="date">` (From / To) and a **Clear** that returns to `/games`. Changing a
  preset navigates to `?range=…`; applying a custom range navigates to
  `?from=…&to=…`; both drop `page`.
- **List**: the current page's games (existing row markup, delete flow intact).
  Empty state adapts: "No games match this filter." when a filter is active.
- **Pager**: `‹ Prev · Page {page} of {pageCount} · {total} games · Next ›`.
  Prev disabled on page 1, Next on the last page; both are query-param links via
  `goto(resolve('/games?…'))`, `noScroll`.
- After a delete, the load re-runs and the page re-renders; if the last row on
  the last page is removed, the server clamp keeps `page` valid.

## Testing

- `paginate.test.ts`: date-window filtering (inclusive bounds, null bounds =
  unbounded), `pageCount`/clamping (page 0 and page > max both clamp), correct
  slice per page, `total` reflects the filtered count.
- `pnpm check` 0/0, `pnpm lint` clean, suite green.
- Runtime: presets + custom range filter the list; paging works; deleting on a
  filtered page keeps the filter.

## Out of scope

- Server-side `LIMIT/OFFSET` SQL (not needed at this scale).
- Filtering by player/format on this page (date only, per request).
