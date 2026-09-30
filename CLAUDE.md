# The Ultimate Mindbug

A leaderboard + Elo rating app for a friend group's daily **Mindbug** games.
Games are team-based (**2v2** or **3v3**, side A vs side B), so the rating math
is team-aware. Live app deployed on Vercel; see `README.md` for the concept.

## Stack

- **SvelteKit 2** + **Svelte 5** (runes: `$props`/`$state`/`$derived`/`$bindable`).
- **TypeScript**, **Vite**, **Vitest**.
- **Drizzle ORM** over Postgres. Local dev uses a docker-compose Postgres (the
  app auto-selects the `pg` driver for `localhost` URLs); production uses **Neon**
  (`@neondatabase/serverless` HTTP driver).
- **pnpm**. ESLint + Prettier.

## Commands

- `pnpm dev` — dev server (pass `--port 5199` if the default is busy).
- `pnpm check` — `svelte-check` (keep at 0 errors / 0 warnings).
- `pnpm lint` — Prettier check + ESLint. `pnpm format` to autofix.
- `pnpm test` — Vitest (run once); `pnpm test:unit` to watch.
- `pnpm db:seed` — seed the local DB (refuses non-localhost). `db:generate` /
  `db:migrate` for Drizzle schema changes. Prod runs `migrate.js` in `vercel-build`.

## Architecture

- **Pure logic is separated from I/O and tested directly:**
  - `src/lib/rating/engine.ts` — the Elo engine.
  - `src/lib/stats/` — `aggregate.ts` (player stats + game log), `teams.ts`
    (team records + team game log / net-record series / streak), `summary.ts`.
  - `src/lib/tournament/` — pure draw / standings / summary logic.
  - Server DB access in `src/lib/server/db/` (`schema.ts`, `queries.ts`,
    `tournaments.ts`); auth in
    `src/lib/server/auth.ts`.
- **Routes:** `/` board (Players/Teams views with format + date-range filters,
  sticky via a `mb_board` cookie), `/players`, `/players/[id]`, `/teams/[id]`
  (team key = sorted player ids joined by `-`, e.g. `1-4`), `/log`, `/login`, `/tournaments` (+ `/new`, `/[id]`).
- **Shared UI:** `src/lib/components/` — e.g. `GameLogRow.svelte` is used by both
  the player and team detail pages so their history can't drift.

## Rating model (implemented)

Team-aware Elo: `startRating: 1000`, `k: 24` (`src/lib/rating/engine.ts`).
Team rating = average of members' ratings; expected result via the standard
logistic; one shared zero-sum delta `K * (actual − expected)` applied to each
member. Three tracks kept in parallel: `total`, `2v2`, `3v3`. **Teams have no
Elo** — they are ranked by WIN% via `teamStats`.

## Conventions

- **Secrets** (`DATABASE_URL`, `MINDBUG_PASSWORD`, `AUTH_SECRET`) live only in
  `.env` (gitignored) / Vercel env vars. Never commit them, never prefix with
  `PUBLIC_`, never send to the browser. `.env.example` is the tracked template.
- **Auth:** logging games / managing players is gated by a shared password;
  the session cookie `mb_auth` is an HMAC-SHA256 over `AUTH_SECRET` and is
  `secure` (so curl over http needs a manually-minted cookie to test gated pages).
- **Do not reproduce Mindbug's copyrighted creature art.** Avatars are emoji
  (`src/lib/creatures.ts`); only user-supplied art into `static/` is acceptable.
- Commit under the repo-local identity (`JurRodi <rodijurrien@gmail.com>`);
  commit/push only when asked.
- Design specs and implementation plans live in `docs/superpowers/`.
