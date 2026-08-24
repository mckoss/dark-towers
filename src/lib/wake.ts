/** Wake-turbulence detection using FAA JO 7110.65BB CWT categories and tables 5-5-3/4. */
import { AIRSPACE_RADIUS_NM, GROUND_AGL_FT, GROUND_SPEED_KT } from './airports';
import { distanceNm, fromLocalNm, type LatLon } from './geo';
import { buildTrackSpline, incidentId, sameAircraft, type ApproachOptions, type TrackSpline } from './separation';
import type { Flight, Incident, WakeCategory } from './types';

type Matrix = Partial<Record<WakeCategory, Partial<Record<WakeCategory, number>>>>;
export const DIRECTLY_BEHIND_MINIMA: Matrix = {
	A: { B: 5, C: 6, D: 6, E: 7, F: 7, G: 7, H: 8, I: 8 },
	B: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 5, I: 5 },
	C: { E: 3.5, F: 3.5, G: 3.5, H: 5, I: 5 },
	D: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 5, I: 5 },
	E: { I: 4 }
};
export const ON_APPROACH_MINIMA: Matrix = {
	...DIRECTLY_BEHIND_MINIMA,
	B: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 5, I: 6 },
	C: { E: 3.5, F: 3.5, G: 3.5, H: 5, I: 6 },
	D: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 6, I: 6 },
	E: { I: 4 }, F: { I: 4 }
};

export function wakeMinimum(leader: WakeCategory | null, follower: WakeCategory, onApproach: boolean): number | null {
	if (!leader) return null;
	return (onApproach ? ON_APPROACH_MINIMA : DIRECTLY_BEHIND_MINIMA)[leader]?.[follower] ?? null;
}

function angle(a: number[], b: number[]): number {
	const dot = a[0] * b[0] + a[1] * b[1], ma = Math.hypot(a[0], a[1]), mb = Math.hypot(b[0], b[1]);
	if (!ma || !mb) return 180;
	return Math.acos(Math.max(-1, Math.min(1, dot / ma / mb))) * 180 / Math.PI;
}

interface Candidate { t: number; spacing: number; trailSeconds: number; leader: number[]; follower: number[] }
function candidate(leader: TrackSpline, follower: TrackSpline, minimum: number, opts: ApproachOptions): Candidate | null {
	const start = Math.max(leader.spline.t0, follower.spline.t0), end = Math.min(leader.spline.t1, follower.spline.t1);
	let best: Candidate | null = null;
	for (let t = start; t <= end; t += opts.stepMs ?? 1000) {
		const l = leader.spline.at(t)!, f = follower.spline.at(t)!;
		if (l[3] < GROUND_SPEED_KT || f[3] < GROUND_SPEED_KT) continue;
		const offset = opts.altOffset?.(t) ?? 0;
		if (opts.elevationFt != null && (l[2] - offset <= opts.elevationFt + GROUND_AGL_FT || f[2] - offset <= opts.elevationFt + GROUND_AGL_FT)) continue;
		if (Math.hypot(f[0], f[1]) > (opts.radiusNm ?? AIRSPACE_RADIUS_NM)) continue;
		const vl = leader.spline.velocityAt(t)!, vf = follower.spline.velocityAt(t)!;
		if (angle(vl, vf) > 15) continue;
		const mag = Math.hypot(vl[0], vl[1]);
		const ahead = ((l[0] - f[0]) * vl[0] + (l[1] - f[1]) * vl[1]) / mag;
		if (ahead <= 0 || ahead >= minimum) continue;
		// FAA CWT applicability: follower no more than 1,000 ft below and within 2,500 ft vertically.
		const dz = f[2] - l[2];
		if (Math.abs(dz) > 2500 || dz < -1000) continue;
		// Estimate when the leader occupied the follower's along-track position,
		// then search a small window to accommodate turns and changing speed.
		const estimate = t - ahead / mag;
		let closest = Infinity, earlier = 0;
		for (let past = Math.max(leader.spline.t0, estimate - 20_000); past < Math.min(t, estimate + 20_000); past += 1000) {
			const p = leader.spline.at(past)!;
			const d = Math.hypot(p[0] - f[0], p[1] - f[1]);
			if (d < closest) { closest = d; earlier = past; }
		}
		if (closest > 0.5 || !earlier) continue;
		const c = { t, spacing: ahead, trailSeconds: Math.round((t - earlier) / 1000), leader: l, follower: f };
		if (!best || c.spacing / minimum < best.spacing / minimum) best = c;
	}
	return best;
}

export function findWakeIncidents(origin: LatLon, airport: string, night: string, flights: Flight[], categories: Map<string, WakeCategory>, opts: ApproachOptions = {}): Incident[] {
	const tracks = flights.map((f) => buildTrackSpline(origin, f)).filter((x): x is TrackSpline => !!x);
	const out: Incident[] = [];
	for (const leader of tracks) for (const follower of tracks) {
		if (leader === follower || leader.flight.tail && leader.flight.tail === follower.flight.tail || sameAircraft(leader, follower, origin)) continue;
		const lc = leader.flight.type ? categories.get(leader.flight.type.toUpperCase()) ?? null : null;
		const fc = follower.flight.type ? categories.get(follower.flight.type.toUpperCase()) ?? 'I' : 'I';
		const approach = leader.flight.direction === 'arrival' && follower.flight.direction === 'arrival';
		const required = wakeMinimum(lc, fc, approach);
		if (!required) continue;
		const c = candidate(leader, follower, required, opts);
		if (!c) continue;
		const posA = fromLocalNm(origin, [c.leader[0], c.leader[1]]), posB = fromLocalNm(origin, [c.follower[0], c.follower[1]]);
		out.push({ id: incidentId(airport, night, leader.flight.id, follower.flight.id, 'wake-turbulence'), kind: 'wake-turbulence', airport, night, t: c.t,
			lateralNm: Math.round(c.spacing * 100) / 100, verticalFt: Math.round(Math.abs(c.leader[2] - c.follower[2])), distNm: Math.round(distanceNm(origin, posB) * 100) / 100,
			severity: 'closer-than-allowed', flightA: leader.flight.id, flightB: follower.flight.id, altA: Math.round(c.leader[2]), altB: Math.round(c.follower[2]), gsA: Math.round(c.leader[3]), gsB: Math.round(c.follower[3]),
			posA: [Math.round(posA[0] * 1e5) / 1e5, Math.round(posA[1] * 1e5) / 1e5], posB: [Math.round(posB[0] * 1e5) / 1e5, Math.round(posB[1] * 1e5) / 1e5],
			requiredNm: required, leaderCategory: lc, followerCategory: fc, trailSeconds: c.trailSeconds });
	}
	return out.sort((a, b) => a.t - b.t);
}
