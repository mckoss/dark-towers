/** Background pipeline jobs started from /admin. One at a time; log kept in memory. */
import { catchUp } from './scheduler';
import { ingestNight } from './pipeline';
import { scheduledTowerHoursOn } from '$lib/airports';
import { getAirport } from './airports-store';
import { addDays, nightWindow, todayKey } from '$lib/time';
import { nightSummary } from './db';

export interface JobState {
	name: string;
	startedAt: number;
	finishedAt: number | null;
	ok: boolean | null;
	log: string[];
}

/** When this server process started (shown when no job has run yet). */
export const BOOTED = Date.now();

let current: JobState | null = null;

export function currentJob(): JobState | null {
	return current;
}

function start(name: string, fn: (log: (m: string) => void) => Promise<void>): boolean {
	if (current && !current.finishedAt) return false;
	const job: JobState = { name, startedAt: Date.now(), finishedAt: null, ok: null, log: [] };
	current = job;
	const log = (m: string) => {
		job.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`);
		if (job.log.length > 400) job.log.shift();
		console.log(`[job:${name}] ${m}`);
	};
	fn(log)
		.then(() => {
			job.ok = true;
		})
		.catch((e) => {
			job.ok = false;
			log(`failed: ${e instanceof Error ? e.message : e}`);
		})
		.finally(() => {
			job.finishedAt = Date.now();
		});
	return true;
}

export function startCatchUp(): boolean {
	return start('catch-up', (log) => catchUp(log));
}

/** The hourly tick and boot-time catch-up run through the same tracker so /admin shows them. Skipped (false) while a manual job runs. */
export function startScheduledCatchUp(): boolean {
	return start('scheduled catch-up', (log) => catchUp(log));
}

export function startIngest(code: string, night: string, force: boolean): boolean {
	return start(`ingest ${code} ${night}${force ? ' (force)' : ''}`, async (log) => {
		await ingestNight(code, night, { force, log });
	});
}

/**
 * Backfill the last `nights` nights for one airport, oldest first, skipping
 * nights already complete. Used when an airport is newly approved or after an
 * API-tier upgrade makes older data reachable. Stops at the first hard API
 * error so a tier limit doesn't burn through the remaining nights.
 */
export function startBackfill(code: string, nights: number): boolean {
	const a = getAirport(code);
	if (!a) return false;
	return start(`backfill ${a.code} × ${nights} nights`, async (log) => {
		const today = todayKey(a.tz);
		let done = 0,
			skipped = 0,
			calls = 0;
		for (let i = nights; i >= 1; i--) {
			const night = addDays(today, -i);
			const hours = scheduledTowerHoursOn(a, night);
			if (hours === undefined) {
				log(`skip ${a.code} ${night}: no tower-hours schedule applies`);
				continue;
			}
			if (nightWindow(a.tz, hours, night).end > Date.now()) continue;
			if (nightSummary(a.icao, night)?.complete) {
				skipped++;
				continue;
			}
			const r = await ingestNight(a.code, night, { log });
			calls += r.apiCalls;
			done++;
		}
		log(`backfill finished: ${done} night(s) ingested, ${skipped} already complete, ${calls} API calls`);
	});
}

/** Re-fetch (force) and reprocess specific nights — after tower hours changed for a past period. */
export function startReingest(code: string, nights: string[]): boolean {
	const a = getAirport(code);
	if (!a) return false;
	return start(`re-ingest ${a.code} × ${nights.length} nights`, async (log) => {
		let calls = 0;
		for (const night of nights) calls += (await ingestNight(a.code, night, { force: true, log })).apiCalls;
		log(`re-ingest finished: ${nights.length} night(s), ${calls} API calls`);
	});
}
