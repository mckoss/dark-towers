import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshDataDir } from './helpers/server-env';
import { scheduledTowerHoursOn, scheduleOn, towerHoursOn } from '../../src/lib/airports';

const seed = () => ({
	airports: [
		{
			id: 'PAE', code: 'PAE', icao: 'KPAE', name: 'Paine Field', city: 'Everett', state: 'WA', tz: 'America/Los_Angeles', lat: 47.9, lon: -122.3, elevation_ft: 606,
			carriers: ['Alaska'], status: 'tracking' as const, tracked: true,
			schedules: [
				{ id: 'PAE-2024-01-01', from: '2024-01-01', to: '2026-09-30', open: 7, close: 21, note: 'old' },
				{ id: 'PAE-2026-10-01', from: '2026-10-01', to: null, open: 6, close: 22, note: 'new' }
			]
		}
	]
});

async function store() {
	const dir = freshDataDir('airports-store');
	// The store seeds itself from AIRPORTS_JSON on first read; point it at this test's fixture.
	const seedPath = path.join(dir, 'airports.json');
	fs.writeFileSync(seedPath, JSON.stringify(seed()));
	vi.stubEnv('AIRPORTS_JSON', seedPath);
	vi.resetModules();
	const dbm = await import('../../src/lib/server/db');
	dbm.openMemoryDb();
	return await import('../../src/lib/server/airports-store');
}

describe('schedule helpers', () => {
	const s = seed().airports[0].schedules;
	it('picks the row in effect on a date, latest from wins on overlap', () => {
		expect(scheduleOn(s, '2026-08-14')?.id).toBe('PAE-2024-01-01');
		expect(scheduleOn(s, '2026-10-01')?.id).toBe('PAE-2026-10-01');
		expect(scheduleOn(s, '2023-12-31')).toBeUndefined();
		const overlapping = [...s, { id: 'x', from: '2026-08-01', to: null, open: 8, close: 20, note: '' }];
		expect(scheduleOn(overlapping, '2026-08-14')?.id).toBe('x');
		expect(scheduleOn(overlapping, '2026-10-05')?.id).toBe('PAE-2026-10-01');
	});
	it('towerHoursOn returns hours or null for no-tower / unscheduled dates', () => {
		expect(towerHoursOn({ schedules: s }, '2026-08-14')).toEqual({ open: 7, close: 21 });
		expect(towerHoursOn({ schedules: s }, '2026-12-01')).toEqual({ open: 6, close: 22 });
		expect(towerHoursOn({ schedules: [{ id: 'n', from: '2024-01-01', to: null, open: null, close: null, note: '' }] }, '2026-01-01')).toBeNull();
		expect(towerHoursOn({ schedules: [] }, '2026-01-01')).toBeNull();
	});
	it('scheduledTowerHoursOn distinguishes no-tower rows from schedule gaps', () => {
		expect(scheduledTowerHoursOn({ schedules: s }, '2026-08-14')).toEqual({ open: 7, close: 21 });
		expect(scheduledTowerHoursOn({ schedules: [{ id: 'n', from: '2024-01-01', to: null, open: null, close: null, note: '' }] }, '2026-01-01')).toBeNull();
		expect(scheduledTowerHoursOn({ schedules: s }, '2023-12-31')).toBeUndefined();
		expect(scheduledTowerHoursOn({ schedules: [] }, '2026-01-01')).toBeUndefined();
	});
});

describe('airports store', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('seeds from JSON, and a second seed inserts nothing', async () => {
		const st = await store();
		expect(st.seedFromJson(seed())).toEqual({ airportsInserted: 1, schedulesInserted: 2 });
		expect(st.seedFromJson(seed())).toEqual({ airportsInserted: 0, schedulesInserted: 0 });
		const a = st.getAirport('kpae')!;
		expect(a.code).toBe('PAE');
		expect(a.schedules).toHaveLength(2);
		expect(a.pos).toEqual([47.9, -122.3]);
	});

	it('the database wins: seeding never overwrites an edited row, and drift reports the difference', async () => {
		const st = await store();
		st.seedFromJson(seed());
		st.updateAirport('PAE', { name: 'Paine Field (edited)', city: 'Everett', state: 'WA', tz: 'America/Los_Angeles', lat: 47.9, lon: -122.3, elevation_ft: 606, carriers: ['Alaska', 'Horizon'], status: 'tracking', tracked: true, kind: 'dark' }, 'admin@example.com');
		st.upsertSchedule('PAE', { id: 'PAE-2024-01-01', from: '2024-01-01', to: '2026-09-30', open: 7, close: 22, note: 'old' }, 'admin@example.com');
		st.seedFromJson(seed());
		const a = st.getAirport('PAE')!;
		expect(a.name).toBe('Paine Field (edited)');
		expect(a.updatedBy).toBe('admin@example.com');
		expect(a.schedules[0].close).toBe(22);

		const d = st.drift(seed());
		const keys = d.map((x) => x.key).sort();
		expect(keys).toEqual(['airport:PAE', 'schedule:PAE-2024-01-01']);
		expect(d.find((x) => x.key === 'airport:PAE')!.diffs).toEqual({ name: ['Paine Field', 'Paine Field (edited)'], carriers: [['Alaska'], ['Alaska', 'Horizon']] });
		expect(d.find((x) => x.key === 'schedule:PAE-2024-01-01')!.diffs).toEqual({ close: [21, 22] });
	});

	it('applyJsonRow is an explicit per-row choice', async () => {
		const st = await store();
		st.seedFromJson(seed());
		st.upsertSchedule('PAE', { id: 'PAE-2024-01-01', from: '2024-01-01', to: '2026-09-30', open: 7, close: 22, note: 'old' }, 'x');
		st.applyJsonRow('schedule:PAE-2024-01-01', 'admin@example.com', seed());
		expect(st.getAirport('PAE')!.schedules[0].close).toBe(21);
		expect(st.drift(seed())).toEqual([]);
	});

	it('seed inserts a new schedule row added to the JSON later (append-only seasons)', async () => {
		const st = await store();
		st.seedFromJson(seed());
		const s2 = seed();
		s2.airports[0].schedules.push({ id: 'PAE-2027-01-01', from: '2027-01-01', to: null, open: 7, close: 21, note: 'winter' });
		expect(st.seedFromJson(s2).schedulesInserted).toBe(1);
		expect(st.getAirport('PAE')!.schedules).toHaveLength(3);
	});

	it('export round-trips the live tables in seed format', async () => {
		const st = await store();
		st.seedFromJson(seed());
		const out = st.exportJson();
		// A seed row written before reference airports existed reads back as 'dark'.
		expect(out.airports).toEqual(seed().airports.map((a) => ({ ...a, kind: 'dark' })));
		expect(st.drift(out)).toEqual([]);
		// …and the older file, with no kind at all, is not reported as drift.
		expect(st.drift(seed())).toEqual([]);
	});

	it('stores a reference airport and round-trips its kind', async () => {
		const st = await store();
		st.seedFromJson(seed());
		st.createAirport(
			{
				id: 'BUR', code: 'BUR', icao: 'KBUR', name: 'Hollywood Burbank', city: 'Burbank', state: 'CA', tz: 'America/Los_Angeles',
				lat: 34.2, lon: -118.36, elevation_ft: 778, carriers: [], status: 'tracking', tracked: true, kind: 'reference'
			},
			'admin@example.com'
		);
		st.upsertSchedule('BUR', { id: 'BUR-2026-08-06', from: '2026-08-06', to: null, open: 7, close: 22, note: 'quiet hours' }, 'admin@example.com');
		expect(st.getAirport('BUR')!.kind).toBe('reference');
		expect(st.exportJson().airports.find((a) => a.id === 'BUR')!.kind).toBe('reference');
	});

	it('derives carriers from stored airline flights while retaining the seed fallback for export', async () => {
		const st = await store();
		const dbm = await import('../../src/lib/server/db');
		const operators = await import('../../src/lib/server/operators-store');
		st.seedFromJson(seed());
		const flight = (id: string, operator: string) => ({
			id, airport: 'KPAE', night: '2026-08-14', ident: `${operator}123`, tail: null, type: null, airframe: null,
			category: 'airline' as const, operator, operatorName: null, operatorShort: null, direction: 'arrival' as const,
			eventTime: Date.UTC(2026, 7, 15), otherCode: null, otherName: null, otherCity: null, positions: []
		});
		dbm.upsertFlight(flight('aal', 'AAL'));
		dbm.upsertFlight(flight('qxe', 'QXE'));

		expect(st.getAirport('PAE')).toMatchObject({ carriers: ['American', 'Horizon'], carriersObserved: true, configuredCarriers: ['Alaska'] });
		operators.upsertOperator({ icao: 'QXE', name: 'Horizon Air', short: 'Horizon Regional' }, 'admin@example.com');
		expect(st.getAirport('PAE')?.carriers).toEqual(['American', 'Horizon Regional']);
		expect(st.exportJson().airports[0].carriers).toEqual(['Alaska']);
	});

	it('drift flags airports present on only one side', async () => {
		const st = await store();
		st.seedFromJson(seed());
		st.createAirport({ id: 'BLI', code: 'BLI', icao: 'KBLI', name: 'Bellingham', city: 'Bellingham', state: 'WA', tz: 'America/Los_Angeles', lat: 48.8, lon: -122.5, elevation_ft: 170, carriers: [], status: 'requested', tracked: false }, 'x');
		const s2 = seed();
		s2.airports.push({ ...s2.airports[0], id: 'RDM', code: 'RDM', icao: 'KRDM', schedules: [] });
		const d = st.drift(s2);
		expect(d.find((x) => x.key === 'airport:BLI')?.missingJson).toBe(true);
		expect(d.find((x) => x.key === 'airport:RDM')?.missingLive).toBe(true);
	});

	it('a deleted schedule stays deleted across re-seeds (tombstone) until restored from JSON', async () => {
		const st = await store();
		st.seedFromJson(seed());
		st.deleteSchedule('PAE-2026-10-01', 'admin@example.com');
		st.seedFromJson(seed()); // restart-equivalent: must NOT resurrect it
		expect(st.getAirport('PAE')!.schedules.map((s) => s.id)).toEqual(['PAE-2024-01-01']);
		const d = st.drift(seed()).find((x) => x.key === 'schedule:PAE-2026-10-01');
		expect(d?.deletedLive).toBe(true);
		st.applyJsonRow('schedule:PAE-2026-10-01', 'admin@example.com', seed());
		expect(st.getAirport('PAE')!.schedules).toHaveLength(2);
		expect(st.drift(seed())).toEqual([]);
	});
});
