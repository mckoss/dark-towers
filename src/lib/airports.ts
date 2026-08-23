import type { AirportConfig } from './types';

/**
 * Airports the site knows about. Only `tracked: true` airports are collected
 * nightly (each one costs FlightAware API calls). Others are listed on the
 * Airports page as queued or requested.
 */
export const AIRPORTS: AirportConfig[] = [
	{ code: 'PAE', icao: 'KPAE', name: 'Snohomish County (Paine Field)', city: 'Everett', state: 'WA', tz: 'America/Los_Angeles', pos: [47.9079, -122.2816], elevationFt: 606, towerHours: { open: 7, close: 21 }, carriers: ['Alaska', 'Horizon', 'Southwest'], status: 'tracking', tracked: true },
	{ code: 'BLI', icao: 'KBLI', name: 'Bellingham International', city: 'Bellingham', state: 'WA', tz: 'America/Los_Angeles', pos: [48.7929, -122.5375], elevationFt: 170, towerHours: { open: 6, close: 22 }, carriers: ['Allegiant', 'Alaska'], status: 'queued', tracked: false },
	{ code: 'RDM', icao: 'KRDM', name: 'Roberts Field', city: 'Redmond', state: 'OR', tz: 'America/Los_Angeles', pos: [44.2541, -121.15], elevationFt: 3080, towerHours: { open: 6, close: 22 }, carriers: ['Alaska', 'United', 'Delta'], status: 'queued', tracked: false },
	{ code: 'SUN', icao: 'KSUN', name: 'Friedman Memorial', city: 'Hailey', state: 'ID', tz: 'America/Boise', pos: [43.5044, -114.2961], elevationFt: 5318, towerHours: { open: 7, close: 21 }, carriers: ['Alaska', 'Delta', 'United'], status: 'queued', tracked: false },
	{ code: 'HYA', icao: 'KHYA', name: 'Barnstable Municipal', city: 'Hyannis', state: 'MA', tz: 'America/New_York', pos: [41.6693, -70.2804], elevationFt: 54, towerHours: { open: 6, close: 22 }, carriers: ['Cape Air', 'JetBlue'], status: 'queued', tracked: false },
	{ code: 'PIH', icao: 'KPIH', name: 'Pocatello Regional', city: 'Pocatello', state: 'ID', tz: 'America/Boise', pos: [42.9098, -112.5958], elevationFt: 4452, towerHours: { open: 6, close: 20 }, carriers: ['SkyWest'], status: 'queued', tracked: false },
	{ code: 'MMH', icao: 'KMMH', name: 'Mammoth Yosemite', city: 'Mammoth Lakes', state: 'CA', tz: 'America/Los_Angeles', pos: [37.6241, -118.8377], elevationFt: 7135, towerHours: null, carriers: ['Alaska', 'United'], status: 'requested', tracked: false },
	{ code: 'EKO', icao: 'KEKO', name: 'Elko Regional', city: 'Elko', state: 'NV', tz: 'America/Los_Angeles', pos: [40.8249, -115.7917], elevationFt: 5140, towerHours: { open: 6, close: 20 }, carriers: ['SkyWest'], status: 'requested', tracked: false },
	{ code: 'HIB', icao: 'KHIB', name: 'Range Regional', city: 'Hibbing', state: 'MN', tz: 'America/Chicago', pos: [47.3866, -92.839], elevationFt: 1354, towerHours: null, carriers: ['Delta Connection'], status: 'requested', tracked: false },
	{ code: 'OTH', icao: 'KOTH', name: 'Southwest Oregon Regional', city: 'North Bend', state: 'OR', tz: 'America/Los_Angeles', pos: [43.4171, -124.246], elevationFt: 17, towerHours: null, carriers: ['Advanced Air'], status: 'requested', tracked: false },
	{ code: 'CKB', icao: 'KCKB', name: 'North Central West Virginia', city: 'Clarksburg', state: 'WV', tz: 'America/New_York', pos: [39.2966, -80.2281], elevationFt: 1217, towerHours: { open: 7, close: 19 }, carriers: ['SkyWest'], status: 'requested', tracked: false },
	{ code: 'DDC', icao: 'KDDC', name: 'Dodge City Regional', city: 'Dodge City', state: 'KS', tz: 'America/Chicago', pos: [37.7634, -99.9656], elevationFt: 2594, towerHours: null, carriers: ['SkyWest'], status: 'requested', tracked: false }
];

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

export function airportByCode(code: string): AirportConfig | undefined {
	const c = code.toUpperCase();
	return AIRPORTS.find((a) => a.code === c || a.icao === c);
}

export function trackedAirports(): AirportConfig[] {
	return AIRPORTS.filter((a) => a.tracked);
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
