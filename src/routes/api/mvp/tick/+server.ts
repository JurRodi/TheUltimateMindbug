import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { processTick } from '$lib/server/mvp';
import { safeEqual } from '$lib/server/secure-compare';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request, locals }) => {
	// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Compare in constant
	// time so a wrong token can't be recovered byte-by-byte via response timing.
	const auth = request.headers.get('authorization');
	if (!env.CRON_SECRET || !auth || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`))
		throw error(401, 'Unauthorized');
	// Skip work entirely while the feature is disabled.
	if (!locals.flags.mvp) return json({ ok: true, skipped: 'mvp disabled' });
	await processTick(db);
	return json({ ok: true });
};
export const GET = handler;
export const POST = handler;
