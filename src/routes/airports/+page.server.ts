import { fail } from '@sveltejs/kit';
import { airportsPageData } from '$lib/server/queries';
import { insertRequest } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => airportsPageData();

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const value = String(form.get('value') ?? '').trim().slice(0, 120);
		const emailRaw = String(form.get('email') ?? '').trim().slice(0, 200);
		if (!value) return fail(400, { error: 'Enter an airport code or a city and state.' });
		insertRequest(value, emailRaw || null);
		return { submitted: true, value };
	}
};
