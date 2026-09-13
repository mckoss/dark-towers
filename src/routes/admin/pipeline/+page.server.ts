import { addDays } from '$lib/time';
import { getAirport, listAirports } from '$lib/server/airports-store';
import { deleteNightData as deleteDerivedNightData, recentProblems, runActivity } from '$lib/server/db';
import { extendedHistoryAllowed } from '$lib/server/capability';
import { BOOTED, currentJob, startBackfill, startCatchUp, startIngest } from '$lib/server/jobs';
import { config } from '$lib/server/config';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function nightRange(from: string, to: string): string[] {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Dates must be YYYY-MM-DD.');
	if (from > to) throw new Error('From date must be on or before to date.');
	const nights: string[] = [];
	for (let n = from; n <= to; n = addDays(n, 1)) {
		nights.push(n);
		if (nights.length > 31) throw new Error('Delete at most 31 nights at a time.');
	}
	return nights;
}


export const load: PageServerLoad = () => ({
 airports: listAirports().map(({code, name}) => ({code, name})),
 historyEnabled: extendedHistoryAllowed(),
 schedulerOn: config().scheduler,
 activity: runActivity(Date.now() - 24 * 3600_000),
 booted: BOOTED,
 problems: recentProblems(Date.now() - 48 * 3600_000),
 job: currentJob()
});

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
	deleteNightData: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '').toUpperCase();
		const from = String(f.get('from') ?? '');
		const to = String(f.get('to') ?? '');
		const confirm = String(f.get('confirm') ?? '');
		const airport = getAirport(code);
		if (!airport) return fail(400, { error: 'Unknown airport.' });
		if (confirm !== 'DELETE') return fail(400, { error: 'Type DELETE to remove derived night data.' });
		const job = currentJob();
		if (job && !job.finishedAt) return fail(409, { error: 'A job is already running.' });
		try {
			const deleted = nightRange(from, to).map((night) => deleteDerivedNightData(airport.icao, night));
			const totals = deleted.reduce(
				(acc, row) => ({
					nights: acc.nights + row.nights,
					flights: acc.flights + row.flights,
					incidents: acc.incidents + row.incidents
				}),
				{ nights: 0, flights: 0, incidents: 0 }
			);
			return { deletedNightData: `${airport.code} ${from}${from === to ? '' : `–${to}`}: removed ${totals.nights} night row(s), ${totals.flights} flight(s), ${totals.incidents} incident(s). Raw API cache was left intact.` };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
	}
};
