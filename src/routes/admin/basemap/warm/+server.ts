/**
 * Fills the base-map tile cache.
 *
 * POST with PNG bytes (?z=&x=&y=) stores one tile fetched by the admin's own
 * browser — that request carries the site's origin, so CARTO answers without
 * the "API KEY REQUIRED" stamp a keyless server-side fetch gets back. With a
 * keyed `tile_url` configured the server can fill the cache itself instead,
 * which is what POST without a body does.
 *
 * /admin is gated in hooks.server.ts, so only an admin can write here.
 */
import { error, json } from '@sveltejs/kit';
import { getAirport } from '$lib/server/airports-store';
import { putTile, tile, tilesConfigured } from '$lib/server/tile-cache';
import { MAP_VIEWS, tilesForView } from '$lib/report-maps';
import type { RequestHandler } from './$types';

const coord = (v: string | null, max: number): number | null => {
	if (!v || !/^\d{1,7}$/.test(v)) return null;
	const n = Number(v);
	return n >= 0 && n <= max ? n : null;
};

export const POST: RequestHandler = async ({ url, request }) => {
	const z = coord(url.searchParams.get('z'), 19);
	const x = z === null ? null : coord(url.searchParams.get('x'), 2 ** z - 1);
	const y = z === null ? null : coord(url.searchParams.get('y'), 2 ** z - 1);
	if (z === null || x === null || y === null) error(400, 'Bad tile coordinates');

	const png = new Uint8Array(await request.arrayBuffer());
	try {
		putTile(z, x, y, png);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Bad tile');
	}
	return json({ ok: true, z, x, y, bytes: png.length });
};

/** Which tiles one airport's charts need, so the browser knows what to fetch. */
export const GET: RequestHandler = ({ url }) => {
	const airport = getAirport(url.searchParams.get('airport') ?? '');
	if (!airport) error(404, 'Unknown airport');
	return json({
		keyed: tilesConfigured(),
		views: MAP_VIEWS.map((view) => ({ ...view, tiles: tilesForView(airport.pos, view.halfNm).map(({ z, x, y }) => ({ z, x, y })) }))
	});
};

/** Server-side warm, available once a keyed `tile_url` is configured. */
export const PUT: RequestHandler = async ({ url }) => {
	if (!tilesConfigured()) error(400, 'No keyed tile_url configured');
	const airport = getAirport(url.searchParams.get('airport') ?? '');
	if (!airport) error(404, 'Unknown airport');
	const force = url.searchParams.get('force') === '1';
	let fetched = 0;
	for (const view of MAP_VIEWS) {
		for (const ref of tilesForView(airport.pos, view.halfNm)) {
			if (await tile(ref.z, ref.x, ref.y, { force })) fetched++;
		}
	}
	return json({ ok: true, airport: airport.code, tiles: fetched });
};
