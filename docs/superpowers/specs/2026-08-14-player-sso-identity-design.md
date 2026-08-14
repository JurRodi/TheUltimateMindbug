# Player Identity & Google SSO — Design (Phase 1)

**Date:** 2026-08-14
**Status:** Approved (design discussion)

## Context

This is **Phase 1 of 2**. The end goal is an **MVP vote** ("most valuable
play") that each participant of a game casts asynchronously from their own
phone — which requires the app to know *which individual* is acting. Today the
app has no per-person identity at all: a single shared `MINDBUG_PASSWORD` (plus
`ADMIN_PASSWORD`) answers only "is this visitor allowed to write?".

Phase 1 builds the identity foundation and ships as a usable increment on its
own: people log in **as themselves** with Google, log their own games, and the
admin manages players — **no voting yet**. Phase 2 (MVP voting) is a separate
spec built on top of this.

## Goal

Replace the shared-password write-gate with **per-player login via Google
(Better Auth)**. Players are still created by an admin; a player becomes able to
log in once the admin records their Google email. Admin rights are a database
flag on the player, managed from the admin UI. The public leaderboard stays
public.

## Auth stack

Adopt [**Better Auth**](https://better-auth.com/) with:

- the **Google social provider** ("Sign in with Google" — not Better Auth's
  enterprise `sso` OIDC/SAML plugin), and
- the **Drizzle adapter** over the existing Postgres, working with both the
  local `pg` driver and the Neon HTTP driver (same driver selection the app
  already does for `localhost` vs prod).

Better Auth owns its own tables (`user`, `session`, `account`, `verification`),
created via a Drizzle migration. A SvelteKit `handle` hook mounts Better Auth's
request handler and resolves the current identity into `event.locals` (see
"Server wiring").

The old auth module is **removed**: `src/lib/server/auth.ts` (HMAC cookie,
`authenticate`, `cookieValue`, role cookie), the `/login` password form, and the
`mb_auth` cookie all go away, replaced by Better Auth's session cookie.

## Data model (`src/lib/server/db/schema.ts`)

`players` gains two **additive, nullable/defaulted** columns — safe to migrate
onto the live Neon data with no backfill required at migrate time:

```ts
email: text('email').unique(),                 // admin-set; join key + allowlist
isAdmin: boolean('is_admin').notNull().default(false),
```

- **`email`** is the join key to the Google identity **and** the allowlist:
  only pre-created emails may enter. It is nullable — a player with no email is
  a leaderboard entity that simply cannot log in yet.
- **Identity join is by email:** the signed-in Google `user.email` is matched
  against `players.email` to resolve the acting player. Email is unique on both
  sides, so the match is unambiguous.
- No matching player row → the visitor is authenticated by Google but **not
  authorized**: they see an "ask an admin to add you" state, not the app.
- Better Auth's `user`/`session`/`account`/`verification` tables are managed by
  its adapter; we do not hand-edit them.

**Identity anchor caveat:** because the join is by email, editing a linked
player's `email` to anything other than their Google address revokes their
access. This is intentional — editing email *is* reassigning who that player is.

## Server wiring (`src/hooks.server.ts`, `src/lib/server/auth.ts` rewritten)

- A new `auth.ts` exports a configured Better Auth instance (Google provider +
  Drizzle adapter + secret/base URL from env).
- `handle` in `hooks.server.ts`:
  1. delegates Better Auth's own routes (`/api/auth/*`) to its handler;
  2. for every request, reads the session, resolves the player by email, and
     sets `event.locals.auth = { session, player, isAdmin }` (all nullable when
     signed out or unlinked).
- New authorization helpers replace the password-era ones, now reading
  `locals` instead of raw cookies:

```ts
requireAuth(locals): void;    // 303 → /login unless locals.auth.player exists
requireAdmin(locals): void;   // 303 → /login unless locals.auth.isAdmin
```

`app.d.ts` `App.Locals` is extended with the `auth` shape.

## Auth & identity flow

- `/login` becomes a single **"Sign in with Google"** button (no password
  field). It kicks off Better Auth's Google flow; `redirectTo` preserves the
  page the user was headed to (same UX as the current post-login redirect).
- On the Google callback, Better Auth verifies the account and yields the
  **verified email**; the hook resolves it to a player and populates `locals`.
- **Logout** clears the Better Auth session (a `POST` action / menu item).

## Authorization migration (behavior-preserving)

| Gate | Before | After |
| --- | --- | --- |
| View board `/`, player/team detail | public | public (unchanged) |
| Log a game (`/log`) | `requireAuth` (shared pw) | `requireAuth` = session resolves to a player |
| Add / toggle player (`/players`) | `requireAdmin` (admin pw) | `requireAdmin` = player `is_admin` |
| Players page `canEdit` | `isAdmin(cookies)` | `locals.auth.isAdmin` |
| Manage games (`/games`) | `requireAdmin` | `requireAdmin` = player `is_admin` |
| Admin nav link (`+layout.server.ts`) | `isAdmin(cookies)` | `locals.auth.isAdmin` |

The mapping is one-to-one: every place that read the password cookie now reads
the resolved-player/`is_admin` from `locals`. No route changes public/private
status.

## Admin UI changes (`/players`)

The player create/edit form (admin-only) gains:

- an **email** field (set/clear per player — the Google address that lets them
  log in), and
- an **admin toggle** (`is_admin`) to promote/demote other players.

`getPlayers` / the players load return the new fields for the admin view; the
public read-only view does **not** expose emails. Corresponding
create/update queries in `queries.ts` are extended to write `email` /
`is_admin`. A player with a `null` email is shown as "no login yet".

## Bootstrap & configuration

**First admin (bootstrap):** an `INITIAL_ADMIN_EMAIL` env var, read **once by
the deploy migration** (`migrate.js`), sets `is_admin = true` on the player
whose `email` matches. Flow: pre-create yourself as a player with your Google
email → deploy → you are admin → promote others from the UI. The var can remain
set as a lock-out safety valve (idempotent: it only ensures that one player is
admin; it never demotes anyone).

**Environment (server-only, never `PUBLIC_`):**

| Var | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `BETTER_AUTH_SECRET` | Better Auth signing secret |
| `BETTER_AUTH_URL` | App base URL (e.g. `http://localhost:5173`, prod URL) |
| `INITIAL_ADMIN_EMAIL` | one-time admin bootstrap for the deploy migration |

`MINDBUG_PASSWORD` / `ADMIN_PASSWORD` / `AUTH_SECRET` are **retired** from the
app (remove from `.env.example`; may be deleted from Vercel after cutover).
`.env.example` gains documented placeholders for the new keys.

**Google Cloud setup (user task — Claude cannot create the project or set
secrets):** the spec/plan will document creating an OAuth 2.0 client, the
consent screen, and the exact **authorized redirect URIs** for local
(`http://localhost:5173/api/auth/callback/google`) and prod
(`https://<prod-domain>/api/auth/callback/google`), then placing the four
non-bootstrap vars in `.env` and Vercel.

## Live-data migration

- The schema migration only **adds** `email` (nullable unique) and `is_admin`
  (default false) — existing `players`/`games` rows are untouched and the board
  keeps rendering.
- After deploy, the admin **backfills emails** on existing players from the UI;
  each player can log in as soon as their email is set.
- Prod migrations run through the existing `migrate.js` in `vercel-build`.

## Testing

Pure logic stays the priority; the Google round-trip is not exercised in unit
tests:

- **Identity resolution** (`email → player`): given a set of players and a
  signed-in email, returns the right player / `null` when unlinked; unique-email
  assumption holds.
- **Authz predicates:** `requireAuth` / `requireAdmin` outcomes across the
  matrix — signed-out, signed-in-but-unlinked, linked non-admin, linked admin —
  produce allow vs `303 → /login` correctly.
- **Bootstrap:** the `INITIAL_ADMIN_EMAIL` step promotes exactly the matching
  player and is idempotent / demotes no one.
- Better Auth wiring (hook, Google provider) is integration-level and gets a
  lighter touch than the pure predicates.
- `pnpm check` 0/0, `pnpm lint` clean, full vitest suite green.
- Runtime smoke: signing in with an allow-listed Google account unlocks
  `/log`; an admin-flagged player additionally unlocks `/players` editing and
  `/games`; a Google account with no player row is denied with the "ask an
  admin" state; the board and detail pages render while signed out.

## Out of scope (Phase 1)

- **MVP voting** — the entire point, deferred to the Phase 2 spec.
- Enterprise SSO (OIDC/SAML), non-Google providers, email/password login.
- Self-service signup — players are created only by an admin.
- Merging Better Auth's `user` into `players` or replacing the `playerId`
  domain key (stats, teams, and Elo keep referencing `players.id`).
- Migrating historical games to a per-user "who logged this" attribution.
