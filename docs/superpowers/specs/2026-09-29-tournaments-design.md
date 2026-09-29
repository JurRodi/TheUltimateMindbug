# Tournaments — Design

**Date:** 2026-09-29
**Status:** Draft (awaiting spec review)

## Context

Games today are one-off: logged via `/log`, rated by the team-aware Elo engine
(`src/lib/rating/engine.ts`), shown on the board and player/team pages. The
group wants to run **tournaments** on game nights: pick players, a style and a
format, get a random draw, play through it and crown a winner.

Mockups from brainstorming live in
[`../mockups/tournaments/`](../mockups/tournaments/) (`list-and-create.html`,
`detail.html`, `player.html`). Where the mockups and this spec disagree, **this
spec wins** (e.g. the list mockup still shows an "Open" button and no
"matches at once" field).

## Goal

- Create a tournament: players, **style**, **format**, **ranked** toggle,
  **rounds** (rotating only) and **matches at once** (tables).
- Random matchmaking; the **full schedule is visible upfront**.
- `/tournaments`: create button + overview of all tournaments (date, winner).
- `/tournaments/[id]`: standings/bracket, schedule, result entry.
- Player detail page: tournaments played, finishing position, tournament stats.
- Board: 🏆 titles badge per player.
- `/log`: a **Ranked** toggle for casual one-off games too.

## Rules (decided during brainstorming)

### Styles (v1)

| Style | Ranking unit | Winner |
| --- | --- | --- |
| **Rotating teams** 🔀 | individual | most points (1 per game won) |
| **Fixed teams round-robin** 🛡️ | team | best record |
| **Knockout** 🥊 | team | wins the final |

- **One format per tournament** (`1v1`, `2v2`, `3v3`). In `1v1` a "team" is one
  player.
- **Matches at once** (`tables`, ≥ 1): multiple decks exist, so a round may hold
  several simultaneous matches when enough players are present. Capped at
  `⌊players / (2 × teamSize)⌋`.
- **Rounds** (rotating only): chosen at creation.

### Ranked

- `ranked = true`: tournament games count exactly like normal games (Elo,
  board, player/team stats).
- `ranked = false`: games are stored and shown (with an **Unranked** badge) but
  are excluded from Elo, the board and W/L stats.
- Tournament results (titles, podiums, positions) count **regardless** of
  ranked; unranked tournaments are shown with an Unranked chip.
- `/log` gets the same toggle (default on) for one-off games.

### Player counts

- **Rotating:** ≥ `2 × teamSize` players. Players who don't fit a round sit out;
  sit-outs rotate fairly (see matchmaking).
- **Fixed / knockout:** player count must be divisible by `teamSize` and yield
  ≥ 2 teams; otherwise creation is blocked with a hint. Knockout fills the
  bracket to the next power of 2 with **byes**; fixed round-robin with an odd
  team count gives one team a rest per round.

### Lifecycle

`live` → `finished` | `abandoned`.

- **Any match can be entered in any order** while `live`.
- **No auto-finish.** Once every game has a result, a **Finish tournament**
  button appears. Finishing locks the tournament (read-only).
- **Editing a result:** tapping a played match highlights it and shows
  Team 1 won / Team 2 won (current winner marked) plus a small ✏️ Clear
  result. Changing or clearing a result is **creator/admin only**.
- **Knockout edit rule:** a knockout result can only be changed/cleared if the
  next-round match it feeds is still unplayed. Changing it swaps the new winner
  into that next match.
- **Abandon** (live only): status `abandoned`, unplayed games deleted, played
  games kept (they were real games).
- No draw editing after start.
- **No MVP voting** for tournament games.

### Permissions

| Action | Who |
| --- | --- |
| Create tournament | any signed-in player |
| Enter a result for an unplayed match | any signed-in player |
| Change / clear an existing result | creator or admin |
| Finish, abandon | creator or admin |
| Delete tournament (+ its games) | admin |

All actions are rejected server-side on a `finished` / `abandoned` tournament.

## Data model

One source of truth for results: tournament matches **are** `games` rows.

### `games` — extended

| Column | Type | Notes |
| --- | --- | --- |
| `tournament_id` | int, nullable, FK → `tournaments.id` on delete cascade | |
| `ranked` | bool, not null, default `true` | copied from tournament for tournament games |
| `round` | int, nullable | 1-based |
| `slot` | int, nullable | table number (rotating/fixed) or bracket position (knockout), 0-based |
| `winner_side` | **now nullable** | null = scheduled, not yet played |
| `played_at` | **now nullable** | set when the result is entered |

CHECK constraints:

- `winner_side IS NOT NULL OR tournament_id IS NOT NULL`
- `played_at IS NOT NULL OR tournament_id IS NOT NULL`
- `(winner_side IS NULL) = (played_at IS NULL)`
- `(round IS NULL AND slot IS NULL) OR tournament_id IS NOT NULL`

Existing rows are unaffected (all have winner, played_at, no tournament).

### `tournaments` — new

| Column | Type |
| --- | --- |
| `id` | serial PK |
| `name` | text, not null (prefilled "Tournament 29 Sep", editable) |
| `style` | enum `rotating \| fixed \| knockout` |
| `format` | existing `format` enum |
| `ranked` | bool, not null |
| `rounds` | int, nullable (rotating only) |
| `tables` | int, not null, default 1 |
| `seed` | int, not null (draw seed, for reproducibility) |
| `status` | enum `live \| finished \| abandoned`, default `live` |
| `created_by` | int FK → players, on delete set null |
| `created_at` | timestamptz, default now |
| `finished_at` | timestamptz, nullable |

### `tournament_players` — new (roster)

| Column | Type |
| --- | --- |
| `tournament_id` | FK → tournaments, cascade |
| `player_id` | FK → players |
| `team_no` | int, nullable (null for rotating) |

Unique `(tournament_id, player_id)`. Needed because knockout games beyond the
first round have no participants yet, fixed teams need a stable identity, and
rotating standings need the full roster (including players who sat out).

### Knockout wiring

No extra columns. The game at `(round r, slot i)` feeds `(r + 1, ⌊i / 2⌋)`,
as side **A** if `i` is even, side **B** if odd. All bracket games are created
upfront (later ones without participants). Bye teams are inserted directly as
participants of their round-2 game; round 1 has no game for a bye. Entering a
result inserts the winning team's players as participants of the next game;
changing it replaces them.

### Filtering in existing code

All game data funnels through the loader in `src/lib/server/db/queries.ts`
(~line 178). There:

- scheduled games (`winner_side IS NULL`) are excluded everywhere outside the
  tournament pages;
- unranked games are excluded from rating computation, the board and W/L stats,
  but included in game histories (`/games`, player/team recent games) with an
  Unranked badge and `±0`.

MVP round creation skips any game with `tournament_id` set.

## Pure logic — `src/lib/tournament/`

All functions take a seeded RNG (`seed` → deterministic output) so the client
preview and the server create produce the same draw and tests are stable.
**Reshuffle** = new seed.

### `validate.ts`

Checks player count vs style/format, `rounds ≥ 1` for rotating, and caps
`tables`. Returns field errors for the form.

### `schedule.ts` — `generateSchedule(input, rng) → { teams?, games[] }`

Each game: `{ round, slot, sideA: playerId[] | null, sideB: playerId[] | null }`.

- **Rotating:** for each round, choose the players who play — fewest games so
  far first, random tiebreak — so sit-outs are fair. Split them into teams and
  pair teams into up to `tables` matches by trying many random arrangements and
  keeping the lowest score (repeat teammates weighted heavily, repeat opponents
  lightly).
- **Fixed round-robin:** shuffle players into teams once; circle method so every
  team meets every other exactly once; odd team count → one team rests per
  round. A circle round with more matches than `tables` is split into several
  rounds.
- **Knockout:** shuffle teams; bracket size = next power of 2; byes assigned to
  random teams. Only round 1 (and bye slots in round 2) have sides.

### `standings.ts` — `standings(tournament, roster, games) → Row[]`

Rows carry `position` (shared positions allowed), played, W, L, points/win%.

- **Rotating:** points → win% → head-to-head (games where the tied players were
  on opposite sides) → shared position.
- **Fixed:** wins → head-to-head → shared.
- **Knockout:** champion 1st, runner-up 2nd, then shared by elimination round
  (3–4, 5–8, …).

Team positions apply to every member. Used by the detail page, the list
(winner), the player page and the board badge.

### `advance.ts`

Knockout helpers: next game for `(round, slot)`, whether a result is editable
(next game unplayed), and the participant changes for set/change/clear.

## Server layer

- `src/lib/server/db/tournaments.ts`: list, get (with roster + games +
  participants), create (tournament + roster + all games + known participants in
  one transaction, schedule regenerated server-side from the submitted seed —
  the client schedule is never trusted), setResult, clearResult, finish,
  abandon, delete. Permission and status checks live here.
- Stats for player pages/board: a query returning, per player, their
  tournaments with computed positions (via `standings.ts`).

## Routes & UI

- **Nav:** new "Tournaments" entry.
- **`/tournaments`:** header with "+ New tournament" (signed-in only). One card
  list: live tournaments first (LIVE chip + progress "7/12 games"), then
  finished (date, 🥇 winner — player(s) or team), abandoned greyed. Each row
  shows style · format · player count and a Ranked/Unranked chip; the whole row
  links to the detail page.
- **`/tournaments/new`:** name, style cards, format segmented control, player
  chips, rounds (rotating), matches at once, ranked toggle, live **draw
  preview** with 🎲 Reshuffle, Start.
- **`/tournaments/[id]`:** header (name, chips, started date + creator,
  progress bar), then:
  - finished: champion banner;
  - standings table (rotating/fixed) or bracket (knockout; undecided slots show
    "Winner QF1");
  - schedule by round → table; match cards labelled Team 1 / Team 2; tapping an
    unplayed match highlights it (teal border) with Team 1 won / Team 2 won;
    played matches show the winner highlighted and, for creator/admin, are
    tappable to change/clear;
  - Finish (when complete) and Abandon (live) for creator/admin.
- **Components:** `TournamentMatchCard.svelte`, `TournamentStandings.svelte`,
  `KnockoutBracket.svelte`. `GameLogRow.svelte` gains an optional tournament
  link (“🏆 Friday Shuffle · R3”) and Unranked badge.
- **`/players/[id]`:** new "🏆 Tournaments" section below the chart: tiles
  **Titles**, **Podiums**, **Played**, **Avg finish** (simple average of
  positions), **tournament record** (W–L, win%), **best style**; then a list of
  tournaments with a position medal ("2 of 8", "🥇 of 7 teams", "3–4th"), date ·
  style · format · teammates (fixed/knockout), record, and on the right either
  points (rotating) or net Elo change (fixed/knockout, ranked only; omitted when
  unranked). Tournament record counts all tournament games, ranked or not. Live tournaments show the current position with a LIVE
  chip; only finished tournaments count toward the tiles.
- **Board (`/`):** 🏆 titles count badge next to players with ≥ 1 title.
- **`/log`:** Ranked toggle (default on).
- **`/games`:** Unranked badge + tournament link.

## Testing (Vitest)

- `schedule.ts`: seed determinism; rotating sit-out fairness (games-played
  spread ≤ 1) and low teammate repeats; `tables` respected; round-robin
  completeness (every pair once, no team twice per round); knockout bracket size,
  byes, round-1 sides only.
- `validate.ts`: divisibility, minimums, tables cap.
- `standings.ts`: each style incl. tiebreaks and shared positions.
- `advance.ts`: next-slot mapping, edit rule, set/change/clear participant
  updates.
- Stats: scheduled and unranked games excluded from Elo/board/tiles, included in
  histories; titles/podiums/avg finish.

## Out of scope / follow-ups

Swiss style, mixed formats per tournament, editing the draw after start, MVP
voting for tournaments, tournament Elo, notifications.
