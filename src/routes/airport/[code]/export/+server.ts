import { error } from '@sveltejs/kit';
import { airportDetail, identsFor } from '$lib/server/queries';
import { renderNightlyReportPdf } from '$lib/server/pdf/nightlyReport';
import { viewTiles } from '$lib/server/tile-cache';
import { MAP_VIEWS } from '$lib/report-maps';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const detail = airportDetail(params.code, url.searchParams.get('night'), url.searchParams.get('month'));
	if (!detail || !detail.selectedNight) error(404, 'No night to report on');

	// Only what is already cached: a reader's download never waits on a tile
	// fetch, and an unwarmed airport just draws its charts on plain ground.
	const tiles = await Promise.all(MAP_VIEWS.map((view) => viewTiles(detail.airport.pos, view.halfNm, { cachedOnly: true })));

	const pdf = await renderNightlyReportPdf({
		detail,
		idents: identsFor(detail.incidents),
		tiles,
		origin: url.origin
	});
	return new Response(Buffer.from(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${detail.airport.code}-${detail.selectedNight}.pdf"`,
			'cache-control': 'no-store'
		}
	});
};
