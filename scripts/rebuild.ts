/**
 * Re-process every cached night from the raw files without any FlightAware
 * API calls. Use after changing the clipping or separation logic. Weather
 * (altimeter) readings are fetched for nights that lack them unless
 * --no-weather is given; they come from a free archive and are cached too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listAirports } from '../src/lib/server/airports-store';
import { RAW_DIR } from '../src/lib/server/config';
import { ingestNight } from '../src/lib/server/pipeline';

const log = (m: string) => console.log(m);
const weather = !process.argv.includes('--no-weather');
async function main() {
	for (const a of listAirports()) {
		const dir = path.join(RAW_DIR, a.icao);
		if (!fs.existsSync(dir)) continue;
		const nights = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
		for (const night of nights) await ingestNight(a.code, night, { offline: true, weather, log });
	}
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
