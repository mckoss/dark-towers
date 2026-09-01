/**
 * Base-map tiles for the live map, served from our own cache.
 *
 * Keeping the provider key server-side is the point: the browser asks us, we
 * answer from disk, and upstream sees roughly one request per tile per month
 * instead of one per visitor. Panning past the cached views still pulls new
 * tiles, which are then cached like any other.
 */
import { error, redirect } from '@sveltejs/kit';
import { directUrl, tile, tilesConfigured, TILE_TTL_MS } from '$lib/server/tile-cache';
import type { RequestHandler } from './$types';

/** Guard rails, so the route cannot be pointed at arbitrary upstream paths. */
const num = (v: string, max: number): number | null => {
	if (!/^\d{1,7}$/.test(v)) return null;
	const n = Number(v);
	return n >= 0 && n <= max ? n : null;
};

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const z = num(params.z, 19);
	const x = z === null ? null : num(params.x, 2 ** z - 1);
	const y = z === null ? null : num(params.y, 2 ** z - 1);
	if (z === null || x === null || y === null) error(400, 'Bad tile coordinates');

	// Serve the cache first; with no key of our own, send anything uncached
	// straight to CARTO, whose reply to a browser on this origin is unstamped.
	const png = await tile(z, x, y, { cachedOnly: !tilesConfigured() });
	if (!png) redirect(302, directUrl(z, x, y));

	setHeaders({
		'content-type': 'image/png',
		// The browser may hold a tile as long as we would before refetching it.
		'cache-control': `public, max-age=${Math.floor(TILE_TTL_MS / 1000)}, immutable`
	});
	return new Response(Buffer.from(png));
};
