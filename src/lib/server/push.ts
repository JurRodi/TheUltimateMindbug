import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { deletePushSubscription, getSubscriptionsForPlayers, type DB } from './db/queries';

let configured = false;
function configure() {
	if (configured) return;
	if (!env.VAPID_PRIVATE_KEY || !pub.PUBLIC_VAPID_KEY) return;
	webpush.setVapidDetails(
		env.VAPID_SUBJECT || 'mailto:admin@example.com',
		pub.PUBLIC_VAPID_KEY,
		env.VAPID_PRIVATE_KEY
	);
	configured = true;
}

export type PushPayload = { title: string; body: string; url: string };

export async function sendToPlayers(
	db: DB,
	playerIds: number[],
	payload: PushPayload
): Promise<void> {
	configure();
	if (!configured) return; // push not set up in this environment — no-op
	const subs = await getSubscriptionsForPlayers(db, playerIds);
	await Promise.all(
		subs.map(async (s) => {
			try {
				await webpush.sendNotification(
					{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
					JSON.stringify(payload)
				);
			} catch (err) {
				const code = (err as { statusCode?: number }).statusCode;
				if (code === 404 || code === 410)
					await deletePushSubscription(db, s.endpoint); // gone
				else console.error('[push] send failed', code);
			}
		})
	);
}
