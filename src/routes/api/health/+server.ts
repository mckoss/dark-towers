import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = () => {
	const row = db().prepare(`SELECT COUNT(*) AS nights, MAX(night) AS latest FROM nights`).get() as {
		nights: number;
		latest: string | null;
	};
	return json(
		{ ok: true, time: new Date().toISOString(), nights: row.nights, latestNight: row.latest ?? null },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
