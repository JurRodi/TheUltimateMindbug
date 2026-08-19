import { env } from '$env/dynamic/public';

export type EnableResult = { ok: true } | { ok: false; reason: string };

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/** Does an existing subscription's applicationServerKey match the current VAPID key?
    A mismatch means it was created under a different key (e.g. a rotated VAPID pair
    or a different deploy) — pushManager.subscribe() would throw InvalidStateError,
    so such a subscription must be dropped and recreated. */
function keyMatches(sub: PushSubscription, appKey: Uint8Array): boolean {
	const existing = sub.options.applicationServerKey;
	if (!existing) return false;
	const a = new Uint8Array(existing);
	if (a.length !== appKey.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== appKey[i]) return false;
	return true;
}

export function pushSupported(): boolean {
	return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushState(): Promise<
	'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'
> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	return sub ? 'subscribed' : 'unsubscribed';
}

export async function enablePush(): Promise<EnableResult> {
	if (!pushSupported())
		return { ok: false, reason: "This browser doesn't support push notifications." };
	if (!env.PUBLIC_VAPID_KEY)
		return {
			ok: false,
			reason: 'Notifications are not configured on the server (missing VAPID key).'
		};
	try {
		const perm = await Notification.requestPermission();
		if (perm !== 'granted')
			return {
				ok: false,
				reason:
					perm === 'denied'
						? 'Notifications are blocked. Enable them in your browser/site settings, then try again.'
						: 'Notification permission was not granted.'
			};

		const reg = await navigator.serviceWorker.ready;
		const appKey = urlBase64ToUint8Array(env.PUBLIC_VAPID_KEY);

		// Reuse an existing subscription only if it was made with the CURRENT key;
		// otherwise drop it and make a fresh one (avoids InvalidStateError and stale
		// endpoints the server can no longer push to).
		let sub = await reg.pushManager.getSubscription();
		if (sub && !keyMatches(sub, appKey)) {
			await sub.unsubscribe();
			sub = null;
		}
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: appKey
			});
		}

		const res = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});
		if (!res.ok) {
			return {
				ok: false,
				reason:
					res.status === 401
						? "Couldn't save the subscription — you may need to sign in again."
						: `Couldn't save the subscription (server returned ${res.status}).`
			};
		}
		return { ok: true };
	} catch (err) {
		const e = err as { name?: string; message?: string };
		console.error('[push] enable failed', e);
		return { ok: false, reason: `Couldn't subscribe: ${e.name ?? 'Error'} — ${e.message ?? err}` };
	}
}

export async function disablePush(): Promise<void> {
	if (!pushSupported()) return;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	if (sub) {
		await fetch('/api/push/unsubscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: sub.endpoint })
		}).catch(() => {});
		await sub.unsubscribe();
	}
}
