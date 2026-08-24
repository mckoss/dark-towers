import { exchangeCode } from '$lib/server/google';
import { setSessionCookie } from '$lib/server/session';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies, fetch }) => {
	const raw = cookies.get('dtw_oauth');
	cookies.delete('dtw_oauth', { path: '/auth' });
	let saved: { state: string; next: string } | null = null;
	try {
		saved = raw ? JSON.parse(raw) : null;
	} catch {
		saved = null;
	}
	const state = url.searchParams.get('state');
	const code = url.searchParams.get('code');
	if (!saved || !state || !code || state !== saved.state) error(400, 'Sign-in could not be verified. Please try again.');

	let user;
	try {
		user = await exchangeCode(url.origin, code, fetch);
	} catch (e) {
		console.error('[auth]', e);
		error(502, 'Google sign-in failed.');
	}
	if (!user.email_verified) error(403, 'Google reports this email as unverified.');
	setSessionCookie(cookies, { email: user.email.toLowerCase(), name: user.name }, url.protocol === 'https:');
	redirect(303, saved.next || '/admin');
};
