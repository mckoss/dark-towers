/**
 * Replay model for a close approach. Pure (no DOM) so it can be unit tested.
 *
 * Positions carry real timestamps, so the replay is a direct playback of both
 * tracks on one shared clock: sample each aircraft's spline at the same
 * instant and report where they were and how far apart. No anchoring, no
 * offsets, no correction factors.
 */
import { SEPARATION_LATERAL_NM, SEPARATION_VERTICAL_FT } from './airports';
import { fromLocalNm, type LatLon } from './geo';
import { buildTrackSpline } from './separation';
import type { Spline } from './spline';
import type { Flight } from './types';

/** Seconds before / after the closest moment the replay covers. */
export const WINDOW_BEFORE_MS = 180_000;
export const WINDOW_AFTER_MS = 90_000;

export interface AircraftSample {
	lat: number;
	lon: number;
	/** Feet. */
	alt: number;
	/** Degrees true, 0–360. */
	hdg: number;
	/** False before the track starts or after it ends (aircraft on the ground / out of range). */
	active: boolean;
}

export interface ReplaySample {
	t: number;
	a: AircraftSample;
	b: AircraftSample;
	lateralNm: number;
	verticalFt: number;
	/** Both inside the controller minima at once. */
	inside: boolean;
}

export interface Replay {
	/** Unix ms. */
	start: number;
	end: number;
	closestT: number;
	sampleAt(t: number): ReplaySample;
	/** Positions of both aircraft at evenly spaced instants across the window (for fitting the map). */
	path(flight: 'a' | 'b', steps?: number): LatLon[];
}

function headingOf(spline: Spline, t: number, fallback: () => number): number {
	const v = spline.velocityAt(t);
	if (v && (Math.abs(v[0]) > 1e-9 || Math.abs(v[1]) > 1e-9)) {
		return ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360;
	}
	return fallback();
}

/** Recorded heading of the position report nearest to t. */
function nearestHdg(flight: Flight, t: number): number {
	let best = flight.positions[0];
	for (const p of flight.positions) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
	return best?.hdg ?? 0;
}

export function buildReplay(origin: LatLon, a: Flight, b: Flight, closestT: number): Replay | null {
	const ta = buildTrackSpline(origin, a);
	const tb = buildTrackSpline(origin, b);
	if (!ta || !tb) return null;
	const sa = ta.spline,
		sb = tb.spline;

	// Window around the recorded closest moment, clipped to the span EITHER
	// track covers. An aircraft whose track has not started yet, or that has
	// already landed, holds at its first/last reported point and is flagged
	// `active: false` so the view can show it parked rather than inventing
	// positions. This way the replay always starts outside the envelope.
	const spanStart = Math.min(sa.t0, sb.t0);
	const spanEnd = Math.max(sa.t1, sb.t1);
	let start = Math.max(closestT - WINDOW_BEFORE_MS, spanStart);
	let end = Math.min(closestT + WINDOW_AFTER_MS, spanEnd);
	if (end < start) [start, end] = [end, start];

	function sampleOne(spline: Spline, flight: Flight, t: number): AircraftSample {
		const v = spline.at(t)!;
		const [lat, lon] = fromLocalNm(origin, [v[0], v[1]]);
		const active = t >= spline.t0 && t <= spline.t1;
		return { lat, lon, alt: v[2], hdg: headingOf(spline, t, () => nearestHdg(flight, t)), active };
	}

	function sampleAt(t: number): ReplaySample {
		const tc = Math.min(Math.max(t, start), end);
		const pa = sa.at(tc)!,
			pb = sb.at(tc)!;
		const lateralNm = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
		const verticalFt = Math.abs(pa[2] - pb[2]);
		const A = sampleOne(sa, a, tc),
			B = sampleOne(sb, b, tc);
		return {
			t: tc,
			a: A,
			b: B,
			lateralNm,
			verticalFt,
			inside: A.active && B.active && lateralNm < SEPARATION_LATERAL_NM && verticalFt < SEPARATION_VERTICAL_FT
		};
	}

	function path(which: 'a' | 'b', steps = 120): LatLon[] {
		const out: LatLon[] = [];
		for (let i = 0; i <= steps; i++) {
			const s = sampleAt(start + ((end - start) * i) / steps)[which];
			out.push([s.lat, s.lon]);
		}
		return out;
	}

	return { start, end, closestT, sampleAt, path };
}

export const GLYPH_MIN_PX = 14;
export const GLYPH_MAX_PX = 34;

/**
 * Silhouette size from the pair's on-screen pixel separation at the closest
 * pass, so the two glyphs never merge on a short mobile map.
 */
export function glyphSizeFor(pixelSeparation: number): number {
	if (!Number.isFinite(pixelSeparation)) return GLYPH_MAX_PX;
	return Math.max(GLYPH_MIN_PX, Math.min(GLYPH_MAX_PX, Math.round(pixelSeparation * 0.52)));
}

export type Silhouette = 'airliner' | 'bizjet' | 'light';

/** Which outline to draw for an aircraft. */
export function silhouetteFor(category: string, type: string | null): Silhouette {
	const t = (type ?? '').toUpperCase();
	if (category === 'airline') return 'airliner';
	if (/^(B7|A3|E7|E1|CRJ|DH8|AT7|MD)/.test(t)) return 'airliner';
	if (/^(C5|C6|C7|LJ|CL|GLF|G[1-6]|E5|H25|BE4|PA46|P46|PC12|TBM|SF5|EA50|PRM1|HDJ)/.test(t)) return 'bizjet';
	return 'light';
}

/** Top-down schematic outlines, nose up, in a 40×40 box (from the prototype). */
export const SILHOUETTE_PATHS: Record<Silhouette, string> = {
	light:
		'M20 3c1.1 0 1.9 1.2 2 3.2l.2 5.3 15.3 3.4c.6.1 1 .6 1 1.2v1.5c0 .4-.4.7-.8.6L22.4 15l.3 9.6 4.6 1.9c.4.2.7.6.7 1v1.2c0 .4-.4.7-.8.6L20.6 27h-1.2l-6.6 2.3c-.4.1-.8-.2-.8-.6v-1.2c0-.4.3-.8.7-1l4.6-1.9.3-9.6L2.3 18.2c-.4.1-.8-.2-.8-.6V16c0-.6.4-1.1 1-1.2l15.3-3.4.2-5.3C18.1 4.2 18.9 3 20 3z',
	bizjet:
		'M20 2c1.5 0 2.6 1.8 2.8 4.6l.5 8.2 13.4 8.6c.5.3.8.9.8 1.5v2.3c0 .5-.5.8-.9.6l-13.4-5.6.4 6.8 4.3 3c.4.3.6.7.6 1.2v1.4c0 .5-.5.8-.9.6L20 33l-7.6 2.2c-.4.1-.9-.2-.9-.6v-1.4c0-.5.2-.9.6-1.2l4.3-3 .4-6.8L3.4 27.8c-.4.2-.9-.1-.9-.6v-2.3c0-.6.3-1.2.8-1.5l13.4-8.6.5-8.2C17.4 3.8 18.5 2 20 2z',
	airliner:
		'M20 1.5c1.7 0 3 2.1 3.2 5.4l.5 9.1 14.6 9.4c.5.3.9 1 .9 1.6v2.6c0 .5-.5.9-1 .7l-15-6 .4 7.2 4.7 3.3c.4.3.7.8.7 1.3v1.6c0 .5-.5.9-1 .7L20 36.4l-7.9 2.2c-.5.1-1-.2-1-.7v-1.6c0-.5.3-1 .7-1.3l4.7-3.3.4-7.2-15 6c-.5.2-1-.2-1-.7v-2.6c0-.6.4-1.3.9-1.6l14.6-9.4.5-9.1C17 3.6 18.3 1.5 20 1.5z'
};

/**
 * Which of the two design colours each aircraft gets: accent for the airline,
 * ink for the private aircraft. If both are the same kind, A takes accent so
 * the pair is still told apart. Shared by the replay and the aircraft cards.
 */
export function pairColors(a: Flight, b: Flight): ['accent' | 'ink', 'accent' | 'ink'] {
	const same = a.category === b.category;
	return [same || a.category === 'airline' ? 'accent' : 'ink', !same && b.category === 'airline' ? 'accent' : 'ink'];
}
