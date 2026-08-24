import { applyJsonRow, deleteSchedule, drift, getAirport, listAirports, nightsAffectedBySchedule, updateAirport, upsertSchedule } from '$lib/server/airports-store';
import { startReingest } from '$lib/server/jobs';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { AirportStatus, TowerSchedule } from '$lib/types';
import { airportCandidate, confirmAirport } from '$lib/server/airport-onboarding';

export const load: PageServerLoad = ({ locals }) => {
	let driftRows: ReturnType<typeof drift> = [];
	let driftError: string | null = null;
	try {
		driftRows = drift();
	} catch (e) {
		driftError = e instanceof Error ? e.message : String(e);
	}
	return { user: locals.user!, airports: listAirports(), drift: driftRows, driftError };
};

const num = (v: FormDataEntryValue | null) => (v == null || v === '' ? NaN : Number(v));
const hour = (v: FormDataEntryValue | null): number | null => {
	if (v == null || String(v).trim() === '') return null;
	const n = Number(v);
	return Number.isInteger(n) && n >= 0 && n <= 24 ? n : NaN;
};
const dateOrNull = (v: FormDataEntryValue | null): string | null | undefined => {
	const s = String(v ?? '').trim();
	if (!s) return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

export const actions: Actions = {
	airport: async ({ request, locals }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const a = getAirport(id);
		if (!a) return fail(404, { error: 'Unknown airport.' });
		const lat = num(f.get('lat')),
			lon = num(f.get('lon')),
			elev = num(f.get('elevation_ft'));
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(elev)) return fail(400, { error: 'Latitude, longitude and elevation must be numbers.' });
		const status = String(f.get('status')) as AirportStatus;
		if (!['tracking', 'requested'].includes(status)) return fail(400, { error: 'Bad status.' });
		updateAirport(
			a.id,
			{
				name: String(f.get('name') ?? '').trim(), city: String(f.get('city') ?? '').trim(), state: String(f.get('state') ?? '').trim().toUpperCase(),
				tz: String(f.get('tz') ?? '').trim(), lat, lon, elevation_ft: elev,
				carriers: String(f.get('carriers') ?? '').split(',').map((c) => c.trim()).filter(Boolean),
				status, tracked: f.get('tracked') === 'on'
			},
			locals.user!.email
		);
		return { saved: a.code };
	},

	lookupAirport: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('code') ?? '').trim().toUpperCase();
		try {
			return { candidate: airportCandidate(code) };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e), code });
		}
	},

	confirmAirport: async ({ request, locals }) => {
		const f = await request.formData();
		const code = String(f.get('code') ?? '').trim().toUpperCase();
		try {
			const added = confirmAirport(code, locals.user!.email);
			return { saved: `${added.code} and its polling schedule`, added: added.code };
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e), code });
		}
	},

	schedule: async ({ request, locals }) => {
		const f = await request.formData();
		const airportId = String(f.get('airport') ?? '');
		const a = getAirport(airportId);
		if (!a) return fail(404, { error: 'Unknown airport.' });
		const from = dateOrNull(f.get('from'));
		const to = dateOrNull(f.get('to'));
		if (!from || to === undefined) return fail(400, { error: 'Dates must be YYYY-MM-DD (from is required).' });
		if (to && to < from) return fail(400, { error: '"To" must not be before "from".' });
		const open = hour(f.get('open')),
			close = hour(f.get('close'));
		if (Number.isNaN(open) || Number.isNaN(close)) return fail(400, { error: 'Hours must be whole numbers 0–24.' });
		if ((open == null) !== (close == null)) return fail(400, { error: 'Give both open and close, or leave both blank for "no tower".' });
		if (open != null && close != null && close <= open) return fail(400, { error: 'Close must be after open (overnight closures are the gap until the next open).' });
		const id = String(f.get('id') ?? '').trim() || `${a.id}-${from}`;
		const s: TowerSchedule = { id, from, to, open, close, note: String(f.get('note') ?? '').trim() };
		upsertSchedule(a.id, s, locals.user!.email);
		const affected = nightsAffectedBySchedule(a, from, to);
		return { saved: a.code, affected: affected.length ? { airport: a.code, nights: affected } : null };
	},

	deleteSchedule: async ({ request, locals }) => {
		const f = await request.formData();
		deleteSchedule(String(f.get('id') ?? ''), locals.user!.email);
		return { saved: 'schedule' };
	},

	applyJson: async ({ request, locals }) => {
		const f = await request.formData();
		try {
			applyJsonRow(String(f.get('key') ?? ''), locals.user!.email);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
		return { saved: 'json' };
	},

	reingest: async ({ request }) => {
		const f = await request.formData();
		const code = String(f.get('airport') ?? '');
		const nights = String(f.get('nights') ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
		if (!nights.length) return fail(400, { error: 'No nights given.' });
		if (!startReingest(code, nights)) return fail(409, { error: 'A job is already running.' });
		return { saved: `re-ingest ${code} × ${nights.length}` };
	}
};
