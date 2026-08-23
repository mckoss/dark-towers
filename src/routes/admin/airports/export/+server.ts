import { exportJson } from '$lib/server/airports-store';
import type { RequestHandler } from '@sveltejs/kit';

/** The live airports table in airports.json format — save over the repo file to re-sync the seed. */
export const GET: RequestHandler = () =>
	new Response(JSON.stringify(exportJson(), null, 2) + '\n', {
		headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="airports.json"', 'cache-control': 'no-store' }
	});
