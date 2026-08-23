/**
 * Hourly altimeter settings for an airport night, from the Iowa State ASOS
 * archive (free, no key; routine METARs plus SPECI reports). Cached forever
 * under data/raw/<ICAO>/<night>/metar.json, like every other raw input — with
 * one exception: a night fetched before its window had ended is marked
 * partial and fetched again next time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseAsosCsv, type AltimeterReading } from '$lib/altimeter';
import { nightDir } from './flightaware';

export interface MetarCache {
	station: string;
	fetchedAt: number;
	/** True when fetched before the window ended (will be refetched). */
	partial: boolean;
	readings: AltimeterReading[];
}

export function metarCachePath(icao: string, night: string): string {
	return path.join(nightDir(icao, night), 'metar.json');
}

/** ASOS station id: US ICAO codes drop the leading K. */
export function asosStation(icao: string): string {
	return /^K[A-Z]{3}$/.test(icao) ? icao.slice(1) : icao;
}

export function readCachedMetar(icao: string, night: string): MetarCache | null {
	try {
		return JSON.parse(fs.readFileSync(metarCachePath(icao, night), 'utf8')) as MetarCache;
	} catch {
		return null;
	}
}

function ymd(t: number): { y: number; m: number; d: number } {
	const d = new Date(t);
	return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function asosUrl(station: string, startMs: number, endMs: number): string {
	// Pad a few hours each side so interpolation has a bracketing reading at both ends.
	const a = ymd(startMs - 6 * 3600_000),
		b = ymd(endMs + 6 * 3600_000 + 86400_000);
	const q = new URLSearchParams({
		station, data: 'alti', year1: String(a.y), month1: String(a.m), day1: String(a.d),
		year2: String(b.y), month2: String(b.m), day2: String(b.d),
		tz: 'Etc/UTC', format: 'onlycomma', latlon: 'no', missing: 'M', trace: 'T', direct: 'no'
	});
	q.append('report_type', '3');
	q.append('report_type', '4');
	return `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${q}`;
}

export interface MetarOptions {
	offline?: boolean;
	log?: (m: string) => void;
	fetchImpl?: typeof fetch;
	now?: number;
}

/**
 * Altimeter readings covering [startMs, endMs] (+6 h each side). Never throws:
 * weather is a refinement, not a prerequisite, so a failed fetch yields null
 * and the night is processed uncorrected.
 */
export async function fetchAltimeter(icao: string, night: string, startMs: number, endMs: number, opts: MetarOptions = {}): Promise<AltimeterReading[] | null> {
	const cached = readCachedMetar(icao, night);
	if (cached && (!cached.partial || opts.offline)) return cached.readings;
	if (opts.offline) return null;
	const station = asosStation(icao);
	const now = opts.now ?? Date.now();
	const url = asosUrl(station, startMs, endMs);
	try {
		opts.log?.(`METAR ${station} ${night}`);
		const res = await (opts.fetchImpl ?? fetch)(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const readings = parseAsosCsv(await res.text()).filter(([t]) => t >= startMs - 6 * 3600_000 && t <= endMs + 6 * 3600_000);
		if (readings.length === 0 && cached) return cached.readings;
		const out: MetarCache = { station, fetchedAt: now, partial: now < endMs + 2 * 3600_000, readings };
		fs.mkdirSync(path.dirname(metarCachePath(icao, night)), { recursive: true });
		fs.writeFileSync(metarCachePath(icao, night), JSON.stringify(out));
		return readings;
	} catch (e) {
		opts.log?.(`METAR ${station} ${night} failed: ${e instanceof Error ? e.message : e}`);
		return cached?.readings ?? null;
	}
}
