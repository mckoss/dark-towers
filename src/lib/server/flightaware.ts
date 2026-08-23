/**
 * FlightAware AeroAPI client with a permanent on-disk cache of raw responses.
 *
 * Every response is written to DATA_DIR/raw before it is used, and every
 * request checks the cache first, so re-running the pipeline over a night that
 * has already been fetched costs zero API calls. Personal-tier accounts are
 * limited to 10 queries/minute; calls are serialised and spaced accordingly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, config, flightAwareApiKey } from './config';

const BASE = 'https://aeroapi.flightaware.com/aeroapi';
/** Live endpoints reach this far back; beyond it the /history/ variants are needed (paid tiers). */
const LIVE_WINDOW_MS = 10 * 86_400_000 - 2 * 3_600_000;

function needsHistory(whenUtcMs: number): boolean {
	return Date.now() - whenUtcMs > LIVE_WINDOW_MS;
}
function historyAllowed(): boolean {
	return config().aeroapi_history;
}
/** Unix seconds embedded in a fa_flight_id (e.g. "N11571-1786769330-adhoc-2951p"), or null. */
export function flightIdTime(faFlightId: string): number | null {
	const m = /-(\d{9,10})-/.exec(faFlightId);
	return m ? Number(m[1]) * 1000 : null;
}
const MIN_SPACING_MS = Number(process.env.FLIGHTAWARE_SPACING_MS ?? 6500);
const MAX_PAGES = 10;

export interface RawAirportRef {
	code: string | null;
	code_icao: string | null;
	code_iata: string | null;
	code_lid: string | null;
	name: string | null;
	city: string | null;
	timezone: string | null;
}

/** Subset of the AeroAPI flight object we rely on. */
export interface RawFlight {
	ident: string;
	fa_flight_id: string;
	operator: string | null;
	operator_icao: string | null;
	registration: string | null;
	aircraft_type: string | null;
	type: 'Airline' | 'General_Aviation' | string;
	origin: RawAirportRef | null;
	destination: RawAirportRef | null;
	actual_off: string | null;
	actual_on: string | null;
	estimated_off: string | null;
	estimated_on: string | null;
	scheduled_off: string | null;
	scheduled_on: string | null;
	cancelled?: boolean;
	position_only?: boolean;
	/** Added by us: which list the flight came from. */
	_source: 'arrival' | 'departure';
}

export interface RawPosition {
	altitude: number; // hundreds of feet
	groundspeed: number;
	heading: number | null;
	latitude: number;
	longitude: number;
	timestamp: string;
	update_type?: string;
}

export interface RawTrack {
	positions: RawPosition[];
	/** Added by us when a track could not be fetched (e.g. 404). */
	_error?: string;
}

export interface Logger {
	(msg: string): void;
}

let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

async function spaced<T>(fn: () => Promise<T>): Promise<T> {
	const run = async () => {
		const wait = lastCall + MIN_SPACING_MS - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		lastCall = Date.now();
		return fn();
	};
	const p = chain.then(run, run);
	chain = p.catch(() => {});
	return p;
}

export class ApiError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

async function apiGet(pathAndQuery: string, log?: Logger): Promise<unknown> {
	const key = flightAwareApiKey();
	if (!key) throw new Error('No FlightAware API key: add api_key to config.json (or CONFIG_JSON)');
	return spaced(async () => {
		log?.(`GET ${pathAndQuery}`);
		const res = await fetch(`${BASE}${pathAndQuery}`, { headers: { 'x-apikey': key, accept: 'application/json' } });
		if (res.status === 429) {
			// Rate limited — back off once and retry.
			log?.('429 rate limited, waiting 30s');
			await new Promise((r) => setTimeout(r, 30_000));
			const again = await fetch(`${BASE}${pathAndQuery}`, { headers: { 'x-apikey': key, accept: 'application/json' } });
			if (!again.ok) throw new ApiError(again.status, `${again.status} ${await again.text()}`);
			return again.json();
		}
		if (!res.ok) throw new ApiError(res.status, `${res.status} ${await res.text()}`);
		return res.json();
	});
}

/* ---------- cache paths ---------- */

export function nightDir(icao: string, night: string): string {
	return path.join(RAW_DIR, icao, night);
}
export function flightsCachePath(icao: string, night: string): string {
	return path.join(nightDir(icao, night), 'flights.json');
}
export function trackCachePath(icao: string, faFlightId: string): string {
	return path.join(RAW_DIR, icao, 'tracks', `${safeName(faFlightId)}.json`);
}
function safeName(id: string): string {
	return id.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function readJson<T>(p: string): T | null {
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
	} catch {
		return null;
	}
}
function writeJson(p: string, v: unknown) {
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const tmp = `${p}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(v, null, 1));
	fs.renameSync(tmp, p);
}

/* ---------- public API ---------- */

export function hasCachedFlights(icao: string, night: string): boolean {
	return fs.existsSync(flightsCachePath(icao, night));
}
export function hasCachedTrack(icao: string, faFlightId: string): boolean {
	return fs.existsSync(trackCachePath(icao, faFlightId));
}

/** Store a flights list fetched elsewhere (e.g. imported from the Colab cache). */
export function storeFlights(icao: string, night: string, flights: RawFlight[]) {
	writeJson(flightsCachePath(icao, night), flights);
}
export function storeTrack(icao: string, faFlightId: string, track: RawTrack) {
	writeJson(trackCachePath(icao, faFlightId), track);
}

/**
 * Arrivals and departures at `icao` between two UTC instants. Cached per night.
 * `force` re-fetches even if cached (for a night that was fetched before it ended).
 */
export async function fetchFlights(
	icao: string,
	night: string,
	startUtcMs: number,
	endUtcMs: number,
	opts: { force?: boolean; log?: Logger } = {}
): Promise<RawFlight[]> {
	const cachePath = flightsCachePath(icao, night);
	if (!opts.force) {
		const cached = readJson<RawFlight[]>(cachePath);
		if (cached) {
			opts.log?.(`cache hit: ${icao} ${night} flights (${cached.length})`);
			return cached;
		}
	}
	const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
	const prefix = needsHistory(startUtcMs) ? (historyAllowed() ? '/history' : null) : '';
	if (prefix === null) {
		throw new ApiError(400, `${icao} ${night} is older than the live API window; set "aeroapi_history": true once the account tier allows it`);
	}
	let url: string | null = `${prefix}/airports/${icao}/flights?start=${iso(startUtcMs)}&end=${iso(endUtcMs)}&max_pages=1`;
	const out: RawFlight[] = [];
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const data = (await apiGet(url, opts.log)) as {
			arrivals?: RawFlight[];
			departures?: RawFlight[];
			links?: { next?: string } | null;
		};
		for (const f of data.arrivals ?? []) out.push({ ...f, _source: 'arrival' });
		for (const f of data.departures ?? []) out.push({ ...f, _source: 'departure' });
		url = data.links?.next ?? null;
	}
	writeJson(cachePath, out);
	opts.log?.(`fetched ${icao} ${night}: ${out.length} flights`);
	return out;
}

/** Track for one flight. Cached forever (a 404 is cached as an empty track so we never retry it). */
export async function fetchTrack(icao: string, faFlightId: string, opts: { log?: Logger } = {}): Promise<RawTrack> {
	const cachePath = trackCachePath(icao, faFlightId);
	const cached = readJson<RawTrack>(cachePath);
	// A "too old" miss becomes retryable once the account can use /history/.
	if (cached && !(cached._error === 'too old' && historyAllowed())) return cached;
	const when = flightIdTime(faFlightId);
	const prefix = when != null && needsHistory(when) ? (historyAllowed() ? '/history' : '') : '';
	try {
		const data = (await apiGet(`${prefix}/flights/${encodeURIComponent(faFlightId)}/track`, opts.log)) as RawTrack;
		const track: RawTrack = { positions: data.positions ?? [] };
		writeJson(cachePath, track);
		return track;
	} catch (e) {
		const tooOld = e instanceof ApiError && e.status === 400 && /more than 10 days/i.test(e.message);
		if (e instanceof ApiError && (e.status === 404 || tooOld)) {
			// Personal-tier accounts cannot fetch tracks older than 10 days. Cache
			// the miss so we never pay for the retry; an import can overwrite it.
			opts.log?.(`track unavailable for ${faFlightId}: ${tooOld ? 'older than 10 days' : 'not found'}`);
			const track: RawTrack = { positions: [], _error: tooOld ? 'too old' : 'not found' };
			writeJson(cachePath, track);
			return track;
		}
		throw e;
	}
}

export function readCachedFlights(icao: string, night: string): RawFlight[] | null {
	return readJson<RawFlight[]>(flightsCachePath(icao, night));
}
