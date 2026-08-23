import { describe, expect, it } from 'vitest';
import type { AirportConfig } from '$lib/types';
import { destination, type LatLon } from '$lib/geo';
import { zonedToUtc } from '$lib/time';
import type { RawFlight, RawPosition, RawTrack } from '$lib/server/flightaware';
import { freshDataDir } from './helpers/server-env';

freshDataDir('pipeline');
const pipeline = await import('$lib/server/pipeline');
const { eventTimeOf, categoryOf, normalizeFlight, clipTrack } = pipeline;

const PAE: AirportConfig = {
	code: 'PAE', icao: 'KPAE', name: 'Snohomish County (Paine Field)', city: 'Everett', state: 'WA', tz: 'America/Los_Angeles',
	pos: [47.9079, -122.2816], elevationFt: 606, towerHours: { open: 7, close: 21 }, carriers: [], status: 'tracking', tracked: true,
	schedules: [{ id: 'PAE-2024-01-01', from: '2024-01-01', to: null, open: 7, close: 21, note: '' }]
};
const NIGHT = '2026-08-14';
const LA = PAE.tz;

function rawFlight(over: Partial<RawFlight> = {}): RawFlight {
	return {
		ident: 'QXE2190',
		fa_flight_id: 'QXE2190-1755212345-airline-123p',
		operator: 'QXE',
		operator_icao: 'QXE',
		registration: 'N419QX',
		aircraft_type: 'E75L',
		type: 'Airline',
		origin: { code: 'KPDX', code_icao: 'KPDX', code_iata: 'PDX', code_lid: 'PDX', name: 'Portland Intl', city: 'Portland', timezone: 'America/Los_Angeles' },
		destination: { code: 'KPAE', code_icao: 'KPAE', code_iata: 'PAE', code_lid: 'PAE', name: 'Snohomish County', city: 'Everett', timezone: 'America/Los_Angeles' },
		actual_off: '2026-08-15T04:20:00Z',
		actual_on: '2026-08-15T05:10:00Z',
		estimated_off: '2026-08-15T04:18:00Z',
		estimated_on: '2026-08-15T05:12:00Z',
		scheduled_off: '2026-08-15T04:15:00Z',
		scheduled_on: '2026-08-15T05:05:00Z',
		_source: 'arrival',
		...over
	};
}

describe('eventTimeOf', () => {
	it('uses actual_on for an arrival', () => {
		expect(eventTimeOf(rawFlight())).toBe(Date.parse('2026-08-15T05:10:00Z'));
	});
	it('falls back to estimated_on when actual_on === actual_off (bogus actuals)', () => {
		const f = rawFlight({ actual_on: '2026-08-15T05:10:00Z', actual_off: '2026-08-15T05:10:00Z' });
		expect(eventTimeOf(f)).toBe(Date.parse('2026-08-15T05:12:00Z'));
	});
	it('uses actual_off for a departure', () => {
		expect(eventTimeOf(rawFlight({ _source: 'departure' }))).toBe(Date.parse('2026-08-15T04:20:00Z'));
	});
	it('falls back to estimated_off for a departure with bogus actuals', () => {
		const f = rawFlight({ _source: 'departure', actual_on: '2026-08-15T05:10:00Z', actual_off: '2026-08-15T05:10:00Z' });
		expect(eventTimeOf(f)).toBe(Date.parse('2026-08-15T04:18:00Z'));
	});
	it('falls through actual → estimated → scheduled, and null when none', () => {
		expect(eventTimeOf(rawFlight({ actual_on: null }))).toBe(Date.parse('2026-08-15T05:12:00Z'));
		expect(eventTimeOf(rawFlight({ actual_on: null, estimated_on: null }))).toBe(Date.parse('2026-08-15T05:05:00Z'));
		expect(eventTimeOf(rawFlight({ actual_on: null, estimated_on: null, scheduled_on: null }))).toBeNull();
		expect(eventTimeOf(rawFlight({ actual_on: 'garbage' }))).toBeNull();
	});
});

describe('categoryOf', () => {
	it('maps Airline to airline and everything else to private', () => {
		expect(categoryOf(rawFlight({ type: 'Airline' }))).toBe('airline');
		expect(categoryOf(rawFlight({ type: 'General_Aviation' }))).toBe('private');
		expect(categoryOf(rawFlight({ type: 'Cargo' }))).toBe('private');
	});
});

describe('normalizeFlight', () => {
	it('returns null for a cancelled flight', () => {
		expect(normalizeFlight(PAE, NIGHT, rawFlight({ cancelled: true }))).toBeNull();
	});
	it('returns null when the event time falls on a different night (or while the tower is open)', () => {
		// 13:00 local on Aug 14: tower open.
		expect(normalizeFlight(PAE, NIGHT, rawFlight({ actual_on: '2026-08-14T20:00:00Z' }))).toBeNull();
		// 22:00 local on Aug 15: the next night.
		expect(normalizeFlight(PAE, NIGHT, rawFlight({ actual_on: '2026-08-16T05:00:00Z' }))).toBeNull();
		expect(normalizeFlight(PAE, '2026-08-15', rawFlight({ actual_on: '2026-08-16T05:00:00Z' }))).not.toBeNull();
	});
	it('returns null when there is no usable event time', () => {
		expect(normalizeFlight(PAE, NIGHT, rawFlight({ actual_on: null, estimated_on: null, scheduled_on: null }))).toBeNull();
	});
	it('maps fields for an arrival: other = origin, operator name from OPERATORS', () => {
		const f = normalizeFlight(PAE, NIGHT, rawFlight())!;
		expect(f).toMatchObject({
			id: 'QXE2190-1755212345-airline-123p',
			airport: 'KPAE',
			night: NIGHT,
			ident: 'QXE2190',
			tail: 'N419QX',
			type: 'E75L',
			category: 'airline',
			operator: 'QXE',
			operatorName: 'Horizon Air',
			direction: 'arrival',
			eventTime: Date.parse('2026-08-15T05:10:00Z'),
			otherCode: 'PDX',
			otherName: 'Portland Intl',
			otherCity: 'Portland',
			positions: []
		});
	});
	it('uses the destination as other for a departure', () => {
		const f = normalizeFlight(PAE, NIGHT, rawFlight({ _source: 'departure', origin: rawFlight().destination, destination: rawFlight().origin }))!;
		expect(f.direction).toBe('departure');
		expect(f.eventTime).toBe(Date.parse('2026-08-15T04:20:00Z'));
		expect(f.otherCode).toBe('PDX');
		expect(f.otherCity).toBe('Portland');
	});
	it('sets otherCode/otherName null for a position-only "L 45.8 -119.0" endpoint', () => {
		const f = normalizeFlight(
			PAE,
			NIGHT,
			rawFlight({ origin: { code: 'L 45.8 -119.0', code_icao: null, code_iata: null, code_lid: null, name: 'Near Hermiston', city: null, timezone: null } })
		)!;
		expect(f.otherCode).toBeNull();
		expect(f.otherName).toBeNull();
	});
	it('unknown operators get a null operatorName; unknown types are null', () => {
		const f = normalizeFlight(PAE, NIGHT, rawFlight({ operator: 'ZZZ', operator_icao: 'ZZZ', aircraft_type: '  ' }))!;
		expect(f.operator).toBe('ZZZ');
		expect(f.operatorName).toBeNull();
		expect(f.type).toBeNull();
		const g = normalizeFlight(PAE, NIGHT, rawFlight({ operator: null, operator_icao: null }))!;
		expect(g.operator).toBeNull();
		expect(g.operatorName).toBeNull();
	});
	it('derives a tail from the flight id when there is no registration', () => {
		const f = normalizeFlight(PAE, NIGHT, rawFlight({ registration: null, ident: 'N12345', fa_flight_id: 'N12345-1755212345-adhoc-0' }))!;
		expect(f.tail).toBe('N12345');
	});
});

describe('clipTrack', () => {
	// A straight westbound pass over the field: points from 15 NM east to 15 NM
	// west, 1 NM apart, every 30 s. Altitude in hundreds of feet as the API reports.
	function pass(startMs: number, stepMs = 30_000, altHundreds = 25): RawTrack {
		const positions: RawPosition[] = [];
		let i = 0;
		for (let nm = 15; nm >= -15; nm -= 1, i++) {
			const p: LatLon = destination(PAE.pos, 90, nm);
			positions.push({
				altitude: altHundreds,
				groundspeed: 120,
				heading: 270,
				latitude: p[0],
				longitude: p[1],
				timestamp: new Date(startMs + i * stepMs).toISOString()
			});
		}
		return { positions };
	}
	const NIGHT_START = zonedToUtc(LA, 2026, 8, 14, 22); // 22:00 local, well inside the night

	it('keeps every point within 10 NM at full resolution and nothing outside the ring', () => {
		const out = clipTrack(PAE, NIGHT, pass(NIGHT_START));
		// 15..-15 → 31 points; |nm| <= 10 gives 21 inside points. The reports at
		// exactly 10 NM sit on the boundary, so the interpolated crossing point
		// coincides with them and is deduped.
		expect(out).toHaveLength(21);
		expect(out.every((p) => p.dist <= 10)).toBe(true);
		expect(out[0].dist).toBeCloseTo(10, 1);
		expect(out[out.length - 1].dist).toBeCloseTo(10, 1);
		// Sorted by time, nothing thinned.
		for (let i = 1; i < out.length; i++) expect(out[i].t - out[i - 1].t).toBe(30_000);
	});

	it('interpolates a point on the ring where the track crosses it', () => {
		// Reports at 10.5 NM and 9.5 NM straddle the ring: expect a synthetic
		// point at exactly 10 NM halfway between them in time and altitude.
		const t0 = NIGHT_START;
		const mk = (nm: number, t: number, alt: number): RawPosition => {
			const p = destination(PAE.pos, 90, nm);
			return { altitude: alt, groundspeed: 100, heading: 270, latitude: p[0], longitude: p[1], timestamp: new Date(t).toISOString() };
		};
		const out = clipTrack(PAE, NIGHT, { positions: [mk(10.5, t0, 30), mk(9.5, t0 + 20_000, 20), mk(8.5, t0 + 40_000, 10)] });
		expect(out).toHaveLength(3);
		expect(out[0].dist).toBe(10);
		expect(out[0].t).toBe(t0 + 10_000);
		expect(out[0].alt).toBe(2500);
		expect(out[1].dist).toBeCloseTo(9.5, 1);
	});

	it('expands altitude x100 and carries the other channels through', () => {
		const out = clipTrack(PAE, NIGHT, pass(NIGHT_START));
		expect(out.every((p) => p.alt === 2500)).toBe(true);
		expect(out.every((p) => p.gs === 120 && p.hdg === 270)).toBe(true);
	});

	it('drops points while the tower was open (outside the night window)', () => {
		// Start so that the aircraft is 5 NM east at 06:59:30 local and crosses
		// the field at 07:02 — points at/after 07:00 local must be dropped.
		const open = zonedToUtc(LA, 2026, 8, 15, 7);
		const start = open - 30_000 * 10 - 30_000; // point index 10 (5 NM east) lands at 06:59:30
		const out = clipTrack(PAE, NIGHT, pass(start));
		expect(out.length).toBeGreaterThan(0);
		expect(out.every((p) => p.t < open)).toBe(true);
		// indices 5..10 are inside (10 NM.. 5 NM east) → 6 points; the crossing coincides with the 10 NM report.
		expect(out).toHaveLength(6);
		expect(out[0].dist).toBeCloseTo(10, 1);
	});

	it('returns nothing for a track flown entirely while the tower was open', () => {
		const noon = zonedToUtc(LA, 2026, 8, 14, 12);
		expect(clipTrack(PAE, NIGHT, pass(noon))).toEqual([]);
	});

	it('returns nothing for a track on a different night', () => {
		expect(clipTrack(PAE, '2026-08-13', pass(NIGHT_START))).toEqual([]);
	});

	it('dedupes identical timestamps and skips malformed points', () => {
		const t = pass(NIGHT_START);
		const dup = { ...t.positions[16] }; // over the field
		t.positions.splice(16, 0, dup);
		t.positions.push({ ...t.positions[20], timestamp: 'not a date' });
		t.positions.push({ ...t.positions[20], latitude: null as unknown as number, timestamp: new Date(NIGHT_START + 1).toISOString() });
		const out = clipTrack(PAE, NIGHT, t);
		expect(out).toHaveLength(21);
		const ts = out.map((p) => p.t);
		expect(new Set(ts).size).toBe(ts.length);
	});

	it('handles a track that leaves and re-enters the ring', () => {
		// Two separate passes 20 minutes apart in the same track.
		const a = pass(NIGHT_START).positions;
		const b = pass(NIGHT_START + 20 * 60_000).positions;
		const out = clipTrack(PAE, NIGHT, { positions: [...a, ...b] });
		expect(out).toHaveLength(42);
	});

	it('handles a missing positions array and unsorted input', () => {
		expect(clipTrack(PAE, NIGHT, {} as RawTrack)).toEqual([]);
		const t = pass(NIGHT_START);
		t.positions.reverse();
		const out = clipTrack(PAE, NIGHT, t);
		expect(out).toHaveLength(21);
		for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
	});

	it('respects a custom radius', () => {
		const out = clipTrack(PAE, NIGHT, pass(NIGHT_START), 3);
		// |nm| <= 3 → 7 inside; crossings coincide with the 3 NM reports.
		expect(out).toHaveLength(7);
	});
});
