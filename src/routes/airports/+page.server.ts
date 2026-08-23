import { fail } from '@sveltejs/kit';
import { airportsPageData } from '$lib/server/queries';
import { insertRequest } from '$lib/server/db';
import { assessRequest } from '$lib/nasr';
import { nasrData } from '$lib/server/nasr';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => airportsPageData();

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const value = String(form.get('value') ?? '').trim().slice(0, 120);
		const emailRaw = String(form.get('email') ?? '').trim().slice(0, 200);
		if (!value) return fail(400, { error: 'Enter an airport code or a city and state.' });
		// Check the FAA record: only airports with a part-time tower or no tower qualify.
		const a = assessRequest(nasrData(), value);
		if (!a.ok) return fail(400, { error: a.message, value });
		insertRequest(value, emailRaw || null, a.airport?.id ?? null, `${a.kind}${a.airport ? `: ${a.airport.towerHours || 'no tower'}` : ''}`);
		return { submitted: true, value, message: a.message };
	}
};
