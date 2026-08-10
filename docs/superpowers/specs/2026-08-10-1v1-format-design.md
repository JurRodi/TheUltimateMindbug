# 1v1 Format — Design

**Date:** 2026-08-10
**Status:** Approved (design discussion)

## Goal

Add **1v1** as a first-class game format alongside 2v2 and 3v3: loggable,
rated on its own track, filterable, and shown on the player detail page — with
full parity to the existing formats. 1v1 games also count toward the Total
rating. A 1v1 game has no multi-player team, so it never appears in the Teams
view.

## Decisions

- **Full parity**: 1v1 gets its own rating track, its own board filter segment,
  and its own player-detail track tile. It also feeds the Total track.
- **Teams view hides 1v1**: the 1v1 filter segment renders only in the Players
  view. Teams remain strictly ≥2-player lineups.

## Type changes (`src/lib/types.ts`)

- `Format = '1v1' | '2v2' | '3v3'`
- `Track = 'total' | '1v1' | '2v2' | '3v3'`

`GameInput.sideA/sideB` already allow any length; a 1v1 game has length-1 sides.

## Rating engine (`src/lib/rating/engine.ts`)

- `computeTrack` already handles length-1 sides (team rating = the single
  player's rating; the shared delta applies to that one player). **No math
  change.**
- `RatingResult` gains `'1v1': TrackResult`.
- `computeRatings` adds `'1v1': computeTrack(games.filter((g) => g.format === '1v1'), config)`.
  The `total` track continues to use all games (now including 1v1).

## Database migration (enum)

`format` is a Postgres enum currently `('2v2','3v3')`.

- Update `src/lib/server/db/schema.ts`:
  `formatEnum = pgEnum('format', ['1v1', '2v2', '3v3'])`.
- `pnpm db:generate` produces an `ALTER TYPE "format" ADD VALUE '1v1'` migration.
  This is safe: the neon-http migrator applies statements individually, and the
  new value is added (not used) in this migration, so PG's "can't use a new enum
  value in the same transaction" rule doesn't apply. Prod applies it via the
  existing `vercel-build` → `migrate.js` step; local via `pnpm db:migrate`.
- `insertGame` (`queries.ts`) and `shape.ts` pass `format` through unchanged —
  the widened `Format` type is all they need.

## Teams (`src/lib/stats/teams.ts`)

- **Guard against single-player "teams".** In `teamStats`, only `record()` a
  side whose length is ≥ 2. This ensures 1v1 games never create a 1-player team
  even under the Total track (which includes all games). The team detail helpers
  (`teamGameLog`/`teamNetSeries`/`teamStreak`) already match on the exact sorted
  id-set, so a 1-player key is unreachable; the guard is the authoritative fix.

## Board filter (`src/lib/components/BoardFilters.svelte`) + home load

- Format options become `Total | 1v1 | 2v2 | 3v3` **in the Players view**; the
  Teams view shows only `Total | 2v2 | 3v3` (the `1v1` segment is conditionally
  rendered on `view === 'players'`).
- **Home load (`+page.server.ts`) clamp:** after resolving `format`, if
  `view === 'teams' && format === '1v1'`, set `format = 'total'`. This covers a
  stale URL/cookie and the case of switching to Teams while 1v1 was selected.
  The clamped value is what gets persisted to the `mb_board` cookie and passed
  to `BoardFilters` (so switching Teams→Players lands on Total, not a hidden
  1v1 — an acceptable, minor reset).

## Log page (`src/routes/log/+page.svelte`)

- `format` state widened to `'1v1' | '2v2' | '3v3'` (default stays `'2v2'`).
- `size = format === '1v1' ? 1 : format === '2v2' ? 2 : 3`.
- Add a `1v1` button to the format segment (order: 1v1, 2v2, 3v3).
- One player slot per side renders when 1v1 is selected (the existing
  `Array(size).keys()` loop already adapts). The "disable Save until valid"
  logic already keys off `size`, so it works unchanged.
- The server action's `size` check already derives from `format`; it just needs
  to accept `'1v1'` as a valid format (the `format !== '2v2' && format !== '3v3'`
  guard is replaced with a check against the three valid formats).

## Player detail (`src/routes/players/[id]/`)

- `+page.server.ts`: add `'1v1'` to the `TRACKS` array (drives `series` + `stats`).
- `+page.svelte`:
  - Tiles become four: **Total, 1v1, 2v2, 3v3**. Colors: Total = teal,
    1v1 = coral (`--coral`), 2v2 = pink, 3v3 = gold. The tiles grid changes from
    3-up to **2×2 on mobile, 4-up on wider screens**.
  - Chart gains a 4th series for 1v1 (coral), in order Total, 1v1, 2v2, 3v3.
    `RatingChart` already renders an arbitrary number of series.

## Testing

- `engine.test.ts`: a 1v1 game (length-1 sides) yields standard Elo deltas
  (winner +K/2 at equal ratings), and `computeRatings(...)['1v1']` isolates 1v1
  games.
- `teams.test.ts`: a game with length-1 sides produces **no** team row in
  `teamStats` (the ≥2 guard).
- `aggregate.test.ts`: `filterGames` with `track: '1v1'` selects only 1v1 games;
  a 1v1 game counts in a player's Total stats.
- `shape.test.ts` / existing suites: extend fixtures where they assert on format.
- `pnpm check`, `pnpm lint`, full vitest suite stay green.

## Out of scope

- Head-to-head / rivalry views for 1v1 (would be a separate feature).
- Backfilling or converting any existing games.
