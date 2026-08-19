import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { processTick } from '$lib/server/mvp';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request }) => {
	// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
	const auth = request.headers.get('authorization');
	if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) throw error(401, 'Unauthorized');
	await processTick(db);
	return json({ ok: true });
};
export const GET = handler;
export const POST = handler;
