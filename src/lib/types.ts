import type { AltimeterReading, OnFieldPoint } from './altimeter';
import type { Airframe, RegistryEntry } from './registry';

/** Shared domain types. Everything user-facing is in plain language (see README). */

export type AirportStatus = 'tracking' | 'requested';

/**
 * What kind of airport this is, and therefore what the nightly window means.
 * 'dark'      — no tower, or a tower that closes while passenger flights are still
 *               arriving and leaving. The window is the hours the tower is closed.
 * 'reference' — a tower staffed 24 hours, tracked during the airport's own published
 *               quiet hours for comparison. Not counted in the site's totals.
 */
export type AirportKind = 'dark' | 'reference';

export interface TowerHours {
	/** Local hour the tower opens (0–23). */
	open: number;
	/** Local hour the tower closes (1–24). */
	close: number;
}

/**
 * An effective-dated tower-hours row. open/close null = no tower during this period.
 * open/close always bound the hours we do NOT collect: for a 'dark' airport those are the
 * staffed hours; for a 'reference' airport they are the hours outside the quiet window.
 * Either way the night runs from `close` to the next day's `open`.
 */
export interface TowerSchedule {
	id: string;
	/** YYYY-MM-DD inclusive. */
	from: string;
	/** YYYY-MM-DD inclusive, or null for open-ended. */
	to: string | null;
	open: number | null;
	close: number | null;
	note: string;
}

/** FAA-published physical runway geometry from the current NASR cycle. */
export interface Runway {
	id: string;
	ends: [{ id: string; pos: [number, number] }, { id: string; pos: [number, number] }];
	lengthFt: number;
	widthFt: number;
	surface: string;
}

export interface AirportConfig {
	/** IATA / local code shown to users, e.g. "PAE". */
	code: string;
	/** ICAO code used by the FlightAware API, e.g. "KPAE". */
	icao: string;
	name: string;
	city: string;
	state: string;
	/** Dark (tower closed or absent) or reference (24-hour tower, tracked during quiet hours). */
	kind: AirportKind;
	/** IANA time zone. */
	tz: string;
	/** [lat, lon] of the field reference point. */
	pos: [number, number];
	/** Field elevation, feet MSL (used to ignore aircraft on the ground). */
	elevationFt: number;
	/** Tower hours in effect today; null means there is no tower at any hour. Derived from `schedules`. */
	towerHours: TowerHours | null;
	/** Effective-dated schedules; use towerHoursOn(airport, night) for a specific night. */
	schedules: TowerSchedule[];
	carriers: string[];
	status: AirportStatus;
	/** Whether the nightly pipeline should collect data for this airport. */
	tracked: boolean;
	/** Current FAA runway endpoints and dimensions, when the NASR cache is available. */
	runways?: Runway[];
}

export type FlightCategory = 'airline' | 'private';
export type Direction = 'arrival' | 'departure';

/** One ADS-B position report, clipped to the 10 NM ring. */
export interface Position {
	/** Unix ms, UTC. */
	t: number;
	lat: number;
	lon: number;
	/** Feet, as reported: standard-pressure altitude in hundreds of feet, stored expanded. Not corrected for the day's pressure. */
	alt: number;
	/** Knots. */
	gs: number;
	/** Degrees true. */
	hdg: number;
	/** Distance from the field in nautical miles. */
	dist: number;
}

export interface Flight {
	/** FlightAware fa_flight_id — unique per flight. */
	id: string;
	airport: string; // ICAO
	night: string; // YYYY-MM-DD, the evening the night began
	ident: string;
	tail: string | null;
	/** ICAO type designator from FlightAware, else make/model from the FAA registry ("BELL 429"). */
	type: string | null;
	/** Airplane or helicopter per the FAA registry, when the tail is US-registered and known. */
	airframe?: Airframe | null;
	/** Current FAA registry details, attached at read time rather than stored with the historical flight. */
	registry?: RegistryEntry | null;
	category: FlightCategory;
	/** ICAO operator code, e.g. ASA. */
	operator: string | null;
	/** Full operator name, resolved at read time from the operators table ("Alaska Airlines"). */
	operatorName: string | null;
	/** Short operator name for labels ("Alaska"). */
	operatorShort: string | null;
	direction: Direction;
	/** Unix ms of the arrival/departure event. */
	eventTime: number;
	otherCode: string | null;
	otherName: string | null;
	otherCity: string | null;
	positions: Position[];
}

export type Severity = 'closer-than-allowed' | 'very-close';
export type IncidentKind = 'separation' | 'wake-turbulence';
export type WakeCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface Incident {
	id: string;
	kind?: IncidentKind;
	airport: string;
	night: string;
	/** Unix ms at the closest moment. */
	t: number;
	lateralNm: number;
	verticalFt: number;
	/** Distance from the field at the closest moment, NM. */
	distNm: number;
	severity: Severity;
	flightA: string;
	flightB: string;
	altA: number;
	altB: number;
	/** Groundspeed (knots) of each aircraft at the closest moment. */
	gsA: number;
	gsB: number;
	/** Interpolated positions at the closest moment. */
	posA: [number, number];
	posB: [number, number];
	/** At least one of the two aircraft was a passenger airline. Derived on read, never stored. */
	airlineInvolved?: boolean;
	/** Wake-only fields; flightA is the leader and flightB the follower. */
	requiredNm?: number | null;
	leaderCategory?: WakeCategory | null;
	followerCategory?: WakeCategory | null;
	trailSeconds?: number | null;
}

export interface NightSummary {
	airport: string;
	night: string;
	flights: number;
	arrivals: number;
	departures: number;
	airline: number;
	private: number;
	positions: number;
	incidents: number;
	wakeIncidents?: number;
	/** Whether the night has been fully processed (tracks fetched). */
	complete: boolean;
	/** Hourly altimeter settings ([unix ms, inHg]) from the airport's weather reports; null if unavailable. */
	altimeter?: AltimeterReading[] | null;
	/** Self-calibration from the tracks: reported altitude of the ground minus field elevation (feet), null if too few tracks. */
	groundOffsetFt?: number | null;
	groundTracks?: number | null;
	/** Reports from aircraft plainly on the field, as [unix ms, reported altitude minus field elevation]. */
	onField?: OnFieldPoint[] | null;
}
