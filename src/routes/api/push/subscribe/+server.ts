import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { savePushSubscription } from '$lib/server/db/queries';
import { isAllowedPushEndpoint } from '$lib/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const player = locals.auth.player;
	if (!player) throw error(401, 'Not authenticated');
	const sub = (await request.json().catch(() => null)) as {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	} | null;
	if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth)
		throw error(400, 'Invalid subscription');
	// The endpoint gets server-side POSTs later; only accept real push gateways.
	if (!isAllowedPushEndpoint(sub.endpoint)) throw error(400, 'Invalid subscription');
	await savePushSubscription(db, {
		playerId: player.id,
		endpoint: sub.endpoint,
		p256dh: sub.keys.p256dh,
		auth: sub.keys.auth
	});
	return json({ ok: true });
};
