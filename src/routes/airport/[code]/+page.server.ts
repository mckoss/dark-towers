import { error } from '@sveltejs/kit';
import { airportDetail, identsFor } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	const detail = airportDetail(params.code, url.searchParams.get('night'));
	if (!detail) error(404, 'Airport not found');
	return { ...detail, idents: identsFor(detail.incidents) };
};
