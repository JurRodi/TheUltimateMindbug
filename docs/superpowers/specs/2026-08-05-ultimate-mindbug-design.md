# The Ultimate Mindbug — Design Spec

**Date:** 2026-08-05
**Status:** Approved (design), pending implementation plan

## Purpose

A hosted leaderboard + Elo-style rating system for a friend group's daily
**Mindbug** games. Games are played as **shared-board, two-sided team games**
(2v2 or 3v3): teammates share one life total / board and play cooperatively
against the other team, producing one combined win/loss per side. The rating
math must therefore be team-aware.

The app settles, once and for all, who is *the Ultimate Mindbug*.

## Confirmed decisions

| Question | Decision |
| --- | --- |
| Play format | Shared board, exactly **2 sides** per game |
| Team stability | Teams **shuffle** every game; per-player rating is primary, but **team-combo stats** are wanted for recurring line-ups |
| Number of sides | **Always exactly 2** (no >2-team math needed) |
| Team sizes | **2v2 and 3v3 only**, always symmetric |
| Delivery | **Small hosted app** on Vercel, phone + laptop, live shared board |
| Access | **Viewing open; logging/managing gated by a shared password** |
| Stack | **SvelteKit** (full-stack), **Neon Postgres**, **Drizzle ORM**, deployed on **Vercel** |
| Installable | **PWA** (manifest + service worker) — "Add to Home Screen" |
| Rating params | Start **1000**, **K = 24** (tunable via config) |
| Rating tracks | **Three independent Elo tracks per player: Total, 2v2, 3v3** |
| Roster | **Start empty**; players added in-app |
| Look & feel | **Mindbug-style** — playful, bold, monster-card-game aesthetic |

## Architecture & stack

- **SvelteKit** full-stack: frontend, API routes (`+server.ts` / form actions),
  and DB access all in one app and one Vercel deploy.
- **Neon Postgres** via the Vercel Marketplace integration (serverless, scales
  to zero, generous free tier). Chosen because the data is inherently
  relational (players, games, participants) and the workload is
  filter/aggregate-heavy.
- **Drizzle ORM** for typed schema + migrations — lightweight and
  serverless-friendly.
- **PWA**: web app manifest + a small service worker so it installs like an app
  on phone and laptop.
- **Access control**: viewing is fully open. Logging games and managing players
  require a **shared password**, verified server-side and remembered in a signed
  cookie. No per-user accounts.
- Deployed on **Vercel** (Hobby/free tier).

## Data model (Postgres)

Source of truth is the **ordered list of games**. Ratings and all derived stats
are computed by **replaying games in chronological order** — nothing mutable is
cached in rating columns. Data volume is tiny (even daily games for years is a
few thousand rows), so full recomputation is cheap and eliminates stale-rating
bugs. Retuning K or fixing a mis-logged game simply re-derives everything.

### Tables

- **`players`** — `id`, `name` (unique), `is_active` (bool), `created_at`
- **`games`** — `id`, `played_at` (date/timestamp), `format` (`'2v2' | '3v3'`),
  `winner_side` (`'A' | 'B'`), `created_at`
- **`game_participants`** — `id`, `game_id` (FK), `player_id` (FK),
  `side` (`'A' | 'B'`)

Integrity expectations (enforced in the logging endpoint, and by constraints
where practical): a game has exactly two sides; each side has the same number of
participants matching `format` (2 for 2v2, 3 for 3v3); a player appears at most
once per game.

## Rating engine

A **pure, DB-free module**. Input: an ordered list of games (with participants
and winner) plus config `{ startRating: 1000, K: 24 }`. Output: current rating
per player and full per-game rating history.

**Per-game update** (standard team-averaged Elo with a shared delta):

1. `teamRating = average(members' current ratings)` for each side.
2. `E_A = 1 / (1 + 10^((R_B − R_A) / 400))`; `E_B = 1 − E_A`.
3. `delta_side = K * (actual − E_side)`, where the winning side has
   `actual = 1` and the losing side `actual = 0`.
4. Apply the side's delta to **every member** of that side individually.

**Three independent tracks**, each its own full pass with a different game
filter, each starting every player at 1000:

- **Total** — all games, in order.
- **2v2** — only 2v2 games, in order.
- **3v3** — only 3v3 games, in order.

A player's rating on a track only exists once they've played a game counted by
that track (before that, they sit at the start rating / are "unrated" for that
track).

## Look & feel

The app should evoke the **Mindbug** card game's aesthetic: playful, bold, and
a little irreverent — the "quirky monster card game" vibe rather than a sober
sports dashboard.

Direction (to be refined during implementation):

- **Bold, saturated palette** with strong accent colors; comfortable in a
  dark-leaning theme so vibrant accents pop.
- **Chunky, rounded, tactile UI** — card-like surfaces for players, games, and
  leaderboard rows, echoing physical playing cards.
- **Expressive, characterful typography** for headings (the leaderboard and
  "Ultimate Mindbug" title should feel like a trophy/title screen), with a clean
  readable body face.
- **Playful touches** — creature/bug motifs, a celebratory feel for the #1
  spot, subtle animation on logging a game or a rank change. Kept tasteful and
  performant, never at the cost of legibility on a phone.
- Fully **responsive / mobile-first**, since games are often logged on a phone
  at the table.

**Locked direction (chosen 2026-08-06): "Dark · Creature Tiles."** A dark teal
game-mat background, cream creature-card surfaces, gold for the champion (#1),
coral for actions; geometric display type (Poppins, standing in for Mindbug's
Futura-style wordmark) + Nunito body; subtle gradients; uniform card borders.
The board is a stepped top-3 podium over full-width creature-card tiles; each
player has an emoji creature avatar (player-chosen, with a deterministic
fallback). The pixel reference lives at
`docs/superpowers/design/mindbug-ui-reference.html` and the design tokens are
specified in the implementation plan (Task 12).

For a **personal** friend-group tool, the official Mindbug card art / logo may be
dropped into `static/` and used in place of the emoji placeholders (the app has
no technical barrier); this is the user's call. The mockups themselves use only
original placeholders, not reproductions.

## Features & pages

1. **Leaderboard (home)** — players ranked by rating, showing win rate,
   all-time wins, games played, current streak.
   - **Format control**: Total / 2v2 / 3v3 — switches which rating track is
     shown and scopes the counting stats.
   - **Date range**: this week / this month / all-time — scopes the counting
     stats and which history is shown.
2. **Log a game** *(password-gated)* — pick format, assign players to Side A and
   Side B (2 or 3 each), tap the winning side, date defaults to today. Submit
   triggers recomputation.
3. **Player profile** — rating-over-time chart (all three tracks), stat block,
   recent games, best teammates, toughest opponents.
4. **Team stats** — recurring line-ups (a "team" = the set of players on one
   side in a game) and their combined record / win rate together.
5. **Manage players** *(password-gated)* — add a player by name, mark a player
   inactive.

### Stat definitions

- **Rating**: Elo per track, start 1000, K = 24, team = average of members,
  shared delta. Cumulative per track — a date-range filter scopes the counting
  stats and displayed history, it does **not** reset or recompute a windowed
  rating.
- **Win rate**: wins / games played, counted within the active format + date
  filters.
- **Wins**: count of wins within the active filters. The headline "all-time
  wins" is simply this stat viewed at date range = all-time and format = Total.
- **Games played**: count within the active filters.
- **Streak**: current run of consecutive same results in chronological order,
  within the active filters.

All counting stats (win rate, wins, games played, streak) respect the active
**format** and **date range** filters uniformly; profiles additionally scope by
**player**. Rating is the one value a date filter does not window (see above).

## Testing

- **Rating engine** — TDD, exhaustive unit tests as a pure function: known
  expected-score cases, symmetric and asymmetric-strength matchups, multi-game
  sequences, the three-pass format split, and edge cases (a player's first game,
  a format they have never played).
- **Stats aggregations** (win rate, streaks, team combos) — unit tests against
  hand-built fixtures.
- **API endpoints** (log game, add player, auth gate, input validation) — a few
  integration tests.
- **Vitest** (SvelteKit default).

## Explicitly out of scope (YAGNI, for now)

- Per-user accounts / real auth.
- Games with more than two sides.
- Asymmetric team sizes (e.g. 2v3).
- Margin-of-victory or per-player contribution weighting in the Elo math.
- These can be revisited later without reworking the core (games remain the
  source of truth).
