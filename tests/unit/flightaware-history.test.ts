import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshDataDir } from './helpers/server-env';

async function load(history: boolean) {
	freshDataDir('fa-history');
	vi.stubEnv('CONFIG_JSON', JSON.stringify({ api_key: 'k', aeroapi_history: history }));
	vi.resetModules();
	const cfg = await import('../../src/lib/server/config');
	cfg.resetConfigCache();
	return await import('../../src/lib/server/flightaware');
}

const OLD_ID = 'N11571-1700000000-adhoc-1p'; // Nov 2023 — far outside the live window
const NEW_ID = `N11571-${Math.floor(Date.now() / 1000) - 3600}-adhoc-2p`;

describe('AeroAPI history handling', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('parses the timestamp embedded in a fa_flight_id', async () => {
		const fa = await load(false);
		expect(fa.flightIdTime(OLD_ID)).toBe(1_700_000_000_000);
		expect(fa.flightIdTime('QXE2116-1786523418-airline-60p')).toBe(1_786_523_418_000);
		expect(fa.flightIdTime('garbage')).toBeNull();
	});

	it('without history: a cached "too old" miss is returned without any network call', async () => {
		const fa = await load(false);
		fa.storeTrack('KPAE', OLD_ID, { positions: [], _error: 'too old' });
		const spy = vi.spyOn(globalThis, 'fetch');
		const t = await fa.fetchTrack('KPAE', OLD_ID);
		expect(t._error).toBe('too old');
		expect(spy).not.toHaveBeenCalled();
	});

	it('with history: the miss is retried via the /history/ endpoint and the result replaces it', async () => {
		const fa = await load(true);
		fa.storeTrack('KPAE', OLD_ID, { positions: [], _error: 'too old' });
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			expect(String(url)).toContain('/aeroapi/history/flights/');
			return new Response(JSON.stringify({ positions: [{ altitude: 10, groundspeed: 90, heading: 1, latitude: 47.9, longitude: -122.3, timestamp: '2023-11-14T22:13:20Z' }] }));
		});
		const t = await fa.fetchTrack('KPAE', OLD_ID);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(t.positions).toHaveLength(1);
		// The cache now holds the real track, so a second fetch is served from disk.
		const again = await fa.fetchTrack('KPAE', OLD_ID);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(again._error).toBeUndefined();
	});

	it('recent flights always use the live endpoint, history enabled or not', async () => {
		const fa = await load(true);
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			expect(String(url)).toContain('/aeroapi/flights/');
			expect(String(url)).not.toContain('/history/');
			return new Response(JSON.stringify({ positions: [] }));
		});
		await fa.fetchTrack('KPAE', NEW_ID);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('without history: an old flight-list window is refused before any network call', async () => {
		const fa = await load(false);
		const spy = vi.spyOn(globalThis, 'fetch');
		const start = Date.parse('2024-06-20T04:00:00Z');
		await expect(fa.fetchFlights('KPAE', '2024-06-19', start, start + 36_000_000)).rejects.toThrow(/extended history/);
		expect(spy).not.toHaveBeenCalled();
	});
});
