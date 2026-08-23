/**
 * Nightly ingestion for one airport + one night.
 *
 *   1. flights in the closed-tower window   (API, cached on disk)
 *   2. each flight's track                   (API, cached on disk)
 *   3. clip tracks to the 10 NM ring and the closed window
 *   4. altimeter settings for the night (weather archive, cached)
 *   5. find close approaches on a shared clock
 *   6. upsert flights / incidents / night summary into SQLite
 *
 * Every step is idempotent: re-running a night reads from the disk cache and
 * overwrites the same database rows. Use `force` to re-fetch the flight list
 * (e.g. the night was first processed before its window had ended).
 */
import { AIRSPACE_EXIT_NM, AIRSPACE_RADIUS_NM, TRACK_GAP_MS, towerHoursOn } from '$lib/airports';
import { getAirport } from './airports-store';
import { distanceNm, fromLocalNm, toLocalNm } from '$lib/geo';
import { findIncidents } from '$lib/separation';
import { correctionOffsetAt, groundOffsetFt, hasCorrection, onFieldPoints, type AltCorrection } from '$lib/altimeter';
import { fetchAltimeter } from './metar';
import { nightOf, nightWindow } from '$lib/time';
import type { AirportConfig, Flight, FlightCategory, NightSummary, Position } from '$lib/types';
import { recordRunEnd, recordRunStart, replaceIncidents, upsertFlight, upsertNight } from './db';
import { fetchFlights, fetchTrack, hasCachedTrack, readCachedFlights, type Logger, type RawFlight, type RawTrack } from './flightaware';

export interface IngestOptions {
	/** Re-fetch the flight list even if cached. */
	force?: boolean;
	/** Don't call the FlightAware API at all — only process what's cached. */
	offline?: boolean;
	/** Fetch weather (altimeter) readings when offline; default true online, false offline. */
	weather?: boolean;
	log?: Logger;
}

export interface IngestResult extends NightSummary {
	apiCalls: number;
	skipped: boolean;
}

export async function ingestNight(airportCode: string, night: string, opts: IngestOptions = {}): Promise<IngestResult> {
	const airport = getAirport(airportCode);
	if (!airport) throw new Error(`Unknown airport ${airportCode}`);
	const log = opts.log ?? (() => {});
	const runId = recordRunStart(airport.icao, night);
	try {
		const result = await ingest(airport, night, opts, log);
		recordRunEnd(runId, true, `${result.flights} flights, ${result.incidents} close approaches, ${result.apiCalls} api calls`);
		return result;
	} catch (e) {
		recordRunEnd(runId, false, e instanceof Error ? e.message : String(e));
		throw e;
	}
}

async function ingest(airport: AirportConfig, night: string, opts: IngestOptions, log: Logger): Promise<IngestResult> {
	const win = nightWindow(airport.tz, towerHoursOn(airport, night), night);
	let apiCalls = 0;
	const counting: Logger = (m) => {
		if (m.startsWith('GET ')) apiCalls++;
		log(m);
	};

	// 1. flights
	let raw: RawFlight[] | null;
	if (opts.offline) {
		raw = readCachedFlights(airport.icao, night);
		if (!raw) {
			log(`offline and no cached flights for ${airport.icao} ${night}; skipping`);
			return { ...emptySummary(airport.icao, night), apiCalls: 0, skipped: true };
		}
	} else {
		raw = await fetchFlights(airport.icao, night, win.start, win.end, { force: opts.force, log: counting });
	}

	// Dedupe (a flight can appear in both lists, or across page overlaps).
	const byId = new Map<string, RawFlight>();
	for (const f of raw) if (!byId.has(f.fa_flight_id)) byId.set(f.fa_flight_id, f);

	// 2–3. tracks, clipped
	const flights: Flight[] = [];
	let complete = true;
	for (const rf of byId.values()) {
		const base = normalizeFlight(airport, night, rf);
		if (!base) continue;
		let track: RawTrack | null = null;
		if (opts.offline) {
			track = hasCachedTrack(airport.icao, rf.fa_flight_id) ? await fetchTrack(airport.icao, rf.fa_flight_id) : null;
		} else {
			track = await fetchTrack(airport.icao, rf.fa_flight_id, { log: counting });
		}
		if (!track) complete = false;
		base.positions = track ? clipTrack(airport, night, track) : [];
		flights.push(base);
	}
	flights.sort((a, b) => a.eventTime - b.eventTime);

	// 4. pressure correction, best source first: reports from aircraft plainly
	// on the field (direct measurement of the transponders), else the hourly
	// altimeter settings from the airport's weather reports (cached), else the
	// lowest points of tracks near the field. Only the on-the-ground test uses
	// it; separation between two aircraft is raw.
	const altimeter = await fetchAltimeter(airport.icao, night, win.start, win.end, { offline: opts.weather != null ? !opts.weather : opts.offline, log });
	const onField = onFieldPoints(flights, airport.elevationFt);
	const ground = groundOffsetFt(flights, airport.elevationFt);
	const correction: AltCorrection = { readings: altimeter, onField, tracksOffsetFt: ground?.offsetFt ?? null };
	const altOffset = hasCorrection(correction) ? (t: number) => correctionOffsetAt(correction, t) : undefined;

	// 5. close approaches
	const incidents = findIncidents(airport.pos, airport.icao, night, flights, { elevationFt: airport.elevationFt, altOffset });

	// 6. store
	for (const f of flights) upsertFlight(f);
	replaceIncidents(airport.icao, night, incidents);
	const summary: NightSummary = {
		airport: airport.icao,
		night,
		flights: flights.length,
		arrivals: flights.filter((f) => f.direction === 'arrival').length,
		departures: flights.filter((f) => f.direction === 'departure').length,
		airline: flights.filter((f) => f.category === 'airline').length,
		private: flights.filter((f) => f.category === 'private').length,
		positions: flights.reduce((n, f) => n + f.positions.length, 0),
		incidents: incidents.length,
		complete,
		altimeter: altimeter && altimeter.length > 0 ? altimeter : null,
		groundOffsetFt: ground ? Math.round(ground.offsetFt) : null,
		groundTracks: ground?.tracks ?? null,
		onField: onField.length ? onField : null
	};
	upsertNight(summary);
	log(`${airport.icao} ${night}: ${summary.flights} flights, ${summary.positions} positions, ${summary.incidents} close approaches${complete ? '' : ' (incomplete)'}`);
	return { ...summary, apiCalls, skipped: false };
}

function emptySummary(airport: string, night: string): NightSummary {
	return { airport, night, flights: 0, arrivals: 0, departures: 0, airline: 0, private: 0, positions: 0, incidents: 0, complete: false };
}

/** Event time per the notebook's rule: actual on/off, falling back to estimates when actuals are bogus. */
export function eventTimeOf(f: RawFlight): number | null {
	const badActuals = !!f.actual_on && f.actual_on === f.actual_off;
	let iso: string | null;
	if (f._source === 'arrival') iso = badActuals && f.estimated_on ? f.estimated_on : (f.actual_on ?? f.estimated_on ?? f.scheduled_on);
	else iso = badActuals && f.estimated_off ? f.estimated_off : (f.actual_off ?? f.estimated_off ?? f.scheduled_off);
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : null;
}

export function categoryOf(f: RawFlight): FlightCategory {
	return f.type === 'Airline' ? 'airline' : 'private';
}

export function normalizeFlight(airport: AirportConfig, night: string, f: RawFlight): Flight | null {
	if (f.cancelled) return null;
	const eventTime = eventTimeOf(f);
	if (eventTime == null) return null;
	// Keep the flight on the night it was queried for; the API window already
	// bounds it, but guard against stragglers just outside the window.
	const n = nightOf(airport.tz, towerHoursOn(airport, night), eventTime);
	if (n !== night) return null;
	const other = f._source === 'arrival' ? f.origin : f.destination;
	// Position-only endpoints come back as "L 45.81 -119.07": no real airport.
	const otherCodeRaw = other?.code_iata ?? other?.code_lid ?? other?.code_icao ?? other?.code ?? null;
	const otherCode = otherCodeRaw && !/\s/.test(otherCodeRaw) ? otherCodeRaw : null;
	const operator = f.operator_icao ?? f.operator ?? null;
	const tail = f.registration && f.registration !== f.ident ? f.registration : f.registration ?? f.fa_flight_id.split('-')[0] ?? null;
	return {
		id: f.fa_flight_id,
		airport: airport.icao,
		night,
		ident: f.ident,
		tail,
		type: f.aircraft_type?.trim() || null,
		category: categoryOf(f),
		operator,
		operatorName: null,
		operatorShort: null,
		direction: f._source,
		eventTime,
		otherCode,
		otherName: otherCode ? (other?.name ?? null) : null,
		otherCity: other?.city ?? null,
		positions: []
	};
}

/**
 * Keep the part of a track that matters for this night. A track counts once
 * it comes inside the 10 NM ring; from then on it is kept in both directions
 * of time out to the 20 NM ring — back along its approach to where it crossed
 * 20 NM inbound, and forward to where it crosses 20 NM outbound — so a path
 * that appears on the map is never cut short of 20 NM. Points are
 * interpolated on the 20 NM ring at both ends so the curve starts and ends
 * on the ring instead of jumping to a report miles away. Only reports while
 * the tower was closed on this night are kept, and a gap longer than
 * TRACK_GAP_MS between reports starts a new segment. Resolution is whatever
 * ADS-B reported — nothing inside is thinned.
 */
export function clipTrack(airport: AirportConfig, night: string, track: RawTrack, radiusNm = AIRSPACE_RADIUS_NM, exitNm = Math.max(radiusNm, AIRSPACE_EXIT_NM * (radiusNm / AIRSPACE_RADIUS_NM))): Position[] {
	const hours = towerHoursOn(airport, night);
	const pts: Position[] = [];
	for (const p of track.positions ?? []) {
		const t = Date.parse(p.timestamp);
		if (!Number.isFinite(t)) continue;
		if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
		if (nightOf(airport.tz, hours, t) !== night) continue;
		pts.push({
			t,
			lat: p.latitude,
			lon: p.longitude,
			alt: (p.altitude ?? 0) * 100,
			gs: p.groundspeed ?? 0,
			hdg: p.heading ?? 0,
			dist: Math.round(distanceNm(airport.pos, [p.latitude, p.longitude]) * 100) / 100
		});
	}
	pts.sort((a, b) => a.t - b.t);

	// Split into segments at gaps; clip each independently.
	const segments: Position[][] = [];
	for (const p of pts) {
		const cur = segments[segments.length - 1];
		if (cur && p.t - cur[cur.length - 1].t <= TRACK_GAP_MS) cur.push(p);
		else segments.push([p]);
	}

	const out: Position[] = [];
	for (const seg of segments) {
		let i = 0;
		while (i < seg.length) {
			// Next report inside the inner ring.
			let k = i;
			while (k < seg.length && seg[k].dist > radiusNm) k++;
			if (k >= seg.length) break;
			// Back to the last report outside the outer ring (inbound crossing).
			let j = k;
			while (j - 1 >= i && seg[j - 1].dist <= exitNm) j--;
			if (j - 1 >= i) {
				const x = ringCrossing(airport, seg[j - 1], seg[j], exitNm);
				if (x) out.push(x);
			}
			// Forward to the first report outside the outer ring (outbound crossing).
			let m = k;
			while (m + 1 < seg.length && seg[m + 1].dist <= exitNm) m++;
			for (let q = j; q <= m; q++) out.push(seg[q]);
			if (m + 1 < seg.length) {
				const x = ringCrossing(airport, seg[m], seg[m + 1], exitNm);
				if (x) out.push(x);
			}
			i = m + 1;
		}
	}
	// Dedupe identical timestamps.
	return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t);
}
function ringCrossing(airport: AirportConfig, a: Position, b: Position, radiusNm: number): Position | null {
	const [ax, ay] = toLocalNm(airport.pos, [a.lat, a.lon]);
	const [bx, by] = toLocalNm(airport.pos, [b.lat, b.lon]);
	// Solve |a + u(b-a)| = r for u in (0,1); fall back to distance ratio.
	const dx = bx - ax,
		dy = by - ay;
	const A = dx * dx + dy * dy,
		B = 2 * (ax * dx + ay * dy),
		C = ax * ax + ay * ay - radiusNm * radiusNm;
	const disc = B * B - 4 * A * C;
	let u = Math.abs(a.dist - b.dist) > 1e-9 ? (a.dist - radiusNm) / (a.dist - b.dist) : 0.5;
	if (A > 0 && disc >= 0) {
		const r1 = (-B - Math.sqrt(disc)) / (2 * A),
			r2 = (-B + Math.sqrt(disc)) / (2 * A);
		const cands = [r1, r2].filter((r) => r > 0 && r < 1);
		if (cands.length) u = cands[0];
	}
	if (u < 0.005 || u > 0.995) return null;
	const lerp = (x: number, y: number) => x + (y - x) * u;
	const [lat, lon] = fromLocalNm(airport.pos, [lerp(ax, bx), lerp(ay, by)]);
	return {
		t: Math.round(lerp(a.t, b.t)),
		lat: Math.round(lat * 1e6) / 1e6,
		lon: Math.round(lon * 1e6) / 1e6,
		alt: Math.round(lerp(a.alt, b.alt)),
		gs: Math.round(lerp(a.gs, b.gs)),
		hdg: b.hdg,
		dist: radiusNm
	};
}
