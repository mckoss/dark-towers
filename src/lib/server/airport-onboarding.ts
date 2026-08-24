import tzLookup from '@photostructure/tz-lookup';
import type { NasrAirport, NasrData } from '$lib/nasr';
import type { TowerSchedule } from '$lib/types';
import { createAirport, getAirport, upsertSchedule } from './airports-store';
import { db, deleteRequest } from './db';
import { nasrData } from './nasr';

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
	schedule: TowerSchedule;
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

export function candidateFromNasr(data: NasrData, code: string): AirportCandidate {
	const normalized = code.trim().toUpperCase();
	if (!/^[A-Z0-9]{3}$/.test(normalized)) throw new Error('Enter a three-letter FAA/IATA airport code.');
	const airport = data.airports[normalized];
	if (!airport) throw new Error(`Could not find ${normalized} in the FAA airport record.`);
	if (!airport.icao) throw new Error(`${normalized} has no ICAO code in the FAA record, so the flight-data service cannot poll it.`);
	if (airport.tower === 'full-time') throw new Error(`${normalized} has a control tower staffed 24 hours, so it is outside what this site tracks.`);

	const hours = airport.tower === 'none' ? null : pollingHours(airport.towerHours);
	if (airport.tower === 'part-time' && !hours) throw new Error(`FAA tower hours for ${normalized} (${airport.towerHours || 'missing'}) cannot be converted to a polling schedule.`);
	const note = airport.tower === 'none'
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
		schedule: {
			id: `${airport.id}-${data.cycle}`,
			from: data.cycle,
			to: null,
			open: hours?.open ?? null,
			close: hours?.close ?? null,
			note
		}
	};
}

export function airportCandidate(code: string): AirportCandidate {
	const data = nasrData();
	if (!data) throw new Error('FAA airport data is not available. Refresh NASR data, then try again.');
	const candidate = candidateFromNasr(data, code);
	if (getAirport(candidate.code) || getAirport(candidate.icao)) throw new Error(`${candidate.code} is already in the airport list.`);
	return candidate;
}

/** Re-resolve FAA data at confirmation time, then atomically add tracking, its schedule, and remove an accepted request. */
export function confirmAirport(code: string, by: string, requestId?: number): AirportCandidate {
	const candidate = airportCandidate(code);
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
				tracked: true
			},
			by
		);
		upsertSchedule(candidate.code, candidate.schedule, by);
		if (requestId !== undefined) deleteRequest(requestId);
	})();
	return candidate;
}
