/** Background pipeline jobs started from /admin. One at a time; log kept in memory. */
import { catchUp } from './scheduler';
import { ingestNight } from './pipeline';
import { airportByCode } from '$lib/airports';
import { addDays, nightWindow, todayKey } from '$lib/time';
import { nightSummary } from './db';

export interface JobState {
	name: string;
	startedAt: number;
	finishedAt: number | null;
	ok: boolean | null;
	log: string[];
}

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
		console.log(`[admin:${name}] ${m}`);
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
	const a = airportByCode(code);
	if (!a) return false;
	return start(`backfill ${a.code} × ${nights} nights`, async (log) => {
		const today = todayKey(a.tz);
		let done = 0,
			skipped = 0,
			calls = 0;
		for (let i = nights; i >= 1; i--) {
			const night = addDays(today, -i);
			if (nightWindow(a.tz, a.towerHours, night).end > Date.now()) continue;
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
