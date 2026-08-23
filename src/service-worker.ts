/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `dtw-${version}`;
/** App shell: built assets plus everything in /static. */
const SHELL = [...build, ...files];
const SHELL_SET = new Set(SHELL);
const OFFLINE_URL = '/';

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(SHELL);
			// Cached home page doubles as the offline fallback for navigations.
			try {
				await cache.add(OFFLINE_URL);
			} catch {
				/* offline at install time; the fallback fills in on first successful navigation */
			}
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

async function networkFirst(request: Request, fallback?: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const res = await fetch(request);
		if (res.ok) cache.put(request, res.clone());
		return res;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		if (fallback) {
			const fb = await cache.match(fallback);
			if (fb) return fb;
		}
		return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const res = await fetch(request);
	if (res.ok) cache.put(request, res.clone());
	return res;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);

	// Basemap tiles: never cache, just pass through.
	if (url.hostname.endsWith('cartocdn.com')) return;
	// Other cross-origin requests (fonts etc.) are left to the browser.
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, OFFLINE_URL));
		return;
	}
	if (url.pathname.startsWith('/api/')) {
		event.respondWith(networkFirst(request));
		return;
	}
	if (SHELL_SET.has(url.pathname) || url.pathname.startsWith('/_app/')) {
		event.respondWith(cacheFirst(request));
		return;
	}
	event.respondWith(networkFirst(request));
});
