/**
 * FAA NASR (National Airspace System Resources) facility data — the official
 * record of which airports have a control tower and when it is staffed.
 * Pure parsing and classification; the download/caching lives in
 * $lib/server/nasr.
 */
import { parseCsv } from './zip';
import type { Runway } from './types';

export type TowerKind = 'none' | 'part-time' | 'full-time';

export interface NasrAirport {
	/** FAA location id, e.g. "PAE". */
	id: string;
	/** ICAO id where one exists, e.g. "KPAE". */
	icao: string | null;
	name: string;
	city: string;
	state: string;
	lat: number;
	lon: number;
	elevFt: number;
	tower: TowerKind;
	/** Raw hours string from NASR ("0700-2100", "24", seasonal text), empty when no tower. */
	towerHours: string;
	/** Part 139 certificated (the airports with scheduled airline service are a subset). */
	part139: boolean;
	/** Physical runway ends and declared dimensions from APT_RWY*.csv. */
	runways: Runway[];
}

export interface NasrData {
	/** Cache schema; version 2 adds runway geometry. */
	schema: 2;
	cycle: string;
	airports: Record<string, NasrAirport>;
}

function col(header: string[], name: string): number {
	const i = header.indexOf(name);
	if (i < 0) throw new Error(`NASR column ${name} missing`);
	return i;
}

export function towerKindOf(facilityType: string, hours: string): TowerKind {
	if (!facilityType.startsWith('ATCT')) return 'none';
	return hours.trim() === '24' ? 'full-time' : 'part-time';
}

/** Build the compact airport table from the FAA airport, tower and runway CSV groups. */
export function buildNasr(cycle: string, aptCsv: string, atcCsv: string, runwayCsv = '', runwayEndCsv = ''): NasrData {
	const apt = parseCsv(aptCsv.replace(/^﻿/, ''));
	const atc = parseCsv(atcCsv.replace(/^﻿/, ''));
	const ah = apt[0],
		th = atc[0];
	const A = {
		id: col(ah, 'ARPT_ID'), icao: col(ah, 'ICAO_ID'), name: col(ah, 'ARPT_NAME'), city: col(ah, 'CITY'), state: col(ah, 'STATE_CODE'),
		lat: col(ah, 'LAT_DECIMAL'), lon: col(ah, 'LONG_DECIMAL'), elev: col(ah, 'ELEV'), p139: col(ah, 'FAR_139_TYPE_CODE'), site: col(ah, 'SITE_TYPE_CODE'), status: col(ah, 'ARPT_STATUS')
	};
	const T = { id: col(th, 'FACILITY_ID'), type: col(th, 'FACILITY_TYPE'), hours: col(th, 'TWR_HRS'), icao: col(th, 'ICAO_ID') };
	const towers = new Map<string, { type: string; hours: string }>();
	for (const r of atc.slice(1)) if (r.length > T.hours) towers.set(r[T.id], { type: r[T.type], hours: r[T.hours] });
	const airports: Record<string, NasrAirport> = {};
	for (const r of apt.slice(1)) {
		if (r.length <= A.status || r[A.site] !== 'A' || r[A.status] !== 'O') continue;
		const id = r[A.id];
		const t = towers.get(id);
		airports[id] = {
			id,
			icao: r[A.icao] || null,
			name: r[A.name],
			city: r[A.city],
			state: r[A.state],
			lat: Number(r[A.lat]),
			lon: Number(r[A.lon]),
			elevFt: Math.round(Number(r[A.elev])),
			tower: t ? towerKindOf(t.type, t.hours) : 'none',
			towerHours: t?.hours ?? '',
			part139: !!r[A.p139],
			runways: []
		};
	}
	if (runwayCsv && runwayEndCsv) {
		const runways = parseCsv(runwayCsv.replace(/^﻿/, ''));
		const ends = parseCsv(runwayEndCsv.replace(/^﻿/, ''));
		const rh = runways[0],
			eh = ends[0];
		const R = {
			airport: col(rh, 'ARPT_ID'), id: col(rh, 'RWY_ID'), length: col(rh, 'RWY_LEN'), width: col(rh, 'RWY_WIDTH'), surface: col(rh, 'SURFACE_TYPE_CODE')
		};
		const E = {
			airport: col(eh, 'ARPT_ID'), runway: col(eh, 'RWY_ID'), id: col(eh, 'RWY_END_ID'), lat: col(eh, 'LAT_DECIMAL'), lon: col(eh, 'LONG_DECIMAL')
		};
		const endByRunway = new Map<string, { id: string; pos: [number, number] }[]>();
		for (const r of ends.slice(1)) {
			const lat = Number(r[E.lat]),
				lon = Number(r[E.lon]);
			if (!airports[r[E.airport]] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
			const key = `${r[E.airport]}\0${r[E.runway]}`;
			if (!endByRunway.has(key)) endByRunway.set(key, []);
			endByRunway.get(key)!.push({ id: r[E.id], pos: [lat, lon] });
		}
		for (const r of runways.slice(1)) {
			const airport = airports[r[R.airport]],
				id = r[R.id],
				lengthFt = Number(r[R.length]),
				widthFt = Number(r[R.width]);
			if (!airport || !id || !(lengthFt > 0) || !(widthFt > 0)) continue;
			const names = id.split('/');
			const found = endByRunway.get(`${r[R.airport]}\0${id}`) ?? [];
			const a = found.find((e) => e.id === names[0]),
				b = found.find((e) => e.id === names[1]);
			if (!a || !b) continue;
			airport.runways.push({ id, ends: [a, b], lengthFt, widthFt, surface: r[R.surface] });
		}
		for (const airport of Object.values(airports)) airport.runways.sort((a, b) => a.id.localeCompare(b.id));
	}
	return { schema: 2, cycle, airports };
}

/** Find an airport by FAA id or ICAO id (case-insensitive; "KPAE" and "PAE" both work). */
export function findByCode(data: NasrData, code: string): NasrAirport | null {
	const c = code.trim().toUpperCase();
	if (!c) return null;
	if (data.airports[c]) return data.airports[c];
	if (c.length === 4 && c.startsWith('K') && data.airports[c.slice(1)]?.icao === c) return data.airports[c.slice(1)];
	for (const a of Object.values(data.airports)) if (a.icao === c) return a;
	return null;
}

/** Part 139 airports whose city matches (e.g. "Bend, OR" or "Bend"). */
export function findByCity(data: NasrData, text: string): NasrAirport[] {
	const m = /^\s*([A-Za-z .'-]+?)\s*(?:,\s*([A-Za-z]{2}))?\s*$/.exec(text);
	if (!m) return [];
	const city = m[1].toUpperCase();
	const state = m[2]?.toUpperCase();
	return Object.values(data.airports).filter((a) => a.part139 && a.city.toUpperCase() === city && (!state || a.state === state));
}

const STATE_CODES = new Map(
	[
		['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
		['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
		['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
		['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
		['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
		['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
		['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
		['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
		['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
		['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
		['DC', 'District of Columbia'], ['AS', 'American Samoa'], ['GU', 'Guam'], ['MP', 'Northern Mariana Islands'],
		['PR', 'Puerto Rico'], ['VI', 'U.S. Virgin Islands']
	].flatMap(([code, name]) => [[code, code], [name.toUpperCase(), code]])
);

/** Qualifying Part 139 airports matching an exact city, state code, or state name. */
export function findQualifyingAirports(data: NasrData, text: string): NasrAirport[] {
	const value = text.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
	const state = STATE_CODES.get(value);
	const matches = state
		? Object.values(data.airports).filter((airport) => airport.state === state)
		: findByCity(data, text);
	return matches
		.filter(qualifiesForTracking)
		.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
}

/** The public coverage rule: passenger-service certification and no 24-hour tower. */
export function qualifiesForTracking(airport: NasrAirport): boolean {
	return airport.part139 && airport.tower !== 'full-time';
}

/** Every airport in the current FAA cycle that meets the public coverage rule. */
export function qualifyingAirports(data: NasrData): NasrAirport[] {
	return Object.values(data.airports)
		.filter(qualifiesForTracking)
		.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
}

export interface Assessment {
	/** Whether the request qualifies (part-time or no tower). */
	ok: boolean;
	/** 'unknown' = not in the FAA record; 'unverified' = no data available to check. */
	kind: TowerKind | 'unknown' | 'unverified' | 'ambiguous';
	airport: NasrAirport | null;
	message: string;
}

/** Plain-language readout of NASR tower hours. */
export function towerHoursText(a: NasrAirport): string {
	if (a.tower === 'none') return 'no control tower';
	if (a.tower === 'full-time') return 'a control tower staffed 24 hours';
	return `a control tower staffed ${a.towerHours.toLowerCase()}`;
}

/** Decide whether a requested airport belongs on the site. */
export function assessRequest(data: NasrData | null, value: string): Assessment {
	if (!data) return { ok: true, kind: 'unverified', airport: null, message: 'We could not check this against FAA records right now; it has been added to the request list.' };
	const v = value.trim();
	let a: NasrAirport | null = null;
	if (/^[A-Za-z0-9]{3,4}$/.test(v)) a = findByCode(data, v);
	if (!a) {
		const byCity = findByCity(data, v);
		if (byCity.length > 1) {
			return { ok: false, kind: 'ambiguous', airport: null, message: `Several airports match "${v}": ${byCity.map((x) => `${x.id} (${x.name})`).join(', ')}. Please request one by its code.` };
		}
		a = byCity[0] ?? null;
	}
	if (!a) return { ok: false, kind: 'unknown', airport: null, message: `We could not find "${v}" in the FAA airport record. Try the three-letter airport code (for example PAE).` };
	const label = `${a.id} (${a.name}, ${a.city}, ${a.state})`;
	if (a.tower === 'full-time') return { ok: false, kind: a.tower, airport: a, message: `${label} has ${towerHoursText(a)}, so it is outside what this site tracks — we only follow airports whose tower closes for part of the day, or that have no tower.` };
	return { ok: true, kind: a.tower, airport: a, message: `${label} has ${towerHoursText(a)} — it qualifies, and has been added to the request list.` };
}
