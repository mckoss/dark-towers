import { error, redirect } from '@sveltejs/kit';
import { isAdmin, openMode } from '$lib/server/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/google');
	if (openMode() || isAdmin(locals.user.email)) redirect(303, '/admin');
	error(403, { message: 'Admin access denied.', account: locals.user.email });
};
