import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/server/scheduler', () => ({ startScheduler: vi.fn() }));

async function setup(email: string | null, pathname = '/admin', method = 'GET') {
	vi.stubEnv('CONFIG_JSON', JSON.stringify({ admins: ['mckoss@gmail.com'], session_secret: 'local-test-only', scheduler: false }));
	vi.stubEnv('DTW_NO_AUTH', '0');
	vi.resetModules();
	const session = await import('../../src/lib/server/session');
	const { handle } = await import('../../src/hooks.server');
	const url = new URL(pathname, 'https://example.test');
	const token = email ? session.encodeSession({ email, name: null }) : undefined;
	const event = { url, request: new Request(url, { method }), locals: {}, cookies: { get: () => token } } as unknown as RequestEvent;
	const resolve = vi.fn(async () => new Response('admin content'));
	return { handle, event, resolve };
}

afterEach(() => vi.unstubAllEnvs());

describe('admin access and recovery', () => {
	it('allows the configured owner and keeps admin responses private', async () => {
		const args = await setup('mckoss@gmail.com');
		const response = await args.handle(args);
		expect(await response.text()).toBe('admin content');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('sends signed-out visitors to Google with their destination', async () => {
		const args = await setup(null, '/admin/airports');
		await expect(args.handle(args)).rejects.toMatchObject({ status: 303, location: '/auth/google?next=%2Fadmin%2Fairports' });
		expect(args.resolve).not.toHaveBeenCalled();
	});

	it('routes a wrong account to recovery without loading admin data', async () => {
		const args = await setup('wrong@example.com');
		await expect(args.handle(args)).rejects.toMatchObject({ status: 303, location: '/auth/denied' });
		expect(args.resolve).not.toHaveBeenCalled();
		const { load } = await import('../../src/routes/auth/denied/+page.server');
		expect(() => load({ locals: args.event.locals } as never)).toThrow(expect.objectContaining({ status: 403, body: { message: 'Admin access denied.', account: 'wrong@example.com' } }));
	});

	it('rejects unauthorized admin writes before their handlers run', async () => {
		const args = await setup('wrong@example.com', '/admin/airports', 'POST');
		await expect(args.handle(args)).rejects.toMatchObject({ status: 403 });
		expect(args.resolve).not.toHaveBeenCalled();
	});

	it('lets rejected accounts sign out and clears the session', async () => {
		const args = await setup('wrong@example.com', '/auth/signout', 'POST');
		await args.handle(args);
		expect(args.resolve).toHaveBeenCalled();
		const { POST } = await import('../../src/routes/auth/signout/+server');
		const remove = vi.fn();
		expect(() => POST({ cookies: { delete: remove } } as never)).toThrow(expect.objectContaining({ status: 303, location: '/' }));
		expect(remove).toHaveBeenCalledWith('dtw_session', { path: '/' });
	});
});
