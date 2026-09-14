import { altimeterCheck, incompleteNights, nightCounts } from '$lib/server/db';
import { pressureOffsetFt } from '$lib/altimeter';
import { config } from '$lib/server/config';
import fs from 'node:fs';
import path from 'node:path';
import type { PageServerLoad } from './$types';
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


export const load: PageServerLoad = () => {
 const s = config();
 return {
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

 };
};
