import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { freshDataDir } from './helpers/server-env';
import type { Flight, NightSummary } from '$lib/types';

function night(n: string, over: Partial<NightSummary> = {}): NightSummary {
	return { airport: 'KSEA', night: n, flights: 10, arrivals: 6, departures: 4, airline: 8, private: 2, positions: 500, incidents: 1, complete: true, ...over };
}

function flight(id: string, night: string): Flight {
	return {
		id,
		airport: 'KSEA',
		night,
		ident: id.toUpperCase(),
		tail: null,
		type: 'B738',
		category: 'airline',
		operator: 'ASA',
		operatorName: 'Alaska Airlines',
		operatorShort: null,
		direction: 'arrival',
		eventTime: Date.UTC(2026, 8, 4, 6, 30),
		otherCode: 'PDX',
		otherName: 'Portland Intl',
		otherCity: 'Portland',
		positions: []
	};
}

describe('query schedule filtering', () => {
	it('hides stored nights that predate an airport schedule', async () => {
		const dir = freshDataDir('queries');
		const airportsJson = path.join(dir, 'airports.json');
		vi.stubEnv('AIRPORTS_JSON', airportsJson);
		fs.writeFileSync(
			airportsJson,
			JSON.stringify({
				airports: [
					{
						id: 'sea',
						code: 'SEA',
						icao: 'KSEA',
						name: 'Seattle-Tacoma Intl',
						city: 'Seattle',
						state: 'WA',
						tz: 'America/Los_Angeles',
						lat: 47.4499,
						lon: -122.3118,
						elevation_ft: 432,
						carriers: [],
						status: 'tracking',
						tracked: true,
						kind: 'reference',
						schedules: [{ id: 'SEA-2026-09-03', from: '2026-09-03', to: null, open: 6, close: 22, note: 'quiet 22-06' }]
					}
				]
			})
		);
		vi.resetModules();
		const db = await import('$lib/server/db');
		const queries = await import('$lib/server/queries');

		db.upsertNight(night('2026-09-02'));
		expect(queries.airportDetail('SEA')).toMatchObject({ hasAnyData: false, selectedNight: null, totals: { nights: 0, flights: 0 } });
		expect(queries.airportsWithStats({ from: '2026-09-01', to: '2026-09-30', label: 'September 2026', month: '2026-09' }).find((a) => a.code === 'SEA')?.stats).toBeNull();

		db.upsertFlight(flight('good', '2026-09-03'));
		db.upsertNight(night('2026-09-03', { flights: 1, airline: 1, private: 0, incidents: 0 }));
		expect(queries.airportDetail('SEA')).toMatchObject({ hasAnyData: true, selectedNight: '2026-09-03', totals: { nights: 1, flights: 1 } });
	});
});
