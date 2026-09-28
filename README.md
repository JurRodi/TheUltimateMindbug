# The Ultimate Mindbug 🐛

A leaderboard + rating system for our daily **Mindbug** games — built to settle,
once and for all, who among us is *the Ultimate Mindbug*.

We mostly play **team games** (2v2 or 3v3, side A vs side B), with **1v1** also
supported, so the rating math is team-aware. That's the interesting part. It's a
live web app (SvelteKit) deployed on Vercel, installable as a PWA.

## What it tracks

- **Rating (team-aware Elo)** — a skill number per player that goes up when you win
  and down when you lose, weighted by how strong the opposing side was. Kept in
  parallel for three tracks: **total**, **2v2**, and **3v3**.
- **Win rate**, **all-time wins**, **games played**, and current **streak**.
- **Teams** — every player pairing/trio's shared record, ranked by win% (teams
  have no Elo of their own).
- **MVP voting** — after each game, players can vote for the game's MVP; results
  and reminders go out via web push notifications.

The board is **filterable** by format (2v2 / 3v3), by date range (today / week /
month / all time), and split into **Players** and **Teams** views. Your last
filter choice sticks via a cookie.

## Rating model

Team-aware Elo (`src/lib/rating/engine.ts`), tuned as:

1. **Each team's rating = the average rating of its members** (`startRating: 1000`).
2. Expected result per side via the standard logistic:
   `E = 1 / (1 + 10^((R_opp - R_team) / 400))`.
3. After the game, every player on a side gets the **same zero-sum delta**
   `K * (actual - expected)` applied to their individual rating
   (`K = 24`; winners `actual = 1`, losers `actual = 0`).

Beating a stronger side earns more; a strong player carried by a weak side still
only gains the team delta.

## Pages

- `/` — the board (Players / Teams views, with format + date filters).
- `/players`, `/players/[id]` — roster and per-player detail; admins manage
  players and emails here.
- `/teams/[id]` — per-team detail (team key = sorted player ids, e.g. `1-4`).
- `/log` — log a new game (sign-in required; the logging player is recorded).
- `/games` — full game history, newest first; admins can see who entered each
  game and when, and delete mistaken games.
- `/mvp` — open MVP votes and recent MVP results.
- `/account`, `/login` — your account and Google sign-in.

## Running & deploying

### Environment variables

The app needs the following environment variables (see `.env.example`):

| Variable               | Purpose                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`          | Neon Postgres connection string.                                        |
| `GOOGLE_CLIENT_ID`      | OAuth 2.0 client ID from Google Cloud Console (Google SSO sign-in).      |
| `GOOGLE_CLIENT_SECRET`  | OAuth 2.0 client secret from Google Cloud Console.                       |
| `BETTER_AUTH_SECRET`    | Random secret Better Auth uses to sign sessions (e.g. `openssl rand -hex 32`). |
| `BETTER_AUTH_URL`       | The app's base URL (e.g. `http://localhost:5173` locally).              |

`MINDBUG_PASSWORD`, `ADMIN_PASSWORD`, and `AUTH_SECRET` (the old shared-password
auth) are retired now that sign-in is via Google SSO; they can be removed from
Vercel after cutover.

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
   the Docker database; fill in the Google SSO variables per
   [Authentication (Google SSO)](#authentication-google-sso) below (or leave
   them as placeholders if you're not testing sign-in locally).
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
3. In the Vercel project settings, add `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` as
   environment variables — see
   [Authentication (Google SSO)](#authentication-google-sso) below for how to
   obtain them.
4. Run the migrations against the Neon database **once** before (or right
   after) the first deploy: locally, export the production `DATABASE_URL`
   (e.g. `DATABASE_URL="<neon-url>" pnpm db:migrate`), or run it as a
   one-off command from the Vercel dashboard/CLI. `vercel-build` also runs
   this automatically on every deploy.
5. Deploy. The app builds with `@sveltejs/adapter-vercel`, so a normal Vercel
   deploy (push to the connected branch, or `vercel deploy`) is all that's
   needed after that.

### Authentication (Google SSO)

Sign-in is via Google OAuth (Better Auth). Setting up a new Google OAuth
client and wiring env vars is a one-time, user-performed task — Claude/CI
cannot create OAuth clients or set secrets for you.

1. In [Google Cloud Console](https://console.cloud.google.com/), create an
   **OAuth 2.0 Client ID** (Application type: **Web application**), and
   configure the OAuth consent screen if you haven't already.
2. Add these **Authorized redirect URIs** to the OAuth client:
   - `http://localhost:5173/api/auth/callback/google` (local dev)
   - `https://<prod-domain>/api/auth/callback/google` (production — replace
     `<prod-domain>` with your actual Vercel/custom domain)
3. Set these environment variables — in `.env` locally, and as Vercel project
   environment variables for production:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from the OAuth client
     created above.
   - `BETTER_AUTH_SECRET` — a long random string (e.g. `openssl rand -hex 32`).
   - `BETTER_AUTH_URL` — the app's base URL (`http://localhost:5173` locally,
     `https://<prod-domain>` in production).
4. Bootstrap your first admin **manually in the database** (a one-time step —
   the admin UI is itself admin-gated, so the first admin can't be granted
   through it). Sign in once with Google so you know the exact address, then on
   your existing player row set the email + admin flag directly, e.g.:

   ```sql
   UPDATE players SET email = 'you@gmail.com', is_admin = true WHERE name = 'YourName';
   ```

   After that you're an admin: assign the other players' emails and grant/revoke
   admin from the `/players` admin UI — no further DB access needed.
5. Once Google SSO is working, the old shared-password auth variables
   (`MINDBUG_PASSWORD`, `ADMIN_PASSWORD`, `AUTH_SECRET`) are no longer read by
   the app and can be removed from Vercel's environment variables.
