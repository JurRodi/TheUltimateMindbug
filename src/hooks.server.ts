import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/betterauth';
import { db } from '$lib/server/db';
import { getPlayerByEmail } from '$lib/server/db/queries';

export const handle: Handle = async ({ event, resolve }) => {
	// Resolve the Google identity to one of our players (join by verified email).
	// The /api/auth/* endpoints themselves are served by the catch-all route at
	// src/routes/api/auth/[...all], which calls auth.handler directly.
	const session = await auth.api.getSession({ headers: event.request.headers });
	const email = session?.user?.email ?? null;
	const player = email ? await getPlayerByEmail(db, email) : null;
	event.locals.auth = { player, isAdmin: !!player?.isAdmin };

	return resolve(event);
};
