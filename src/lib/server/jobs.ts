/** Background pipeline jobs started from /admin. One at a time; log kept in memory. */
import { catchUp } from './scheduler';
import { ingestNight } from './pipeline';

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
