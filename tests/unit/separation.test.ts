import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromLocalNm, toLocalNm, type LatLon } from '$lib/geo';
import { closestApproach, buildTrackSpline, dropGhosts, findIncidents, incidentId, radarTrack, sameAircraft, severityOf } from '$lib/separation';
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

	it('a coarse radar copy of an airline arrival is the same aircraft', () => {
		const origin: [number, number] = [59.64554861, -151.47659472];
		const mk = (id: string, ident: string, tail: string | null, positions: Position[]): Flight => ({
			id, airport: 'PAHO', night: '2026-08-16', ident, tail, type: 'SB20', category: 'airline', operator: 'SRY', operatorName: null, operatorShort: null,
			direction: 'arrival', eventTime: ident === 'SRY681' ? 1786894604000 : 1786894620000, otherCode: 'ANC', otherName: 'Anchorage Intl', otherCity: 'Anchorage',
			positions
		});
		const real = mk('SRY1401-1786695705-airline-593p', 'SRY681', 'N681SA', [
			{ t: 1786894107418, lat: 59.944355, lon: -151.185255, alt: 8416, gs: 233, hdg: 166, dist: 20 },
			{ t: 1786894113000, lat: 59.93825, lon: -151.18268, alt: 8300, gs: 233, hdg: 166, dist: 19.69 },
			{ t: 1786894143000, lat: 59.90643, lon: -151.16711, alt: 7600, gs: 230, hdg: 166, dist: 18.24 },
			{ t: 1786894173000, lat: 59.87833, lon: -151.15311, alt: 6800, gs: 211, hdg: 166, dist: 17.06 },
			{ t: 1786894203000, lat: 59.85044, lon: -151.13873, alt: 6000, gs: 200, hdg: 165, dist: 15.99 },
			{ t: 1786894233000, lat: 59.82368, lon: -151.12367, alt: 5300, gs: 202, hdg: 165, dist: 15.11 },
			{ t: 1786894263000, lat: 59.79356, lon: -151.10728, alt: 4800, gs: 227, hdg: 165, dist: 14.28 },
			{ t: 1786894288000, lat: 59.76869, lon: -151.09433, alt: 4300, gs: 233, hdg: 167, dist: 13.74 },
			{ t: 1786894305000, lat: 59.75054, lon: -151.09753, alt: 4000, gs: 232, hdg: 196, dist: 13.1 },
			{ t: 1786894325000, lat: 59.73527, lon: -151.12282, alt: 3600, gs: 229, hdg: 232, dist: 12 },
			{ t: 1786894348000, lat: 59.72305, lon: -151.164, alt: 3200, gs: 219, hdg: 244, dist: 10.55 },
			{ t: 1786894379000, lat: 59.71055, lon: -151.21563, alt: 2900, gs: 190, hdg: 244, dist: 8.82 },
			{ t: 1786894409000, lat: 59.69943, lon: -151.26288, alt: 2600, gs: 188, hdg: 245, dist: 7.24 },
			{ t: 1786894428000, lat: 59.69258, lon: -151.29291, alt: 2300, gs: 186, hdg: 251, dist: 6.24 },
			{ t: 1786894448000, lat: 59.689, lon: -151.32523, alt: 2000, gs: 171, hdg: 260, dist: 5.28 },
			{ t: 1786894469000, lat: 59.68467, lon: -151.35542, alt: 1600, gs: 155, hdg: 249, dist: 4.36 },
			{ t: 1786894480000, lat: 59.6816, lon: -151.36897, alt: 1400, gs: 148, hdg: 245, dist: 3.92 },
			{ t: 1786894485000, lat: 59.68039, lon: -151.37384, alt: 1400, gs: 146, hdg: 244, dist: 3.75 },
			{ t: 1786894504000, lat: 59.67398, lon: -151.39618, alt: 1100, gs: 140, hdg: 239, dist: 2.98 },
			{ t: 1786894520000, lat: 59.66844, lon: -151.41193, alt: 900, gs: 136, hdg: 235, dist: 2.39 },
			{ t: 1786894540000, lat: 59.66167, lon: -151.43115, alt: 600, gs: 132, hdg: 236, dist: 1.68 },
			{ t: 1786894556000, lat: 59.65572, lon: -151.44795, alt: 400, gs: 134, hdg: 235, dist: 1.06 },
			{ t: 1786894572000, lat: 59.65009, lon: -151.46375, alt: 300, gs: 133, hdg: 235, dist: 0.48 }
		]);
		const ghost = mk('SRY1401-1786892888-sw-2118p', 'SRY1401', 'SRY1401', [
			{ t: 1786894104901, lat: 59.941753, lon: -151.175027, alt: 8352, gs: 235, hdg: 171, dist: 20 },
			{ t: 1786894135000, lat: 59.91667, lon: -151.16667, alt: 7700, gs: 230, hdg: 171, dist: 18.78 },
			{ t: 1786894195000, lat: 59.85, lon: -151.13333, alt: 6100, gs: 210, hdg: 166, dist: 16.08 },
			{ t: 1786894255000, lat: 59.8, lon: -151.1, alt: 4800, gs: 210, hdg: 161, dist: 14.7 },
			{ t: 1786894315000, lat: 59.73333, lon: -151.1, alt: 3700, gs: 230, hdg: 180, dist: 12.57 },
			{ t: 1786894375000, lat: 59.7, lon: -151.2, alt: 2800, gs: 210, hdg: 237, dist: 9 },
			{ t: 1786894435000, lat: 59.68333, lon: -151.3, alt: 2000, gs: 190, hdg: 252, dist: 5.82 },
			{ t: 1786894495000, lat: 59.66667, lon: -151.38333, alt: 1100, gs: 150, hdg: 248, dist: 3.1 },
			{ t: 1786894555000, lat: 59.65, lon: -151.43333, alt: 800, gs: 130, hdg: 237, dist: 1.34 }
		]);
		expect(sameAircraft(buildTrackSpline(origin, real)!, buildTrackSpline(origin, ghost)!, origin)).toBe(true);
		expect(findIncidents(origin, 'PAHO', '2026-08-16', [real, ghost])).toEqual([]);

		const other = mk('SRY9999-1786892888-airline-1p', 'SRY9999', 'N999SA', ghost.positions.map((p) => {
			const [lat, lon] = fromLocalNm(origin, [toLocalNm(origin, [p.lat, p.lon])[0] + 1.2, toLocalNm(origin, [p.lat, p.lon])[1]]);
			return { ...p, lat, lon };
		}));
		expect(sameAircraft(buildTrackSpline(origin, real)!, buildTrackSpline(origin, other)!, origin)).toBe(false);
	});
});

describe('radar copies (sparse ghost records)', () => {
	// A Southwest departure climbing out north-west at 220 kt, ADS-B every 4 s.
	const origin: LatLon = [47.9079, -122.2816];
	const HDG = 330;
	const KT = 220;
	const rad = (HDG * Math.PI) / 180;
	const at = (s: number, abeamNm = 0): [number, number, number] => {
		const along = (KT / 3600) * s;
		return [Math.sin(rad) * along + Math.cos(rad) * abeamNm, Math.cos(rad) * along - Math.sin(rad) * abeamNm, 1500 + s * 15];
	};
	// Radar cuts positions toward zero on the arc-minute grid.
	const cut = (deg: number) => Math.trunc(deg * 60) / 60;
	const pos = (t: number, [e, n, alt]: [number, number, number], grid = false): Position => {
		let [lat, lon] = fromLocalNm(origin, [e, n]);
		if (grid) [lat, lon] = [cut(lat), cut(lon)];
		return { t: T0 + t * 1000, lat, lon, alt: Math.round(alt / 100) * 100, gs: KT, hdg: HDG, dist: Math.hypot(e, n) };
	};
	const mk = (id: string, ident: string, tail: string | null, type: string | null, positions: Position[]): Flight => ({
		id, airport: ICAO, night: NIGHT, ident, tail, type, category: tail ? 'airline' : 'private', operator: tail ? 'SWA' : null, operatorName: null, operatorShort: null,
		direction: 'departure', eventTime: T0, otherCode: tail ? 'LAS' : null, otherName: null, otherCity: null, positions
	});
	const real = mk('SWA1234-1-airline-1p', 'SWA1234', 'N8501V', 'B38M', Array.from({ length: 76 }, (_, i) => pos(i * 4, at(i * 4))));
	const minutes = [10, 70, 130, 190, 250];

	it('a lagging radar copy on the arc-minute grid is the same aircraft', () => {
		// The same transponder seen by radar under an ad-hoc ident: one report a
		// minute, cut to whole arc-minutes, about 8 s behind the ADS-B track.
		const shadow = mk('OV1234-2-adhoc-1p', 'OV1234', null, null, minutes.map((s) => pos(s, at(s - 8), true)));
		expect(radarTrack(shadow)).toBe(true);
		const T = (f: Flight) => buildTrackSpline(origin, f)!;
		expect(sameAircraft(T(real), T(shadow), origin)).toBe(true);
		expect(findIncidents(origin, ICAO, NIGHT, [real, shadow])).toEqual([]);
		expect(dropGhosts(origin, [shadow, real]).dropped.map((f) => f.id)).toEqual(['OV1234-2-adhoc-1p']);
	});

	it('a lagging radar copy off the grid is the same aircraft', () => {
		// 10 s behind: 0.6 NM back along the track at the same instant.
		const shadow = mk('OV2345-5-adhoc-1p', 'OV2345', null, null, minutes.map((s) => pos(s, at(s - 10, 0.05))));
		expect(findIncidents(origin, ICAO, NIGHT, [real, shadow])).toEqual([]);
	});

	it('a sparse untyped aircraft 0.5 NM abeam is still a close approach', () => {
		const abeam = mk('OV5678-3-adhoc-1p', 'OV5678', null, null, minutes.map((s) => pos(s, at(s, 0.5))));
		expect(radarTrack(abeam)).toBe(true);
		expect(sameAircraft(buildTrackSpline(origin, real)!, buildTrackSpline(origin, abeam)!, origin)).toBe(false);
		expect(findIncidents(origin, ICAO, NIGHT, [real, abeam])).toHaveLength(1);
	});

	it('a sparse untyped aircraft 1.5 NM abeam on the grid is still a close approach', () => {
		const abeam = mk('OV6789-6-adhoc-1p', 'OV6789', null, null, minutes.map((s) => pos(s, at(s, 1.5), true)));
		expect(radarTrack(abeam)).toBe(true);
		expect(findIncidents(origin, ICAO, NIGHT, [real, abeam])).toHaveLength(1);
	});

	it('the ADS-B record itself is not a radar track', () => {
		expect(radarTrack(real)).toBe(false);
		// Mirror image: the ADS-B record is never loosely matched to a sparse neighbour.
		const typed = mk('N12345-4-adhoc-1p', 'N12345', 'N12345', 'C172', minutes.map((s) => pos(s, at(s, 0.5))));
		expect(findIncidents(origin, ICAO, NIGHT, [real, typed])).toHaveLength(1);
	});

	it('recorded case: OV3542 on radar is the Lufthansa departure it rode on', () => {
		// PAE 2026-10-02: a Boeing delivery flight and its radar copy, published
		// as a 0.00 NM / 22 ft close approach before radar copies were matched.
		const c = JSON.parse(fs.readFileSync('tests/fixtures/ghosts/PAE-20261002-jpmz8.json', 'utf8')) as { origin: LatLon; night: string; flights: Flight[] };
		const [dlh, ov] = c.flights;
		expect(radarTrack(ov)).toBe(true);
		expect(radarTrack(dlh)).toBe(false);
		expect(sameAircraft(buildTrackSpline(c.origin, dlh)!, buildTrackSpline(c.origin, ov)!, c.origin)).toBe(true);
		expect(findIncidents(c.origin, ICAO, c.night, [dlh, ov])).toEqual([]);
		expect(dropGhosts(c.origin, [ov, dlh]).dropped.map((f) => f.ident)).toEqual(['OV3542']);
	});

	it('a formation flight is two aircraft, however alike their operator and route', () => {
		// Two of one company's aircraft, related flight numbers, both on ADS-B,
		// 0.3 NM apart the whole way.
		const lead = mk('SRY681-7-airline-1p', 'SRY681', 'N681SA', 'C208', Array.from({ length: 76 }, (_, i) => pos(i * 4, at(i * 4))));
		const wing = mk('SRY682-8-airline-1p', 'SRY682', 'N682SA', 'C208', Array.from({ length: 76 }, (_, i) => pos(i * 4 + 2, at(i * 4 + 2, 0.3))));
		for (const f of [lead, wing]) Object.assign(f, { operator: 'SRY', category: 'airline', otherCode: 'ANC' });
		expect(radarTrack(wing)).toBe(false);
		expect(sameAircraft(buildTrackSpline(origin, lead)!, buildTrackSpline(origin, wing)!, origin)).toBe(false);
		expect(dropGhosts(origin, [lead, wing]).dropped).toEqual([]);
		expect(findIncidents(origin, ICAO, NIGHT, [lead, wing])).toHaveLength(1);
	});

	it('recorded case: N49KJ on radar is N749KJ on ADS-B, not a neighbour', () => {
		// PAE 2024-06-20: one aircraft filed twice, the radar copy under a
		// one-digit-off tail. Before, it was a "close approach" at 0.00 NM.
		const recorded = (file: string, tail: string): Flight => {
			const raw = JSON.parse(fs.readFileSync(`tests/fixtures/raw/KPAE/tracks/${file}.json`, 'utf8')) as { positions: { timestamp: string; latitude: number; longitude: number; altitude: number; groundspeed: number; heading: number }[] };
			return {
				id: file, airport: ICAO, night: '2024-06-20', ident: tail, tail, type: 'C172', category: 'private', operator: null, operatorName: null, operatorShort: null,
				direction: 'departure', eventTime: 0, otherCode: null, otherName: null, otherCity: null,
				positions: raw.positions
					.map((p) => ({ t: Date.parse(p.timestamp), lat: p.latitude, lon: p.longitude, alt: p.altitude * 100, gs: p.groundspeed, hdg: p.heading, dist: Math.hypot(...toLocalNm(ORIGIN, [p.latitude, p.longitude])) }))
					.filter((p) => p.dist <= 20) // as the pipeline clips
			};
		};
		const T = (f: Flight) => buildTrackSpline(ORIGIN, f)!;
		const radar = recorded('N49KJ-1718938261-adhoc-314p', 'N49KJ');
		const adsb = recorded('N749KJ-1718937361-adhoc-270p', 'N749KJ');
		const neighbour = recorded('N248JW-1718942118-adhoc-553p', 'N248JW');
		expect(radarTrack(radar)).toBe(true);
		expect(radarTrack(adsb)).toBe(false);
		expect(sameAircraft(T(radar), T(adsb), ORIGIN)).toBe(true);
		expect(sameAircraft(T(radar), T(neighbour), ORIGIN)).toBe(false);
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
