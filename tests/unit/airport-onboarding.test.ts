import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NasrData } from '../../src/lib/nasr';
import { candidateFromNasr } from '../../src/lib/server/airport-onboarding';
import { confirmAirport } from '../../src/lib/server/airport-onboarding';
import { getAirport } from '../../src/lib/server/airports-store';
import { insertRequest, listRequests, openMemoryDb } from '../../src/lib/server/db';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/nasr.json'), 'utf8')) as NasrData;

describe('airport onboarding', () => {
	it('builds a complete tracked-airport candidate from a three-letter FAA code', () => {
		const a = candidateFromNasr(fixture, 'bli');
		expect(a).toMatchObject({
			code: 'BLI',
			icao: 'KBLI',
			name: 'BELLINGHAM INTL',
			city: 'BELLINGHAM',
			state: 'WA',
			tz: 'America/Los_Angeles',
			elevationFt: 171,
			schedule: { from: '2026-08-06', to: null, open: 7, close: 23 }
		});
	});

	it('creates an all-day polling schedule for an airport without a tower', () => {
		expect(candidateFromNasr(fixture, 'MMH').schedule).toMatchObject({ open: null, close: null });
	});

	it('rejects invalid codes and airports with a 24-hour tower', () => {
		expect(() => candidateFromNasr(fixture, 'KSEA')).toThrow(/three-letter/);
		expect(() => candidateFromNasr(fixture, 'SEA')).toThrow(/staffed 24 hours/);
	});

	it('confirms an airport and schedule as tracked, removing an accepted request atomically', () => {
		openMemoryDb();
		process.env.NASR_JSON = path.join(__dirname, '../fixtures/nasr.json');
		insertRequest('STS', 'reader@example.com', 'STS', 'part-time');
		const requestId = listRequests()[0].id;

		confirmAirport('STS', 'admin@example.com', requestId);

		expect(getAirport('STS')).toMatchObject({
			code: 'STS',
			tracked: true,
			status: 'tracking',
			schedules: [{ open: 7, close: 20 }]
		});
		expect(listRequests()).toEqual([]);
		delete process.env.NASR_JSON;
	});
});
