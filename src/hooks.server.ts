import { building } from '$app/environment';
import { startScheduler } from '$lib/server/scheduler';
import { decodeSession, SESSION_COOKIE } from '$lib/server/session';
import { isAdmin, openMode, SCHEDULER_ENABLED } from '$lib/server/config';
import { error, redirect, type Handle, type ServerInit } from '@sveltejs/kit';

let warnedOpen = false;

export const init: ServerInit = async () => {
	if (building || !SCHEDULER_ENABLED) return;
	startScheduler((m) => console.log(`[pipeline] ${m}`));
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = decodeSession(event.cookies.get(SESSION_COOKIE));
	if (openMode()) {
		if (!warnedOpen) {
			console.warn('[auth] DTW_NO_AUTH is set — /admin is OPEN with a synthetic admin');
			warnedOpen = true;
		}
		event.locals.user = { email: 'open@localhost', name: 'Open mode', exp: Number.MAX_SAFE_INTEGER };
	}
	const adminPath = event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/');
	if (adminPath && !openMode()) {
		if (!event.locals.user) redirect(303, `/auth/google?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
		if (!isAdmin(event.locals.user.email)) error(403, 'This account is not authorised for admin.');
	}
	const response = await resolve(event);
	if (event.url.pathname.startsWith('/admin') || event.url.pathname.startsWith('/auth')) {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
		response.headers.set('cache-control', 'no-store');
	}
	return response;
};
