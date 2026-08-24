import { listAirports } from '$lib/server/airports-store';
import { altimeterCheck, deleteRequest, incompleteNights, listRequests, nightCounts, recentProblems, runActivity } from '$lib/server/db';
import { pressureOffsetFt } from '$lib/altimeter';
import { cachedCapability, extendedHistoryAllowed, probeCapability } from '$lib/server/capability';
import { BOOTED, currentJob, startBackfill, startCatchUp, startIngest } from '$lib/server/jobs';
import { config, flightAwareApiKey } from '$lib/server/config';
import { nasrData } from '$lib/server/nasr';
import { registryData } from '$lib/server/registry';
import { fail } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import type { Actions, PageServerLoad } from './$types';

/** Recursive file count + total bytes for one directory (missing dir → zeros). */
function dirStats(dir: string): { files: number; bytes: number } {
	let files = 0, bytes = 0;
	const walk = (d: string) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.isFile()) {
				files++;
				bytes += fs.statSync(p).size;
			}
		}
	};
	try { walk(dir); } catch { /* not created yet */ }
	return { files, bytes };
}

/** Size of the SQLite database including its WAL/SHM sidecars. */
function dbBytes(dbPath: string): number {
	let bytes = 0;
	for (const p of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
		try { bytes += fs.statSync(p).size; } catch { /* absent */ }
	}
	return bytes;
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

export const load: PageServerLoad = ({ locals }) => {
	const s = config();
	return {
		user: locals.user!,
		admins: s.admins,
		apiKeyPresent: !!flightAwareApiKey(),
		historyEnabled: extendedHistoryAllowed(),
		historyOverride: s.aeroapi_history,
		capability: cachedCapability(),
		historyDays: s.history_days,
		googleConfigured: !!s.google,
		nasrCycle: nasrData()?.cycle ?? null,
		registry: (() => {
			const r = registryData();
			return r ? { asOf: r.asOf, aircraft: Object.keys(r.tails).length } : null;
		})(),
		airports: listAirports().map((a) => ({ code: a.code, icao: a.icao, name: a.name, tracked: a.tracked, status: a.status })),
		counts: nightCounts(),
		incomplete: incompleteNights(),
		altimeter: altimeterCheck().map((n) => {
			const r = n.altimeter ?? [];
			const vals = r.map(([, v]) => v);
			const lo = vals.length ? Math.min(...vals) : null;
			const hi = vals.length ? Math.max(...vals) : null;
			return {
				airport: n.airport,
				night: n.night,
				readings: r.length,
				range: lo != null && hi != null ? `${lo.toFixed(2)}–${hi.toFixed(2)}` : '—',
				/** Weather-derived offset range (feet to subtract from reported altitude). */
				weatherFt: lo != null && hi != null ? `${Math.round(pressureOffsetFt(hi))}…${Math.round(pressureOffsetFt(lo))}` : '—',
				groundFt: n.groundOffsetFt,
				groundTracks: n.groundTracks,
				onFieldFt: n.onField?.length ? median(n.onField.map(([, v]) => v)) : null,
				onFieldPoints: n.onField?.length ?? 0
			};
		}),
		storage: (() => {
			const rows = [
				{ label: 'Raw API responses', path: path.join(s.data_dir, 'raw'), ...dirStats(path.join(s.data_dir, 'raw')) },
				{ label: 'FAA facility data (NASR)', path: path.join(s.data_dir, 'nasr'), ...dirStats(path.join(s.data_dir, 'nasr')) },
				{ label: 'FAA aircraft registry', path: path.join(s.data_dir, 'registry'), ...dirStats(path.join(s.data_dir, 'registry')) },
				{ label: 'Database (SQLite)', path: s.db_path, files: 1, bytes: dbBytes(s.db_path) }
			];
			return { rows, totalBytes: rows.reduce((n, r) => n + r.bytes, 0) };
		})(),
		schedulerOn: s.scheduler,
		activity: runActivity(Date.now() - 24 * 3600_000),
		booted: BOOTED,
		problems: recentProblems(Date.now() - 48 * 3600_000),
		requests: listRequests(),
		job: currentJob()
	};
};

export const actions: Actions = {
	probe: async () => {
		const cap = await probeCapability({ log: console.log });
		if (!cap) return fail(503, { error: 'Could not reach AeroAPI to check the key.' });
		return { probed: cap.extendedHistory ? 'Extended history is available on this key.' : `Extended history is not available on this key (${cap.detail}).` };
	},
	catchup: async () => {
		if (!startCatchUp()) return fail(409, { error: 'A job is already running.' });
		return { started: 'catch-up' };
	},
	ingest: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '').toUpperCase();
		const night = String(f.get('night') ?? '');
		const force = f.get('force') === 'on';
		if (!listAirports().some((a) => a.code === code)) return fail(400, { error: 'Unknown airport.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return fail(400, { error: 'Night must be YYYY-MM-DD.' });
		if (!startIngest(code, night, force)) return fail(409, { error: 'A job is already running.' });
		return { started: `ingest ${code} ${night}` };
	},
	backfill: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '').toUpperCase();
		const nights = Math.min(365, Math.max(1, Number(f.get('nights') ?? 30)));
		if (!listAirports().some((a) => a.code === code)) return fail(400, { error: 'Unknown airport.' });
		if (!startBackfill(code, nights)) return fail(409, { error: 'A job is already running.' });
		return { started: `backfill ${code} × ${nights} nights` };
	},
	deleteRequest: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad id.' });
		deleteRequest(id);
		return { deleted: id };
	}
};
