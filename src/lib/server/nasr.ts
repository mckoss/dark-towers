/**
 * Download and cache the FAA NASR 28-day subscription extract, reduced to the
 * airport/tower table in $lib/nasr. One ~20 MB download per cycle; the
 * compact JSON lives at data/nasr/<cycle>.json and is reused until the next
 * cycle begins. A failed download falls back to the newest cached cycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildNasr, type NasrData } from '$lib/nasr';
import { listZip, readZipEntry } from '$lib/zip';
import { DATA_DIR } from './config';

/** A known cycle start; cycles are 28 days apart. */
const ANCHOR = Date.UTC(2026, 7, 6);
const CYCLE_MS = 28 * 86400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Start date (YYYY-MM-DD) of the cycle in effect at `now`. */
export function cycleFor(now = Date.now()): string {
	const n = Math.floor((now - ANCHOR) / CYCLE_MS);
	return new Date(ANCHOR + n * CYCLE_MS).toISOString().slice(0, 10);
}

export function cycleUrl(cycle: string): string {
	const [y, m, d] = cycle.split('-');
	return `https://nfdc.faa.gov/webContent/28DaySub/extra/${d}_${MONTHS[Number(m) - 1]}_${y}_CSV.zip`;
}

const dir = () => (process.env.NASR_DIR ?? path.join(DATA_DIR, 'nasr'));
const fileFor = (cycle: string) => path.join(dir(), `${cycle}.json`);

let cache: NasrData | null = null;

function readCached(cycle: string): NasrData | null {
	try {
		const data = JSON.parse(fs.readFileSync(fileFor(cycle), 'utf8')) as NasrData;
		// Force one refresh of caches written before runway geometry was added.
		return data.schema === 2 ? data : null;
	} catch {
		return null;
	}
}
function newestCached(): NasrData | null {
	try {
		const files = fs.readdirSync(dir()).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
		const last = files[files.length - 1];
		return last ? (JSON.parse(fs.readFileSync(path.join(dir(), last), 'utf8')) as NasrData) : null;
	} catch {
		return null;
	}
}

export interface NasrOptions {
	log?: (m: string) => void;
	fetchImpl?: typeof fetch;
	now?: number;
}

/** Fetch the current cycle if not already cached; never throws. */
export async function updateNasr(opts: NasrOptions = {}): Promise<NasrData | null> {
	const cycle = cycleFor(opts.now);
	const have = readCached(cycle);
	if (have) return (cache = have);
	try {
		opts.log?.(`NASR: downloading cycle ${cycle}`);
		const res = await (opts.fetchImpl ?? fetch)(cycleUrl(cycle), { headers: { 'user-agent': 'dark-towers.org (tower hours check)' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		const entries = listZip(buf);
		const get = (name: string) => {
			const e = entries.find((x) => x.name === name);
			if (!e) throw new Error(`${name} missing from NASR zip`);
			return readZipEntry(buf, e).toString('utf8');
		};
		const data = buildNasr(cycle, get('APT_BASE.csv'), get('ATC_BASE.csv'), get('APT_RWY.csv'), get('APT_RWY_END.csv'));
		fs.mkdirSync(dir(), { recursive: true });
		fs.writeFileSync(fileFor(cycle), JSON.stringify(data));
		opts.log?.(`NASR: ${Object.keys(data.airports).length} airports for cycle ${cycle}`);
		return (cache = data);
	} catch (e) {
		opts.log?.(`NASR: download failed (${e instanceof Error ? e.message : e}); using cached data if any`);
		return (cache = newestCached());
	}
}

/**
 * Current data without network access: a fixture named by NASR_JSON (tests),
 * else the in-memory copy, else the newest cached cycle on disk.
 */
export function nasrData(): NasrData | null {
	if (process.env.NASR_JSON) {
		try {
			return JSON.parse(fs.readFileSync(process.env.NASR_JSON, 'utf8')) as NasrData;
		} catch {
			return null;
		}
	}
	return cache ?? (cache = newestCached());
}
