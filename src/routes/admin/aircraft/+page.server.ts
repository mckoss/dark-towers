import { deleteAircraft, listAircraft, unknownAircraft, upsertAircraft } from '$lib/server/aircraft-store';
import type { WakeCategory } from '$lib/types';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
const valid = new Set('ABCDEFGHI'.split(''));
export const load: PageServerLoad = () => ({ aircraft: listAircraft(), unknown: unknownAircraft() });
export const actions: Actions = {
	save: async ({ request, locals }) => {
		const f = await request.formData(), type = String(f.get('type') ?? '').trim().toUpperCase(), category = String(f.get('category') ?? '').toUpperCase(), description = String(f.get('description') ?? '').trim();
		if (!/^[A-Z0-9]{2,8}$/.test(type) || !valid.has(category)) return fail(400, { error: 'Enter a valid ICAO type and CWT category A–I.' });
		upsertAircraft({ type, category: category as WakeCategory, description }, locals.user!.email); return { saved: type };
	},
	delete: async ({ request }) => { deleteAircraft(String((await request.formData()).get('type') ?? '')); return { saved: 'deleted' }; }
};
