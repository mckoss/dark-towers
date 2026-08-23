/**
 * Import a weekly flights file produced by the Colab notebook
 * (KPAE-YYYY-MM-DD.json: arrivals+departures with `_source`) into the
 * per-night raw cache, so `ingest` can proceed without re-querying the
 * flight lists. Optionally also imports a -tracks.json file.
 *
 *   npm run import:colab -- data/raw/KPAE-2026-08-12.json [tracks.json]
 */
import fs from 'node:fs';
import { getAirport as airportByCode } from '../src/lib/server/airports-store';
import { eventTimeOf } from '../src/lib/server/pipeline';
import { hasCachedFlights, storeFlights, storeTrack, type RawFlight, type RawTrack } from '../src/lib/server/flightaware';
import { nightOf } from '../src/lib/time';
import { towerHoursOn } from '../src/lib/airports';

const [file, tracksFile] = process.argv.slice(2);
if (!file) {
	console.error('usage: import-colab <flights.json> [tracks.json]');
	process.exit(1);
}
const m = /([A-Z]{4})-\d{4}-\d{2}-\d{2}/.exec(file);
const airport = airportByCode(m?.[1] ?? 'KPAE');
if (!airport) throw new Error('unknown airport in filename');

const flights = JSON.parse(fs.readFileSync(file, 'utf8')) as RawFlight[];
const byNight = new Map<string, RawFlight[]>();
for (const f of flights) {
	const t = eventTimeOf(f);
	if (t == null) continue;
	// Use the schedule in effect on the flight's own date (evening or morning).
	const n = nightOf(airport.tz, towerHoursOn(airport, new Date(t).toISOString().slice(0, 10)), t);
	if (!n) continue;
	if (!byNight.has(n)) byNight.set(n, []);
	byNight.get(n)!.push(f);
}
for (const [night, list] of [...byNight].sort()) {
	if (hasCachedFlights(airport.icao, night)) {
		console.log(`${night}: already cached, skipping`);
		continue;
	}
	storeFlights(airport.icao, night, list);
	console.log(`${night}: stored ${list.length} flights`);
}
if (tracksFile) {
	const tracks = JSON.parse(fs.readFileSync(tracksFile, 'utf8')) as Record<string, RawTrack>;
	let n = 0;
	for (const [id, tr] of Object.entries(tracks)) {
		storeTrack(airport.icao, id, { positions: tr.positions ?? [] });
		n++;
	}
	console.log(`stored ${n} tracks`);
}
