# Player Identity & Google SSO Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared-password write-gate with per-player login via Google (Better Auth); the admin creates players and records each one's Google email, and admin rights become a database flag on the player.

**Architecture:** Add Better Auth (Google social provider + Drizzle adapter) which owns its own `user`/`session`/`account`/`verification` tables. A `hooks.server.ts` handle resolves the signed-in Google email to a `players` row (join by email) and stashes `{ player, isAdmin }` in `event.locals.auth`. Every route gate moves from reading the old HMAC cookie to reading `locals.auth` via two pure predicates. The public leaderboard and detail pages stay public.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Drizzle ORM over Postgres (local `pg` driver / prod Neon HTTP driver), Better Auth, Vitest + PGlite, pnpm.

## Global Constraints

- **Svelte 5 runes only** (`$props`/`$state`/`$derived`) — match surrounding components.
- **Secrets are server-only:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `INITIAL_ADMIN_EMAIL`, `DATABASE_URL` live only in `.env` / Vercel. **Never** prefix with `PUBLIC_`, never send to the browser.
- **Email is never serialized to public pages** — only the admin players load and server-only `locals` may carry it. The public board, detail pages, and `+layout` data expose at most `{ id, name, avatar }` + an `isAdmin` boolean.
- **Two DB drivers must both work:** local `pg` (docker Postgres) and prod `drizzle-orm/neon-http`. The neon-http driver has **no interactive transactions** (`db.transaction()` throws) — use single statements. `db.execute()` return shape differs by driver (bare array vs `{ rows }`).
- **Identity join is by lowercased email.** Store and look up emails lowercased/trimmed. `players.email` is `unique`.
- **Quality bars:** `pnpm check` → 0 errors / 0 warnings; `pnpm lint` clean; `pnpm test` green.
- **Commit** under the repo-local identity (`JurRodi <rodijurrien@gmail.com>`); the plan commits per task but never pushes.
- **Board `/`, `/players/[id]`, `/teams/[id]` stay public** — do not gate them.

---

## File Structure

**Created:**
- `src/lib/server/db/auth-schema.ts` — Better Auth's `user`/`session`/`account`/`verification` Drizzle tables.
- `src/lib/server/betterauth.ts` — the configured Better Auth server instance.
- `src/lib/auth-client.ts` — the Better Auth browser client (`signIn.social`, `signOut`).
- `src/lib/server/authz.ts` — `AuthContext` type + pure `requireAuth` / `requireAdmin` predicates.
- `src/lib/server/authz.test.ts` — unit tests for the predicates.
- `src/hooks.server.ts` — mounts Better Auth + populates `locals.auth`.
- `scripts/bootstrap-admin.js` — `promoteInitialAdmin(db, email)` used by `migrate.js` + tested.
- `scripts/bootstrap-admin.test.ts` — unit test for the bootstrap SQL semantics.

**Modified:**
- `src/lib/server/db/schema.ts` — add `email` + `isAdmin` to `players`; re-export auth tables.
- `src/lib/types.ts` — add `AdminPlayer`.
- `src/lib/server/db/queries.ts` — `getPlayerByEmail`, `getPlayersForAdmin`, `updatePlayerAuth`; `addPlayer` gains `email`.
- `src/lib/server/db/queries.test.ts` — cover the new queries.
- `src/app.d.ts` — `App.Locals.auth`.
- `src/routes/+layout.server.ts` — return `{ isAdmin, me }` from `locals`.
- `src/routes/log/+page.server.ts`, `src/routes/players/+page.server.ts`, `src/routes/games/+page.server.ts` — gates → `locals.auth` + `authz`; players gains email/admin actions.
- `src/routes/login/+page.svelte` — Google sign-in button; `src/routes/login/+page.server.ts` — redirect-if-signed-in load (password action deleted).
- `src/routes/players/+page.svelte` — email field + admin toggle.
- `src/lib/components/Nav.svelte` — signed-in chip + login/logout.
- `scripts/migrate.js` — run the admin bootstrap after migrating.
- `.env.example` — add new keys, retire old auth keys.

**Deleted:**
- `src/lib/server/auth.ts` (old HMAC/password module) and `src/lib/server/auth.test.ts` — in Task 5, together with the last consumer swap so no intermediate build breaks.

---

### Task 1: DB foundation — Better Auth tables + `players` columns + migration

**Files:**
- Modify: `package.json` (add `better-auth` dependency)
- Create: `src/lib/server/db/auth-schema.ts`
- Modify: `src/lib/server/db/schema.ts`
- Create: `drizzle/NNNN_*.sql` (generated)
- Test: `src/lib/server/db/schema.migrate.test.ts`

**Interfaces:**
- Produces: `players.email: text unique (nullable)`, `players.isAdmin: boolean not null default false`; exported tables `user`, `session`, `account`, `verification`.

- [ ] **Step 1: Install Better Auth**

```bash
pnpm add better-auth
```

- [ ] **Step 2: Add the auth tables**

Create `src/lib/server/db/auth-schema.ts` — Better Auth's documented core schema (Postgres):

```ts
import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});
```

- [ ] **Step 3: Verify the schema matches the installed Better Auth version**

Run the generator and diff its output against `auth-schema.ts`; reconcile any column the installed version adds/renames (this schema is the documented v1 shape, but pin it to what's installed):

```bash
npx @better-auth/cli@latest generate --config src/lib/server/betterauth.ts || true
```

If `betterauth.ts` doesn't exist yet (it's created in Task 4), instead compare against the "Drizzle" schema in the installed package's docs/`node_modules/better-auth` core schema. Any mismatch → edit `auth-schema.ts` to match.

- [ ] **Step 4: Add the `players` columns and re-export the auth tables**

In `src/lib/server/db/schema.ts`, add to the `players` table definition:

```ts
	email: text('email').unique(),
	isAdmin: boolean('is_admin').notNull().default(false),
```

and at the bottom of the file:

```ts
export * from './auth-schema';
```

- [ ] **Step 5: Generate the migration**

```bash
pnpm db:generate
```

Confirm a new file appears under `drizzle/` adding the four auth tables plus `email`/`is_admin` on `players`. (Generate is offline — it reads the schema, not the DB.)

- [ ] **Step 6: Write the migration test**

Create `src/lib/server/db/schema.migrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './test-db';
import { players, user } from './schema';

describe('schema migration', () => {
	it('applies auth tables and the new player columns', async () => {
		const db = await makeTestDb();
		// auth table exists and is empty
		expect(await db.select().from(user)).toEqual([]);
		// players carries email + is_admin (default false)
		await db.insert(players).values({ name: 'Jur', email: 'jur@example.com' });
		const [row] = await db.select().from(players).where(eq(players.name, 'Jur'));
		expect(row.email).toBe('jur@example.com');
		expect(row.isAdmin).toBe(false);
	});
});
```

- [ ] **Step 7: Run the test**

Run: `pnpm test -- src/lib/server/db/schema.migrate.test.ts`
Expected: PASS.

- [ ] **Step 8: Type-check and commit**

```bash
pnpm check
git add package.json pnpm-lock.yaml src/lib/server/db/auth-schema.ts src/lib/server/db/schema.ts drizzle/ src/lib/server/db/schema.migrate.test.ts
git commit -m "feat(auth): Better Auth tables + player email/is_admin columns"
```

---

### Task 2: Queries + `AdminPlayer` type + admin bootstrap (TDD)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/db/queries.ts`
- Modify: `src/lib/server/db/queries.test.ts`
- Create: `scripts/bootstrap-admin.js`
- Create: `scripts/bootstrap-admin.test.ts`

**Interfaces:**
- Produces:
  - `interface AdminPlayer extends Player { email: string | null; isAdmin: boolean }`
  - `getPlayerByEmail(db, email: string): Promise<AdminPlayer | null>`
  - `getPlayersForAdmin(db): Promise<AdminPlayer[]>`
  - `updatePlayerAuth(db, id: number, patch: { email?: string | null; isAdmin?: boolean }): Promise<void>`
  - `addPlayer(db, name, avatar?, email?): Promise<AdminPlayer>` (now returns `AdminPlayer`)
  - `promoteInitialAdmin(db, email): Promise<void>` (in `scripts/bootstrap-admin.js`)
- Consumes: `makeTestDb` from `src/lib/server/db/test-db.ts`.

- [ ] **Step 1: Add the `AdminPlayer` type**

In `src/lib/types.ts`, after `interface Player`:

```ts
/** A player as seen by an admin: includes the login email + admin flag. Never
    serialize this to a public page — email is admin-only. */
export interface AdminPlayer extends Player {
	email: string | null;
	isAdmin: boolean;
}
```

- [ ] **Step 2: Write the failing query tests**

Add to `src/lib/server/db/queries.test.ts`:

```ts
import { getPlayerByEmail, getPlayersForAdmin, updatePlayerAuth } from './queries';

describe('player identity queries', () => {
	it('resolves a player by email, case-insensitively', async () => {
		const db = await makeTestDb();
		await addPlayer(db, 'Jur', null, 'Jur@Example.com');
		const hit = await getPlayerByEmail(db, 'jur@example.com');
		expect(hit?.name).toBe('Jur');
		expect(hit?.email).toBe('jur@example.com'); // stored lowercased
		expect(await getPlayerByEmail(db, 'nobody@example.com')).toBeNull();
	});

	it('updatePlayerAuth sets email and admin independently', async () => {
		const db = await makeTestDb();
		const p = await addPlayer(db, 'Sam');
		expect(p.email).toBeNull();
		expect(p.isAdmin).toBe(false);
		await updatePlayerAuth(db, p.id, { email: 'SAM@x.com' });
		await updatePlayerAuth(db, p.id, { isAdmin: true });
		const [got] = await getPlayersForAdmin(db);
		expect(got.email).toBe('sam@x.com');
		expect(got.isAdmin).toBe(true);
	});
});
```

(Adjust the existing `addPlayer` import if needed — it already lives in this test file.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- src/lib/server/db/queries.test.ts`
Expected: FAIL (`getPlayerByEmail is not a function`).

- [ ] **Step 4: Implement the queries**

In `src/lib/server/db/queries.ts`, import `AdminPlayer` and add:

```ts
function toAdminPlayer(row: typeof players.$inferSelect): AdminPlayer {
	return { ...toPlayer(row), email: row.email, isAdmin: row.isAdmin };
}

export async function getPlayersForAdmin(db: DB): Promise<AdminPlayer[]> {
	const rows = await db.select().from(players).orderBy(asc(players.name));
	return rows.map(toAdminPlayer);
}

export async function getPlayerByEmail(db: DB, email: string): Promise<AdminPlayer | null> {
	const norm = email.trim().toLowerCase();
	if (!norm) return null;
	const rows = await db.select().from(players).where(eq(sql`lower(${players.email})`, norm));
	return rows[0] ? toAdminPlayer(rows[0]) : null;
}

export async function updatePlayerAuth(
	db: DB,
	id: number,
	patch: { email?: string | null; isAdmin?: boolean }
): Promise<void> {
	const set: Partial<typeof players.$inferInsert> = {};
	if (patch.email !== undefined) set.email = patch.email ? patch.email.trim().toLowerCase() : null;
	if (patch.isAdmin !== undefined) set.isAdmin = patch.isAdmin;
	if (Object.keys(set).length) await db.update(players).set(set).where(eq(players.id, id));
}
```

Change `addPlayer` to accept + store email and return `AdminPlayer`:

```ts
export async function addPlayer(
	db: DB,
	name: string,
	avatar?: string | null,
	email?: string | null
): Promise<AdminPlayer> {
	const rows = await db
		.insert(players)
		.values({ name, avatar: avatar ?? null, email: email ? email.trim().toLowerCase() : null })
		.returning();
	return toAdminPlayer(rows[0]);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- src/lib/server/db/queries.test.ts`
Expected: PASS (existing `addPlayer` assertions still hold — `AdminPlayer` is a superset of `Player`).

- [ ] **Step 6: Write the bootstrap + its failing test**

Create `scripts/bootstrap-admin.js`:

```js
import { sql } from 'drizzle-orm';

/** Promote the player whose email matches to admin. Case-insensitive,
    idempotent, and a no-op when `email` is empty. Used once per deploy by
    scripts/migrate.js to guarantee a first admin exists. */
export async function promoteInitialAdmin(db, email) {
	if (!email) return;
	await db.execute(sql`UPDATE players SET is_admin = true WHERE lower(email) = lower(${email})`);
}
```

Create `scripts/bootstrap-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/lib/server/db/test-db';
import { players } from '../src/lib/server/db/schema';
import { promoteInitialAdmin } from './bootstrap-admin.js';

describe('promoteInitialAdmin', () => {
	it('promotes exactly the matching email (case-insensitive), idempotently', async () => {
		const db = await makeTestDb();
		await db.insert(players).values([
			{ name: 'Jur', email: 'jur@example.com' },
			{ name: 'Sam', email: 'sam@example.com' }
		]);
		await promoteInitialAdmin(db, 'JUR@example.com');
		await promoteInitialAdmin(db, 'JUR@example.com');
		const [jur] = await db.select().from(players).where(eq(players.name, 'Jur'));
		const [sam] = await db.select().from(players).where(eq(players.name, 'Sam'));
		expect(jur.isAdmin).toBe(true);
		expect(sam.isAdmin).toBe(false);
	});

	it('is a no-op when the email is empty', async () => {
		const db = await makeTestDb();
		await db.insert(players).values({ name: 'Jur', email: 'jur@example.com' });
		await promoteInitialAdmin(db, undefined);
		const [jur] = await db.select().from(players).where(eq(players.name, 'Jur'));
		expect(jur.isAdmin).toBe(false);
	});
});
```

- [ ] **Step 7: Run the bootstrap test**

Run: `pnpm test -- scripts/bootstrap-admin.test.ts`
Expected: PASS.

- [ ] **Step 8: Type-check and commit**

```bash
pnpm check
git add src/lib/types.ts src/lib/server/db/queries.ts src/lib/server/db/queries.test.ts scripts/bootstrap-admin.js scripts/bootstrap-admin.test.ts
git commit -m "feat(auth): identity queries + admin bootstrap helper"
```

---

### Task 3: Pure authorization predicates (TDD)

**Files:**
- Create: `src/lib/server/authz.ts`
- Create: `src/lib/server/authz.test.ts`

**Interfaces:**
- Consumes: `AdminPlayer` from `$lib/types`.
- Produces:
  - `interface AuthContext { player: AdminPlayer | null; isAdmin: boolean }`
  - `requireAuth(auth: AuthContext): void` — throws `redirect(303, '/login')` when `player` is null.
  - `requireAdmin(auth: AuthContext): void` — throws `redirect(303, '/login')` when not admin.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/authz.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { requireAuth, requireAdmin, type AuthContext } from './authz';
import type { AdminPlayer } from '$lib/types';

const mkPlayer = (isAdmin: boolean): AdminPlayer => ({
	id: 1,
	name: 'Jur',
	avatar: null,
	isActive: true,
	createdAt: '2026-01-01T00:00:00Z',
	email: 'jur@example.com',
	isAdmin
});

const signedOut: AuthContext = { player: null, isAdmin: false };
const asUser: AuthContext = { player: mkPlayer(false), isAdmin: false };
const asAdmin: AuthContext = { player: mkPlayer(true), isAdmin: true };

const expectLoginRedirect = (fn: () => void) => {
	try {
		fn();
	} catch (e) {
		expect(e).toMatchObject({ status: 303, location: '/login' });
		return;
	}
	throw new Error('expected a redirect to be thrown');
};

describe('requireAuth', () => {
	it('allows a resolved player', () => expect(() => requireAuth(asUser)).not.toThrow());
	it('redirects when signed out or unlinked', () => expectLoginRedirect(() => requireAuth(signedOut)));
});

describe('requireAdmin', () => {
	it('allows an admin', () => expect(() => requireAdmin(asAdmin)).not.toThrow());
	it('redirects a non-admin player', () => expectLoginRedirect(() => requireAdmin(asUser)));
	it('redirects when signed out', () => expectLoginRedirect(() => requireAdmin(signedOut)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/lib/server/authz.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the predicates**

Create `src/lib/server/authz.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import type { AdminPlayer } from '$lib/types';

/** What the request handle resolves the current session into. `player` is null
    when signed out, or signed in with a Google account that has no matching
    player row (authenticated but not authorized). */
export interface AuthContext {
	player: AdminPlayer | null;
	isAdmin: boolean;
}

/** Redirect to /login unless the session resolves to a known player. */
export function requireAuth(auth: AuthContext): void {
	if (!auth.player) throw redirect(303, '/login');
}

/** Redirect to /login unless the resolved player is an admin. */
export function requireAdmin(auth: AuthContext): void {
	if (!auth.isAdmin) throw redirect(303, '/login');
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- src/lib/server/authz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/authz.ts src/lib/server/authz.test.ts
git commit -m "feat(auth): pure requireAuth/requireAdmin predicates over AuthContext"
```

---

### Task 4: Better Auth server instance + browser client + env template

**Files:**
- Create: `src/lib/server/betterauth.ts`
- Create: `src/lib/auth-client.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `db` from `$lib/server/db`, auth tables from `$lib/server/db/schema`.
- Produces: `auth` (Better Auth server instance) from `betterauth.ts`; `authClient` from `auth-client.ts`.

This task is configuration/wiring — its gate is `pnpm check` plus the runtime smoke in Task 5, not a unit test (mirrors the spec's "lighter touch" for Better Auth wiring).

- [ ] **Step 1: Create the server instance**

Create `src/lib/server/betterauth.ts`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { user, session, account, verification } from './db/schema';

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: { user, session, account, verification }
	}),
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID ?? '',
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? ''
		}
	}
});
```

- [ ] **Step 2: Create the browser client**

Create `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/svelte';

// Same-origin: baseURL is inferred from the page, so no secret is needed here.
export const authClient = createAuthClient();
```

- [ ] **Step 3: Update `.env.example`**

Add the new keys and remove the retired ones. New block:

```dotenv
# Better Auth — Google SSO
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=generate-a-long-random-string
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
# One-time admin bootstrap: the deploy migration promotes this email to admin.
INITIAL_ADMIN_EMAIL=you@example.com
```

Delete the `MINDBUG_PASSWORD`, `ADMIN_PASSWORD`, and `AUTH_SECRET` lines from `.env.example`.

- [ ] **Step 4: Type-check**

Run: `pnpm check`
Expected: 0 errors / 0 warnings. (`betterauth.ts` is not imported by any route yet — Task 5 wires it in.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/betterauth.ts src/lib/auth-client.ts .env.example
git commit -m "feat(auth): Better Auth server instance + client + env template"
```

---

### Task 5: Cutover — hooks, locals, gate swap, login/logout, delete old auth

This is one atomic task: removing the old `auth.ts` breaks every consumer, so the hook, all four server gates, `app.d.ts`, the login flow, and the deletions land together and leave a compiling app running on Better Auth.

**Files:**
- Create: `src/hooks.server.ts`
- Modify: `src/app.d.ts`
- Modify: `src/routes/+layout.server.ts`
- Modify: `src/routes/log/+page.server.ts`
- Modify: `src/routes/players/+page.server.ts`
- Modify: `src/routes/games/+page.server.ts`
- Modify: `src/routes/login/+page.svelte`
- Replace: `src/routes/login/+page.server.ts`
- Delete: `src/lib/server/auth.ts`, `src/lib/server/auth.test.ts`

**Interfaces:**
- Consumes: `auth` (betterauth.ts), `getPlayerByEmail`/`getPlayersForAdmin`/`updatePlayerAuth`/`addPlayer` (queries), `requireAuth`/`requireAdmin`/`AuthContext` (authz), `authClient` (auth-client).
- Produces: `event.locals.auth: AuthContext` for every request; `+layout` data `{ isAdmin: boolean; me: { id, name, avatar } | null }`.

- [ ] **Step 1: Declare the locals type**

Replace the body of `src/app.d.ts`:

```ts
import type { AuthContext } from '$lib/server/authz';

declare global {
	namespace App {
		interface Locals {
			auth: AuthContext;
		}
	}
}

export {};
```

- [ ] **Step 2: Add the request handle**

Create `src/hooks.server.ts`:

```ts
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/betterauth';
import { db } from '$lib/server/db';
import { getPlayerByEmail } from '$lib/server/db/queries';

export const handle: Handle = async ({ event, resolve }) => {
	// Resolve the Google identity to one of our players (join by verified email).
	const session = await auth.api.getSession({ headers: event.request.headers });
	const email = session?.user?.email ?? null;
	const player = email ? await getPlayerByEmail(db, email) : null;
	event.locals.auth = { player, isAdmin: !!player?.isAdmin };

	// Better Auth owns /api/auth/*; everything else falls through to SvelteKit.
	return svelteKitHandler({ event, resolve, auth, building });
};
```

- [ ] **Step 3: Swap the layout load**

Replace `src/routes/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	isAdmin: locals.auth.isAdmin,
	// Public-safe: id/name/avatar only — never the email.
	me: locals.auth.player
		? { id: locals.auth.player.id, name: locals.auth.player.name, avatar: locals.auth.player.avatar }
		: null
});
```

- [ ] **Step 4: Swap the `/log` gate**

In `src/routes/log/+page.server.ts`, change the import `from '$lib/server/auth'` to `from '$lib/server/authz'`, and both call sites from `requireAuth(cookies)` to `requireAuth(locals.auth)` (update the destructured params `{ cookies }` → `{ locals }` in `load`, and `{ request, cookies }` → `{ request, locals }` in the action). No other logic changes.

- [ ] **Step 5: Swap + extend the `/players` server**

Replace `src/routes/players/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, getPlayersForAdmin, addPlayer, setPlayerActive, updatePlayerAuth } from '$lib/server/db/queries';
import { requireAdmin } from '$lib/server/authz';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.auth.isAdmin) return { canEdit: true as const, players: await getPlayersForAdmin(db) };
	return { canEdit: false as const, players: await getPlayers(db) };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		const email = String(form.get('email') ?? '').trim().toLowerCase() || null;
		if (!name) return fail(400, { error: 'Name required' });
		try {
			await addPlayer(db, name, avatar, email);
		} catch {
			return fail(400, { error: 'That name or email already exists' });
		}
		return { ok: true };
	},
	toggle: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		await setPlayerActive(db, id, form.get('active') === 'true');
		return { ok: true };
	},
	setEmail: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const email = String(form.get('email') ?? '').trim().toLowerCase() || null;
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		try {
			await updatePlayerAuth(db, id, { email });
		} catch {
			return fail(400, { error: 'That email is already assigned' });
		}
		return { ok: true };
	},
	setAdmin: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		await updatePlayerAuth(db, id, { isAdmin: form.get('isAdmin') === 'true' });
		return { ok: true };
	}
};
```

- [ ] **Step 6: Swap the `/games` gate**

In `src/routes/games/+page.server.ts`, change the import to `from '$lib/server/authz'` and both `requireAdmin(cookies)` calls to `requireAdmin(locals.auth)` (params `{ cookies }` → `{ locals }` in `load`, and add `locals` to the delete action's params). No other logic changes.

- [ ] **Step 7: Replace the login server load (drop the password action)**

Replace `src/routes/login/+page.server.ts` with a redirect-if-already-signed-in load:

```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.auth.player) {
		const requested = url.searchParams.get('redirectTo');
		const to = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
		throw redirect(303, to);
	}
	return {};
};
```

- [ ] **Step 8: Replace the login page with a Google button**

Replace `src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';
	let submitting = $state(false);

	async function signIn() {
		submitting = true;
		const requested = page.url.searchParams.get('redirectTo');
		const to = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
		await authClient.signIn.social({ provider: 'google', callbackURL: to });
	}
</script>

<h1>Sign in</h1>
<p class="muted">Use the Google account your admin added. New here? Ask an admin to add you.</p>

<button class="btn" onclick={signIn} disabled={submitting}>
	{#if submitting}<span class="spin" aria-hidden="true"></span> Redirecting…{:else}Sign in with Google{/if}
</button>

<style>
	.muted {
		color: var(--muted);
	}
	button {
		margin-top: 1rem;
	}
</style>
```

- [ ] **Step 9: Delete the old auth module + its tests**

```bash
git rm src/lib/server/auth.ts src/lib/server/auth.test.ts
```

- [ ] **Step 10: Type-check, lint, test**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: 0/0, clean, all green. (Fix any lingering `$lib/server/auth` import the grep in Step 11 surfaces.)

- [ ] **Step 11: Confirm no stale references remain**

Run: `grep -rn "server/auth'\|AUTH_COOKIE\|cookieValue\|authenticate(" src`
Expected: no matches (all now go through `authz` / Better Auth).

- [ ] **Step 12: Runtime smoke (needs Google OAuth env — see Task 8 setup)**

With `.env` populated and a player pre-created carrying your Google email (via a temporary `INITIAL_ADMIN_EMAIL` + local `pnpm db:migrate`, or by inserting a row), run `pnpm dev` and verify: `/login` shows the Google button; signing in returns you to the app; `/log` is reachable; the board renders while signed out. If the OAuth client isn't set up yet, defer this step until after Task 8's setup and note it as pending.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(auth): cut over gates to Better Auth session; Google login/logout"
```

---

### Task 6: Players admin UI — email field + admin toggle

**Files:**
- Modify: `src/routes/players/+page.svelte`

**Interfaces:**
- Consumes: `data.canEdit` (discriminated), `data.players` (`AdminPlayer[]` when `canEdit`), form actions `add` (now with `email`), `setEmail`, `setAdmin`.

- [ ] **Step 1: Add an email input to the "add player" form**

In the `.row1` block of the add form (admin branch), after the name input add:

```svelte
			<input name="email" type="email" placeholder="Google email (optional)" autocomplete="off" />
```

- [ ] **Step 2: Add per-player email + admin controls**

Inside the `{#if data.canEdit}` block of each `<li>` (alongside the existing toggle form), add an email-set form and an admin-toggle form. `data.players` is `AdminPlayer[]` in this branch (the discriminated `canEdit: true`), so `p.email` / `p.isAdmin` are available:

```svelte
				<form method="POST" action="?/setEmail" use:enhance class="idform">
					<input type="hidden" name="id" value={p.id} />
					<input name="email" type="email" value={p.email ?? ''} placeholder="no login yet" />
					<button class="btn secondary" type="submit">Save email</button>
				</form>
				<form
					method="POST"
					action="?/setAdmin"
					use:enhance
					onsubmit={() => (toast = p.isAdmin ? 'Admin removed' : 'Admin granted')}
				>
					<input type="hidden" name="id" value={p.id} />
					<input type="hidden" name="isAdmin" value={(!p.isAdmin).toString()} />
					<button class="btn secondary" type="submit">{p.isAdmin ? 'Revoke admin' : 'Make admin'}</button>
				</form>
```

- [ ] **Step 3: Minimal styling so the extra controls wrap cleanly**

Add to the `<style>` block:

```css
	.idform {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.idform input {
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		max-width: 12rem;
	}
	li {
		flex-wrap: wrap;
		gap: 0.5rem;
	}
```

- [ ] **Step 4: Verify**

Run: `pnpm check && pnpm lint`
Expected: 0/0, clean. Runtime: as admin, `/players` shows an email box + admin button per player; saving an email lets that person sign in; the public (signed-out) view still shows no emails and no controls.

- [ ] **Step 5: Commit**

```bash
git add src/routes/players/+page.svelte
git commit -m "feat(players): admin email field + grant/revoke admin controls"
```

---

### Task 7: Nav — signed-in chip + login / logout

**Files:**
- Modify: `src/lib/components/Nav.svelte`

**Interfaces:**
- Consumes: `page.data.me` (`{ id, name, avatar } | null`), `page.data.isAdmin`; `authClient.signOut`.

- [ ] **Step 1: Add login/logout logic**

In the `<script>` of `Nav.svelte`, add:

```ts
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	const me = $derived(page.data.me as { id: number; name: string; avatar: string | null } | null);
	async function logout() {
		await authClient.signOut();
		goto('/');
	}
```

- [ ] **Step 2: Render the account row**

After the `{#each links}` block, before `</nav>`, add:

```svelte
	{#if me}
		<button class="acct" onclick={logout} title="Sign out">
			<span class="icon">🚪</span><span class="label">Sign out ({me.name})</span>
		</button>
	{:else}
		<a href={resolve('/login')} class:on={isActive('/login')}>
			<span class="icon">🔑</span><span class="label">Sign in</span>
		</a>
	{/if}
```

- [ ] **Step 3: Style the button to match the nav links**

Add to `<style>` so the `<button>` matches the anchor styling (the existing `a` rules don't apply to a button):

```css
	.acct {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--onmat-muted);
		background: none;
		border: 0;
		cursor: pointer;
		padding: 0.3rem 0.6rem;
		border-radius: 10px;
	}
	.acct .icon {
		font-size: 1.05rem;
	}
	.acct:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--onmat);
	}
	@media (min-width: 820px) {
		.acct {
			flex-direction: row;
			justify-content: flex-start;
			gap: 0.65rem;
			font-size: 0.95rem;
			text-transform: none;
			letter-spacing: 0;
			padding: 0.68rem 0.8rem;
		}
		.acct .icon {
			font-size: 1.2rem;
		}
	}
```

- [ ] **Step 4: Verify**

Run: `pnpm check && pnpm lint`
Expected: 0/0, clean. Runtime: signed out → "Sign in" link; signed in → "Sign out (Name)" that clears the session and returns to the board; the admin `Games` link still appears only for admins.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Nav.svelte
git commit -m "feat(nav): signed-in chip with sign in / sign out"
```

---

### Task 8: Deploy bootstrap wiring + Google setup docs + final verification

**Files:**
- Modify: `scripts/migrate.js`
- Modify: `README.md` (auth setup section) — optional but recommended

**Interfaces:**
- Consumes: `promoteInitialAdmin` from `scripts/bootstrap-admin.js`.

- [ ] **Step 1: Run the bootstrap after migrations**

In `scripts/migrate.js`, after the existing `migrate(...)` call, add:

```js
const { promoteInitialAdmin } = await import('./bootstrap-admin.js');
await promoteInitialAdmin(db, process.env.INITIAL_ADMIN_EMAIL);
console.log('[migrate] initial admin ensured.');
```

(`db` here is the raw `drizzle(neon(...))` instance already created in the file — `promoteInitialAdmin` uses driver-agnostic `sql`, so no schema import is needed.)

- [ ] **Step 2: Document the Google Cloud + env setup**

Add an "Authentication (Google SSO)" section to `README.md` capturing the **user-performed** setup (Claude cannot create the OAuth client or set secrets):

1. Google Cloud Console → create an OAuth 2.0 Client ID (type: Web application) + configure the consent screen.
2. Authorized redirect URIs:
   - `http://localhost:5173/api/auth/callback/google` (local dev)
   - `https://<prod-domain>/api/auth/callback/google` (production)
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (a long random string), and `BETTER_AUTH_URL` (the app's base URL) into `.env` locally and Vercel env vars.
4. Set `INITIAL_ADMIN_EMAIL` to your Google email and pre-create a player with that email; the deploy migration promotes you to admin. Remove/keep the var afterward (idempotent lock-out safety valve).
5. The retired `MINDBUG_PASSWORD` / `ADMIN_PASSWORD` / `AUTH_SECRET` can be removed from Vercel after cutover.

- [ ] **Step 3: Full verification**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: 0 errors / 0 warnings, lint clean, full vitest suite green.

- [ ] **Step 4: Manual smoke checklist (with real Google OAuth env)**

Verify end-to-end and note results:
- Signed out: board `/`, `/players/[id]`, `/teams/[id]` render; `/log` redirects to `/login`; `/games` redirects to `/login`.
- Sign in with an **allow-listed** Google account → land back in the app; `/log` works.
- Sign in with a Google account that has **no** player row → not authorized (gated routes still redirect to `/login`); no crash.
- Admin-flagged player: `/players` editing + admin toggles + `/games` all reachable; the `Games` nav link shows.
- Set an existing player's email in the admin UI → that person can now sign in.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate.js README.md
git commit -m "feat(auth): deploy-time admin bootstrap + Google SSO setup docs"
```

---

## Self-Review

**Spec coverage:**
- Better Auth + Google + Drizzle adapter → Tasks 1, 4. ✅
- `players.email` + `is_admin` columns, additive/nullable → Task 1. ✅
- Identity join by verified email; unlinked = "ask an admin" → Tasks 2 (query), 5 (hook + gates). ✅
- Gate migration table (log/players/games/layout, board stays public) → Task 5. ✅
- Login → Google button; logout → Tasks 5, 7. ✅
- Admin UI: email field + admin toggle → Tasks 5 (actions) + 6 (UI). ✅
- Bootstrap via `INITIAL_ADMIN_EMAIL` in `migrate.js` → Tasks 2 (helper, tested) + 8 (wiring). ✅
- Env vars + `.env.example` + retire old secrets → Tasks 4, 8. ✅
- Google Cloud setup as a user task → Task 8. ✅
- Live-data migration (additive columns, backfill in UI) → Task 1 (additive) + 6/8 (backfill). ✅
- Testing: email→player resolution, authz predicates, bootstrap idempotency → Tasks 2, 3, 2. ✅
- Identity-anchor caveat (editing email revokes access) → documented in spec; behavior falls out of the by-email join (no separate task needed). ✅

**Placeholder scan:** `<prod-domain>` in Task 8 is a deliberate user-supplied value, labelled as such. Task 1 Step 3 is a real verification command, not a TODO. No `TBD`/"handle edge cases"/"similar to Task N" placeholders remain.

**Type consistency:** `AdminPlayer` (types.ts) is produced in Task 2 and consumed by `AuthContext` (Task 3), the hook and gates (Task 5), and the players UI (Task 6). `AuthContext { player, isAdmin }` is defined once (Task 3) and used identically in `app.d.ts`, the hook, and every `require*` call. `addPlayer(db, name, avatar?, email?)` returns `AdminPlayer` consistently across Task 2 and its Task 5 caller. `getPlayerByEmail`/`getPlayersForAdmin`/`updatePlayerAuth`/`promoteInitialAdmin` signatures match between definition (Task 2) and use (Tasks 5, 8). `me` is `{ id, name, avatar } | null` in both the layout load (Task 5) and Nav (Task 7).

**One risk flagged for the implementer:** the exact Better Auth table columns can drift by version — Task 1 Step 3 pins `auth-schema.ts` to the installed version before generating the migration. Do not skip it.
