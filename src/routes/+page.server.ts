import { homeData } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => homeData();
