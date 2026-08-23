import { authorizationUrl, googleConfigured, newState } from '$lib/server/google';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';

/** Start the Google sign-in. Only a same-origin `next` path is honoured. */
export const GET: RequestHandler = ({ url, cookies }) => {
	if (!googleConfigured()) error(503, 'Sign-in is not configured on this server.');
	const next = url.searchParams.get('next') ?? '/admin';
	const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
	const state = newState();
	cookies.set('dtw_oauth', JSON.stringify({ state, next: safeNext }), { path: '/auth', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600 });
	redirect(302, authorizationUrl(url.origin, state));
};
