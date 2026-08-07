/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `mindbug-cache-${version}`;
const ASSETS = [...build, ...files];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	// Never cache navigations/data — always try network first so the board stays fresh.
	if (url.origin !== location.origin || req.mode === 'navigate') return;
	event.respondWith(
		caches.match(req).then((cached) => cached ?? fetch(req))
	);
});
