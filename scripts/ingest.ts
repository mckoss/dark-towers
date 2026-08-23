/**
 * Ingest one or more nights for an airport.
 *
 *   npm run ingest -- PAE 2026-08-18            one night
 *   npm run ingest -- PAE 2026-08-12 --nights 7 seven nights starting there
 *   npm run ingest -- PAE --catch-up            whatever the scheduler would do
 *   npm run ingest -- BLI --backfill 30         last 30 nights, oldest first, skipping complete ones
 *   flags: --offline (cache only, no API), --force (re-fetch flight lists)
 */
import { airportByCode } from '../src/lib/airports';
import { ingestNight } from '../src/lib/server/pipeline';
import { catchUp } from '../src/lib/server/scheduler';
import { addDays, nightWindow, todayKey } from '../src/lib/time';
import { nightSummary } from '../src/lib/server/db';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && (args[i - 1] === '--nights' || args[i - 1] === '--backfill')));
const [code, start] = positional;
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function main() {
	if (flag('catch-up')) {
		await catchUp(log);
		return;
	}
	if (flag('backfill')) {
		const a = airportByCode(code ?? '');
		if (!a) {
			console.error('usage: ingest <AIRPORT> --backfill <N>');
			process.exit(1);
		}
		const n = Number(opt('backfill') ?? 30);
		const today = todayKey(a.tz);
		let calls = 0;
		for (let i = n; i >= 1; i--) {
			const night = addDays(today, -i);
			if (nightWindow(a.tz, a.towerHours, night).end > Date.now()) continue;
			if (nightSummary(a.icao, night)?.complete) continue;
			calls += (await ingestNight(a.code, night, { log })).apiCalls;
		}
		log(`backfill done. ${calls} API calls.`);
		return;
	}
	if (!code || !start || !airportByCode(code)) {
		console.error('usage: ingest <AIRPORT> <YYYY-MM-DD> [--nights N] [--offline] [--force]');
		process.exit(1);
	}
	const nights = Number(opt('nights') ?? 1);
	let totalCalls = 0;
	for (let i = 0; i < nights; i++) {
		const r = await ingestNight(code, addDays(start, i), { offline: flag('offline'), force: flag('force'), log });
		totalCalls += r.apiCalls;
	}
	log(`done. ${totalCalls} API calls.`);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
