import { listAirports } from '$lib/server/airports-store';
import { altimeterCheck, deleteRequest, incompleteNights, listRequests, nightCounts, recentRuns } from '$lib/server/db';
import { pressureOffsetFt } from '$lib/altimeter';
import { currentJob, startBackfill, startCatchUp, startIngest } from '$lib/server/jobs';
import { config, flightAwareApiKey } from '$lib/server/config';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

export const load: PageServerLoad = ({ locals }) => {
	const s = config();
	return {
		user: locals.user!,
		admins: s.admins,
		apiKeyPresent: !!flightAwareApiKey(),
		historyEnabled: s.aeroapi_history,
		historyDays: s.history_days,
		googleConfigured: !!s.google,
		airports: listAirports().map((a) => ({ code: a.code, icao: a.icao, name: a.name, tracked: a.tracked, status: a.status })),
		counts: nightCounts(),
		incomplete: incompleteNights(),
		altimeter: altimeterCheck().map((n) => {
			const r = n.altimeter ?? [];
			const vals = r.map(([, v]) => v);
			const lo = vals.length ? Math.min(...vals) : null;
			const hi = vals.length ? Math.max(...vals) : null;
			return {
				airport: n.airport,
				night: n.night,
				readings: r.length,
				range: lo != null && hi != null ? `${lo.toFixed(2)}–${hi.toFixed(2)}` : '—',
				/** Weather-derived offset range (feet to subtract from reported altitude). */
				weatherFt: lo != null && hi != null ? `${Math.round(pressureOffsetFt(hi))}…${Math.round(pressureOffsetFt(lo))}` : '—',
				groundFt: n.groundOffsetFt,
				groundTracks: n.groundTracks,
				onFieldFt: n.onField?.length ? median(n.onField.map(([, v]) => v)) : null,
				onFieldPoints: n.onField?.length ?? 0
			};
		}),
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
		if (!listAirports().some((a) => a.code === code)) return fail(400, { error: 'Unknown airport.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return fail(400, { error: 'Night must be YYYY-MM-DD.' });
		if (!startIngest(code, night, force)) return fail(409, { error: 'A job is already running.' });
		return { started: `ingest ${code} ${night}` };
	},
	backfill: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '').toUpperCase();
		const nights = Math.min(365, Math.max(1, Number(f.get('nights') ?? 30)));
		if (!listAirports().some((a) => a.code === code)) return fail(400, { error: 'Unknown airport.' });
		if (!startBackfill(code, nights)) return fail(409, { error: 'A job is already running.' });
		return { started: `backfill ${code} × ${nights} nights` };
	},
	deleteRequest: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Bad id.' });
		deleteRequest(id);
		return { deleted: id };
	}
};
