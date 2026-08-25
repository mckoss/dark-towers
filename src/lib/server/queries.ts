/**
 * Read models for the pages. Everything the UI needs per route, assembled from
 * SQLite and the static airport config. Period = rolling 30 nights ending on
 * the latest complete night (so the figures on every page agree).
 */
import { getAirport, listAirports } from './airports-store';
import { operatorMap } from './operators-store';
import { flightLabel } from '$lib/flights';
import { addDays, todayKey } from '$lib/time';
import type { AirportConfig, Flight, Incident, NightSummary } from '$lib/types';
import * as db from './db';
import { nasrData } from './nasr';
import { qualifyingAirports, towerHoursText } from '$lib/nasr';
import { towerHoursLabel } from '$lib/airports';
import { sortCloseApproaches, type CloseApproachSort } from '$lib/close-approach-sort';
import { lookupTail } from './registry';
import { registryKey, type RegistryEntry } from '$lib/registry';
import { aircraftIdentity, type AircraftIdentityData } from '$lib/aircraft';

export const PERIOD_NIGHTS = 30;

export interface Period {
	from: string;
	to: string;
	/** "Last 30 days" or a calendar month such as "June 2024". */
	label: string;
	/** YYYY-MM when this is a calendar-month window; null for the rolling default. */
	month: string | null;
}

import { monthLabel } from '$lib/monthLabel';
export { monthLabel };

/** Calendar-month window, e.g. "2024-06" → 2024-06-01 … 2024-06-30. */
export function monthPeriod(month: string): Period {
	const [y, m] = month.split('-').map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, label: monthLabel(month), month };
}

export function shiftMonth(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + n, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rolling 30-night period ending on the most recent complete night in the DB (or yesterday if empty). */
export function currentPeriod(): Period {
	const latest = db
		.db()
		.prepare(`SELECT MAX(night) night FROM nights WHERE complete = 1`)
		.get() as { night: string | null };
	const to = latest.night ?? addDays(todayKey('UTC'), -1);
	return { from: addDays(to, -(PERIOD_NIGHTS - 1)), to, label: 'Last 30 days', month: null };
}

export interface WindowNav {
	/** Earliest and latest month with any data for the airport, YYYY-MM. */
	firstMonth: string | null;
	lastMonth: string | null;
	/** Month to step back to (null when nothing earlier exists). */
	prev: string | null;
	/** Month to step forward to; null when already at the latest window. */
	next: string | null;
	/** Whether this is the default rolling window. */
	isDefault: boolean;
}

export interface AirportWithStats extends AirportConfig {
	stats: db.Totals | null;
}

export interface AirportListRow extends AirportWithStats {
	towerLabel: string;
}

export type CoverageStatus = 'tracking' | 'requested' | 'available';
export interface CoverageAirport {
	code: string;
	name: string;
	city: string;
	state: string;
	pos: [number, number];
	towerLabel: string;
	status: CoverageStatus;
	/** Recorded arrivals and departures in the current 30-day window. */
	operations: number;
	/** Whether the current 30-day window contains at least one very-close event. */
	veryClose: boolean;
}

export function airportsWithStats(period = currentPeriod()): AirportWithStats[] {
	const by = db.totalsByAirport(period.from, period.to);
	return listAirports().map((a) => ({ ...a, stats: by[a.icao] ?? null }));
}

export function homeData() {
	const period = currentPeriod();
	const totals = db.totalsAll(period.from, period.to);
	return { period, totals, airports: airportCoverage(period) };
}

/** All FAA-qualifying fields, overlaid with provisional requests and tracked application rows. */
export function airportCoverage(period = currentPeriod()): CoverageAirport[] {
	const configured = airportsWithStats(period);
	const veryClose = db.veryCloseAirports(period.from, period.to);
	const configuredByCode = new Map(configured.map((airport) => [airport.code, airport]));
	const requested = new Set(db.requestedAirportCodes());
	const data = nasrData();
	const coverage = new Map<string, CoverageAirport>();
	if (data) {
		for (const airport of qualifyingAirports(data)) {
			const stored = configuredByCode.get(airport.id);
			const status: CoverageStatus = stored?.tracked ? 'tracking' : stored || requested.has(airport.id) ? 'requested' : 'available';
			coverage.set(airport.id, {
				code: airport.id, name: airport.name, city: airport.city, state: airport.state,
				pos: [airport.lat, airport.lon], towerLabel: towerHoursText(airport), status,
				operations: stored?.stats?.flights ?? 0,
				veryClose: stored ? veryClose.has(stored.icao) : false
			});
		}
	}
	// Preserve configured airports even if a later FAA cycle no longer classifies them as qualifying.
	for (const airport of configured) {
		coverage.set(airport.code, {
			code: airport.code, name: airport.name, city: airport.city, state: airport.state, pos: airport.pos,
			towerLabel: towerHoursLabel(airport), status: airport.tracked ? 'tracking' : 'requested',
			operations: airport.stats?.flights ?? 0,
			veryClose: veryClose.has(airport.icao)
		});
	}
	return [...coverage.values()].sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.code.localeCompare(b.code));
}

export function airportsPageData() {
	const period = currentPeriod();
	const configured = airportsWithStats(period);
	const airportsByCode = new Map<string, AirportListRow>(configured.map((airport) => [airport.code, { ...airport, towerLabel: towerHoursLabel(airport) }]));
	const data = nasrData();
	if (data) {
		for (const code of db.requestedAirportCodes()) {
			if (airportsByCode.has(code)) continue;
			const airport = data.airports[code];
			if (!airport) continue;
			airportsByCode.set(code, {
				code: airport.id, icao: airport.icao ?? airport.id, name: airport.name, city: airport.city, state: airport.state,
				tz: '', pos: [airport.lat, airport.lon], elevationFt: airport.elevFt, towerHours: null, schedules: [], carriers: [],
				status: 'requested', tracked: false, stats: null, towerLabel: towerHoursText(airport)
			});
		}
	}
	const airports = [...airportsByCode.values()].sort((a, b) => a.code.localeCompare(b.code));
	const tracked = airports.filter((a) => a.tracked);
	return {
		period,
		airports,
		stats: {
			tracked: tracked.length,
			incidents: tracked.reduce((n, a) => n + (a.stats?.incidents ?? 0), 0),
			wakeIncidents: tracked.reduce((n, a) => n + (a.stats?.wakeIncidents ?? 0), 0),
			requested: airports.filter((a) => !a.tracked).length,
			nights: Math.max(0, ...tracked.map((a) => a.stats?.nights ?? 0))
		}
	};
}

export interface AirportDetail {
	airport: AirportConfig;
	period: Period;
	nav: WindowNav;
	/** Whether the airport has any nightly data at all (in any window). */
	hasAnyData: boolean;
	totals: db.Totals;
	/** One entry per night in the period, including nights with no data (summary null). */
	calendar: { night: string; summary: NightSummary | null }[];
	selectedNight: string | null;
	flights: Flight[];
	incidents: Incident[];
	nightSummary: NightSummary | null;
}

/** Add current FAA runway geometry without making it editable application state. */
function withRunways(airport: AirportConfig): AirportConfig {
	return { ...airport, runways: nasrData()?.airports[airport.code]?.runways ?? [] };
}

export function airportDetail(code: string, night?: string | null, month?: string | null): AirportDetail | null {
	const storedAirport = getAirport(code);
	if (!storedAirport) return null;
	const airport = withRunways(storedAirport);
	const range = db
		.db()
		.prepare(`SELECT MIN(night) first, MAX(night) last FROM nights WHERE airport = ?`)
		.get(airport.icao) as { first: string | null; last: string | null };
	const firstMonth = range.first?.slice(0, 7) ?? null;
	const lastMonth = range.last?.slice(0, 7) ?? null;
	const rolling = currentPeriod();
	// A deep-linked night outside the default window implies its month.
	if (!month && night && /^\d{4}-\d{2}-\d{2}$/.test(night) && (night < rolling.from || night > rolling.to)) month = night.slice(0, 7);
	const period = month && /^\d{4}-\d{2}$/.test(month) ? monthPeriod(month) : rolling;
	const defaultFirstMonth = rolling.from.slice(0, 7);
	const nav: WindowNav = {
		firstMonth,
		lastMonth,
		isDefault: !period.month,
		prev: (() => {
			if (!firstMonth) return null;
			const cand = period.month ? shiftMonth(period.month, -1) : shiftMonth(defaultFirstMonth, period.from.endsWith('-01') ? -1 : 0);
			return cand >= firstMonth ? cand : null;
		})(),
		next: (() => {
			if (!period.month) return null;
			const cand = shiftMonth(period.month, 1);
			return cand > rolling.to.slice(0, 7) ? null : cand;
		})()
	};
	const totals = db.totalsForAirport(airport.icao, period.from, period.to);
	const nights = db.nightsForAirport(airport.icao, period.from, period.to);
	const byNight = new Map(nights.map((n) => [n.night, n]));
	const calendar: AirportDetail['calendar'] = [];
	for (let d = period.from; d <= period.to; d = addDays(d, 1)) calendar.push({ night: d, summary: byNight.get(d) ?? null });
	const latestInWindow = [...nights].reverse().find((n) => n.complete)?.night ?? nights[nights.length - 1]?.night ?? null;
	const selectedNight = night && byNight.has(night) ? night : latestInWindow;
	const flights = selectedNight ? decorate(db.flightsForNight(airport.icao, selectedNight)) : [];
	const incidents = selectedNight ? db.incidentsForNight(airport.icao, selectedNight) : [];
	return { airport, period, nav, hasAnyData: !!range.first, totals, calendar, selectedNight, flights, incidents, nightSummary: selectedNight ? (byNight.get(selectedNight) ?? null) : null };
}

export interface IncidentDetail {
	incident: Incident;
	airport: AirportConfig;
	a: Flight;
	b: Flight;
	/** Every other flight with positions that night (context traffic). */
	others: Flight[];
	/** Other close approaches at the same airport in the period. */
	related: (Incident & { identA: string; identB: string; identityA: AircraftIdentityData; identityB: AircraftIdentityData })[];
	/** The night's summary, carrying the altimeter readings used to show altitudes above the field. */
	night: NightSummary | null;
}

export function incidentDetail(id: string): IncidentDetail | null {
	const incident = db.incidentById(id);
	if (!incident) return null;
	const storedAirport = getAirport(incident.airport);
	const a = db.flightById(incident.flightA);
	const b = db.flightById(incident.flightB);
	if (!storedAirport || !a || !b) return null;
	const airport = withRunways(storedAirport);
	decorate([a, b]);
	const others = decorate(db.flightsForNight(airport.icao, incident.night).filter((f) => f.id !== a.id && f.id !== b.id && f.positions.length > 1));
	const period = currentPeriod();
	const related = db
		.incidentsForAirport(airport.icao, period.from)
		.filter((i) => i.id !== id)
		.map((i) => {
			const identityA = identityFor(i.flightA);
			const identityB = identityFor(i.flightB);
			return { ...i, identA: identityA.label, identB: identityB.label, identityA, identityB };
		});
	return { incident, airport, a, b, others, related, night: db.nightSummary(airport.icao, incident.night) };
}

/** Fill operatorName/operatorShort from the live operators table. */
export function decorate(flights: Flight[]): Flight[] {
	const ops = operatorMap();
	for (const f of flights) {
		const o = f.operator ? ops.get(f.operator.toUpperCase()) : undefined;
		f.operatorName = o?.name ?? null;
		f.operatorShort = o?.short ?? null;
		f.registry = lookupTail(f.tail);
	}
	return flights;
}

export interface AircraftSighting {
	flight: Flight;
	airportCode: string;
	airportName: string;
	tz: string;
	closeApproaches: { id: string; kind: Incident['kind']; t: number }[];
}

export interface AircraftDetail {
	registration: string;
	registry: RegistryEntry | null;
	sightings: AircraftSighting[];
}

/** Current registry facts plus every Dark Towers flight recorded for this N-number. */
export function aircraftDetail(value: string): AircraftDetail | null {
	const key = registryKey(value);
	if (!key) return null;
	const registration = `N${key}`;
	const registry = lookupTail(registration);
	const flights = decorate(db.flightsForTail(registration));
	if (!registry && !flights.length) return null;
	const airportByIcao = new Map(listAirports().map((airport) => [airport.icao, airport]));
	const incidentByFlight = new Map<string, { id: string; kind: Incident['kind']; t: number }[]>();
	for (const incident of db.incidentsForTail(registration)) {
		for (const id of [incident.flightA, incident.flightB]) {
			if (!incidentByFlight.has(id)) incidentByFlight.set(id, []);
			incidentByFlight.get(id)!.push({ id: incident.id, kind: incident.kind, t: incident.t });
		}
	}
	const sightings = flights.map((flight) => {
		const airport = airportByIcao.get(flight.airport);
		return {
			flight,
			airportCode: airport?.code ?? flight.airport.replace(/^K/, ''),
			airportName: airport?.name ?? flight.airport,
			tz: airport?.tz ?? 'UTC',
			closeApproaches: incidentByFlight.get(flight.id) ?? []
		};
	});
	return { registration, registry, sightings };
}

/** Friendly label ("Alaska 1712") for a stored flight id. */
export function labelFor(flightId: string): string {
	const f = db.flightById(flightId);
	if (!f) return '?';
	decorate([f]);
	return flightLabel(f);
}

export function identityFor(flightId: string): AircraftIdentityData {
	const flight = db.flightById(flightId);
	if (!flight) return { label: '?', sublabel: null, tail: null, href: null, registry: null };
	decorate([flight]);
	return aircraftIdentity(flight);
}

/** Friendly labels for every flight referenced by the incidents. */
export function identsFor(incidents: Incident[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const i of incidents) {
		for (const fid of [i.flightA, i.flightB]) if (!(fid in out)) out[fid] = labelFor(fid);
	}
	return out;
}

export interface ListedCloseApproach extends Incident {
	airportCode: string;
	airportName: string;
	tz: string;
	identA: string;
	identB: string;
	identityA: AircraftIdentityData;
	identityB: AircraftIdentityData;
}

/** Public close-approach listing, optionally narrowed to an airport and/or night. */
export function closeApproachesData(airportCode?: string | null, night?: string | null, month?: string | null, requestedSort?: string | null) {
	const airport = airportCode ? getAirport(airportCode) : null;
	if (airportCode && !airport) return null;
	const validNight = night && /^\d{4}-\d{2}-\d{2}$/.test(night) ? night : null;
	const period = validNight
		? { from: validNight, to: validNight, label: `Night of ${validNight}`, month: null }
		: month && /^\d{4}-\d{2}$/.test(month)
			? monthPeriod(month)
			: currentPeriod();
	const incidents = db.separationIncidents(period.from, period.to, airport?.icao);
	const identities: Record<string, AircraftIdentityData> = {};
	for (const incident of incidents) {
		for (const id of [incident.flightA, incident.flightB]) if (!identities[id]) identities[id] = identityFor(id);
	}
	const airports = new Map(listAirports().map((a) => [a.icao, a]));
	const rows: ListedCloseApproach[] = incidents.flatMap((incident) => {
		const found = airports.get(incident.airport);
		return found
			? [{ ...incident, airportCode: found.code, airportName: found.name, tz: found.tz, identA: identities[incident.flightA]?.label ?? '?', identB: identities[incident.flightB]?.label ?? '?', identityA: identities[incident.flightA], identityB: identities[incident.flightB] }]
			: [];
	});
	const sort: CloseApproachSort = requestedSort === 'airport' || requestedSort === 'date' ? requestedSort : 'closest';
	return { airport, period, night: validNight, sort, rows: sortCloseApproaches(rows, sort) };
}
