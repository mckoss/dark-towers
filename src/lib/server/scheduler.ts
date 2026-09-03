/**
 * Autonomous nightly capture. Runs hourly inside the server process; for each
 * tracked airport it ingests every recent night whose closed-tower window has
 * ended and which is not yet complete. Because ingestion is idempotent and
 * cached, a missed run or a restart simply catches up on the next tick.
 */
import cron from 'node-cron';
import { updateNasr } from './nasr';
import { updateRegistry } from './registry';
import { ensureCapability } from './capability';
import { scheduledTowerHoursOn } from '$lib/airports';
import { trackedAirports } from './airports-store';
import { addDays, nightWindow, todayKey } from '$lib/time';
import { config } from './config';
import { nightSummary } from './db';
import { ingestNight } from './pipeline';

/** AeroAPI history reach for the account tier, in days. */
const HISTORY_DAYS = config().history_days;
/** Wait this long after the window ends so late tracks are available. */
const SETTLE_MS = 60 * 60 * 1000;

let running = false;

export async function catchUp(log: (m: string) => void = console.log): Promise<void> {
	if (running) return;
	running = true;
	try {
		const now = Date.now();
		for (const a of trackedAirports()) {
			const today = todayKey(a.tz, now);
			for (let i = HISTORY_DAYS; i >= 0; i--) {
				const night = addDays(today, -i);
				const hours = scheduledTowerHoursOn(a, night);
				if (hours === undefined) {
					log(`skip ${a.code} ${night}: no tower-hours schedule applies`);
					continue;
				}
				const win = nightWindow(a.tz, hours, night);
				if (win.end + SETTLE_MS > now) continue;
				const existing = nightSummary(a.icao, night);
				if (existing?.complete) continue;
				try {
					await ingestNight(a.code, night, { log });
				} catch (e) {
					log(`ingest ${a.code} ${night} failed: ${e instanceof Error ? e.message : e}`);
				}
			}
		}
	} finally {
		running = false;
	}
}

let task: ReturnType<typeof cron.schedule> | null = null;
let nasrTask: ReturnType<typeof cron.schedule> | null = null;
void nasrTask;

export function startScheduler(log: (m: string) => void = console.log) {
	if (task) return;
	const scheduledCatchUp = () => void import('./jobs').then((j) => j.startScheduledCatchUp() || log('scheduled catch-up skipped: a job is already running'));
	task = cron.schedule('7 * * * *', scheduledCatchUp);
	// FAA NASR facility data: new 28-day cycle picked up within a day of release.
	nasrTask = cron.schedule('41 4 * * *', () => void updateNasr({ log }));
	// FAA aircraft registry: refreshed monthly (cached by month).
	cron.schedule('51 4 * * *', () => void updateRegistry({ log }));
	log('scheduler: hourly catch-up enabled');
	// Also catch up shortly after boot.
	setTimeout(() => void ensureCapability({ log }).then(() => scheduledCatchUp()), 15_000).unref();
	setTimeout(() => void updateNasr({ log }), 30_000).unref();
	setTimeout(() => void updateRegistry({ log }), 45_000).unref();
}
