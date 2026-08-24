import { error } from '@sveltejs/kit';
import { airportDetail, identsFor } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	const detail = airportDetail(params.code, url.searchParams.get('night'), url.searchParams.get('month'));
	if (!detail) error(404, 'Airport not found');
	const rawReplayTime = url.searchParams.get('t');
	const replayTime = rawReplayTime != null && Number.isFinite(Number(rawReplayTime)) ? Number(rawReplayTime) : null;
	return { ...detail, idents: identsFor(detail.incidents), replayTime };
};
