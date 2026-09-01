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

	it('rejects invalid codes', () => {
		expect(() => candidateFromNasr(fixture, 'KSEA')).toThrow(/three-letter/);
	});

	it('holds a 24-hour tower as a reference candidate until quiet hours arrive', () => {
		const pending = candidateFromNasr(fixture, 'SEA');
		expect(pending).toMatchObject({ kind: 'reference', needsQuietHours: true, schedule: null });

		// Quiet hours 10 pm – 7 am become the gap between close and the next open.
		const ready = candidateFromNasr(fixture, 'SEA', { start: 22, end: 7 });
		expect(ready).toMatchObject({ kind: 'reference', needsQuietHours: false, schedule: { open: 7, close: 22 } });
		expect(ready.schedule!.note).toMatch(/10:00 pm to 7:00 am/);
	});

	it('insists that quiet hours run overnight, and only for a 24-hour tower', () => {
		expect(() => candidateFromNasr(fixture, 'SEA', { start: 7, end: 22 })).toThrow(/overnight/);
		expect(() => candidateFromNasr(fixture, 'SEA', { start: 22, end: 25 })).toThrow(/whole hours/);
		expect(() => candidateFromNasr(fixture, 'STS', { start: 22, end: 7 })).toThrow(/tower that closes/);
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

	// These continue on the database the test above opened.
	it('refuses to add a reference airport with no quiet hours', () => {
		process.env.NASR_JSON = path.join(__dirname, '../fixtures/nasr.json');
		expect(() => confirmAirport('SEA', 'admin@example.com')).toThrow(/quiet hours/);
		expect(getAirport('SEA')).toBeUndefined();
		delete process.env.NASR_JSON;
	});

	it('adds a reference airport with its quiet-hours schedule', () => {
		process.env.NASR_JSON = path.join(__dirname, '../fixtures/nasr.json');
		confirmAirport('SEA', 'admin@example.com', undefined, { start: 22, end: 7 });
		expect(getAirport('SEA')).toMatchObject({
			code: 'SEA',
			kind: 'reference',
			tracked: true,
			schedules: [{ open: 7, close: 22 }]
		});
		delete process.env.NASR_JSON;
	});
});
