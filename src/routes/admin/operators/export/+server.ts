import { exportOperatorsJson } from '$lib/server/operators-store';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () =>
	new Response(JSON.stringify(exportOperatorsJson(), null, 2) + '\n', {
		headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="operators.json"', 'cache-control': 'no-store' }
	});
