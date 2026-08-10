# Team Detail Page — Design

**Date:** 2026-08-10
**Status:** Approved (design mockup reviewed)

## Goal

Give each team that has played a detail page — mirroring the player detail
page — reachable by tapping a team on the existing homepage **Teams** tab.
No standalone overview page and no new nav item: the Teams tab already lists
every team, so it becomes the sole entry point.

## What a "team" is

A team is a lineup that has played — a sorted set of player ids that appeared
on one side of a game. Teams are never created; they exist because
`teamStats` (in `src/lib/stats/teams.ts`) observed that exact set of players
on a side. Identity key = `playerIds.sort().join('-')` (e.g. `1-4`).

## Routing

- New route: `src/routes/teams/[id]/+page.svelte` + `+page.server.ts`.
- `[id]` is the team key: sorted player ids joined by `-` (e.g. `/teams/1-4`).
- The server parses the key into ids, sorts them, and looks the team up in the
  **all-time, total-track** `teamStats` result. If no such lineup has ever
  played, throw `error(404, 'Team not found')` — a lineup with no games does
  not exist, exactly as with a player 404.
- Ordering / rank is taken from the same `teamStats` list the Teams tab
  renders, so a team's rank on the detail page matches its position on the tab.

## Page layout (mirrors the player detail page)

### Hero card

- **Avatar cluster** in a gold `.art` frame (same overlapping cream circles as
  the podium/tile clusters), one avatar per member via
  `creatureFor(id, avatar)`.
- **Team name**: member names joined with ` + `.
- **Format badge**: derived from roster size — 2 players → `2v2 TEAM`, 3 →
  `3v3 TEAM`. (Roster size fixes the format, which is why the player page's
  Total/2v2/3v3 track tiles do **not** apply to teams.)
- **Rank**: `#{rank} of {rankTotal} teams`.
- **Stat row**: Win rate, Record (`{wins}–{losses}`), Games, Net record
  (`{wins - losses}`, signed), and a streak chip (`W3 🔥` / `L2` / `–`).
- **Member chips**: each links to `/players/[id]` — teams and players
  cross-link.

### Net-record trend chart

Replaces the Elo rating chart (teams have no Elo). A single line of the team's
**running net record** (cumulative `wins − losses`) after each game it played,
oldest → newest.

- New component `src/lib/components/TeamRecordChart.svelte`, styled like
  `RatingChart` (gridlines, dots, emphasized latest point + value label) but:
  - Integer-friendly y-axis (no rounding to tens).
  - A visible **zero baseline** (a team can go negative).
  - Single teal series.
  - Empty state text when the team has no games (defensive; a 404 team never
    reaches the page).

### Recent games

Same visual language as the player page's Recent-games list:

- W/L result badge, format tag, date.
- The team's own side shown as a green (win) / red (loss) capsule of member
  avatars; the opposing side as an avatar cluster + joined names.
- Right column shows the **running net record after that game** (signed,
  up/down colored), so the list tracks the chart.
- Default 5 rows with a "View all N ▾" toggle (reuse the player-page pattern).

## New pure functions (`src/lib/stats/teams.ts`)

All pure and unit-tested, consistent with the existing `teamStats` style.

```ts
/** One row of a team's game history, resolved to ids. */
export interface TeamGameLogEntry {
  gameId: number;
  playedAt: string;
  format: Format;
  won: boolean;
  /** Player ids on the opposing side. */
  opponentIds: number[];
  /** Running net record (cumulative wins − losses) after this game. */
  netAfter: number;
}

/** A team's games, newest first, with running net record per game. */
export function teamGameLog(games: GameInput[], playerIds: number[]): TeamGameLogEntry[];

/** One point of the net-record trend, oldest → newest. */
export interface TeamNetPoint { playedAt: string; net: number; }
export function teamNetSeries(games: GameInput[], playerIds: number[]): TeamNetPoint[];

/** Signed current streak for a team: >0 win streak, <0 loss streak, 0 = none. */
export function teamStreak(games: GameInput[], playerIds: number[]): number;
```

Notes:

- A team plays a game iff its exact sorted id-set equals `sideA` or `sideB`
  (sorted). Match on the sorted set, not `includes`, so a 2-player team is
  distinct from a 3-player team that contains those two players.
- `teamGameLog` computes `netAfter` by walking chronologically (oldest first)
  and returns the rows newest-first (matching `playerGameLog`).
- `teamNetSeries` is the same walk, oldest-first, returning cumulative net.
- Rank/record aggregate stats reuse the existing `teamStats` (find the row
  whose `playerIds` match); no new record aggregator needed.

## Server load (`src/routes/teams/[id]/+page.server.ts`)

- Parse `[id]` → integer ids; `404` on any non-integer segment.
- Sort ids; compute all-time total-track `teamStats`; find the matching row;
  `404` if absent.
- Compute `rank` (1-based index in that `teamStats` list) and
  `rankTotal = teams.length`.
- Build the hero data: names + avatars (`creatureFor`), format from roster
  length, record/winRate from the matched row, `netRecord = wins - losses`,
  `streak = teamStreak(...)`.
- Build `series = teamNetSeries(...)` for the chart.
- Build `history` from `teamGameLog(...)`, resolving `opponentIds` to
  `{ id, name, emoji }` (same `resolve` helper shape as the player page) and
  the team's own members to `{ id, name, emoji }`.

## Homepage wiring (make the Teams tab clickable)

Currently the Teams tab renders the podium and tiles with `href: null`. Change:

- `src/routes/+page.svelte`: set the team podium items' and tiles' `href` to
  `resolve('/teams/[id]', { id: t.playerIds.join('-') })`.
- `Podium.svelte` and `CreatureTile.svelte` already forward an `href` prop and
  render an `<a>` when present — no component changes needed beyond passing the
  value. (Tiles already show the link affordance via their existing styles.)

## Out of scope

- No standalone `/teams` overview route, no new nav item, no teams icon.
- No Elo for teams (ranking stays WIN%/record via `teamStats`).
- No changes to how games are logged.

## Testing

- Unit tests for `teamGameLog`, `teamNetSeries`, `teamStreak` in
  `src/lib/stats/teams.test.ts`: exact-set matching (2- vs 3-player lineups),
  chronological running-net correctness, newest-first ordering, streak sign,
  and empty-team behavior.
- `pnpm check`, `pnpm lint`, and the full vitest suite stay green.
