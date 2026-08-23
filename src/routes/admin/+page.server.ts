import { AIRPORTS } from '$lib/airports';
import { deleteRequest, incompleteNights, listRequests, nightCounts, recentRuns } from '$lib/server/db';
import { currentJob, startCatchUp, startIngest } from '$lib/server/jobs';
import { config, flightAwareApiKey } from '$lib/server/config';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const s = config();
	return {
		user: locals.user!,
		admins: s.admins,
		apiKeyPresent: !!flightAwareApiKey(),
		googleConfigured: !!s.google,
		airports: AIRPORTS.map((a) => ({ code: a.code, icao: a.icao, name: a.name, tracked: a.tracked, status: a.status })),
		counts: nightCounts(),
		incomplete: incompleteNights(),
		runs: recentRuns(),
		requests: listRequests(),
		job: currentJob()
	};
};

export const actions: Actions = {
	catchup: async () => {
		if (!startCatchUp()) return fail(409, { error: 'A job is already running.' });
		return { started: 'catch-up' };
	},
	ingest: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '').toUpperCase();
		const night = String(f.get('night') ?? '');
		const force = f.get('force') === 'on';
		if (!AIRPORTS.some((a) => a.code === code)) return fail(400, { error: 'Unknown airport.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return fail(400, { error: 'Night must be YYYY-MM-DD.' });
		if (!startIngest(code, night, force)) return fail(409, { error: 'A job is already running.' });
		return { started: `ingest ${code} ${night}` };
	},
	deleteRequest: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad id.' });
		deleteRequest(id);
		return { deleted: id };
	}
};
