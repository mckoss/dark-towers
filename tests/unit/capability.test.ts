import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDataDir } from './helpers/server-env';

describe('AeroAPI capability probe', () => {
	beforeEach(() => {
		freshDataDir('cap');
		vi.stubEnv('FLIGHTAWARE_API_KEY', 'test-key-1');
		vi.resetModules();
	});
	afterEach(() => vi.unstubAllEnvs());

	async function load() {
		const cfg = await import('../../src/lib/server/config');
		cfg.resetConfigCache();
		return import('../../src/lib/server/capability');
	}

	it('records extended history as available on a 200 and not available on a 403, per key', async () => {
		const cap = await load();
		expect(cap.extendedHistoryAllowed()).toBe(false);
		const ok = vi.fn(async () => new Response(JSON.stringify({ arrivals: [] }), { status: 200 }));
		const r1 = await cap.probeCapability({ fetchImpl: ok as unknown as typeof fetch });
		expect(r1?.extendedHistory).toBe(true);
		expect(String((ok.mock.calls[0] as unknown[])[0])).toMatch(/\/history\/airports\/KPAE\/flights\/arrivals\?start=/);
		expect(cap.extendedHistoryAllowed()).toBe(true);
		expect(cap.cachedCapability()?.key).toBe(cap.keyFingerprint());

		const denied = vi.fn(async () => new Response(JSON.stringify({ title: 'Forbidden', detail: 'not permitted on this tier' }), { status: 403 }));
		const r2 = await cap.probeCapability({ fetchImpl: denied as unknown as typeof fetch });
		expect(r2?.extendedHistory).toBe(false);
		expect(r2?.detail).toMatch(/403.*not permitted/);
		expect(cap.extendedHistoryAllowed()).toBe(false);
	});

	it('a rate limit or outage leaves the cached answer alone', async () => {
		const cap = await load();
		await cap.probeCapability({ fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
		const r = await cap.probeCapability({ fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch });
		expect(r?.extendedHistory).toBe(true);
		const r2 = await cap.probeCapability({ fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
		expect(r2?.extendedHistory).toBe(true);
	});

	it('a different key starts unknown; the config flag overrides the probe', async () => {
		let cap = await load();
		await cap.probeCapability({ fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
		vi.stubEnv('FLIGHTAWARE_API_KEY', 'test-key-2');
		vi.resetModules();
		cap = await load();
		expect(cap.cachedCapability()).toBeNull();
		expect(cap.extendedHistoryAllowed()).toBe(false);
		vi.stubEnv('CONFIG_JSON', JSON.stringify({ aeroapi_history: true }));
		vi.resetModules();
		cap = await load();
		expect(cap.extendedHistoryAllowed()).toBe(true);
	});
});
