import { describe, expect, it } from 'vitest';
import { fromLocalNm, type LatLon } from '$lib/geo';
import { closestApproach, buildTrackSpline, dropGhosts, findIncidents, incidentId, sameAircraft, severityOf } from '$lib/separation';
import type { Flight, Position } from '$lib/types';

const ORIGIN: LatLon = [47.9079, -122.2816];
const ICAO = 'KPAE';
const NIGHT = '2026-08-14';
const T0 = Date.UTC(2026, 7, 15, 5, 0, 0); // 22:00 PDT on the night of Aug 14

interface Line {
	/** [east, north] in NM at t = start. */
	from: [number, number];
	to: [number, number];
	alt: number;
	start: number;
	/** Duration in seconds; positions every 10 s. */
	seconds: number;
}

function positionsAlong(l: Line): Position[] {
	const out: Position[] = [];
	for (let s = 0; s <= l.seconds; s += 10) {
		const u = s / l.seconds;
		const e = l.from[0] + (l.to[0] - l.from[0]) * u;
		const n = l.from[1] + (l.to[1] - l.from[1]) * u;
		const [lat, lon] = fromLocalNm(ORIGIN, [e, n]);
		out.push({ t: l.start + s * 1000, lat, lon, alt: l.alt, gs: 120, hdg: 0, dist: Math.hypot(e, n) });
	}
	return out;
}

function flight(id: string, tail: string | null, line: Line): Flight {
	return {
		id,
		airport: ICAO,
		night: NIGHT,
		ident: id.toUpperCase(),
		tail,
		type: 'C172',
		category: 'private',
		operator: null,
		operatorName: null, operatorShort: null,
		direction: 'arrival',
		eventTime: line.start,
		otherCode: null,
		otherName: null,
		otherCity: null,
		positions: positionsAlong(line)
	};
}

// 10 NM in 300 s = 120 kt. A and B meet at e = 0 after 150 s.
const westToEast: Line = { from: [-5, 0], to: [5, 0], alt: 2000, start: T0, seconds: 300 };
const eastToWest: Line = { from: [5, 0.5], to: [-5, 0.5], alt: 2000, start: T0, seconds: 300 };

describe('findIncidents', () => {
	it('(a) flags a head-on crossing within 0.5 NM at the same altitude as very-close', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', eastToWest);
		const inc = findIncidents(ORIGIN, ICAO, NIGHT, [a, b]);
		expect(inc).toHaveLength(1);
		const i = inc[0];
		expect(i.severity).toBe('very-close');
		expect(Math.abs(i.lateralNm - 0.5)).toBeLessThanOrEqual(0.05);
		expect(i.verticalFt).toBe(0);
		expect(Math.abs(i.t - (T0 + 150_000))).toBeLessThanOrEqual(2000);
		expect(i.flightA).toBe('fa-a');
		expect(i.flightB).toBe('fa-b');
		expect(i.altA).toBe(2000);
		expect(i.altB).toBe(2000);
		expect(i.airport).toBe(ICAO);
		expect(i.night).toBe(NIGHT);
		// Closest moment is over the field, so ~0.25 NM from the origin.
		expect(i.distNm).toBeLessThan(0.4);
		// Interpolated positions are near the origin, on either side of the line.
		expect(Math.abs(i.posA[0] - ORIGIN[0])).toBeLessThan(0.001);
		expect(i.posB[0]).toBeGreaterThan(i.posA[0]);
	});

	it('flags a 2 NM / 800 ft pass as closer-than-allowed, not very-close', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', { ...eastToWest, from: [5, 2], to: [-5, 2], alt: 2800 });
		const inc = findIncidents(ORIGIN, ICAO, NIGHT, [a, b]);
		expect(inc).toHaveLength(1);
		expect(inc[0].severity).toBe('closer-than-allowed');
		expect(Math.abs(inc[0].lateralNm - 2)).toBeLessThanOrEqual(0.05);
		expect(inc[0].verticalFt).toBe(800);
	});

	it('(b) ignores parallel tracks 5 NM apart', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', { ...westToEast, from: [-5, 5], to: [5, 5] });
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [a, b])).toEqual([]);
	});

	it('(c) ignores crossing tracks 2,000 ft apart vertically', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', { ...eastToWest, alt: 4000 });
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [a, b])).toEqual([]);
	});

	it('(d) ignores two flight ids carried by the same tail', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N111AA', eastToWest);
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [a, b])).toEqual([]);
		// ...but a null tail on both is not "the same aircraft".
		const c = flight('fa-c', null, westToEast);
		const d = flight('fa-d', null, eastToWest);
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [c, d])).toHaveLength(1);
	});

	it('(e) ignores tracks whose time spans do not overlap', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', { ...eastToWest, start: T0 + 600_000 });
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [a, b])).toEqual([]);
	});

	it('(f) incidentId is stable and order-independent', () => {
		const ab = incidentId('KPAE', NIGHT, 'fa-a', 'fa-b');
		const ba = incidentId('KPAE', NIGHT, 'fa-b', 'fa-a');
		expect(ab).toBe(ba);
		expect(ab).toMatch(/^PAE-20260814-[0-9a-z]+$/);
		expect(incidentId('KPAE', NIGHT, 'fa-a', 'fa-c')).not.toBe(ab);
		expect(incidentId('KPAE', '2026-08-15', 'fa-a', 'fa-b')).not.toBe(ab);
		expect(incidentId('KBLI', NIGHT, 'fa-a', 'fa-b')).not.toBe(ab);
	});

	it('(g) is deterministic and independent of input order', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', eastToWest);
		const first = findIncidents(ORIGIN, ICAO, NIGHT, [a, b]);
		const second = findIncidents(ORIGIN, ICAO, NIGHT, [a, b]);
		const swapped = findIncidents(ORIGIN, ICAO, NIGHT, [b, a]);
		expect(second).toEqual(first);
		expect(swapped).toEqual(first);
	});

	it('skips flights with fewer than two distinct positions', () => {
		const a = flight('fa-a', 'N111AA', westToEast);
		const b = flight('fa-b', 'N222BB', eastToWest);
		b.positions = [b.positions[0], { ...b.positions[0] }];
		expect(buildTrackSpline(ORIGIN, b)).toBeNull();
		expect(findIncidents(ORIGIN, ICAO, NIGHT, [a, b])).toEqual([]);
	});
});

describe('closestApproach / severityOf', () => {
	it('returns null when the pair never gets inside both minima', () => {
		const a = buildTrackSpline(ORIGIN, flight('fa-a', null, westToEast))!;
		const far = buildTrackSpline(ORIGIN, flight('fa-b', null, { ...westToEast, from: [-5, 3.5], to: [5, 3.5] }))!;
		expect(closestApproach(a.spline, far.spline)).toBeNull();
	});
	it('reports the closest moment', () => {
		const a = buildTrackSpline(ORIGIN, flight('fa-a', null, westToEast))!;
		const b = buildTrackSpline(ORIGIN, flight('fa-b', null, eastToWest))!;
		const cp = closestApproach(a.spline, b.spline)!;
		expect(cp.lateralNm).toBeCloseTo(0.5, 3);
		expect(cp.t).toBe(T0 + 150_000);
	});
	it('severity thresholds are exclusive', () => {
		expect(severityOf(0.99, 499)).toBe('very-close');
		expect(severityOf(1, 499)).toBe('closer-than-allowed');
		expect(severityOf(0.99, 500)).toBe('closer-than-allowed');
	});
});

describe('sameAircraft (ghost records)', () => {
	it('a sparse ad-hoc record riding on a real track is the same aircraft, a parallel one is not', () => {
		const origin: [number, number] = [47.9079, -122.2816];
		const mk = (id: string, pts: [number, number, number, number][]): Flight => ({
			id, airport: 'KPAE', night: '2026-08-22', ident: id, tail: null, type: null, category: 'private', operator: null, operatorName: null, operatorShort: null,
			direction: 'departure', eventTime: 0, otherCode: null, otherName: null, otherCity: null,
			positions: pts.map(([t, e, n, alt]) => { const [lat, lon] = fromLocalNm(origin, [e, n]); return { t, lat, lon, alt, gs: 200, hdg: 0, dist: Math.hypot(e, n) }; })
		});
		// Real track: 16 s reports climbing out northbound.
		const real = mk('REAL', Array.from({ length: 20 }, (_, i) => [i * 16_000, 0, i * 0.9, 2000 + i * 400] as [number, number, number, number]));
		// Ghost: a report every 60 s on the same path (small jitter).
		const ghost = mk('GHOST', [0, 60_000, 120_000, 180_000, 240_000].map((t) => [t, 0.03, (t / 16_000) * 0.9, 2000 + (t / 16_000) * 400 + 40] as [number, number, number, number]));
		// A genuinely separate aircraft 0.5 NM abeam at the same altitude.
		const other = mk('OTHER', [0, 60_000, 120_000, 180_000, 240_000].map((t) => [t, 0.5, (t / 16_000) * 0.9, 2000 + (t / 16_000) * 400] as [number, number, number, number]));
		const T = (f: Flight) => buildTrackSpline(origin, f)!;
		expect(sameAircraft(T(real), T(ghost), origin)).toBe(true);
		expect(sameAircraft(T(real), T(other), origin)).toBe(false);
		// findIncidents drops the ghost pair but still flags the real neighbour.
		const ids = findIncidents(origin, 'KPAE', '2026-08-22', [real, ghost, other]).map((i) => [i.flightA, i.flightB].sort().join('+'));
		expect(ids).not.toContain('GHOST+REAL');
		expect(ids).toContain('OTHER+REAL');
	});
});

describe('dropGhosts', () => {
	it('keeps the record with tail/type and the most reports, drops its ghost, leaves others alone', () => {
		const origin: [number, number] = [47.9079, -122.2816];
		const mk = (id: string, tail: string | null, type: string | null, pts: [number, number, number, number][]): Flight => ({
			id, airport: 'KPAE', night: '2026-08-22', ident: id, tail, type, category: 'private', operator: null, operatorName: null, operatorShort: null,
			direction: 'departure', eventTime: 0, otherCode: null, otherName: null, otherCity: null,
			positions: pts.map(([t, e, n, alt]) => { const [lat, lon] = fromLocalNm(origin, [e, n]); return { t, lat, lon, alt, gs: 200, hdg: 0, dist: Math.hypot(e, n) }; })
		});
		const real = mk('SWA8507', 'N247WN', 'B737', Array.from({ length: 20 }, (_, i) => [i * 16_000, 0, i * 0.9, 2000 + i * 400] as [number, number, number, number]));
		const ghost = mk('OV3510', null, null, [0, 60_000, 120_000, 180_000, 240_000].map((t) => [t, 0.03, (t / 16_000) * 0.9, 2000 + (t / 16_000) * 400 + 40] as [number, number, number, number]));
		const other = mk('N1', 'N1', 'C172', [0, 60_000, 120_000, 180_000, 240_000].map((t) => [t, 0.5, (t / 16_000) * 0.9, 2000 + (t / 16_000) * 400] as [number, number, number, number]));
		const r = dropGhosts(origin, [ghost, real, other]);
		expect(r.dropped.map((f) => f.id)).toEqual(['OV3510']);
		expect(r.kept.map((f) => f.id)).toEqual(['SWA8507', 'N1']);
	});
});
