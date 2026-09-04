import { beforeEach, describe, expect, it } from 'vitest';
import type { Flight, Incident, NightSummary, Position } from '$lib/types';
import { freshDataDir } from './helpers/server-env';

freshDataDir('db');
const dbm = await import('$lib/server/db');
const {
	openMemoryDb, upsertFlight, replaceIncidents, upsertNight, deleteNightData, totalsForAirport, latestNight, flightById, flightsForNight,
	incidentsForNight, incidentById, incidentsForAirport, separationIncidents, nightSummary, nightsForAirport, totalsAll, totalsByAirport, veryCloseAirports,
	recordRunStart, recordRunEnd, insertRequest, listRequests, requestExists, requestedAirportCodes
} = dbm;

function pos(t: number, alt = 2000): Position {
	return { t, lat: 47.9, lon: -122.28, alt, gs: 100, hdg: 90, dist: 0.5 };
}
function flight(id: string, over: Partial<Flight> = {}): Flight {
	return {
		id, airport: 'KPAE', night: '2026-08-14', ident: id.toUpperCase(), tail: 'N' + id, type: 'C172', category: 'private',
		operator: null, operatorName: null, operatorShort: null, direction: 'arrival', eventTime: Date.UTC(2026, 7, 15, 5), otherCode: null,
		otherName: null, otherCity: null, positions: [pos(1), pos(2)], ...over
	};
}
function incident(id: string, a: string, b: string, over: Partial<Incident> = {}): Incident {
	return {
		id, kind: 'separation', airport: 'KPAE', night: '2026-08-14', t: Date.UTC(2026, 7, 15, 5, 10), lateralNm: 0.5, verticalFt: 100, distNm: 1.2,
		severity: 'very-close', flightA: a, flightB: b, altA: 2000, altB: 2100, gsA: 120, gsB: 130, posA: [47.9, -122.28], posB: [47.91, -122.28], ...over
	};
}
function night(n: string, over: Partial<NightSummary> = {}): NightSummary {
	return { airport: 'KPAE', night: n, flights: 10, arrivals: 6, departures: 4, airline: 3, private: 7, positions: 500, incidents: 1, complete: true, ...over };
}

beforeEach(() => {
	openMemoryDb();
});

describe('upsertFlight', () => {
	it('keeps one row and the newest positions after a second upsert', () => {
		upsertFlight(flight('a'));
		upsertFlight(flight('a', { positions: [pos(1), pos(2), pos(3, 2500)], ident: 'CHANGED', tail: 'N999' }));
		expect(flightsForNight('KPAE', '2026-08-14')).toHaveLength(1);
		const f = flightById('a')!;
		expect(f.positions).toHaveLength(3);
		expect(f.positions[2].alt).toBe(2500);
		expect(f.ident).toBe('CHANGED');
		expect(f.tail).toBe('N999');
	});
	it('round-trips every field', () => {
		const f = flight('b', { operator: 'QXE', operatorName: 'Horizon Air', category: 'airline', direction: 'departure', otherCode: 'PDX', otherName: 'Portland', otherCity: 'Portland', airframe: 'airplane' });
		upsertFlight(f);
		expect(flightById('b')).toEqual({ ...f, operatorShort: null });
	});
	it('orders a night by event time', () => {
		upsertFlight(flight('late', { eventTime: 300 }));
		upsertFlight(flight('early', { eventTime: 100 }));
		expect(flightsForNight('KPAE', '2026-08-14').map((f) => f.id)).toEqual(['early', 'late']);
		expect(flightsForNight('KPAE', '2026-08-15')).toEqual([]);
	});
	it('moves a flight to a new night on re-upsert', () => {
		upsertFlight(flight('a'));
		upsertFlight(flight('a', { night: '2026-08-15' }));
		expect(flightsForNight('KPAE', '2026-08-14')).toEqual([]);
		expect(flightsForNight('KPAE', '2026-08-15')).toHaveLength(1);
	});
});

describe('replaceIncidents', () => {
	beforeEach(() => {
		for (const id of ['a', 'b', 'c']) upsertFlight(flight(id));
	});
	it('replaces a night wholesale', () => {
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b'), incident('i2', 'a', 'c')]);
		expect(incidentsForNight('KPAE', '2026-08-14').map((i) => i.id)).toEqual(['i1', 'i2']);
		replaceIncidents('KPAE', '2026-08-14', [incident('i3', 'b', 'c')]);
		expect(incidentsForNight('KPAE', '2026-08-14').map((i) => i.id)).toEqual(['i3']);
		expect(incidentById('i1')).toBeNull();
		replaceIncidents('KPAE', '2026-08-14', []);
		expect(incidentsForNight('KPAE', '2026-08-14')).toEqual([]);
	});
	it('re-inserting the same id twice in a row does not fail or duplicate', () => {
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		expect(incidentsForNight('KPAE', '2026-08-14')).toHaveLength(1);
	});
	it('leaves other nights and airports alone', () => {
		upsertFlight(flight('x', { night: '2026-08-15' }));
		replaceIncidents('KPAE', '2026-08-15', [incident('other', 'x', 'a', { night: '2026-08-15' })]);
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		replaceIncidents('KPAE', '2026-08-14', []);
		expect(incidentById('other')).not.toBeNull();
		expect(incidentsForAirport('KPAE', '2026-08-01').map((i) => i.id)).toEqual(['other']);
	});
	it('round-trips and sorts by time', () => {
		const late = incident('late', 'a', 'b', { t: 200 });
		const early = incident('early', 'a', 'c', { t: 100, severity: 'closer-than-allowed' });
		replaceIncidents('KPAE', '2026-08-14', [late, early]);
		// airlineInvolved is derived on read, so it is added to every row that comes back.
		expect(incidentsForNight('KPAE', '2026-08-14')).toEqual([
			{ ...early, airlineInvolved: false },
			{ ...late, airlineInvolved: false }
		]);
	});

	it('marks an incident as airline-involved when either aircraft is a passenger airline', () => {
		upsertFlight(flight('jet', { category: 'airline', ident: 'ASA1712', tail: 'N123AS' }));
		replaceIncidents('KPAE', '2026-08-14', [
			incident('private-pair', 'a', 'b'),
			incident('airline-first', 'jet', 'b'),
			incident('airline-second', 'a', 'jet')
		]);
		const byId = new Map(incidentsForNight('KPAE', '2026-08-14').map((i) => [i.id, i.airlineInvolved]));
		expect(byId.get('private-pair')).toBe(false);
		expect(byId.get('airline-first')).toBe(true);
		expect(byId.get('airline-second')).toBe(true);
		// Every read path carries the flag, not just the per-night one.
		expect(incidentById('airline-first')?.airlineInvolved).toBe(true);
		expect(separationIncidents('2026-08-01', '2026-08-31').find((i) => i.id === 'private-pair')?.airlineInvolved).toBe(false);
		expect(incidentsForAirport('KPAE', '2026-08-01').find((i) => i.id === 'airline-second')?.airlineInvolved).toBe(true);
	});

	it('counts airline-involved close approaches and wake events separately', () => {
		upsertFlight(flight('jet', { category: 'airline', ident: 'ASA1712' }));
		replaceIncidents('KPAE', '2026-08-14', [
			incident('sep-private', 'a', 'b'),
			incident('sep-airline', 'jet', 'b'),
			incident('wake-airline', 'jet', 'a', { kind: 'wake-turbulence' }),
			incident('wake-private', 'a', 'b', { kind: 'wake-turbulence' })
		]);
		upsertNight(night('2026-08-14', { incidents: 2, wakeIncidents: 2 }));
		const totals = totalsForAirport('KPAE', '2026-08-01', '2026-08-31');
		expect(totals.airlineIncidents).toBe(1);
		expect(totals.airlineWakeIncidents).toBe(1);
		expect(totalsAll('2026-08-01', '2026-08-31')).toMatchObject({ airlineIncidents: 1, airlineWakeIncidents: 1 });
		// A reference airport excluded from the headline totals takes its airline counts with it.
		expect(totalsAll('2026-08-01', '2026-08-31', ['KPAE'])).toMatchObject({ airlineIncidents: 0, airlineWakeIncidents: 0 });
		expect(totalsByAirport('2026-08-01', '2026-08-31').KPAE).toMatchObject({ airlineIncidents: 1, airlineWakeIncidents: 1 });
	});
	it('lists only separation events inside the requested range', () => {
		replaceIncidents('KPAE', '2026-08-14', [
			incident('separation', 'a', 'b'),
			incident('wake', 'a', 'c', { kind: 'wake-turbulence', requiredNm: 5 })
		]);
		expect(separationIncidents('2026-08-14', '2026-08-14').map((i) => i.id)).toEqual(['separation']);
		expect(separationIncidents('2026-08-15', '2026-08-16')).toEqual([]);
	});
	it('finds airports with very-close events only inside the requested range', () => {
		upsertFlight(flight('x', { airport: 'KBLI', night: '2026-08-15' }));
		replaceIncidents('KPAE', '2026-08-14', [incident('close', 'a', 'b')]);
		replaceIncidents('KBLI', '2026-08-15', [incident('ordinary', 'x', 'c', { airport: 'KBLI', night: '2026-08-15', severity: 'closer-than-allowed' })]);
		expect([...veryCloseAirports('2026-08-14', '2026-08-14')]).toEqual(['KPAE']);
		expect(veryCloseAirports('2026-08-15', '2026-08-15').size).toBe(0);
	});
	it('is wrapped in a transaction: a failing insert rolls back the delete', () => {
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		// 'nope' violates the foreign key to flights.
		expect(() => replaceIncidents('KPAE', '2026-08-14', [incident('i2', 'a', 'nope')])).toThrow();
		expect(incidentsForNight('KPAE', '2026-08-14').map((i) => i.id)).toEqual(['i1']);
	});
	it('cascades when a flight is deleted', () => {
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		dbm.db().prepare('DELETE FROM flights WHERE id = ?').run('a');
		expect(incidentsForNight('KPAE', '2026-08-14')).toEqual([]);
	});
});

describe('nights', () => {
	it('upsertNight upserts', () => {
		upsertNight(night('2026-08-14', { flights: 5, complete: false }));
		upsertNight(night('2026-08-14', { flights: 12, complete: true }));
		const s = nightSummary('KPAE', '2026-08-14')!;
		expect(s.flights).toBe(12);
		expect(s.complete).toBe(true);
		expect(nightsForAirport('KPAE', '2026-08-01', '2026-08-31')).toHaveLength(1);
		expect(nightSummary('KPAE', '2026-08-13')).toBeNull();
	});
	it('totalsForAirport sums over the inclusive range', () => {
		upsertNight(night('2026-08-10', { flights: 1, airline: 1, private: 0, incidents: 0 }));
		upsertNight(night('2026-08-11', { flights: 2, airline: 1, private: 1, incidents: 1 }));
		upsertNight(night('2026-08-12', { flights: 4, airline: 2, private: 2, incidents: 2 }));
		upsertNight(night('2026-08-13', { flights: 8, airline: 0, private: 8, incidents: 0 }));
		upsertNight(night('2026-08-12', { airport: 'KBLI', flights: 100, airline: 50, private: 50, incidents: 9 }));
		const none = { airlineIncidents: 0, airlineWakeIncidents: 0 };
		expect(totalsForAirport('KPAE', '2026-08-11', '2026-08-12')).toEqual({ flights: 6, airline: 3, private: 3, incidents: 3, wakeIncidents: 0, nights: 2, ...none });
		expect(totalsForAirport('KPAE', '2026-08-10', '2026-08-13')).toEqual({ flights: 15, airline: 4, private: 11, incidents: 3, wakeIncidents: 0, nights: 4, ...none });
		expect(totalsForAirport('KPAE', '2026-09-01', '2026-09-30')).toEqual({ flights: 0, airline: 0, private: 0, incidents: 0, wakeIncidents: 0, nights: 0, ...none });
		expect(totalsAll('2026-08-12', '2026-08-12')).toEqual({ flights: 104, airline: 52, private: 52, incidents: 11, wakeIncidents: 0, nights: 1, ...none });
		const by = totalsByAirport('2026-08-01', '2026-08-31');
		expect(by.KBLI.flights).toBe(100);
		expect(by.KPAE.nights).toBe(4);
	});
	it('totalsAll can exclude airports that must not count, such as reference airports', () => {
		upsertNight(night('2026-08-12', { flights: 4, airline: 2, private: 2, incidents: 2 }));
		upsertNight(night('2026-08-12', { airport: 'KBUR', flights: 100, airline: 50, private: 50, incidents: 9 }));
		expect(totalsAll('2026-08-12', '2026-08-12')).toMatchObject({ flights: 104, incidents: 11 });
		expect(totalsAll('2026-08-12', '2026-08-12', ['KBUR'])).toMatchObject({ flights: 4, incidents: 2, nights: 1 });
	});
	it('latestNight only counts complete nights', () => {
		expect(latestNight('KPAE')).toBeNull();
		upsertNight(night('2026-08-14', { complete: true }));
		upsertNight(night('2026-08-15', { complete: true }));
		upsertNight(night('2026-08-16', { complete: false }));
		expect(latestNight('KPAE')).toBe('2026-08-15');
		upsertNight(night('2026-08-16', { complete: true }));
		expect(latestNight('KPAE')).toBe('2026-08-16');
		expect(latestNight('KBLI')).toBeNull();
	});
	it('deletes derived data for one airport night only', () => {
		for (const id of ['a', 'b']) upsertFlight(flight(id));
		upsertFlight(flight('other-night', { night: '2026-08-15' }));
		upsertFlight(flight('other-airport', { airport: 'KBLI' }));
		replaceIncidents('KPAE', '2026-08-14', [incident('i1', 'a', 'b')]);
		upsertNight(night('2026-08-14', { flights: 2, incidents: 1 }));
		upsertNight(night('2026-08-15', { flights: 1 }));
		upsertNight(night('2026-08-14', { airport: 'KBLI', flights: 1 }));

		expect(deleteNightData('KPAE', '2026-08-14')).toEqual({ airport: 'KPAE', night: '2026-08-14', nights: 1, flights: 2, incidents: 1 });
		expect(nightSummary('KPAE', '2026-08-14')).toBeNull();
		expect(flightsForNight('KPAE', '2026-08-14')).toEqual([]);
		expect(incidentsForNight('KPAE', '2026-08-14')).toEqual([]);
		expect(nightSummary('KPAE', '2026-08-15')).not.toBeNull();
		expect(nightSummary('KBLI', '2026-08-14')).not.toBeNull();
		expect(flightsForNight('KBLI', '2026-08-14')).toHaveLength(1);
	});
});

describe('runs and requests', () => {
	it('records a run start and end', () => {
		const id = recordRunStart('KPAE', '2026-08-14');
		recordRunEnd(id, true, 'ok');
		const row = dbm.db().prepare('SELECT * FROM runs WHERE id = ?').get(id) as { ok: number; message: string; finished_at: number };
		expect(row.ok).toBe(1);
		expect(row.message).toBe('ok');
		expect(row.finished_at).toBeGreaterThan(0);
	});
	it('stores requests', () => {
		insertRequest('KXYZ', null);
		insertRequest('ABC', 'verified@example.com', 'ABC', 'none: no tower', 'Ada Reader', 'Please add this airport.');
		expect(dbm.db().prepare('SELECT COUNT(*) n FROM requests').get()).toEqual({ n: 2 });
		expect(listRequests()[0]).toMatchObject({ code: 'ABC', email: 'verified@example.com', name: 'Ada Reader', comment: 'Please add this airport.' });
		expect(requestExists('abc')).toBe(true);
		expect(requestExists('KXYZ')).toBe(true);
		expect(requestExists('NOPE')).toBe(false);
		expect(requestedAirportCodes()).toEqual(['ABC', 'KXYZ']);
	});
});
