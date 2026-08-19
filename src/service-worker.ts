/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `mindbug-cache-${version}`;
const ASSETS = [...build, ...files];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	// Never cache navigations/data — always try network first so the board stays fresh.
	if (url.origin !== location.origin || req.mode === 'navigate') return;
	event.respondWith(caches.match(req).then((cached) => cached ?? fetch(req)));
});

// --- Web Push (MVP voting) ---
sw.addEventListener('push', (event) => {
	const data = (() => {
		try {
			return event.data?.json() ?? {};
		} catch {
			return {};
		}
	})() as {
		title?: string;
		body?: string;
		url?: string;
	};
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Mindbug', {
			body: data.body ?? '',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url ?? '/mvp' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data as { url?: string })?.url ?? '/mvp';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const c of clients) {
				if (c.url.includes(url) && 'focus' in c) return c.focus();
			}
			return sw.clients.openWindow(url);
		})
	);
});
