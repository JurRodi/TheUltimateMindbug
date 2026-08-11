# Admin Role + Delete Games — Design

**Date:** 2026-08-11
**Status:** Approved (design discussion)

## Goal

Introduce a second, higher-privilege **admin** password. Split the app's write
capabilities into two tiers:

- **Normal password** → **log games only**.
- **Admin password** → log games **plus** manage players (add / activate /
  deactivate) **plus** delete games from a dedicated admin page.

Admin is a strict superset of normal. Deleting a game is a hard delete with an
inline confirm; ratings recompute automatically (they're derived from the games
on every load).

## Auth model (`src/lib/server/auth.ts`)

Two roles encoded in the existing signed cookie (`mb_auth`), distinguished by
the HMAC payload:

- `cookieValue('authorized')` — current behavior, issued for the normal password.
- `cookieValue('admin')` — issued for the admin password.

New/changed helpers:

```ts
export type Role = 'authorized' | 'admin';

/** Which role a submitted password grants, or null if it matches neither. */
export function authenticate(input: string): Role | null;

export function cookieValue(role: Role = 'authorized'): string; // HMAC(AUTH_SECRET, role)

export function isAuthed(cookies): boolean;   // cookie matches authorized OR admin
export function isAdmin(cookies): boolean;    // cookie matches admin
export function requireAuth(cookies): void;   // redirect to /login unless isAuthed
export function requireAdmin(cookies): void;  // redirect to /login unless isAdmin
```

- `authenticate` checks the admin password **first** (admin wins if both match),
  and **only treats a non-empty `ADMIN_PASSWORD` as valid** — an unset/empty
  admin password never authenticates anyone as admin.
- `isAuthed` accepts either role's cookie value (admin is a superset), so the
  log page keeps working for both. `isAdmin` accepts only the admin value.
- Env: add `ADMIN_PASSWORD` (server-only, never `PUBLIC_`). If unset, admin
  features are simply unreachable — no one can obtain the admin cookie.

## Capability changes

| Action | Before | After |
| --- | --- | --- |
| Log a game (`/log`) | `requireAuth` | `requireAuth` (unchanged) |
| Add / toggle player (`/players`) | `requireAuth` | **`requireAdmin`** |
| Players page `canEdit` flag | `isAuthed` | **`isAdmin`** |
| Delete a game (`/games`) | — | **`requireAdmin`** (new) |

The normal password thus loses player-management; a normal user visiting
`/players` sees the read-only view with the existing "unlock to edit" pill.

## Login (`src/routes/login/+page.server.ts`)

Replace `verifyPassword` with `authenticate`:

```ts
const role = authenticate(password);
if (!role) return fail(400, { error: 'Wrong password' });
cookies.set(AUTH_COOKIE, cookieValue(role), authCookieOptions());
throw redirect(303, safeRedirectTarget);
```

One password field accepts either password; the granted role depends on which
one was entered. (Copy tweak only; no structural UI change.)

## Delete query (`src/lib/server/db/queries.ts`)

```ts
export async function deleteGame(db: DB, id: number): Promise<void>;
```

Deletes the `games` row; `game_participants` rows cascade via the existing
`onDelete: 'cascade'` FK. No schema change.

## Manage-games page (`/games`)

- `+page.server.ts`:
  - `load`: `requireAdmin(cookies)`; fetch `getAllGames` + `getPlayers`; return
    games **newest-first**, each resolved to `{ id, playedAt, format, winnerSide,
    sideA: {name,emoji}[], sideB: {name,emoji}[] }`.
  - `actions.delete`: `requireAdmin(cookies)`; parse `id`; `deleteGame(db, id)`;
    return `{ ok: true }`.
- `+page.svelte`: a list of game rows, each showing format · date · side A vs
  side B (winner marked), and a **Delete** control that expands to an inline
  "Delete? Yes / Cancel" confirm (no native dialog). Submits via `use:enhance`
  with a per-row spinner; on success shows a **"Game deleted ✓"** toast (reuse
  the `Toast` component). Empty state when there are no games.

## Nav (admin-only link)

- New `src/routes/+layout.server.ts`: `load` returns `{ isAdmin: isAdmin(cookies) }`.
- `Nav.svelte`: show a **Games** item (icon 🎲 → `/games`) only when
  `page.data.isAdmin`. Non-admins never see the link; the page itself is also
  `requireAdmin`-gated, so the link is a convenience, not the security boundary.

## Environment

- `.env` (local) and Vercel: add `ADMIN_PASSWORD`. `.env.example` gains a
  documented placeholder line.

## Testing

- `auth.test.ts` (extend the mocked env with `ADMIN_PASSWORD: 'admin-pw'`):
  - `authenticate('admin-pw') === 'admin'`, `authenticate('hunter2') === 'authorized'`,
    `authenticate('nope') === null`.
  - With admin password unset/empty, `authenticate('')` and any input never
    return `'admin'`.
  - `isAdmin` accepts only the admin cookie value; `isAuthed` accepts both;
    tampered/absent cookies rejected.
- `queries.test.ts`: `deleteGame` removes the game (and, via cascade, its
  participants — assert `getAllGames` no longer contains it).
- `pnpm check` 0/0, `pnpm lint` clean, full vitest suite green.
- Runtime: admin login unlocks the Games nav item + `/games`; a normal
  login can log games but `/players` is read-only and `/games` redirects
  to login; deleting a game removes it and recomputes the board.

## Out of scope

- Per-user accounts / individual accountability (still a shared password model).
- Soft delete / recycle bin (chosen: hard delete).
- Editing an existing game (only create + delete).
