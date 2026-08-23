/**
 * Close-approach detection. Pure and synchronous so it can be unit tested and
 * re-run over cached data at any time.
 */
import { SEPARATION_LATERAL_NM, SEPARATION_VERTICAL_FT, VERY_CLOSE_LATERAL_NM, VERY_CLOSE_VERTICAL_FT } from './airports';
import { distanceNm, fromLocalNm, toLocalNm, type LatLon } from './geo';
import { Spline } from './spline';
import type { Flight, Incident, Position, Severity } from './types';

export interface TrackSpline {
	flight: Flight;
	spline: Spline; // channels: [east NM, north NM, alt ft]
}

export function buildTrackSpline(origin: LatLon, flight: Flight): TrackSpline | null {
	const pts = flight.positions
		.slice()
		.sort((a, b) => a.t - b.t)
		.filter((p, i, arr) => i === 0 || p.t > arr[i - 1].t) // drop duplicate timestamps
		.map((p) => ({ t: p.t, v: [...toLocalNm(origin, [p.lat, p.lon]), p.alt] }));
	if (pts.length < 2) return null;
	return { flight, spline: new Spline(pts) };
}

export interface ClosestPoint {
	t: number;
	lateralNm: number;
	verticalFt: number;
	a: number[];
	b: number[];
}

/**
 * Walk the overlapping time span of two tracks on a shared clock and return
 * the closest moment at which both aircraft were simultaneously inside the
 * lateral AND vertical minima. Returns null if that never happened.
 */
export function closestApproach(a: Spline, b: Spline, stepMs = 1000): ClosestPoint | null {
	const start = Math.max(a.t0, b.t0);
	const end = Math.min(a.t1, b.t1);
	if (end - start < 0) return null;
	let best: ClosestPoint | null = null;
	for (let t = start; t <= end; t += stepMs) {
		const pa = a.at(t)!,
			pb = b.at(t)!;
		const dx = pa[0] - pb[0],
			dy = pa[1] - pb[1];
		const lateral = Math.hypot(dx, dy);
		const vertical = Math.abs(pa[2] - pb[2]);
		if (lateral < SEPARATION_LATERAL_NM && vertical < SEPARATION_VERTICAL_FT) {
			// Rank by lateral first (the figure people understand), vertical second.
			if (!best || lateral < best.lateralNm || (lateral === best.lateralNm && vertical < best.verticalFt)) {
				best = { t, lateralNm: lateral, verticalFt: vertical, a: pa, b: pb };
			}
		}
	}
	return best;
}

export function severityOf(lateralNm: number, verticalFt: number): Severity {
	return lateralNm < VERY_CLOSE_LATERAL_NM && verticalFt < VERY_CLOSE_VERTICAL_FT ? 'very-close' : 'closer-than-allowed';
}

/** Find every flagged pair among a night's flights. Deterministic and idempotent. */
export function findIncidents(origin: LatLon, airportIcao: string, night: string, flights: Flight[]): Incident[] {
	const tracks = flights.map((f) => buildTrackSpline(origin, f)).filter((t): t is TrackSpline => !!t);
	tracks.sort((x, y) => x.flight.id.localeCompare(y.flight.id));
	const out: Incident[] = [];
	for (let i = 0; i < tracks.length; i++) {
		for (let j = i + 1; j < tracks.length; j++) {
			const A = tracks[i],
				B = tracks[j];
			if (A.spline.t1 < B.spline.t0 || B.spline.t1 < A.spline.t0) continue;
			// One physical aircraft can carry two flight ids back to back (e.g. a
			// touch-and-go). It cannot be close to itself.
			if (A.flight.tail && A.flight.tail === B.flight.tail) continue;
			const cp = closestApproach(A.spline, B.spline);
			if (!cp) continue;
			const posA = fromLocalNm(origin, [cp.a[0], cp.a[1]]);
			const posB = fromLocalNm(origin, [cp.b[0], cp.b[1]]);
			const mid: LatLon = [(posA[0] + posB[0]) / 2, (posA[1] + posB[1]) / 2];
			out.push({
				id: incidentId(airportIcao, night, A.flight.id, B.flight.id),
				airport: airportIcao,
				night,
				t: cp.t,
				lateralNm: round(cp.lateralNm, 2),
				verticalFt: Math.round(cp.verticalFt),
				distNm: round(distanceNm(origin, mid), 2),
				severity: severityOf(cp.lateralNm, cp.verticalFt),
				flightA: A.flight.id,
				flightB: B.flight.id,
				altA: Math.round(cp.a[2]),
				altB: Math.round(cp.b[2]),
				posA: [round(posA[0], 5), round(posA[1], 5)],
				posB: [round(posB[0], 5), round(posB[1], 5)]
			});
		}
	}
	out.sort((x, y) => x.t - y.t);
	return out;
}

/** Stable id: same inputs always yield the same incident id. */
export function incidentId(airport: string, night: string, a: string, b: string): string {
	const [x, y] = [a, b].sort();
	let h = 2166136261;
	for (const ch of `${airport}|${night}|${x}|${y}`) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return `${airport.replace(/^K/, '')}-${night.replace(/-/g, '')}-${(h >>> 0).toString(36)}`;
}

function round(n: number, places: number): number {
	const k = 10 ** places;
	return Math.round(n * k) / k;
}

/** Convenience for callers that need a spline over raw positions. */
export function positionsSpline(origin: LatLon, positions: Position[]): Spline {
	return new Spline(positions.map((p) => ({ t: p.t, v: [...toLocalNm(origin, [p.lat, p.lon]), p.alt] })));
}
