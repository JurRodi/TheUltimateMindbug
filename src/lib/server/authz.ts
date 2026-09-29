import { redirect } from '@sveltejs/kit';
import type { AdminPlayer } from '$lib/types';
import type { FlagKey, Flags } from '$lib/flags';

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

/** Redirect to the board when a feature flag is off — for routes that only
    exist while their feature is enabled. */
export function requireFlag(flags: Flags, key: FlagKey): void {
	if (!flags[key]) throw redirect(303, '/');
}
