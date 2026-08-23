import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fromLocalNm, type LatLon } from '$lib/geo';
import type { RawFlight, RawPosition, RawTrack } from '$lib/server/flightaware';
import { freshDataDir } from './helpers/server-env';

const dataDir = freshDataDir('ingest');
const fa = await import('$lib/server/flightaware');
const dbm = await import('$lib/server/db');
const { ingestNight } = await import('$lib/server/pipeline');

const ORIGIN: LatLon = [47.9079, -122.2816];
const NIGHT = '2026-08-14';
const T0 = Date.UTC(2026, 7, 15, 5, 0, 0); // 22:00 PDT

function raw(id: string, ident: string, reg: string, over: Partial<RawFlight> = {}): RawFlight {
	return {
		ident,
		fa_flight_id: id,
		operator: null,
		operator_icao: null,
		registration: reg,
		aircraft_type: 'C172',
		type: 'General_Aviation',
		origin: { code: 'KBFI', code_icao: 'KBFI', code_iata: 'BFI', code_lid: 'BFI', name: 'Boeing Field', city: 'Seattle', timezone: 'America/Los_Angeles' },
		destination: { code: 'KPAE', code_icao: 'KPAE', code_iata: 'PAE', code_lid: 'PAE', name: 'Paine Field', city: 'Everett', timezone: 'America/Los_Angeles' },
		actual_off: '2026-08-15T04:40:00Z',
		actual_on: '2026-08-15T05:06:00Z',
		estimated_off: null,
		estimated_on: null,
		scheduled_off: null,
		scheduled_on: null,
		_source: 'arrival',
		...over
	};
}

/** Straight line in local NM, 10 s samples, 300 s long. */
function track(from: [number, number], to: [number, number], altHundreds: number): RawTrack {
	const positions: RawPosition[] = [];
	for (let s = 0; s <= 300; s += 10) {
		const u = s / 300;
		const [lat, lon] = fromLocalNm(ORIGIN, [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u]);
		positions.push({ altitude: altHundreds, groundspeed: 120, heading: 90, latitude: lat, longitude: lon, timestamp: new Date(T0 + s * 1000).toISOString() });
	}
	return { positions };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
		throw new Error('network must not be used');
	});
	fa.storeFlights('KPAE', NIGHT, [
		raw('N111AA-1755234000-adhoc-0', 'N111AA', 'N111AA'),
		raw('N222BB-1755234000-adhoc-0', 'N222BB', 'N222BB', { actual_on: '2026-08-15T05:07:00Z' }),
		// A third flight that appears twice in the list (arrival + departure overlap) and has no cached track.
		raw('N333CC-1755234000-adhoc-0', 'N333CC', 'N333CC', { actual_on: '2026-08-15T06:00:00Z' }),
		raw('N333CC-1755234000-adhoc-0', 'N333CC', 'N333CC', { _source: 'departure', actual_off: '2026-08-15T06:00:00Z' })
	]);
	fa.storeTrack('KPAE', 'N111AA-1755234000-adhoc-0', track([-5, 0], [5, 0], 20));
	fa.storeTrack('KPAE', 'N222BB-1755234000-adhoc-0', track([5, 0.5], [-5, 0.5], 20));
	dbm.openMemoryDb();
});

afterAll(() => {
	fetchSpy.mockRestore();
	fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('ingestNight offline is idempotent', () => {
	it('produces the same rows and summary when run twice without touching the network', async () => {
		const logs: string[] = [];
		const first = await ingestNight('PAE', NIGHT, { offline: true, log: (m) => logs.push(m) });
		const second = await ingestNight('PAE', NIGHT, { offline: true, log: (m) => logs.push(m) });

		expect(first.skipped).toBe(false);
		expect(first.apiCalls).toBe(0);
		expect(first.flights).toBe(3);
		expect(first.arrivals).toBe(3);
		expect(first.departures).toBe(0);
		expect(first.private).toBe(3);
		expect(first.airline).toBe(0);
		expect(first.positions).toBe(62);
		expect(first.incidents).toBe(1);
		// The third flight has no cached track, so the night is not complete.
		expect(first.complete).toBe(false);
		expect(second).toEqual(first);

		const d = dbm.db();
		const flightRows = d.prepare('SELECT id, COUNT(*) n FROM flights GROUP BY id').all() as { id: string; n: number }[];
		expect(flightRows).toHaveLength(3);
		expect(flightRows.every((r) => r.n === 1)).toBe(true);
		expect(dbm.flightById('N111AA-1755234000-adhoc-0')!.positions).toHaveLength(31);
		expect(dbm.flightById('N333CC-1755234000-adhoc-0')!.positions).toHaveLength(0);

		const incidents = dbm.incidentsForNight('KPAE', NIGHT);
		expect(incidents).toHaveLength(1);
		expect(incidents[0].severity).toBe('very-close');
		expect(incidents[0].lateralNm).toBeCloseTo(0.5, 1);
		expect(d.prepare('SELECT COUNT(*) n FROM incidents').get()).toEqual({ n: 1 });
		expect(incidents[0].id).toMatch(/^PAE-20260814-/);

		// Run a third time and the incident id is unchanged.
		await ingestNight('PAE', NIGHT, { offline: true });
		expect(dbm.incidentsForNight('KPAE', NIGHT)[0].id).toBe(incidents[0].id);

		expect(dbm.nightSummary('KPAE', NIGHT)).toMatchObject({ flights: 3, incidents: 1, positions: 62, complete: false });
		expect(dbm.latestNight('KPAE')).toBeNull();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logs.some((m) => m.startsWith('GET '))).toBe(false);

		// Each run is recorded.
		expect(d.prepare('SELECT COUNT(*) n FROM runs WHERE ok = 1').get()).toEqual({ n: 3 });
	});

	it('reads from the DATA_DIR cache that was set before import', () => {
		expect(fa.flightsCachePath('KPAE', NIGHT)).toBe(path.join(dataDir, 'raw', 'KPAE', NIGHT, 'flights.json'));
		expect(fa.hasCachedFlights('KPAE', NIGHT)).toBe(true);
		expect(fa.hasCachedTrack('KPAE', 'N333CC-1755234000-adhoc-0')).toBe(false);
	});

	it('skips a night with no cached flights when offline', async () => {
		const r = await ingestNight('PAE', '2026-08-13', { offline: true });
		expect(r.skipped).toBe(true);
		expect(r.flights).toBe(0);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects an unknown airport', async () => {
		await expect(ingestNight('XXX', NIGHT, { offline: true })).rejects.toThrow(/Unknown airport/);
	});
});
