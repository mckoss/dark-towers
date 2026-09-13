import { deleteRequest, getRequest, listRequests } from '$lib/server/db';
import { airportCandidate, confirmAirport, type QuietHours } from '$lib/server/airport-onboarding';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ requests: listRequests() });
/** The quiet-hours window the requester proposed, for a reference-airport request. */
function quietOf(row: { kind: string | null; quiet_start: number | null; quiet_end: number | null }): QuietHours | null {
	return row.kind === 'reference' && row.quiet_start != null && row.quiet_end != null ? { start: row.quiet_start, end: row.quiet_end } : null;
}



export const actions: Actions = {
	deleteRequest: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad id.' });
		deleteRequest(id);
		return { deleted: id };
	},
	acceptRequest: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad request id.' });
		const row = getRequest(id);
		if (!row) return fail(404, { error: 'Request not found.' });
		const code = row.code || row.value;
		try {
			return { candidate: airportCandidate(code, quietOf(row)), requestId: id };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
	},
	confirmRequest: async ({ request, locals }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad request id.' });
		const row = getRequest(id);
		if (!row) return fail(404, { error: 'Request not found.' });
		try {
			const added = confirmAirport(row.code || row.value, locals.user!.email, id, quietOf(row));
			return { accepted: added.code };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
	}
};
