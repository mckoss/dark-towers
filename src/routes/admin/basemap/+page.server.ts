import { listAirports } from '$lib/server/airports-store';
import { cacheStats, coverage, tilesConfigured, TILE_TTL_MS } from '$lib/server/tile-cache';
import { MAP_VIEWS, tilesForView } from '$lib/report-maps';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	keyed: tilesConfigured(),
	ttlDays: Math.round(TILE_TTL_MS / 86_400_000),
	stats: cacheStats(),
	airports: listAirports()
		.filter((a) => a.tracked)
		.map((a) => ({
			code: a.code,
			icao: a.icao,
			name: a.name,
			pos: a.pos,
			views: MAP_VIEWS.map((view) => ({ ...view, ...coverage(tilesForView(a.pos, view.halfNm)) }))
		}))
});
