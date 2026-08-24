/**
 * Download and cache the FAA aircraft registry, reduced by $lib/registry to a
 * tail → aircraft and non-address registrant facts (~8 MB JSON at
 * data/registry/<month>.json). The FAA republishes nightly; Dark Towers
 * refreshes monthly. A failed
 * download falls back to the newest cached month. The registry site rejects
 * requests without a browser-like user agent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, lookupRegistry, type RegistryData, type RegistryEntry } from '$lib/registry';
import { listZip, readZipEntry, zipEntryLines } from '$lib/zip';
import { DATA_DIR } from './config';

export const REGISTRY_URL = 'https://registry.faa.gov/database/ReleasableAircraft.zip';

const dir = () => process.env.REGISTRY_DIR ?? path.join(DATA_DIR, 'registry');
const monthFor = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);
const fileFor = (month: string) => path.join(dir(), `${month}.json`);

let cache: RegistryData | null = null;

function readFile(file: string): RegistryData | null {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8')) as RegistryData;
	} catch {
		return null;
	}
}
function newestCached(): RegistryData | null {
	try {
		const files = fs.readdirSync(dir()).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
		const last = files[files.length - 1];
		return last ? readFile(path.join(dir(), last)) : null;
	} catch {
		return null;
	}
}

export interface RegistryOptions {
	log?: (m: string) => void;
	fetchImpl?: typeof fetch;
	now?: number;
}

/** Fetch this month's registry if not already cached; never throws. */
export async function updateRegistry(opts: RegistryOptions = {}): Promise<RegistryData | null> {
	const month = monthFor(opts.now);
	const have = readFile(fileFor(month));
	if (have?.schema === 2) return (cache = have);
	try {
		opts.log?.(`registry: downloading FAA aircraft registry for ${month}`);
		const res = await (opts.fetchImpl ?? fetch)(REGISTRY_URL, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; dark-towers.org aircraft lookup)' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		const entries = listZip(buf);
		const entry = (name: string) => {
			const e = entries.find((x) => x.name === name);
			if (!e) throw new Error(`${name} missing from registry zip`);
			return e;
		};
		const asOf = new Date(opts.now ?? Date.now()).toISOString().slice(0, 10);
		const data = await buildRegistry(asOf, readZipEntry(buf, entry('ACFTREF.txt')).toString('utf8'), zipEntryLines(buf, entry('MASTER.txt')));
		fs.mkdirSync(dir(), { recursive: true });
		fs.writeFileSync(fileFor(month), JSON.stringify(data));
		opts.log?.(`registry: ${Object.keys(data.tails).length} aircraft, ${Object.keys(data.models).length} models`);
		return (cache = data);
	} catch (e) {
		opts.log?.(`registry: download failed (${e instanceof Error ? e.message : e}); using cached data if any`);
		return (cache = newestCached());
	}
}

/** Current data without network access: REGISTRY_JSON fixture (tests), else memory, else newest cached month. */
export function registryData(): RegistryData | null {
	if (process.env.REGISTRY_JSON) return readFile(process.env.REGISTRY_JSON);
	return cache ?? (cache = newestCached());
}

export function lookupTail(tail: string | null | undefined): RegistryEntry | null {
	return lookupRegistry(registryData(), tail);
}
