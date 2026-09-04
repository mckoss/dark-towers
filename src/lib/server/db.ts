import Database from 'better-sqlite3';
import { DB_PATH, ensureDirs } from './config';
import type { AirportKind, Flight, Incident, NightSummary, Position } from '$lib/types';
import type { AltimeterReading, OnFieldPoint } from '$lib/altimeter';

let _db: Database.Database | null = null;

export function db(): Database.Database {
	if (_db) return _db;
	ensureDirs();
	_db = new Database(DB_PATH);
	_db.pragma('journal_mode = WAL');
	_db.pragma('foreign_keys = ON');
	migrate(_db);
	return _db;
}

/** For tests: open an in-memory database. */
export function openMemoryDb(): Database.Database {
	const d = new Database(':memory:');
	d.pragma('foreign_keys = ON');
	migrate(d);
	_db = d;
	return d;
}

function migrate(d: Database.Database) {
	d.exec(`
	CREATE TABLE IF NOT EXISTS nights (
		airport TEXT NOT NULL,
		night TEXT NOT NULL,
		flights INTEGER NOT NULL DEFAULT 0,
		arrivals INTEGER NOT NULL DEFAULT 0,
		departures INTEGER NOT NULL DEFAULT 0,
		airline INTEGER NOT NULL DEFAULT 0,
		private INTEGER NOT NULL DEFAULT 0,
		positions INTEGER NOT NULL DEFAULT 0,
		incidents INTEGER NOT NULL DEFAULT 0,
		wake_incidents INTEGER NOT NULL DEFAULT 0,
		complete INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (airport, night)
	);
	CREATE TABLE IF NOT EXISTS flights (
		id TEXT PRIMARY KEY,
		airport TEXT NOT NULL,
		night TEXT NOT NULL,
		ident TEXT NOT NULL,
		tail TEXT,
		type TEXT,
		category TEXT NOT NULL,
		operator TEXT,
		operator_name TEXT,
		direction TEXT NOT NULL,
		event_time INTEGER NOT NULL,
		other_code TEXT,
		other_name TEXT,
		other_city TEXT,
		positions TEXT NOT NULL DEFAULT '[]'
	);
	CREATE INDEX IF NOT EXISTS flights_night ON flights (airport, night, event_time);
	CREATE TABLE IF NOT EXISTS incidents (
		id TEXT PRIMARY KEY,
		kind TEXT NOT NULL DEFAULT 'separation',
		airport TEXT NOT NULL,
		night TEXT NOT NULL,
		t INTEGER NOT NULL,
		lateral_nm REAL NOT NULL,
		vertical_ft INTEGER NOT NULL,
		dist_nm REAL NOT NULL,
		severity TEXT NOT NULL,
		flight_a TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
		flight_b TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
		alt_a INTEGER NOT NULL,
		alt_b INTEGER NOT NULL,
		gs_a INTEGER NOT NULL DEFAULT 0,
		gs_b INTEGER NOT NULL DEFAULT 0,
		pos_a TEXT NOT NULL,
		pos_b TEXT NOT NULL,
		required_nm REAL,
		leader_category TEXT,
		follower_category TEXT,
		trail_seconds INTEGER
	);
	CREATE INDEX IF NOT EXISTS incidents_night ON incidents (airport, night, t);
	CREATE TABLE IF NOT EXISTS requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		value TEXT NOT NULL,
		email TEXT,
		name TEXT,
		comment TEXT,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		airport TEXT NOT NULL,
		night TEXT NOT NULL,
		started_at INTEGER NOT NULL,
		finished_at INTEGER,
		ok INTEGER,
		message TEXT
	);
	`);
	// Additive migrations for databases created before these columns existed.
	const cols = (d.prepare(`PRAGMA table_info(incidents)`).all() as { name: string }[]).map((c) => c.name);
	if (!cols.includes('gs_a')) d.exec(`ALTER TABLE incidents ADD COLUMN gs_a INTEGER NOT NULL DEFAULT 0; ALTER TABLE incidents ADD COLUMN gs_b INTEGER NOT NULL DEFAULT 0;`);
	if (!cols.includes('kind')) d.exec(`ALTER TABLE incidents ADD COLUMN kind TEXT NOT NULL DEFAULT 'separation'; ALTER TABLE incidents ADD COLUMN required_nm REAL; ALTER TABLE incidents ADD COLUMN leader_category TEXT; ALTER TABLE incidents ADD COLUMN follower_category TEXT; ALTER TABLE incidents ADD COLUMN trail_seconds INTEGER;`);
	const ncols = (d.prepare(`PRAGMA table_info(nights)`).all() as { name: string }[]).map((c) => c.name);
	if (!ncols.includes('altimeter')) d.exec(`ALTER TABLE nights ADD COLUMN altimeter TEXT; ALTER TABLE nights ADD COLUMN ground_offset_ft INTEGER; ALTER TABLE nights ADD COLUMN ground_tracks INTEGER;`);
	if (!ncols.includes('on_field')) d.exec(`ALTER TABLE nights ADD COLUMN on_field TEXT;`);
	if (!ncols.includes('wake_incidents')) d.exec(`ALTER TABLE nights ADD COLUMN wake_incidents INTEGER NOT NULL DEFAULT 0;`);
	const rcols = (d.prepare(`PRAGMA table_info(requests)`).all() as { name: string }[]).map((c) => c.name);
	const fcols = (d.prepare(`PRAGMA table_info(flights)`).all() as { name: string }[]).map((c) => c.name);
	if (!fcols.includes('airframe')) d.exec(`ALTER TABLE flights ADD COLUMN airframe TEXT;`);
	if (!rcols.includes('code')) d.exec(`ALTER TABLE requests ADD COLUMN code TEXT; ALTER TABLE requests ADD COLUMN assessment TEXT;`);
	if (!rcols.includes('name')) d.exec(`ALTER TABLE requests ADD COLUMN name TEXT;`);
	if (!rcols.includes('comment')) d.exec(`ALTER TABLE requests ADD COLUMN comment TEXT;`);
	// Reference-airport requests carry the quiet-hours window the requester proposed.
	if (!rcols.includes('kind')) d.exec(`ALTER TABLE requests ADD COLUMN kind TEXT; ALTER TABLE requests ADD COLUMN quiet_start INTEGER; ALTER TABLE requests ADD COLUMN quiet_end INTEGER;`);
}

/* ---------- writes (all upserts → idempotent) ---------- */

/** Remove rows for this night that are no longer part of it (e.g. ghost records dropped on re-ingest). */
export function deleteFlightsExcept(airport: string, night: string, keepIds: string[]) {
	const d = db();
	const rows = d.prepare(`SELECT id FROM flights WHERE airport = ? AND night = ?`).all(airport, night) as { id: string }[];
	const keep = new Set(keepIds);
	const del = d.prepare(`DELETE FROM flights WHERE id = ?`);
	for (const r of rows) if (!keep.has(r.id)) del.run(r.id);
}

export interface DeletedNightData {
	airport: string;
	night: string;
	nights: number;
	flights: number;
	incidents: number;
}

/** Delete derived SQLite data for one airport/night while leaving the raw API cache untouched. */
export function deleteNightData(airport: string, night: string): DeletedNightData {
	const d = db();
	return d.transaction(() => {
		const incidents = d.prepare(`DELETE FROM incidents WHERE airport = ? AND night = ?`).run(airport, night).changes;
		const flights = d.prepare(`DELETE FROM flights WHERE airport = ? AND night = ?`).run(airport, night).changes;
		const nights = d.prepare(`DELETE FROM nights WHERE airport = ? AND night = ?`).run(airport, night).changes;
		return { airport, night, nights, flights, incidents };
	})();
}

export function upsertFlight(f: Flight) {
	db()
		.prepare(
			`INSERT INTO flights (id, airport, night, ident, tail, type, airframe, category, operator, operator_name, direction, event_time, other_code, other_name, other_city, positions)
			 VALUES (@id, @airport, @night, @ident, @tail, @type, @airframe, @category, @operator, @operatorName, @direction, @eventTime, @otherCode, @otherName, @otherCity, @positions)
			 ON CONFLICT(id) DO UPDATE SET airport=excluded.airport, night=excluded.night, ident=excluded.ident, tail=excluded.tail, type=excluded.type, airframe=excluded.airframe,
			 category=excluded.category, operator=excluded.operator, operator_name=excluded.operator_name, direction=excluded.direction, event_time=excluded.event_time,
			 other_code=excluded.other_code, other_name=excluded.other_name, other_city=excluded.other_city, positions=excluded.positions`
		)
		.run({ ...f, airframe: f.airframe ?? null, positions: JSON.stringify(f.positions) });
}

/** Replace a night's incidents wholesale (they're derived data). */
export function replaceIncidents(airport: string, night: string, incidents: Incident[]) {
	const d = db();
	const tx = d.transaction(() => {
		d.prepare(`DELETE FROM incidents WHERE airport = ? AND night = ?`).run(airport, night);
		const ins = d.prepare(
			`INSERT INTO incidents (id, kind, airport, night, t, lateral_nm, vertical_ft, dist_nm, severity, flight_a, flight_b, alt_a, alt_b, gs_a, gs_b, pos_a, pos_b, required_nm, leader_category, follower_category, trail_seconds)
			 VALUES (@id, @kind, @airport, @night, @t, @lateralNm, @verticalFt, @distNm, @severity, @flightA, @flightB, @altA, @altB, @gsA, @gsB, @posA, @posB, @requiredNm, @leaderCategory, @followerCategory, @trailSeconds)`
		);
		for (const i of incidents) ins.run({ ...i, kind: i.kind ?? 'separation', requiredNm: i.requiredNm ?? null, leaderCategory: i.leaderCategory ?? null, followerCategory: i.followerCategory ?? null, trailSeconds: i.trailSeconds ?? null, posA: JSON.stringify(i.posA), posB: JSON.stringify(i.posB) });
	});
	tx();
}

export function upsertNight(s: NightSummary) {
	db()
		.prepare(
			`INSERT INTO nights (airport, night, flights, arrivals, departures, airline, private, positions, incidents, wake_incidents, complete, altimeter, ground_offset_ft, ground_tracks, on_field, updated_at)
			 VALUES (@airport, @night, @flights, @arrivals, @departures, @airline, @private, @positions, @incidents, @wakeIncidents, @complete, @altimeter, @groundOffsetFt, @groundTracks, @onField, @updatedAt)
			 ON CONFLICT(airport, night) DO UPDATE SET flights=excluded.flights, arrivals=excluded.arrivals, departures=excluded.departures,
			 airline=excluded.airline, private=excluded.private, positions=excluded.positions, incidents=excluded.incidents, wake_incidents=excluded.wake_incidents, complete=excluded.complete,
			 altimeter=excluded.altimeter, ground_offset_ft=excluded.ground_offset_ft, ground_tracks=excluded.ground_tracks,
			 on_field=excluded.on_field, updated_at=excluded.updated_at`
		)
		.run({
			...s,
			wakeIncidents: s.wakeIncidents ?? 0,
			complete: s.complete ? 1 : 0,
			altimeter: s.altimeter ? JSON.stringify(s.altimeter) : null,
			groundOffsetFt: s.groundOffsetFt ?? null,
			groundTracks: s.groundTracks ?? null,
			onField: s.onField && s.onField.length ? JSON.stringify(s.onField) : null,
			updatedAt: Date.now()
		});
}

export function recordRunStart(airport: string, night: string): number {
	const r = db().prepare(`INSERT INTO runs (airport, night, started_at) VALUES (?, ?, ?)`).run(airport, night, Date.now());
	return Number(r.lastInsertRowid);
}
export function recordRunEnd(id: number, ok: boolean, message: string) {
	db().prepare(`UPDATE runs SET finished_at = ?, ok = ?, message = ? WHERE id = ?`).run(Date.now(), ok ? 1 : 0, message, id);
}

export function insertRequest(
	value: string,
	email: string | null,
	code: string | null = null,
	assessment: string | null = null,
	name: string | null = null,
	comment: string | null = null,
	kind: AirportKind = 'dark',
	quiet: { start: number; end: number } | null = null
) {
	db()
		.prepare(`INSERT INTO requests (value, email, code, assessment, name, comment, kind, quiet_start, quiet_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		.run(value, email, code, assessment, name, comment, kind, quiet?.start ?? null, quiet?.end ?? null, Date.now());
}

export function requestExists(code: string): boolean {
	return !!db().prepare(`SELECT 1 FROM requests WHERE code = ? COLLATE NOCASE OR value = ? COLLATE NOCASE LIMIT 1`).get(code.trim(), code.trim());
}

/** Airport codes with a public request awaiting review; no requester details leave this module. */
export function requestedAirportCodes(): string[] {
	return (db()
		.prepare(`SELECT DISTINCT UPPER(COALESCE(code, value)) code FROM requests WHERE COALESCE(code, value) <> '' ORDER BY code`)
		.all() as { code: string }[]).map((row) => row.code);
}

/* ---------- reads ---------- */

interface FlightRow {
	id: string; airport: string; night: string; ident: string; tail: string | null; type: string | null; airframe: string | null; category: string;
	operator: string | null; operator_name: string | null; direction: string; event_time: number;
	other_code: string | null; other_name: string | null; other_city: string | null; positions: string;
}

function rowToFlight(r: FlightRow): Flight {
	return {
		id: r.id, airport: r.airport, night: r.night, ident: r.ident, tail: r.tail, type: r.type, airframe: (r.airframe as Flight['airframe']) ?? null,
		category: r.category as Flight['category'], operator: r.operator, operatorName: r.operator_name, operatorShort: null,
		direction: r.direction as Flight['direction'], eventTime: r.event_time,
		otherCode: r.other_code, otherName: r.other_name, otherCity: r.other_city,
		positions: JSON.parse(r.positions) as Position[]
	};
}

export function flightsForNight(airport: string, night: string): Flight[] {
	return (db().prepare(`SELECT * FROM flights WHERE airport = ? AND night = ? ORDER BY event_time`).all(airport, night) as FlightRow[]).map(rowToFlight);
}

/** Every stored sighting of one registration, newest first. */
export function flightsForTail(tail: string): Flight[] {
	return (db().prepare(`SELECT * FROM flights WHERE tail = ? COLLATE NOCASE ORDER BY event_time DESC`).all(tail) as FlightRow[]).map(rowToFlight);
}

/**
 * Whether a passenger airline was involved is derived from the two flights rather than stored, so
 * every night already in the database is correct without a rebuild. The foreign keys cascade, so
 * both flights always exist and an inner join drops nothing.
 */
const AIRLINE_INVOLVED = `(fa.category = 'airline' OR fb.category = 'airline')`;
const INCIDENT_FROM = `FROM incidents i
	 JOIN flights fa ON fa.id = i.flight_a
	 JOIN flights fb ON fb.id = i.flight_b`;
const INCIDENT_SELECT = `SELECT i.*, ${AIRLINE_INVOLVED} AS airline_involved ${INCIDENT_FROM}`;
/** Rows written before `kind` existed are separation events. */
const SEPARATION_KIND = `(i.kind IS NULL OR i.kind = 'separation')`;

export function incidentsForTail(tail: string): Incident[] {
	const rows = db().prepare(
		`${INCIDENT_SELECT}
		 WHERE (fa.tail = ? COLLATE NOCASE OR fb.tail = ? COLLATE NOCASE) ORDER BY i.t DESC`
	).all(tail, tail) as IncidentRow[];
	return rows.map(rowToIncident);
}

export function flightById(id: string): Flight | null {
	const r = db().prepare(`SELECT * FROM flights WHERE id = ?`).get(id) as FlightRow | undefined;
	return r ? rowToFlight(r) : null;
}

interface IncidentRow {
	id: string; kind: string; airport: string; night: string; t: number; lateral_nm: number; vertical_ft: number; dist_nm: number; severity: string;
	flight_a: string; flight_b: string; alt_a: number; alt_b: number; gs_a: number; gs_b: number; pos_a: string; pos_b: string;
	required_nm: number | null; leader_category: string | null; follower_category: string | null; trail_seconds: number | null;
	/** 1 when either aircraft is a passenger airline; derived by the join below, never stored. */
	airline_involved: number;
}

function rowToIncident(r: IncidentRow): Incident {
	const incident: Incident = {
		id: r.id, kind: r.kind as Incident['kind'], airport: r.airport, night: r.night, t: r.t, lateralNm: r.lateral_nm, verticalFt: r.vertical_ft, distNm: r.dist_nm,
		severity: r.severity as Incident['severity'], flightA: r.flight_a, flightB: r.flight_b, altA: r.alt_a, altB: r.alt_b, gsA: r.gs_a ?? 0, gsB: r.gs_b ?? 0,
		posA: JSON.parse(r.pos_a), posB: JSON.parse(r.pos_b), airlineInvolved: !!r.airline_involved
	};
	if (r.kind === 'wake-turbulence') Object.assign(incident, { requiredNm: r.required_nm, leaderCategory: r.leader_category, followerCategory: r.follower_category, trailSeconds: r.trail_seconds });
	return incident;
}

export function incidentsForNight(airport: string, night: string): Incident[] {
	return (db().prepare(`${INCIDENT_SELECT} WHERE i.airport = ? AND i.night = ? ORDER BY i.t`).all(airport, night) as IncidentRow[]).map(rowToIncident);
}
export function incidentsForAirport(airport: string, fromNight: string): Incident[] {
	return (db().prepare(`${INCIDENT_SELECT} WHERE i.airport = ? AND i.night >= ? ORDER BY i.night DESC, i.t`).all(airport, fromNight) as IncidentRow[]).map(rowToIncident);
}
export function separationIncidents(fromNight: string, toNight: string, airport?: string): Incident[] {
	const rows = airport
		? db().prepare(`${INCIDENT_SELECT} WHERE i.airport = ? AND i.night >= ? AND i.night <= ? AND ${SEPARATION_KIND} ORDER BY i.night DESC, i.t DESC`).all(airport, fromNight, toNight)
		: db().prepare(`${INCIDENT_SELECT} WHERE i.night >= ? AND i.night <= ? AND ${SEPARATION_KIND} ORDER BY i.night DESC, i.t DESC`).all(fromNight, toNight);
	return (rows as IncidentRow[]).map(rowToIncident);
}
export function incidentById(id: string): Incident | null {
	const r = db().prepare(`${INCIDENT_SELECT} WHERE i.id = ?`).get(id) as IncidentRow | undefined;
	return r ? rowToIncident(r) : null;
}

interface NightRow {
	airport: string; night: string; flights: number; arrivals: number; departures: number; airline: number; private: number; positions: number; incidents: number; wake_incidents: number; complete: number;
	altimeter: string | null; ground_offset_ft: number | null; ground_tracks: number | null;
	on_field: string | null;
}
function rowToNight(r: NightRow): NightSummary {
	const { altimeter, ground_offset_ft, ground_tracks, on_field, wake_incidents, ...rest } = r;
	return {
		...rest,
		wakeIncidents: wake_incidents ?? 0,
		complete: !!r.complete,
		altimeter: altimeter ? (JSON.parse(altimeter) as AltimeterReading[]) : null,
		groundOffsetFt: ground_offset_ft ?? null,
		groundTracks: ground_tracks ?? null,
		onField: on_field ? (JSON.parse(on_field) as OnFieldPoint[]) : null
	};
}
export function nightsForAirport(airport: string, fromNight: string, toNight: string): NightSummary[] {
	return (db().prepare(`SELECT * FROM nights WHERE airport = ? AND night >= ? AND night <= ? ORDER BY night`).all(airport, fromNight, toNight) as NightRow[]).map(rowToNight);
}
export function nightSummary(airport: string, night: string): NightSummary | null {
	const r = db().prepare(`SELECT * FROM nights WHERE airport = ? AND night = ?`).get(airport, night) as NightRow | undefined;
	return r ? rowToNight(r) : null;
}
export function latestNight(airport: string): string | null {
	const r = db().prepare(`SELECT night FROM nights WHERE airport = ? AND complete = 1 ORDER BY night DESC LIMIT 1`).get(airport) as { night: string } | undefined;
	return r?.night ?? null;
}

export interface Totals {
	flights: number; airline: number; private: number; incidents: number; wakeIncidents: number; nights: number;
	/** Of `incidents`, how many had a passenger airline on at least one side. */
	airlineIncidents: number;
	/** Of `wakeIncidents`, how many had a passenger airline on at least one side. */
	airlineWakeIncidents: number;
}

interface AirlineCounts {
	airlineIncidents: number;
	airlineWakeIncidents: number;
}
const NO_AIRLINE_COUNTS: AirlineCounts = { airlineIncidents: 0, airlineWakeIncidents: 0 };

/**
 * Close approaches and wake events involving a passenger airline, per airport, over an inclusive
 * night range. Separate from the `nights` rollup so historical nights need no rebuild.
 */
export function airlineIncidentsByAirport(fromNight: string, toNight: string): Record<string, AirlineCounts> {
	const rows = db()
		.prepare(
			`SELECT i.airport,
			   SUM(CASE WHEN ${SEPARATION_KIND} THEN 1 ELSE 0 END) airlineIncidents,
			   SUM(CASE WHEN i.kind = 'wake-turbulence' THEN 1 ELSE 0 END) airlineWakeIncidents
			 ${INCIDENT_FROM}
			 WHERE i.night >= ? AND i.night <= ? AND ${AIRLINE_INVOLVED}
			 GROUP BY i.airport`
		)
		.all(fromNight, toNight) as (AirlineCounts & { airport: string })[];
	const out: Record<string, AirlineCounts> = {};
	for (const r of rows) out[r.airport] = { airlineIncidents: r.airlineIncidents, airlineWakeIncidents: r.airlineWakeIncidents };
	return out;
}

/** Sum the per-airport airline counts, optionally dropping airports that must not count. */
function sumAirlineCounts(byAirport: Record<string, AirlineCounts>, exclude: string[] = []): AirlineCounts {
	const skip = new Set(exclude);
	return Object.entries(byAirport).reduce<AirlineCounts>(
		(acc, [airport, c]) =>
			skip.has(airport)
				? acc
				: { airlineIncidents: acc.airlineIncidents + c.airlineIncidents, airlineWakeIncidents: acc.airlineWakeIncidents + c.airlineWakeIncidents },
		{ ...NO_AIRLINE_COUNTS }
	);
}
export function totalsForAirport(airport: string, fromNight: string, toNight: string): Totals {
	const r = db()
		.prepare(`SELECT COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COALESCE(SUM(wake_incidents),0) wakeIncidents, COUNT(*) nights FROM nights WHERE airport = ? AND night >= ? AND night <= ?`)
		.get(airport, fromNight, toNight) as Totals;
	return { ...r, ...(airlineIncidentsByAirport(fromNight, toNight)[airport] ?? NO_AIRLINE_COUNTS) };
}
/** Site-wide totals. `exclude` drops airports (by ICAO) that must not count — reference airports. */
export function totalsAll(fromNight: string, toNight: string, exclude: string[] = []): Totals {
	const holes = exclude.map(() => '?').join(',');
	const r = db()
		.prepare(`SELECT COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COALESCE(SUM(wake_incidents),0) wakeIncidents, COUNT(DISTINCT night) nights FROM nights WHERE night >= ? AND night <= ?${exclude.length ? ` AND airport NOT IN (${holes})` : ''}`)
		.get(fromNight, toNight, ...exclude) as Totals;
	return { ...r, ...sumAirlineCounts(airlineIncidentsByAirport(fromNight, toNight), exclude) };
}
export function totalsByAirport(fromNight: string, toNight: string): Record<string, Totals> {
	const rows = db()
		.prepare(`SELECT airport, COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COALESCE(SUM(wake_incidents),0) wakeIncidents, COUNT(*) nights FROM nights WHERE night >= ? AND night <= ? GROUP BY airport`)
		.all(fromNight, toNight) as (Totals & { airport: string })[];
	const airline = airlineIncidentsByAirport(fromNight, toNight);
	const out: Record<string, Totals> = {};
	for (const r of rows) out[r.airport] = { ...r, ...(airline[r.airport] ?? NO_AIRLINE_COUNTS) };
	return out;
}

/** Airports with at least one very-close event inside an inclusive night range. */
export function veryCloseAirports(fromNight: string, toNight: string): Set<string> {
	const rows = db()
		.prepare(`SELECT DISTINCT airport FROM incidents WHERE night >= ? AND night <= ? AND severity = 'very-close'`)
		.all(fromNight, toNight) as { airport: string }[];
	return new Set(rows.map((row) => row.airport));
}

/* ---------- admin reads ---------- */

export interface RunRow {
	id: number; airport: string; night: string; started_at: number; finished_at: number | null; ok: number | null; message: string | null;
}
export function recentRuns(limit = 40): RunRow[] {
	return db().prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT ?`).all(limit) as RunRow[];
}
/** Pipeline activity in a recent window: run count, summed API calls (parsed from run messages), and the newest run. */
export function runActivity(sinceMs: number): { runs: number; apiCalls: number; failed: number; lastAt: number | null; lastOk: boolean | null } {
	const rows = db().prepare(`SELECT started_at, ok, message FROM runs WHERE started_at >= ? ORDER BY started_at DESC`).all(sinceMs) as { started_at: number; ok: number | null; message: string | null }[];
	let apiCalls = 0, failed = 0;
	for (const r of rows) {
		const m = r.message?.match(/(\d+) api calls/);
		if (m) apiCalls += Number(m[1]);
		if (r.ok === 0) failed++;
	}
	return { runs: rows.length, apiCalls, failed, lastAt: rows[0]?.started_at ?? null, lastOk: rows[0] ? !!rows[0].ok : null };
}

/** Failed runs in a recent window, grouped: one row per airport/night/message with a count and the latest time. */
export function recentProblems(sinceMs: number): { airport: string; night: string; message: string | null; times: number; lastAt: number }[] {
	return db()
		.prepare(
			`SELECT airport, night, message, COUNT(*) AS times, MAX(started_at) AS lastAt
			 FROM runs WHERE ok = 0 AND started_at >= ? GROUP BY airport, night, message ORDER BY lastAt DESC LIMIT 30`
		)
		.all(sinceMs) as { airport: string; night: string; message: string | null; times: number; lastAt: number }[];
}

export interface RequestRow {
	id: number; value: string; email: string | null; name: string | null; comment: string | null; code: string | null; assessment: string | null;
	kind: AirportKind | null; quiet_start: number | null; quiet_end: number | null; created_at: number;
}
export function listRequests(limit = 200): RequestRow[] {
	return db().prepare(`SELECT * FROM requests ORDER BY id DESC LIMIT ?`).all(limit) as RequestRow[];
}
export function getRequest(id: number): RequestRow | undefined {
	return db().prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as RequestRow | undefined;
}
export function deleteRequest(id: number) {
	db().prepare(`DELETE FROM requests WHERE id = ?`).run(id);
}
export function incompleteNights(limit = 60): NightSummary[] {
	return (db().prepare(`SELECT * FROM nights WHERE complete = 0 ORDER BY night DESC LIMIT ?`).all(limit) as NightRow[]).map(rowToNight);
}
/** Per-night pressure-correction check: weather-derived offset at the window midpoint vs the ground-track estimate. */
export function altimeterCheck(limit = 60): { airport: string; night: string; altimeter: AltimeterReading[] | null; groundOffsetFt: number | null; groundTracks: number | null; onField: OnFieldPoint[] | null }[] {
	return (db().prepare(`SELECT airport, night, altimeter, ground_offset_ft, ground_tracks, on_field FROM nights ORDER BY night DESC LIMIT ?`).all(limit) as NightRow[]).map((r) => ({
		airport: r.airport,
		night: r.night,
		altimeter: r.altimeter ? (JSON.parse(r.altimeter) as AltimeterReading[]) : null,
		groundOffsetFt: r.ground_offset_ft ?? null,
		groundTracks: r.ground_tracks ?? null,
		onField: r.on_field ? (JSON.parse(r.on_field) as OnFieldPoint[]) : null
	}));
}
export function nightCounts(): { airport: string; nights: number; complete: number; first: string; last: string }[] {
	return db().prepare(`SELECT airport, COUNT(*) nights, SUM(complete) complete, MIN(night) first, MAX(night) last FROM nights GROUP BY airport ORDER BY airport`).all() as never;
}
