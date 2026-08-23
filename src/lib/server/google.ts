/** Google OAuth 2.0 web flow, no library. */
import crypto from 'node:crypto';
import { settings } from './settings';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function googleConfigured(): boolean {
	return !!settings().google;
}

export function redirectUri(requestOrigin: string): string {
	return `${settings().public_origin ?? requestOrigin}/auth/google/callback`;
}

export function newState(): string {
	return crypto.randomBytes(16).toString('base64url');
}

export function authorizationUrl(requestOrigin: string, state: string): string {
	const g = settings().google;
	if (!g) throw new Error('Google sign-in is not configured');
	const q = new URLSearchParams({
		client_id: g.client_id,
		redirect_uri: redirectUri(requestOrigin),
		response_type: 'code',
		scope: 'openid email profile',
		state,
		prompt: 'select_account'
	});
	return `${AUTH_URL}?${q}`;
}

export interface GoogleUser {
	email: string;
	email_verified: boolean;
	name: string | null;
}

export async function exchangeCode(requestOrigin: string, code: string, fetchFn: typeof fetch = fetch): Promise<GoogleUser> {
	const g = settings().google;
	if (!g) throw new Error('Google sign-in is not configured');
	const res = await fetchFn(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: g.client_id,
			client_secret: g.client_secret,
			redirect_uri: redirectUri(requestOrigin),
			grant_type: 'authorization_code'
		})
	});
	if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
	const tok = (await res.json()) as { id_token?: string };
	if (!tok.id_token) throw new Error('Google did not return an id_token');
	// The id_token arrived directly from Google's token endpoint over TLS, so
	// (per OIDC Core §3.1.3.7) its signature need not be re-verified; we still
	// check the audience and issuer before trusting the claims.
	const u = decodeIdToken(tok.id_token);
	if (u.aud !== g.client_id) throw new Error('id_token audience mismatch');
	if (u.iss !== 'https://accounts.google.com' && u.iss !== 'accounts.google.com') throw new Error('id_token issuer mismatch');
	if (!u.email) throw new Error('Google did not return an email');
	return { email: u.email, email_verified: !!u.email_verified, name: u.name ?? null };
}

export interface IdTokenClaims {
	iss?: string;
	aud?: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	exp?: number;
}

export function decodeIdToken(jwt: string): IdTokenClaims {
	const parts = jwt.split('.');
	if (parts.length !== 3) throw new Error('malformed id_token');
	return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims;
}
