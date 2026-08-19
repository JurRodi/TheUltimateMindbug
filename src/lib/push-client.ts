import { env } from '$env/dynamic/public';

/** Categories of enable failure, so the UI can show the right help. */
export type PushErrorKind =
	| 'unsupported' // browser has no Push/ServiceWorker support
	| 'unconfigured' // server missing VAPID key
	| 'permission' // user hasn't granted (or has blocked) notifications
	| 'push-service' // browser refused the push service (e.g. Brave's Google push off)
	| 'server' // our /api/push/subscribe rejected it
	| 'unknown';

export type EnableResult = { ok: true } | { ok: false; reason: string; kind: PushErrorKind };

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
		return {
			ok: false,
			kind: 'unsupported',
			reason: "This browser can't show notifications."
		};
	if (!env.PUBLIC_VAPID_KEY)
		return {
			ok: false,
			kind: 'unconfigured',
			reason: "Notifications aren't set up yet — let the admin know."
		};
	try {
		const perm = await Notification.requestPermission();
		if (perm !== 'granted')
			return {
				ok: false,
				kind: 'permission',
				reason:
					perm === 'denied'
						? 'Notifications are blocked for this site.'
						: "You didn't allow notifications."
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
				kind: 'server',
				reason:
					res.status === 401
						? 'Please sign in again to turn on notifications.'
						: `Couldn't save your subscription (error ${res.status}). Please try again.`
			};
		}
		return { ok: true };
	} catch (err) {
		const e = err as { name?: string; message?: string };
		console.error('[push] enable failed', e);
		// Brave (and other Chromium browsers with the push service disabled) reject
		// registration with AbortError / "push service error". Treat that specially so
		// the UI can point the user at the right browser setting.
		const isPushService =
			e.name === 'AbortError' ||
			/push service/i.test(e.message ?? '') ||
			e.name === 'NotAllowedError';
		if (e.name === 'NotAllowedError') {
			return { ok: false, kind: 'permission', reason: 'Notifications are blocked for this site.' };
		}
		return {
			ok: false,
			kind: isPushService ? 'push-service' : 'unknown',
			reason: isPushService
				? "Your browser's notification service is turned off."
				: "Couldn't turn on notifications — something went wrong."
		};
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
