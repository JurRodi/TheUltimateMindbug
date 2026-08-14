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
