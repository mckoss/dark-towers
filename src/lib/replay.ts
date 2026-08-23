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
	/** Knots. */
	gs: number;
	/** Vertical speed, ft/s (+ climbing). */
	vs: number;
	/** False before the track starts or after it ends (aircraft on the ground / out of range). */
	active: boolean;
	/** 'before' the first report, 'active', or 'after' the last report (held at its last position). */
	phase: 'before' | 'active' | 'after';
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
		const vel = spline.velocityAt(t);
		const [lat, lon] = fromLocalNm(origin, [v[0], v[1]]);
		const active = t >= spline.t0 && t <= spline.t1;
		const phase = t < spline.t0 ? 'before' : t > spline.t1 ? 'after' : 'active';
		return { lat, lon, alt: v[2], hdg: headingOf(spline, t, () => nearestHdg(flight, t)), gs: v[3] ?? 0, vs: active && vel ? vel[2] * 1000 : 0, active, phase };
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

export const GLYPH_MIN_PX = 26;
export const GLYPH_MAX_PX = 48;

/**
 * Silhouette size from the pair's on-screen pixel separation at the closest
 * pass, so the two glyphs never merge on a short mobile map.
 */
export function glyphSizeFor(pixelSeparation: number): number {
	if (!Number.isFinite(pixelSeparation)) return GLYPH_MAX_PX;
	return Math.max(GLYPH_MIN_PX, Math.min(GLYPH_MAX_PX, Math.round(pixelSeparation * 0.7)));
}

export type Silhouette = 'airliner' | 'bizjet' | 'light' | 'helicopter' | 'military';

/** ICAO type designators of helicopters (prefix match). */
const HELICOPTER_TYPES = /^(H269|H369|H500|H60|H47|H53|H64|UH1|B06|B105|B212|B214|B222|B230|B407|B412|B427|B429|B430|B505|R22|R44|R66|EC20|EC25|EC30|EC35|EC45|EC55|EC75|H125|H130|H135|H145|H155|H160|H175|AS32|AS50|AS55|AS65|A109|A119|A139|A149|A169|A189|S61|S64|S76|S92|MD52|MD60|MD90|BK17|B47G|EN28|EN48|R[0-9]{2}$|CH47|V22|LYNX|GAZL|PUMA|SUCO|ALO)/;
/** ICAO type designators of military aircraft (prefix match). Airliners and bizjets in military service are not caught. */
const MILITARY_TYPES = /^(C17|C30J|C130|C5M|K35R|KC35|K46|E3|E6|E8|P8|P3|F15|F16|F18|F22|F35|A10|B1|B2|B52|T38|TEX2|T6|T45|U2|RQ|MQ|C27J|C2|E2|EA18|AV8|H60|CH47|V22|UH1|H53|H64|C146|C12|C26|UC35|C37|C40|C32|VC25|E4|E7)/;
/** Military callsign prefixes (ident match). */
const MILITARY_IDENTS = /^(RCH|REACH|NAVY|ARMY|USAF|EVAC|SAM|CNV|PAT|SPAR|AIO|HOOK|DOOM|BOLT|TOPCAT|JAKE|KING|TITAN|SLAM|COBRA|VENOM|HAWG|RAIDR|RIDER|DUKE|WOLF|PACK|BISON|ELVIS|GRIZ|MOOSE|SHARK|SNTRY|DRAGN|NCHO|GOLD|FORCE|HAVOC|STEEL|VIPER|BRONCO|TALON|SHADO|CASA|TOGA|JUMBO|RRR|BLUE)\d/;

export type AircraftKind = 'airline' | 'private' | 'military' | 'helicopter';

/** Finer classification than the airline/private category, from the type designator and callsign. */
export function aircraftKind(f: { category: string; type: string | null; ident?: string }): AircraftKind {
	const t = (f.type ?? '').toUpperCase();
	if (HELICOPTER_TYPES.test(t)) return 'helicopter';
	if (MILITARY_TYPES.test(t) || MILITARY_IDENTS.test((f.ident ?? '').toUpperCase())) return 'military';
	return f.category === 'airline' ? 'airline' : 'private';
}

/** Which outline to draw for an aircraft. */
export function silhouetteFor(category: string, type: string | null, ident?: string): Silhouette {
	const kind = aircraftKind({ category, type, ident });
	if (kind === 'helicopter') return 'helicopter';
	if (kind === 'military') return 'military';
	const t = (type ?? '').toUpperCase();
	if (category === 'airline') return 'airliner';
	if (/^(B7|A3|E7|E1|CRJ|DH8|AT7|MD)/.test(t)) return 'airliner';
	if (/^(C5|C6|C7|LJ|CL|GLF|G[1-6]|E5|H25|BE4|PA46|P46|PC12|TBM|SF5|EA50|PRM1|HDJ)/.test(t)) return 'bizjet';
	return 'light';
}

/** Track / glyph colour for a flight: accent for airlines, ink for private, blue for military (helicopters follow their operator). */
export const MILITARY_BLUE = '#1f5fbf';

/** Top-down schematic outlines, nose up, in a 40×40 box (from the prototype). */
export const SILHOUETTE_PATHS: Record<Silhouette, string> = {
	// Bold top-view silhouettes in a 40×40 box, nose up. Deliberately chunky
	// (wide fuselage, thick wings) so they read at 26–48 px over a busy basemap.
	light:
		'M20 1.5c2.6 0 3.6 2.6 3.6 6.2v3.8l15.2 1.5v5.5l-15.2-.3-.4 10 6 2.6v3.7L20 33l-9.2 1.5v-3.7l6-2.6-.4-10-15.2.3V13l15.2-1.5V7.7c0-3.6 1-6.2 3.6-6.2z',
	bizjet:
		'M20 1c2.3 0 3.4 3 3.4 7v6.5L37 25v5l-13.6-5v5.5l5.4 4v3.5L20 36l-8.8 2v-3.5l5.4-4v-5.5L3 30v-5l13.6-10.5V8c0-4 1.1-7 3.4-7z',
	airliner:
		'M20 .5c2.8 0 4 3 4 7v5.5l15 10V29l-15-5.5v6l6 4.2V37l-10-2.5L10 37v-3.3l6-4.2v-6L1 29v-6l15-10V7.5c0-4 1.2-7 4-7z',
	// Rotor disc (ring, even-odd), cabin and tail boom.
	helicopter:
		'M20 1a16 16 0 1 0 0 32a16 16 0 1 0 0-32zM20 3a14 14 0 1 1 0 28a14 14 0 1 1 0-28zM20 8c3.6 0 5.8 3 5.8 7.5v5.5c0 3.2-2.6 5.2-5.8 5.2s-5.8-2-5.8-5.2v-5.5C14.2 11 16.4 8 20 8zM18.6 25.5h2.8v10l3.6 1.5v2.5h-10V37l3.6-1.5z',
	// Delta-wing jet with fin: unmistakably not an airliner.
	military:
		'M20 .5l14.5 30H25l-5-6.5-5 6.5H5.5zM17 30.5h6v5l3 2v2H14v-2l3-2z'
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

/** Marker HTML for an aircraft glyph (ring for the alert state + silhouette), nose up; rotated by the caller. */
export function glyphHtml(color: string, shape: Silhouette, g: number): string {
	const ring = Math.round(g * 1.3);
	return (
		`<div class="replay-ring" style="width:${ring}px;height:${ring}px"></div>` +
		`<svg class="replay-glyph" viewBox="0 0 40 40" width="${g}" height="${g}"><path fill="${color}" fill-rule="evenodd" stroke="#f3f2f2" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke" d="${SILHOUETTE_PATHS[shape]}"/></svg>`
	);
}

/**
 * Lay time marks out in two rows so labels never overlap: each mark, in
 * x order, goes on the first row whose previous label it clears; if neither
 * row is free it gets -1 (no label — the pip itself still shows). `x` and
 * `labelW` are in the same units (pixels). Returns a row index per mark.
 */
export function assignLanes(xs: number[], labelW: number): number[] {
	const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
	const lastX = [-Infinity, -Infinity];
	const lanes = new Array<number>(xs.length).fill(0);
	for (const i of order) {
		const lane = xs[i] - lastX[0] >= labelW ? 0 : xs[i] - lastX[1] >= labelW ? 1 : -1;
		lanes[i] = lane;
		if (lane >= 0) lastX[lane] = xs[i];
	}
	return lanes;
}
