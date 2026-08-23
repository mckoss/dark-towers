/** Shared domain types. Everything user-facing is in plain language (see README). */

export type AirportStatus = 'tracking' | 'queued' | 'requested';

export interface TowerHours {
	/** Local hour the tower opens (0–23). */
	open: number;
	/** Local hour the tower closes (1–24). */
	close: number;
}

export interface AirportConfig {
	/** IATA / local code shown to users, e.g. "PAE". */
	code: string;
	/** ICAO code used by the FlightAware API, e.g. "KPAE". */
	icao: string;
	name: string;
	city: string;
	state: string;
	/** IANA time zone. */
	tz: string;
	/** [lat, lon] of the field reference point. */
	pos: [number, number];
	/** null means there is no tower at any hour. */
	towerHours: TowerHours | null;
	carriers: string[];
	status: AirportStatus;
	/** Whether the nightly pipeline should collect data for this airport. */
	tracked: boolean;
}

export type FlightCategory = 'airline' | 'private';
export type Direction = 'arrival' | 'departure';

/** One ADS-B position report, clipped to the 10 NM ring. */
export interface Position {
	/** Unix ms, UTC. */
	t: number;
	lat: number;
	lon: number;
	/** Feet MSL (FlightAware reports hundreds of feet; stored expanded). */
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
	type: string | null;
	category: FlightCategory;
	operator: string | null;
	operatorName: string | null;
	direction: Direction;
	/** Unix ms of the arrival/departure event. */
	eventTime: number;
	otherCode: string | null;
	otherName: string | null;
	otherCity: string | null;
	positions: Position[];
}

export type Severity = 'closer-than-allowed' | 'very-close';

export interface Incident {
	id: string;
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
	/** Interpolated positions at the closest moment. */
	posA: [number, number];
	posB: [number, number];
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
	/** Whether the night has been fully processed (tracks fetched). */
	complete: boolean;
}
