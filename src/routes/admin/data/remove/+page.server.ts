import { fail } from '@sveltejs/kit';
import { getAirport, listAirports } from '$lib/server/airports-store';
import { airportDataCounts, deleteAirportData } from '$lib/server/db';
import { currentJob } from '$lib/server/jobs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	airports: listAirports().map(({ code, name }) => ({ code, name })),
	selected: getAirport(url.searchParams.get('airport') ?? '')?.code ?? ''
});

function selection(form: FormData) {
	const code = String(form.get('airport') ?? '').trim().toUpperCase();
	const airport = getAirport(code);
	if (!airport) throw new Error('Choose a known airport.');
	const scope = form.get('scope');
	if (scope !== 'all' && scope !== 'range') throw new Error('Choose all nights or a date range.');
	return {
		code: airport.code, name: airport.name, airport: airport.icao,
		from: scope === 'all' ? null : String(form.get('from') ?? ''),
		to: scope === 'all' ? null : String(form.get('to') ?? '')
	};
}

export const actions: Actions = {
	preview: async ({ request }) => {
		try {
			const target = selection(await request.formData());
			return { preview: { ...target, ...airportDataCounts(target) } };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
	},
	remove: async ({ request, locals }) => {
		try {
			const form = await request.formData();
			const target = selection(form);
			if (String(form.get('confirm') ?? '').trim() !== target.code) {
				return fail(400, { error: `Type ${target.code} to confirm removal. Preview the selection again to continue.` });
			}
			const job = currentJob();
			if (job && !job.finishedAt) return fail(409, { error: 'A collection job is running. Wait for it to finish, then preview again.' });
			const removed = deleteAirportData(target);
			console.log('[admin] removed airport data', { by: locals.user!.email, ...target, ...removed });
			return { removed: { ...target, ...removed } };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
	}
};
