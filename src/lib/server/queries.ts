/**
 * Read models for the pages. Everything the UI needs per route, assembled from
 * SQLite and the static airport config. Period = rolling 30 nights ending on
 * the latest complete night (so the figures on every page agree).
 */
import { AIRPORTS, airportByCode } from '$lib/airports';
import { addDays, todayKey } from '$lib/time';
import type { AirportConfig, Flight, Incident, NightSummary } from '$lib/types';
import * as db from './db';

export const PERIOD_NIGHTS = 30;

export interface Period {
	from: string;
	to: string;
}

/** Rolling 30-night period ending on the most recent complete night in the DB (or yesterday if empty). */
export function currentPeriod(): Period {
	const latest = db
		.db()
		.prepare(`SELECT MAX(night) night FROM nights WHERE complete = 1`)
		.get() as { night: string | null };
	const to = latest.night ?? addDays(todayKey('UTC'), -1);
	return { from: addDays(to, -(PERIOD_NIGHTS - 1)), to };
}

export interface AirportWithStats extends AirportConfig {
	stats: db.Totals | null;
}

export function airportsWithStats(period = currentPeriod()): AirportWithStats[] {
	const by = db.totalsByAirport(period.from, period.to);
	return AIRPORTS.map((a) => ({ ...a, stats: by[a.icao] ?? null }));
}

export function homeData() {
	const period = currentPeriod();
	const totals = db.totalsAll(period.from, period.to);
	return { period, totals, airports: airportsWithStats(period) };
}

export function airportsPageData() {
	const period = currentPeriod();
	const airports = airportsWithStats(period);
	const tracked = airports.filter((a) => a.tracked);
	return {
		period,
		airports,
		stats: {
			tracked: tracked.length,
			incidents: tracked.reduce((n, a) => n + (a.stats?.incidents ?? 0), 0),
			requested: airports.filter((a) => !a.tracked).length,
			nights: Math.max(0, ...tracked.map((a) => a.stats?.nights ?? 0))
		}
	};
}

export interface AirportDetail {
	airport: AirportConfig;
	period: Period;
	totals: db.Totals;
	/** One entry per night in the period, including nights with no data (summary null). */
	calendar: { night: string; summary: NightSummary | null }[];
	selectedNight: string | null;
	flights: Flight[];
	incidents: Incident[];
	nightSummary: NightSummary | null;
}

export function airportDetail(code: string, night?: string | null): AirportDetail | null {
	const airport = airportByCode(code);
	if (!airport) return null;
	const period = currentPeriod();
	const totals = db.totalsForAirport(airport.icao, period.from, period.to);
	const nights = db.nightsForAirport(airport.icao, period.from, period.to);
	const byNight = new Map(nights.map((n) => [n.night, n]));
	const calendar: AirportDetail['calendar'] = [];
	for (let d = period.from; d <= period.to; d = addDays(d, 1)) calendar.push({ night: d, summary: byNight.get(d) ?? null });
	const selectedNight = night && byNight.has(night) ? night : (db.latestNight(airport.icao) ?? null);
	const flights = selectedNight ? db.flightsForNight(airport.icao, selectedNight) : [];
	const incidents = selectedNight ? db.incidentsForNight(airport.icao, selectedNight) : [];
	return { airport, period, totals, calendar, selectedNight, flights, incidents, nightSummary: selectedNight ? (byNight.get(selectedNight) ?? null) : null };
}

export interface IncidentDetail {
	incident: Incident;
	airport: AirportConfig;
	a: Flight;
	b: Flight;
	/** Every other flight with positions that night (context traffic). */
	others: Flight[];
	/** Other close approaches at the same airport in the period. */
	related: (Incident & { identA: string; identB: string })[];
}

export function incidentDetail(id: string): IncidentDetail | null {
	const incident = db.incidentById(id);
	if (!incident) return null;
	const airport = airportByCode(incident.airport);
	const a = db.flightById(incident.flightA);
	const b = db.flightById(incident.flightB);
	if (!airport || !a || !b) return null;
	const others = db.flightsForNight(airport.icao, incident.night).filter((f) => f.id !== a.id && f.id !== b.id && f.positions.length > 1);
	const period = currentPeriod();
	const related = db
		.incidentsForAirport(airport.icao, period.from)
		.filter((i) => i.id !== id)
		.map((i) => ({ ...i, identA: db.flightById(i.flightA)?.ident ?? '?', identB: db.flightById(i.flightB)?.ident ?? '?' }));
	return { incident, airport, a, b, others, related };
}

export function identsFor(incidents: Incident[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const i of incidents) {
		for (const fid of [i.flightA, i.flightB]) if (!(fid in out)) out[fid] = db.flightById(fid)?.ident ?? '?';
	}
	return out;
}
