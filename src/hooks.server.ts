import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/betterauth';
import { db } from '$lib/server/db';
import { getPlayerByEmail, getFlags } from '$lib/server/db/queries';

export const handle: Handle = async ({ event, resolve }) => {
	// Resolve the Google identity to one of our players (join by verified email).
	// The /api/auth/* endpoints themselves are served by the catch-all route at
	// src/routes/api/auth/[...all], which calls auth.handler directly.
	const session = await auth.api.getSession({ headers: event.request.headers });
	const email = session?.user?.email ?? null;
	const player = email ? await getPlayerByEmail(db, email) : null;
	event.locals.auth = { player, isAdmin: !!player?.isAdmin };
	// Resolve feature flags once per request so every load/action reads the same
	// snapshot from `locals.flags` without its own query.
	event.locals.flags = await getFlags(db);

	return resolve(event);
};
