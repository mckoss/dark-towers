import { error } from '@sveltejs/kit';
import { incidentDetail } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const detail = incidentDetail(params.id);
	if (!detail) error(404, 'Close approach not found');
	return detail;
};
