/**
 * One base-map tile cache, shared by the web map and the PDF report.
 *
 * CARTO watermarks basemap tiles fetched without an API key, so the key lives
 * in config (`tile_url`) and never reaches the browser: the map requests
 * /tiles/{z}/{x}/{y}.png from us, and we serve from disk, fetching upstream
 * only on a miss or once the copy is a month old. Tiles are immutable in
 * practice, so this collapses per-visitor tile traffic to roughly one fetch per
 * tile per month.
 *
 * Panning and zooming past the cached default views still reaches for new
 * tiles, which are then cached like any other.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LatLon } from '$lib/geo';
import { fillTileUrl, tilesForView, TILE_DIRECT_URL, type TileRef } from '$lib/report-maps';
import { config, DATA_DIR } from './config';

/** Re-fetch a cached tile once it is this old. */
export const TILE_TTL_MS = 30 * 86_400_000;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array) => b.length > 8 && PNG_MAGIC.every((m, i) => b[i] === m);

const dir = () => process.env.TILE_DIR ?? path.join(DATA_DIR, 'tiles');
const fileFor = (z: number, x: number, y: number) => path.join(dir(), String(z), String(x), `${y}.png`);

/** Whether a tile source is configured at all. */
export function tilesConfigured(): boolean {
	return !!config().tile_url;
}

/** The keyed upstream URL, when one is configured. */
function upstreamUrl(z: number, x: number, y: number): string | null {
	const template = config().tile_url;
	return template ? fillTileUrl(template, z, x, y) : null;
}

/** Where an uncached tile is sent when we have no key of our own. */
export function directUrl(z: number, x: number, y: number): string {
	return fillTileUrl(TILE_DIRECT_URL, z, x, y);
}

/**
 * Store a tile fetched somewhere else — in practice an admin's browser, whose
 * request carries the site's own origin and so comes back unstamped.
 */
export function putTile(z: number, x: number, y: number, png: Uint8Array) {
	if (!isPng(png)) throw new Error('tile must be a PNG');
	if (png.length > MAX_BYTES) throw new Error('tile is too large');
	writeCached(z, x, y, png);
}

interface CachedTile {
	png: Uint8Array;
	/** When it was fetched, unix ms. */
	age: number;
}

function readCached(z: number, x: number, y: number): CachedTile | null {
	try {
		const file = fileFor(z, x, y);
		const png = new Uint8Array(fs.readFileSync(file));
		return isPng(png) ? { png, age: fs.statSync(file).mtimeMs } : null;
	} catch {
		return null;
	}
}

function writeCached(z: number, x: number, y: number, png: Uint8Array) {
	try {
		const file = fileFor(z, x, y);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, png);
	} catch {
		/* an unwritable cache must not break the map */
	}
}

async function fetchTile(z: number, x: number, y: number, fetchImpl: typeof fetch): Promise<Uint8Array | null> {
	const url = upstreamUrl(z, x, y);
	if (!url) return null;
	try {
		const res = await fetchImpl(url, {
			headers: { 'user-agent': 'dark-towers (+https://github.com/mckoss/dark-towers)' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) return null;
		const png = new Uint8Array(await res.arrayBuffer());
		return isPng(png) && png.length <= MAX_BYTES ? png : null;
	} catch {
		return null;
	}
}

export interface TileOptions {
	fetchImpl?: typeof fetch;
	/** Fetch even when a fresh copy is cached. */
	force?: boolean;
	/** Serve only what is already cached. */
	cachedOnly?: boolean;
}

/**
 * One tile, from disk when it is fresh enough, otherwise from upstream. Returns
 * null when nothing is cached and nothing can be fetched — callers draw on
 * plain ground rather than failing.
 */
export async function tile(z: number, x: number, y: number, opts: TileOptions = {}): Promise<Uint8Array | null> {
	const cached = readCached(z, x, y);
	if (cached && !opts.force && (opts.cachedOnly || Date.now() - cached.age < TILE_TTL_MS)) return cached.png;
	if (opts.cachedOnly) return cached?.png ?? null;

	const fetched = await fetchTile(z, x, y, opts.fetchImpl ?? fetch);
	if (!fetched) return cached?.png ?? null; // stale beats blank
	writeCached(z, x, y, fetched);
	return fetched;
}

/** One cached tile plus the geographic box it covers, ready to place on a chart. */
export interface ViewTile extends TileRef {
	png: Uint8Array;
}

/**
 * Every tile behind one chart view. Used by the PDF report, which must not go
 * to the network on a reader's request — with `cachedOnly` it draws whatever
 * has been warmed and leaves the rest to plain ground.
 */
export async function viewTiles(center: LatLon, halfNm: number, opts: TileOptions = {}): Promise<ViewTile[]> {
	const refs = tilesForView(center, halfNm);
	const loaded = await Promise.all(refs.map(async (ref) => ({ ref, png: await tile(ref.z, ref.x, ref.y, opts) })));
	return loaded.filter((t) => t.png).map(({ ref, png }) => ({ ...ref, png: png! }));
}

export interface CacheStats {
	tiles: number;
	bytes: number;
	/** Oldest and newest cached tile, unix ms, or null when empty. */
	oldest: number | null;
	newest: number | null;
}

/** Cache totals for the whole store, for /admin. */
export function cacheStats(): CacheStats {
	let tiles = 0;
	let bytes = 0;
	let oldest: number | null = null;
	let newest: number | null = null;
	const walk = (d: string) => {
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, entry.name);
			if (entry.isDirectory()) walk(p);
			else if (entry.isFile() && entry.name.endsWith('.png')) {
				const stat = fs.statSync(p);
				tiles++;
				bytes += stat.size;
				oldest = oldest === null ? stat.mtimeMs : Math.min(oldest, stat.mtimeMs);
				newest = newest === null ? stat.mtimeMs : Math.max(newest, stat.mtimeMs);
			}
		}
	};
	try {
		walk(dir());
	} catch {
		/* nothing cached yet */
	}
	return { tiles, bytes, oldest, newest };
}

/** How many of `refs` are already cached, and how old the oldest of them is. */
export function coverage(refs: { z: number; x: number; y: number }[]): { cached: number; total: number; oldest: number | null } {
	let cached = 0;
	let oldest: number | null = null;
	for (const ref of refs) {
		const hit = readCached(ref.z, ref.x, ref.y);
		if (!hit) continue;
		cached++;
		oldest = oldest === null ? hit.age : Math.min(oldest, hit.age);
	}
	return { cached, total: refs.length, oldest };
}
