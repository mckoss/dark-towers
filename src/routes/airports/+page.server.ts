import { fail, redirect } from '@sveltejs/kit';
import { airportsPageData } from '$lib/server/queries';
import { insertRequest, requestExists } from '$lib/server/db';
import { assessRequest, findByCode, findQualifyingAirports, towerHoursText, type NasrAirport } from '$lib/nasr';
import { nasrData } from '$lib/server/nasr';
import { getAirport } from '$lib/server/airports-store';
import { googleConfigured } from '$lib/server/google';
import { validateQuietHours, type QuietHours } from '$lib/server/airport-onboarding';
import type { AirportKind } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/** A whole local hour 0–24 from a form field, or null when blank/invalid. */
function hour(v: FormDataEntryValue | null): number | null {
	const n = Number(String(v ?? '').trim());
	return Number.isInteger(n) && n >= 0 && n <= 24 && String(v ?? '').trim() !== '' ? n : null;
}

interface RequestCandidate extends NasrAirport {
	towerLabel: string;
	/** 'reference' when the tower is staffed 24 hours: quiet hours and a reason are required. */
	track: AirportKind;
}

interface RequestSearchResult extends RequestCandidate {
	status: 'available' | 'listed' | 'pending';
}

function lookupCandidate(value: string): { candidate: RequestCandidate | null; error: string | null } {
	const assessment = assessRequest(nasrData(), value);
	if (!assessment.ok) return { candidate: null, error: assessment.message };
	if (!assessment.airport) return { candidate: null, error: 'FAA airport data is temporarily unavailable, so we cannot verify this request yet. Please try again later.' };
	const airport = assessment.airport;
	if (!airport.part139) return { candidate: null, error: `${airport.id} (${airport.name}) is not listed as an FAA Part 139 air-carrier airport, so it does not meet this site's passenger-service requirement.` };
	if (getAirport(airport.id)) return { candidate: null, error: `${airport.id} (${airport.name}) is already on the Dark Towers airport list.` };
	if (requestExists(airport.id)) return { candidate: null, error: `${airport.id} (${airport.name}) already has a pending request.` };
	return { candidate: { ...airport, towerLabel: towerHoursText(airport), track: assessment.track }, error: null };
}

function searchCandidates(value: string): { candidate?: RequestCandidate; matches?: RequestSearchResult[]; error?: string } {
	const data = nasrData();
	if (!data) return { error: 'FAA airport data is temporarily unavailable, so we cannot search right now. Please try again later.' };
	const exact = findByCode(data, value);
	if (exact) {
		const result = lookupCandidate(exact.id);
		return result.candidate ? { candidate: result.candidate } : { error: result.error ?? 'This airport cannot be requested.' };
	}
	const matches = findQualifyingAirports(data, value).map((airport) => ({
		...airport,
		towerLabel: towerHoursText(airport),
		track: 'dark' as const,
		status: getAirport(airport.id) ? 'listed' as const : requestExists(airport.id) ? 'pending' as const : 'available' as const
	}));
	if (!matches.length) {
		return { error: `We could not find any qualifying airports for "${value}". Try an airport code, city, state name, or two-letter state code.` };
	}
	return { matches };
}

export const load: PageServerLoad = ({ locals, url }) => {
	const requested = url.searchParams.get('request')?.slice(0, 120) ?? '';
	const lookup = requested ? lookupCandidate(requested) : { candidate: null, error: null };
	return {
		...airportsPageData(),
		user: locals.user ? { email: locals.user.email, name: locals.user.name } : null,
		googleConfigured: googleConfigured(),
		candidate: lookup.candidate,
		requestError: lookup.error
	};
};

export const actions: Actions = {
	lookup: async ({ request }) => {
		const form = await request.formData();
		const value = String(form.get('value') ?? '').trim().slice(0, 120);
		if (!value) return fail(400, { error: 'Enter an airport code, city, or state.' });
		const result = searchCandidates(value);
		if (result.error) return fail(400, { error: result.error, value });
		return result;
	},
	submit: async ({ request, locals }) => {
		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim().slice(0, 4).toUpperCase();
		const result = lookupCandidate(code);
		if (!result.candidate) return fail(400, { error: result.error });
		if (!locals.user) redirect(303, `/auth/google?next=${encodeURIComponent(`/airports?request=${result.candidate.id}#request-airport`)}`);
		const name = String(form.get('name') ?? '').trim().slice(0, 120);
		const comment = String(form.get('comment') ?? '').trim().slice(0, 2000);
		if (!name) return fail(400, { error: 'Enter your name.', candidate: result.candidate });
		const a = result.candidate;
		// A 24-hour tower can only be listed for comparison, so we need the quiet hours and the reason.
		let quiet: QuietHours | null = null;
		if (a.track === 'reference') {
			const start = hour(form.get('quiet_start')),
				end = hour(form.get('quiet_end'));
			if (start == null || end == null) return fail(400, { error: 'Give the quiet hours this airport keeps — when they start in the evening and end in the morning.', candidate: a });
			try {
				validateQuietHours({ start, end });
			} catch (e) {
				return fail(400, { error: e instanceof Error ? e.message : String(e), candidate: a });
			}
			if (comment.length < 10) return fail(400, { error: 'Tell us why this airport is worth comparing and where its quiet hours come from.', candidate: a });
			quiet = { start, end };
		}
		insertRequest(a.id, locals.user.email, a.id, `${a.tower}: ${a.towerHours || 'no tower'}`, name, comment || null, a.track, quiet);
		return { submitted: true, message: `Your request for ${a.id} (${a.name}) has been sent.` };
	}
};
