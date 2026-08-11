# Admin Role + Delete Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin password tier (a superset of the normal password) that can manage players and delete games from a new admin-only `/games` page; the normal password can only log games.

**Architecture:** Encode a role (`authorized`/`admin`) in the existing signed `mb_auth` cookie via the HMAC payload. Gate player management + game deletion behind `requireAdmin`. Add a `deleteGame` query and a `/games` management page. Expose `isAdmin` through a layout load so the nav can show a Games link.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Drizzle + Postgres, Vitest.

## Global Constraints

- Admin is a strict superset of normal: `isAuthed` accepts either role; `isAdmin` accepts only admin.
- `ADMIN_PASSWORD` is server-only (never `PUBLIC_`, never committed). An unset/empty admin password must never authenticate anyone as admin.
- Deleting a game is a hard delete (participants cascade via the existing FK); ratings recompute from games on load — no rating bookkeeping.
- `pnpm check` 0/0, `pnpm lint` clean, full vitest suite green.
- Commit under the repo-local identity; commit/push only when asked.

---

### Task 1: Auth roles + admin env

**Files:**
- Modify: `src/lib/server/auth.ts`
- Test: `src/lib/server/auth.test.ts`
- Modify: `.env` (local, gitignored), `.env.example` (tracked)

**Interfaces:**
- Produces: `type Role = 'authorized' | 'admin'`; `authenticate(input): Role | null`; `cookieValue(role?: Role): string`; `isAuthed(cookies): boolean`; `isAdmin(cookies): boolean`; `requireAuth(cookies): void`; `requireAdmin(cookies): void`.

- [ ] **Step 1: Rewrite the auth tests**

Replace `src/lib/server/auth.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		MINDBUG_PASSWORD: 'hunter2',
		ADMIN_PASSWORD: 'admin-pw',
		AUTH_SECRET: 'test-secret'
	}
}));
import { vi } from 'vitest';

describe('authenticate', () => {
	it('maps each password to its role and rejects unknown input', async () => {
		const { authenticate } = await import('./auth');
		expect(authenticate('admin-pw')).toBe('admin');
		expect(authenticate('hunter2')).toBe('authorized');
		expect(authenticate('nope')).toBe(null);
		expect(authenticate('')).toBe(null);
	});
});

describe('cookie roles', () => {
	it('isAdmin accepts only the admin value; isAuthed accepts both', async () => {
		const { cookieValue, isAuthed, isAdmin, AUTH_COOKIE } = await import('./auth');
		const asAdmin = { get: (n: string) => (n === AUTH_COOKIE ? cookieValue('admin') : undefined) };
		const asUser = {
			get: (n: string) => (n === AUTH_COOKIE ? cookieValue('authorized') : undefined)
		};
		const tampered = { get: (n: string) => (n === AUTH_COOKIE ? 'deadbeef' : undefined) };
		const none = { get: () => undefined };

		expect(isAdmin(asAdmin)).toBe(true);
		expect(isAdmin(asUser)).toBe(false);
		expect(isAuthed(asAdmin)).toBe(true);
		expect(isAuthed(asUser)).toBe(true);
		expect(isAuthed(tampered)).toBe(false);
		expect(isAuthed(none)).toBe(false);
	});
});
```

- [ ] **Step 2: Add a failing test for the empty-admin-password guard**

Append to `src/lib/server/auth.test.ts`:

```ts
describe('authenticate with no admin password', () => {
	it('never grants admin when ADMIN_PASSWORD is empty', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { MINDBUG_PASSWORD: 'hunter2', ADMIN_PASSWORD: '', AUTH_SECRET: 'test-secret' }
		}));
		const { authenticate } = await import('./auth');
		expect(authenticate('')).toBe(null);
		expect(authenticate('hunter2')).toBe('authorized');
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
	});
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `pnpm exec vitest run src/lib/server/auth.test.ts`
Expected: FAIL (`authenticate`/`isAdmin`/`cookieValue(role)` don't exist yet).

- [ ] **Step 4: Implement roles in `auth.ts`**

Replace the body of `src/lib/server/auth.ts` (keep imports + `AUTH_COOKIE` + `safeEqual` + `authCookieOptions`):

```ts
export type Role = 'authorized' | 'admin';

export function cookieValue(role: Role = 'authorized'): string {
	return createHmac('sha256', env.AUTH_SECRET ?? '')
		.update(role)
		.digest('hex');
}

/** Which role a submitted password grants, or null. Admin wins if both match;
    an empty ADMIN_PASSWORD never authenticates anyone as admin. */
export function authenticate(input: string): Role | null {
	const admin = env.ADMIN_PASSWORD ?? '';
	if (admin && safeEqual(input, admin)) return 'admin';
	if (safeEqual(input, env.MINDBUG_PASSWORD ?? '')) return 'authorized';
	return null;
}

export function isAuthed(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	if (value === undefined) return false;
	return safeEqual(value, cookieValue('authorized')) || safeEqual(value, cookieValue('admin'));
}

export function isAdmin(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	return value !== undefined && safeEqual(value, cookieValue('admin'));
}

export function requireAuth(cookies: { get(name: string): string | undefined }): void {
	if (!isAuthed(cookies)) throw redirect(303, '/login');
}

export function requireAdmin(cookies: { get(name: string): string | undefined }): void {
	if (!isAdmin(cookies)) throw redirect(303, '/login');
}
```

Remove the old `verifyPassword` export (its only caller, the login action, moves to `authenticate` in Task 2).

- [ ] **Step 5: Add ADMIN_PASSWORD to env files**

In `.env` add a local value (e.g. `ADMIN_PASSWORD="localadmin"`). In `.env.example` add a documented placeholder:

```
# Higher-privilege password: manage players + delete games. Leave unset to disable admin.
ADMIN_PASSWORD=...
```

- [ ] **Step 6: Run tests + check**

Run: `pnpm exec vitest run src/lib/server/auth.test.ts && pnpm check`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/auth.ts src/lib/server/auth.test.ts .env.example
git commit -m "feat(auth): admin role (authorized/admin) in the signed cookie"
```

(`.env` is gitignored — not committed.)

---

### Task 2: Login issues the right role

**Files:**
- Modify: `src/routes/login/+page.server.ts`

- [ ] **Step 1: Use `authenticate`**

Replace the import and the password check:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { authenticate, cookieValue, AUTH_COOKIE, authCookieOptions } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const role = authenticate(password);
		if (!role) return fail(400, { error: 'Wrong password' });
		cookies.set(AUTH_COOKIE, cookieValue(role), authCookieOptions());
		const requested = url.searchParams.get('redirectTo');
		const to =
			requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/log';
		throw redirect(303, to);
	}
};
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm check && pnpm lint`

```bash
git add src/routes/login/+page.server.ts
git commit -m "feat(auth): login issues admin or authorized cookie by password"
```

---

### Task 3: Player management is admin-only

**Files:**
- Modify: `src/routes/players/+page.server.ts`

- [ ] **Step 1: Gate on admin**

Change the import to `isAdmin, requireAdmin`, set `canEdit: isAdmin(cookies)`, and replace both `requireAuth(cookies)` calls in the `add`/`toggle` actions with `requireAdmin(cookies)`:

```ts
import { isAdmin, requireAdmin } from '$lib/server/auth';
// load:
	return { players: await getPlayers(db), canEdit: isAdmin(cookies) };
// add:  requireAdmin(cookies);
// toggle: requireAdmin(cookies);
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm check && pnpm lint`

```bash
git add src/routes/players/+page.server.ts
git commit -m "feat(auth): restrict player management to admins"
```

---

### Task 4: deleteGame query

**Files:**
- Modify: `src/lib/server/db/queries.ts`
- Test: `src/lib/server/db/queries.test.ts`

**Interfaces:**
- Produces: `deleteGame(db, id: number): Promise<void>`.

- [ ] **Step 1: Write a failing test**

Add `deleteGame` to the imports in `src/lib/server/db/queries.test.ts` and append:

```ts
describe('deleteGame', () => {
	it('removes the game (participants cascade)', async () => {
		const a = await addPlayer(db, 'Ada');
		const b = await addPlayer(db, 'Bo');
		const gid = await insertGame(db, {
			playedAt: '2026-01-01T10:00:00Z',
			format: '1v1',
			winnerSide: 'A',
			sideA: [a.id],
			sideB: [b.id]
		});
		expect((await getAllGames(db)).map((g) => g.id)).toContain(gid);
		await deleteGame(db, gid);
		expect((await getAllGames(db)).map((g) => g.id)).not.toContain(gid);
	});
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm exec vitest run src/lib/server/db/queries.test.ts`
Expected: FAIL (`deleteGame` not exported).

- [ ] **Step 3: Implement**

Append to `src/lib/server/db/queries.ts`:

```ts
export async function deleteGame(db: DB, id: number): Promise<void> {
	await db.delete(games).where(eq(games.id, id));
}
```

(`games` and `eq` are already imported.)

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/lib/server/db/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/queries.ts src/lib/server/db/queries.test.ts
git commit -m "feat(db): deleteGame query"
```

---

### Task 5: The /games management page

**Files:**
- Create: `src/routes/games/+page.server.ts`
- Create: `src/routes/games/+page.svelte`

**Interfaces:**
- Consumes: `requireAdmin`, `getAllGames`, `getPlayers`, `deleteGame`, `creatureFor`, `Toast`.

- [ ] **Step 1: Create the load + delete action**

`src/routes/games/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { getAllGames, getPlayers, deleteGame } from '$lib/server/db/queries';
import { creatureFor } from '$lib/creatures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	requireAdmin(cookies);
	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (id: number) => ({
		name: nameById.get(id) ?? `#${id}`,
		emoji: creatureFor(id, avatarById.get(id))
	});
	const rows = [...games]
		.sort((a, b) => (a.playedAt === b.playedAt ? b.id - a.id : a.playedAt < b.playedAt ? 1 : -1))
		.map((g) => ({
			id: g.id,
			playedAt: g.playedAt,
			format: g.format,
			winnerSide: g.winnerSide,
			sideA: g.sideA.map(resolve),
			sideB: g.sideB.map(resolve)
		}));
	return { games: rows };
};

export const actions: Actions = {
	delete: async ({ request, cookies }) => {
		requireAdmin(cookies);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid game' });
		await deleteGame(db, id);
		return { ok: true };
	}
};
```

- [ ] **Step 2: Create the page**

`src/routes/games/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import Toast from '$lib/components/Toast.svelte';
	let { data } = $props();

	let confirmingId = $state<number | null>(null);
	let deletingId = $state<number | null>(null);
	let toast = $state<string | null>(null);

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<h1>Games 🎲</h1>
<p class="sub">Delete a mistaken or joke game. Permanent — ratings recompute automatically.</p>

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

{#if data.games.length === 0}
	<p class="card">No games logged yet.</p>
{:else}
	<div class="log">
		{#each data.games as g (g.id)}
			<div class="card row">
				<div class="mid">
					<div class="line1">
						<span class="fmt">{g.format}</span><span class="date">{fmtDate(g.playedAt)}</span>
					</div>
					<div class="teams">
						<span class="side" class:win={g.winnerSide === 'A'}>
							{#each g.sideA as p (p.name)}<span class="pl"><span class="em">{p.emoji}</span>{p.name}</span>{/each}
						</span>
						<span class="vs">vs</span>
						<span class="side" class:win={g.winnerSide === 'B'}>
							{#each g.sideB as p (p.name)}<span class="pl"><span class="em">{p.emoji}</span>{p.name}</span>{/each}
						</span>
					</div>
				</div>
				<div class="actions">
					{#if confirmingId === g.id}
						<form
							method="POST"
							action="?/delete"
							use:enhance={() => {
								deletingId = g.id;
								return async ({ result, update }) => {
									await update();
									deletingId = null;
									confirmingId = null;
									if (result.type === 'success') toast = 'Game deleted ✓';
								};
							}}
						>
							<input type="hidden" name="id" value={g.id} />
							<span class="q">Delete?</span>
							<button class="btn danger" type="submit" disabled={deletingId === g.id}>
								{#if deletingId === g.id}<span class="spin" aria-hidden="true"></span>{:else}Yes{/if}
							</button>
							<button class="btn secondary" type="button" onclick={() => (confirmingId = null)}
								>Cancel</button
							>
						</form>
					{:else}
						<button class="btn secondary" type="button" onclick={() => (confirmingId = g.id)}
							>🗑 Delete</button
						>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.sub {
		color: var(--onmat-muted);
		font-size: 0.9rem;
		margin: 0.2rem 0 1rem;
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.8rem;
	}
	.mid {
		flex: 1;
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.teams {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.side {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		padding: 0.15rem 0.35rem;
		border-radius: 9px;
	}
	.side.win {
		background: rgba(15, 143, 106, 0.14);
	}
	.pl {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--ink);
	}
	.pl .em {
		font-size: 0.95rem;
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
	}
	.actions form {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.q {
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--ink);
	}
	.btn.danger {
		background: linear-gradient(160deg, #e5604a, #c23b28);
		color: #fff;
	}
</style>
```

- [ ] **Step 3: Verify**

Run: `pnpm check && pnpm lint`
Expected: clean. Manual (admin cookie): `/games` lists games newest-first; Delete → inline "Delete? Yes/Cancel"; Yes removes the row + shows the toast; a normal/no cookie is redirected to `/login`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/games/+page.server.ts src/routes/games/+page.svelte
git commit -m "feat(games): admin-only /games page to delete games"
```

---

### Task 6: Expose isAdmin + Games nav link

**Files:**
- Create: `src/routes/+layout.server.ts`
- Modify: `src/lib/components/Nav.svelte`

**Interfaces:**
- Produces: layout `data.isAdmin` consumed by `Nav` via `page.data.isAdmin`.

- [ ] **Step 1: Layout load**

`src/routes/+layout.server.ts`:

```ts
import { isAdmin } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({ isAdmin: isAdmin(cookies) });
```

- [ ] **Step 2: Conditional nav link**

In `src/lib/components/Nav.svelte`, make `links` reactive to admin status:

```ts
import { page } from '$app/state';
import { resolve } from '$app/paths';

const base = [
	{ href: '/', label: 'Board', icon: '📊' },
	{ href: '/players', label: 'Players', icon: '👾' },
	{ href: '/log', label: 'Log', icon: '➕' }
] as const;
const adminLinks = [{ href: '/games', label: 'Games', icon: '🎲' }] as const;
const links = $derived(page.data.isAdmin ? [...base, ...adminLinks] : [...base]);
```

(The existing `{#each links ...}` and `isActive` helper are unchanged; `isActive('/games')` uses the existing `startsWith` branch.)

- [ ] **Step 3: Verify**

Run: `pnpm check && pnpm lint`
Expected: clean. Manual: admin cookie shows the 🎲 Games nav item; normal/no cookie does not.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.server.ts src/lib/components/Nav.svelte
git commit -m "feat(nav): admin-only Games link via layout isAdmin"
```

---

## Self-Review

- **Spec coverage:** roles in cookie (T1), empty-admin guard (T1), login role issuance (T2), player management → admin (T3), deleteGame (T4), /games page + delete action + confirm + toast (T5), layout isAdmin + nav link (T6). All covered.
- **Placeholder scan:** none — every step has concrete code.
- **Type consistency:** `Role`/`cookieValue(role)`/`authenticate` (T1) are consumed by login (T2); `requireAdmin`/`isAdmin` (T1) used in T3/T5/T6; `deleteGame` signature (T4) matches its call in T5; `data.isAdmin` (T6 layout) matches `page.data.isAdmin` (T6 nav); `/games` route (T5) matches the nav href + `resolve` (T6).
- **Security:** role is derived from the password server-side and encoded as an HMAC over the role string keyed by `AUTH_SECRET`; the client never supplies a role, and forging the admin value requires the secret (see spec).
