import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const base = { api_key: 'k', admins: ['Admin@Example.com ', 'second@example.com'], session_secret: 'test-secret', google: { client_id: 'cid', client_secret: 'cs' } };

async function load(configJson: unknown) {
	vi.stubEnv('CONFIG_JSON', JSON.stringify(configJson));
	vi.stubEnv('NODE_ENV', 'test');
	vi.resetModules();
	const cfg = await import('../../src/lib/server/config');
	cfg.resetConfigCache();
	const session = await import('../../src/lib/server/session');
	const google = await import('../../src/lib/server/google');
	return { cfg, session, google };
}

describe('config', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('loads from CONFIG_JSON and normalises admin emails', async () => {
		const { cfg } = await load(base);
		expect(cfg.config().admins).toEqual(['admin@example.com', 'second@example.com']);
		expect(cfg.isAdmin('ADMIN@example.com')).toBe(true);
		expect(cfg.isAdmin('someone@else.com')).toBe(false);
		expect(cfg.isAdmin(null)).toBe(false);
	});

	it('FLIGHTAWARE_API_KEY env overrides the config key', async () => {
		vi.stubEnv('FLIGHTAWARE_API_KEY', 'override');
		const { cfg } = await load(base);
		expect(cfg.config().api_key).toBe('override');
	});

	it('google is undefined unless both client fields are present', async () => {
		const { cfg } = await load({ ...base, google: { client_id: 'x' } });
		expect(cfg.config().google).toBeUndefined();
	});

	it('open mode only with DTW_NO_AUTH', async () => {
		const { cfg } = await load(base);
		expect(cfg.openMode()).toBe(false);
		vi.stubEnv('DTW_NO_AUTH', '1');
		expect(cfg.openMode()).toBe(true);
	});
});

describe('session cookie', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('round-trips and enforces expiry', async () => {
		const { session } = await load(base);
		const now = 1_700_000_000_000;
		const tok = session.encodeSession({ email: 'admin@example.com', name: 'Mike' }, now);
		expect(session.decodeSession(tok, now + 1000)?.email).toBe('admin@example.com');
		expect(session.decodeSession(tok, now + 15 * 86_400_000)).toBeNull();
	});

	it('rejects tampered payloads, bad signatures and garbage', async () => {
		const { session } = await load(base);
		const tok = session.encodeSession({ email: 'admin@example.com', name: null });
		const [payload, sig] = tok.split('.');
		const forged = Buffer.from(JSON.stringify({ email: 'evil@x.com', exp: Date.now() + 1e9 })).toString('base64url');
		expect(session.decodeSession(`${forged}.${sig}`)).toBeNull();
		expect(session.decodeSession(`${payload}.${sig.slice(1)}x`)).toBeNull();
		expect(session.decodeSession('nonsense')).toBeNull();
		expect(session.decodeSession(undefined)).toBeNull();
	});

	it('a token signed with a different secret is rejected', async () => {
		const a = await load(base);
		const tok = a.session.encodeSession({ email: 'admin@example.com', name: null });
		const b = await load({ ...base, session_secret: 'other' });
		expect(b.session.decodeSession(tok)).toBeNull();
	});
});

describe('google oauth', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('builds an authorization url with state and redirect', async () => {
		const { google } = await load(base);
		const url = new URL(google.authorizationUrl('http://localhost:5173', 'st8'));
		expect(url.origin).toBe('https://accounts.google.com');
		expect(url.searchParams.get('client_id')).toBe('cid');
		expect(url.searchParams.get('state')).toBe('st8');
		expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/auth/google/callback');
		expect(url.searchParams.get('scope')).toContain('email');
	});

	it('public_origin overrides the callback origin', async () => {
		const { google } = await load({ ...base, public_origin: 'https://darktowerwatch.org' });
		expect(google.redirectUri('http://localhost:5173')).toBe('https://darktowerwatch.org/auth/google/callback');
	});

	it('exchangeCode validates id_token audience/issuer and returns the email', async () => {
		const { google } = await load(base);
		const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
		const fetchFn = (async (_url: string, init?: RequestInit) => {
			expect(String(init?.body)).toContain('grant_type=authorization_code');
			return new Response(JSON.stringify({ id_token: jwt({ iss: 'https://accounts.google.com', aud: 'cid', email: 'admin@example.com', email_verified: true, name: 'Mike' }) }));
		}) as unknown as typeof fetch;
		const u = await google.exchangeCode('http://localhost', 'code', fetchFn);
		expect(u).toEqual({ email: 'admin@example.com', email_verified: true, name: 'Mike' });

		const bad = (async () => new Response(JSON.stringify({ id_token: jwt({ iss: 'https://accounts.google.com', aud: 'someone-else', email: 'x@y.z' }) }))) as unknown as typeof fetch;
		await expect(google.exchangeCode('http://localhost', 'code', bad)).rejects.toThrow(/audience/);
	});
});
