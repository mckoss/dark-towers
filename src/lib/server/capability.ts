/**
 * What the FlightAware key can do, learned by asking rather than configured.
 * The only capability that matters to the pipeline is "extended history":
 * whether the /history/ endpoints (data older than the 10-day live window)
 * are allowed on this key's tier. One cheap probe per key, cached on disk.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, flightAwareApiKey, config } from './config';

export interface Capability {
	/** First 8 hex of sha256(key): which key this answer belongs to. */
	key: string;
	extendedHistory: boolean;
	checkedAt: number;
	/** What the API said, for the admin page. */
	detail: string;
}

const file = () => path.join(DATA_DIR, 'aeroapi-capability.json');

export function keyFingerprint(key = flightAwareApiKey()): string {
	return key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 8) : 'none';
}

/** Cached answer for the current key, or null if never probed (or the key changed). */
export function cachedCapability(): Capability | null {
	try {
		const c = JSON.parse(fs.readFileSync(file(), 'utf8')) as Capability;
		return c.key === keyFingerprint() ? c : null;
	} catch {
		return null;
	}
}

/**
 * Whether /history/ calls may be made: the config flag `aeroapi_history`
 * overrides when set; otherwise the probed capability; otherwise false.
 */
export function extendedHistoryAllowed(): boolean {
	const forced = config().aeroapi_history;
	if (forced != null) return forced;
	return cachedCapability()?.extendedHistory ?? false;
}

export interface ProbeOptions {
	log?: (m: string) => void;
	fetchImpl?: typeof fetch;
	now?: number;
}

/**
 * Ask the API for one minute of arrivals at KPAE from twelve days ago via the
 * /history/ endpoint. Success means the tier allows extended history; a
 * 400/401/403 means it does not. Network failures leave the cache untouched.
 */
export async function probeCapability(opts: ProbeOptions = {}): Promise<Capability | null> {
	const key = flightAwareApiKey();
	if (!key) return null;
	const now = opts.now ?? Date.now();
	const start = new Date(now - 12 * 86400_000);
	start.setUTCHours(12, 0, 0, 0);
	const end = new Date(start.getTime() + 60_000);
	const url = `https://aeroapi.flightaware.com/aeroapi/history/airports/KPAE/flights/arrivals?start=${start.toISOString().slice(0, 19)}Z&end=${end.toISOString().slice(0, 19)}Z&max_pages=1`;
	try {
		opts.log?.('AeroAPI: probing extended-history capability');
		const res = await (opts.fetchImpl ?? fetch)(url, { headers: { 'x-apikey': key, accept: 'application/json' } });
		let detail = `HTTP ${res.status}`;
		try {
			const body = (await res.json()) as { detail?: string; title?: string };
			if (body?.detail || body?.title) detail += ` — ${body.title ?? ''}${body.title && body.detail ? ': ' : ''}${body.detail ?? ''}`;
		} catch {
			/* not JSON */
		}
		if (res.status === 429 || res.status >= 500) {
			opts.log?.(`AeroAPI: probe inconclusive (${detail}); will retry later`);
			return cachedCapability();
		}
		const cap: Capability = { key: keyFingerprint(key), extendedHistory: res.ok, checkedAt: now, detail };
		fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(file(), JSON.stringify(cap));
		opts.log?.(`AeroAPI: extended history ${cap.extendedHistory ? 'available' : 'not available'} on this key (${detail})`);
		return cap;
	} catch (e) {
		opts.log?.(`AeroAPI: probe failed (${e instanceof Error ? e.message : e})`);
		return cachedCapability();
	}
}

/** Probe once per key (cached answers are reused). */
export async function ensureCapability(opts: ProbeOptions = {}): Promise<Capability | null> {
	return cachedCapability() ?? probeCapability(opts);
}
