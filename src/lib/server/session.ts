/**
 * Signed session cookie (HMAC-SHA256, no server-side store). Payload is the
 * signed-in user's email and an expiry. Only admins ever get a session.
 */
import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { config } from './config';

export const SESSION_COOKIE = 'dtw_session';
const SESSION_DAYS = 14;

export interface SessionUser {
	email: string;
	name: string | null;
	exp: number;
}

let ephemeralSecret: string | null = null;
function secret(): string {
	const s = config().session_secret;
	if (s) return s;
	if (!ephemeralSecret) {
		ephemeralSecret = crypto.randomBytes(32).toString('hex');
		console.warn('[session] no session_secret in config — sessions will not survive a restart');
	}
	return ephemeralSecret;
}

function sign(data: string): string {
	return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function encodeSession(user: Omit<SessionUser, 'exp'>, now = Date.now()): string {
	const payload = Buffer.from(JSON.stringify({ ...user, exp: now + SESSION_DAYS * 86_400_000 })).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): SessionUser | null {
	if (!token) return null;
	const i = token.lastIndexOf('.');
	if (i < 0) return null;
	const payload = token.slice(0, i),
		sig = token.slice(i + 1);
	const expected = sign(payload);
	if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
	try {
		const u = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser;
		if (typeof u.email !== 'string' || typeof u.exp !== 'number' || u.exp < now) return null;
		return u;
	} catch {
		return null;
	}
}

export function setSessionCookie(cookies: Cookies, user: Omit<SessionUser, 'exp'>, secure: boolean) {
	cookies.set(SESSION_COOKIE, encodeSession(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: SESSION_DAYS * 86_400
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
