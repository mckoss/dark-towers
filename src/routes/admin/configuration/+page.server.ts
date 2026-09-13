import { listAirports } from '$lib/server/airports-store';
import { config, flightAwareApiKey } from '$lib/server/config';
import { cachedCapability, probeCapability } from '$lib/server/capability';
import { nasrData } from '$lib/server/nasr';
import { registryData } from '$lib/server/registry';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
 const s = config();
 return {
		admins: s.admins,
		apiKeyPresent: !!flightAwareApiKey(),
		historyOverride: s.aeroapi_history,
		capability: cachedCapability(),
		historyDays: s.history_days,
		googleConfigured: !!s.google,
		nasrCycle: nasrData()?.cycle ?? null,
		registry: (() => {
			const r = registryData();
			return r ? { asOf: r.asOf, aircraft: Object.keys(r.tails).length } : null;
		})(),
		airports: listAirports().map((a) => ({ code: a.code, icao: a.icao, name: a.name, tracked: a.tracked, status: a.status })),

 };
};

export const actions: Actions = {
	probe: async () => {
		const cap = await probeCapability({ log: console.log });
		if (!cap) return fail(503, { error: 'Could not reach AeroAPI to check the key.' });
		return { probed: cap.extendedHistory ? 'Extended history is available on this key.' : `Extended history is not available on this key (${cap.detail}).` };
	}
};
