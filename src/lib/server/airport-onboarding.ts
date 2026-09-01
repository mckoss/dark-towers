import tzLookup from '@photostructure/tz-lookup';
import type { NasrAirport, NasrData } from '$lib/nasr';
import type { AirportKind, TowerSchedule } from '$lib/types';
import { hourLabel } from '$lib/airports';
import { createAirport, getAirport, upsertSchedule } from './airports-store';
import { db, deleteRequest } from './db';
import { nasrData } from './nasr';

/** The hours passenger airlines have agreed not to fly, as local whole hours (22 → 7). */
export interface QuietHours {
	start: number;
	end: number;
}

export interface AirportCandidate {
	code: string;
	icao: string;
	name: string;
	city: string;
	state: string;
	tz: string;
	lat: number;
	lon: number;
	elevationFt: number;
	tower: NasrAirport['tower'];
	towerHours: string;
	cycle: string;
	kind: AirportKind;
	/** A reference airport cannot be added until its quiet hours are supplied. */
	needsQuietHours: boolean;
	/** Null only while a reference candidate is still waiting for its quiet hours. */
	schedule: TowerSchedule | null;
}

/** The database stores whole-hour windows. Use the widest staffed window so collection never includes towered time. */
function pollingHours(raw: string): { open: number; close: number } | null {
	const ranges = [...raw.matchAll(/\b(\d{2})(\d{2})-(\d{2})(\d{2})\b/g)];
	if (!ranges.length) return null;
	return {
		open: Math.min(...ranges.map((m) => Math.floor((Number(m[1]) * 60 + Number(m[2])) / 60))),
		close: Math.max(...ranges.map((m) => Math.ceil((Number(m[3]) * 60 + Number(m[4])) / 60)))
	};
}

/** Quiet hours must run overnight, so the stored window (open = end, close = start) is a real gap. */
export function validateQuietHours(quiet: QuietHours): void {
	const { start, end } = quiet;
	for (const h of [start, end]) if (!Number.isInteger(h) || h < 0 || h > 24) throw new Error('Quiet hours must be whole hours between 0 and 24.');
	if (end >= start) throw new Error('Quiet hours must run overnight — the start (evening) must be later than the end (morning).');
}

export function candidateFromNasr(data: NasrData, code: string, quiet?: QuietHours | null): AirportCandidate {
	const normalized = code.trim().toUpperCase();
	if (!/^[A-Z0-9]{3}$/.test(normalized)) throw new Error('Enter a three-letter FAA/IATA airport code.');
	const airport = data.airports[normalized];
	if (!airport) throw new Error(`Could not find ${normalized} in the FAA airport record.`);
	if (!airport.icao) throw new Error(`${normalized} has no ICAO code in the FAA record, so the flight-data service cannot poll it.`);

	const kind: AirportKind = airport.tower === 'full-time' ? 'reference' : 'dark';
	if (quiet && kind === 'dark') throw new Error(`${normalized} has a tower that closes, so its window comes from the FAA tower hours rather than quiet hours.`);
	if (kind === 'reference' && quiet) validateQuietHours(quiet);

	const hours = kind === 'reference'
		? quiet ? { open: quiet.end, close: quiet.start } : null
		: airport.tower === 'none' ? null : pollingHours(airport.towerHours);
	if (airport.tower === 'part-time' && !hours) throw new Error(`FAA tower hours for ${normalized} (${airport.towerHours || 'missing'}) cannot be converted to a polling schedule.`);
	const note = kind === 'reference'
		? quiet
			? `Reference airport. FAA NASR cycle ${data.cycle}: tower staffed 24 hours. Watched during the airport's published quiet hours, ${hourLabel(quiet.start)} to ${hourLabel(quiet.end)}.`
			: ''
		: airport.tower === 'none'
			? `FAA NASR cycle ${data.cycle}: no control tower.`
			: `FAA NASR cycle ${data.cycle}: tower ${airport.towerHours}. Polling uses the conservative whole-hour window shown.`;

	return {
		code: airport.id,
		icao: airport.icao,
		name: airport.name,
		city: airport.city,
		state: airport.state,
		tz: tzLookup(airport.lat, airport.lon),
		lat: airport.lat,
		lon: airport.lon,
		elevationFt: airport.elevFt,
		tower: airport.tower,
		towerHours: airport.towerHours,
		cycle: data.cycle,
		kind,
		needsQuietHours: kind === 'reference' && !quiet,
		schedule: kind === 'reference' && !quiet
			? null
			: {
					id: `${airport.id}-${data.cycle}`,
					from: data.cycle,
					to: null,
					open: hours?.open ?? null,
					close: hours?.close ?? null,
					note
				}
	};
}

export function airportCandidate(code: string, quiet?: QuietHours | null): AirportCandidate {
	const data = nasrData();
	if (!data) throw new Error('FAA airport data is not available. Refresh NASR data, then try again.');
	const candidate = candidateFromNasr(data, code, quiet);
	if (getAirport(candidate.code) || getAirport(candidate.icao)) throw new Error(`${candidate.code} is already in the airport list.`);
	return candidate;
}

/** Re-resolve FAA data at confirmation time, then atomically add tracking, its schedule, and remove an accepted request. */
export function confirmAirport(code: string, by: string, requestId?: number, quiet?: QuietHours | null): AirportCandidate {
	const candidate = airportCandidate(code, quiet);
	if (!candidate.schedule) throw new Error(`${candidate.code} has a tower staffed 24 hours, so it needs quiet hours before it can be added as a reference airport.`);
	db().transaction(() => {
		createAirport(
			{
				id: candidate.code,
				code: candidate.code,
				icao: candidate.icao,
				name: candidate.name,
				city: candidate.city,
				state: candidate.state,
				tz: candidate.tz,
				lat: candidate.lat,
				lon: candidate.lon,
				elevation_ft: candidate.elevationFt,
				carriers: [],
				status: 'tracking',
				tracked: true,
				kind: candidate.kind
			},
			by
		);
		upsertSchedule(candidate.code, candidate.schedule!, by);
		if (requestId !== undefined) deleteRequest(requestId);
	})();
	return candidate;
}
