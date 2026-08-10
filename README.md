# The Ultimate Mindbug 🐛

A leaderboard + rating system for our daily **Mindbug** games — built to settle,
once and for all, who among us is *the Ultimate Mindbug*.

We mostly play **multiplayer** (2v2 or 3v3), not standard 1v1, so the rating math
has to be team-aware. That's the interesting part.

## What it tracks

- **Rating (Elo-style)** — a skill number per player that goes up when you win and
  down when you lose, weighted by how strong the opposing side was.
- **Win rate** — wins / games played.
- **All-time wins** — total career wins.
- **Games played**, current streak, and more as we go.

All stats should be **filterable** — e.g. by game format (2v2 / 3v3), by date range
(this week / this month / all time), and by player.

## Multiplayer Elo — the approach (draft)

Standard Elo is 1v1. For team games (2v2, 3v3) a common, well-proven adaptation is:

1. **Each team's rating = the average rating of its members.**
2. Compute the expected result for each team with the normal Elo formula:
   `E_team = 1 / (1 + 10^((R_opp - R_team) / 400))`.
3. After the game, every player on a team gets the **same team delta**
   (`K * (actual - expected)`) applied to their individual rating.
   - Winners: `actual = 1`. Losers: `actual = 0`.
4. `K` (the volatility factor) is tunable — higher = ratings move faster.

This keeps it simple and fair: beating a stronger team earns more; a strong player
carried by a weak team still only gains the team delta. We can refine later
(e.g. margin of victory, per-player contribution, 3-way free-for-alls).

Open questions to decide together:
- Starting rating (e.g. 1000 or 1500) and `K` value.
- How to handle games with more than two teams.
- Whether teams are fixed or shuffle every game (affects filtering).

## Status

🚧 Early days. This README is the plan. Next: decide the data model (how we log a
game) and pick how we want to use it — a simple local web page, a spreadsheet-backed
tool, or a small app.

## The players

_TBD — add the crew here._

## Running & deploying

### Environment variables

The app needs three environment variables (see `.env.example`):

| Variable          | Purpose                                                       |
| ------------------ | -------------------------------------------------------------- |
| `DATABASE_URL`      | Neon Postgres connection string.                                |
| `MINDBUG_PASSWORD`  | Shared password required to log games and manage players.       |
| `AUTH_SECRET`       | Random secret used to sign the auth cookie (e.g. `openssl rand -hex 32`). |

### Local development

This project uses **pnpm** (pinned via `packageManager`; run `corepack enable`
once if you don't have pnpm) and a local Postgres in Docker for development.

The app picks its database driver automatically from `DATABASE_URL`: a
`localhost` URL uses **node-postgres** (for the Docker db below), while a Neon
host uses the **Neon HTTP** driver (production). So local dev needs no special
configuration beyond pointing `DATABASE_URL` at the local database.

1. `docker compose up -d` — starts a local Postgres on host port `5433`.
2. `pnpm install`
3. Copy `.env.example` to `.env`. Its default `DATABASE_URL` already points at
   the Docker database; set any `MINDBUG_PASSWORD` and `AUTH_SECRET` you like.
4. `pnpm db:seed` — **resets** the local database, applies migrations, and
   fills it with dummy players and games so the board has something to show.
   (Safety: this refuses to run against any non-`localhost` database.)
5. `pnpm dev` — starts the app locally.

Other useful scripts: `pnpm db:generate` (regenerate migrations after a
schema change), `pnpm db:migrate` (apply migrations to a **Neon**
`DATABASE_URL`), and `pnpm test` (full test suite).

### Deploying to Vercel

1. Push this repo to GitHub and connect it to a new Vercel project.
2. Add the **Neon** integration from the Vercel marketplace (or link an
   existing Neon project) — this sets `DATABASE_URL` in the Vercel project's
   environment variables automatically.
3. In the Vercel project settings, add `MINDBUG_PASSWORD` and `AUTH_SECRET`
   as environment variables (same values you'd use locally, or new ones for
   production).
4. Run the migrations against the Neon database **once** before (or right
   after) the first deploy: locally, export the production `DATABASE_URL`
   (e.g. `DATABASE_URL="<neon-url>" pnpm db:migrate`), or run it as a
   one-off command from the Vercel dashboard/CLI.
5. Deploy. The app builds with `@sveltejs/adapter-vercel`, so a normal Vercel
   deploy (push to the connected branch, or `vercel deploy`) is all that's
   needed after that.
