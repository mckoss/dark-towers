import { error } from '@sveltejs/kit';
import { closeApproachesData } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const data = closeApproachesData(url.searchParams.get('airport'), url.searchParams.get('night'), url.searchParams.get('month'));
	if (!data) error(404, 'Airport not found');
	return data;
};
