import type { AirportConfig, TowerHours, TowerSchedule } from './types';

/**
 * Airports the site knows about. Only `tracked: true` airports are collected
 * nightly (each one costs FlightAware API calls). Others are listed on the
 * Airports page as queued or requested.
 */
/**
 * Airports are stored in the database (seeded from airports.json, editable at
 * /admin/airports). Server code reads them via $lib/server/airports-store.
 * This module keeps the client-safe helpers and thresholds.
 */

/** Radius of the airspace we analyse, in nautical miles. */
export const AIRSPACE_RADIUS_NM = 10;
/** Controller separation minima: flag pairs inside BOTH of these at once. */
export const SEPARATION_LATERAL_NM = 3;
export const SEPARATION_VERTICAL_FT = 1000;
/** Samples below this height above the field, or slower than this, count as "on the ground". */
export const GROUND_AGL_FT = 75;
export const GROUND_SPEED_KT = 40;
/** "Very close" threshold. */
export const VERY_CLOSE_LATERAL_NM = 1;
export const VERY_CLOSE_VERTICAL_FT = 500;

/** Known operator ICAO codes → plain names. */
export const OPERATORS: Record<string, string> = {
	ASA: 'Alaska Airlines',
	QXE: 'Horizon Air',
	SWA: 'Southwest Airlines',
	SKW: 'SkyWest',
	AAY: 'Allegiant Air',
	UAL: 'United Airlines',
	DAL: 'Delta Air Lines',
	JBU: 'JetBlue',
	KAP: 'Cape Air',
	KEN: 'Kenmore Air',
	AIP: 'Alpine Air Express',
	FDX: 'FedEx',
	UPS: 'UPS',
	CAP: 'Civil Air Patrol'
};

/** The schedule row in effect on a local date (YYYY-MM-DD), or undefined. Latest `from` wins on overlap. */
export function scheduleOn(schedules: TowerSchedule[], date: string): TowerSchedule | undefined {
	return schedules
		.filter((s) => s.from <= date && (s.to === null || date <= s.to))
		.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0))[0];
}

/** Tower hours for the night beginning on `night`; null = no tower (or no schedule at all). */
export function towerHoursOn(a: { schedules: TowerSchedule[] }, night: string): TowerHours | null {
	const s = scheduleOn(a.schedules, night);
	if (!s || s.open == null || s.close == null) return null;
	return { open: s.open, close: s.close };
}

/** Plain-language tower hours, e.g. "7:00 am – 9:00 pm" or "No tower". */
export function towerHoursLabel(a: AirportConfig): string {
	if (!a.towerHours) return 'No tower';
	return `${hourLabel(a.towerHours.open)} – ${hourLabel(a.towerHours.close)}`;
}

export function hourLabel(h: number): string {
	const hh = ((h % 24) + 24) % 24;
	const ampm = hh < 12 ? 'am' : 'pm';
	const h12 = hh % 12 === 0 ? 12 : hh % 12;
	return `${h12}:00 ${ampm}`;
}

/** Hours per day the tower is closed. */
export function hoursClosed(a: AirportConfig): number {
	if (!a.towerHours) return 24;
	return 24 - (a.towerHours.close - a.towerHours.open);
}
