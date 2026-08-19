import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { deletePushSubscriptionForPlayer } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const player = locals.auth.player;
	if (!player) throw error(401, 'Not authenticated');
	const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
	if (endpoint) await deletePushSubscriptionForPlayer(db, endpoint, player.id);
	return json({ ok: true });
};
