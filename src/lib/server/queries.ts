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

export function airportDetail(code: string, night?: string | null, month?: string | null): AirportDetail | null {
	const airport = airportByCode(code);
	if (!airport) return null;
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
	const flights = selectedNight ? db.flightsForNight(airport.icao, selectedNight) : [];
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
