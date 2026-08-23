import { deleteOperator, listOperators, unknownOperators, upsertOperator } from '$lib/server/operators-store';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ user: locals.user!, operators: listOperators(), unknown: unknownOperators() });

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const f = await request.formData();
		const icao = String(f.get('icao') ?? '').trim().toUpperCase();
		const name = String(f.get('name') ?? '').trim();
		const short = String(f.get('short') ?? '').trim() || name;
		if (!/^[A-Z0-9]{2,4}$/.test(icao)) return fail(400, { error: 'Operator code must be 2–4 letters/digits (ICAO, e.g. ASA).' });
		if (!name) return fail(400, { error: 'Name is required.' });
		upsertOperator({ icao, name, short }, locals.user!.email);
		return { saved: icao };
	},
	delete: async ({ request, locals }) => {
		const f = await request.formData();
		const icao = String(f.get('icao') ?? '').trim().toUpperCase();
		deleteOperator(icao, locals.user!.email);
		return { saved: `deleted ${icao}` };
	}
};
