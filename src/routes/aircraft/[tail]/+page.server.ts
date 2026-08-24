import { error } from '@sveltejs/kit';
import { aircraftDetail } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const detail = aircraftDetail(params.tail);
	if (!detail) error(404, 'Aircraft not found');
	return detail;
};
