import Database from 'better-sqlite3';
import { DB_PATH, ensureDirs } from './config';
import type { Flight, Incident, NightSummary, Position } from '$lib/types';

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
		pos_b TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS incidents_night ON incidents (airport, night, t);
	CREATE TABLE IF NOT EXISTS requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		value TEXT NOT NULL,
		email TEXT,
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
}

/* ---------- writes (all upserts → idempotent) ---------- */

export function upsertFlight(f: Flight) {
	db()
		.prepare(
			`INSERT INTO flights (id, airport, night, ident, tail, type, category, operator, operator_name, direction, event_time, other_code, other_name, other_city, positions)
			 VALUES (@id, @airport, @night, @ident, @tail, @type, @category, @operator, @operatorName, @direction, @eventTime, @otherCode, @otherName, @otherCity, @positions)
			 ON CONFLICT(id) DO UPDATE SET airport=excluded.airport, night=excluded.night, ident=excluded.ident, tail=excluded.tail, type=excluded.type,
			 category=excluded.category, operator=excluded.operator, operator_name=excluded.operator_name, direction=excluded.direction, event_time=excluded.event_time,
			 other_code=excluded.other_code, other_name=excluded.other_name, other_city=excluded.other_city, positions=excluded.positions`
		)
		.run({ ...f, positions: JSON.stringify(f.positions) });
}

/** Replace a night's incidents wholesale (they're derived data). */
export function replaceIncidents(airport: string, night: string, incidents: Incident[]) {
	const d = db();
	const tx = d.transaction(() => {
		d.prepare(`DELETE FROM incidents WHERE airport = ? AND night = ?`).run(airport, night);
		const ins = d.prepare(
			`INSERT INTO incidents (id, airport, night, t, lateral_nm, vertical_ft, dist_nm, severity, flight_a, flight_b, alt_a, alt_b, gs_a, gs_b, pos_a, pos_b)
			 VALUES (@id, @airport, @night, @t, @lateralNm, @verticalFt, @distNm, @severity, @flightA, @flightB, @altA, @altB, @gsA, @gsB, @posA, @posB)`
		);
		for (const i of incidents) ins.run({ ...i, posA: JSON.stringify(i.posA), posB: JSON.stringify(i.posB) });
	});
	tx();
}

export function upsertNight(s: NightSummary) {
	db()
		.prepare(
			`INSERT INTO nights (airport, night, flights, arrivals, departures, airline, private, positions, incidents, complete, updated_at)
			 VALUES (@airport, @night, @flights, @arrivals, @departures, @airline, @private, @positions, @incidents, @complete, @updatedAt)
			 ON CONFLICT(airport, night) DO UPDATE SET flights=excluded.flights, arrivals=excluded.arrivals, departures=excluded.departures,
			 airline=excluded.airline, private=excluded.private, positions=excluded.positions, incidents=excluded.incidents, complete=excluded.complete, updated_at=excluded.updated_at`
		)
		.run({ ...s, complete: s.complete ? 1 : 0, updatedAt: Date.now() });
}

export function recordRunStart(airport: string, night: string): number {
	const r = db().prepare(`INSERT INTO runs (airport, night, started_at) VALUES (?, ?, ?)`).run(airport, night, Date.now());
	return Number(r.lastInsertRowid);
}
export function recordRunEnd(id: number, ok: boolean, message: string) {
	db().prepare(`UPDATE runs SET finished_at = ?, ok = ?, message = ? WHERE id = ?`).run(Date.now(), ok ? 1 : 0, message, id);
}

export function insertRequest(value: string, email: string | null) {
	db().prepare(`INSERT INTO requests (value, email, created_at) VALUES (?, ?, ?)`).run(value, email, Date.now());
}

/* ---------- reads ---------- */

interface FlightRow {
	id: string; airport: string; night: string; ident: string; tail: string | null; type: string | null; category: string;
	operator: string | null; operator_name: string | null; direction: string; event_time: number;
	other_code: string | null; other_name: string | null; other_city: string | null; positions: string;
}

function rowToFlight(r: FlightRow): Flight {
	return {
		id: r.id, airport: r.airport, night: r.night, ident: r.ident, tail: r.tail, type: r.type,
		category: r.category as Flight['category'], operator: r.operator, operatorName: r.operator_name, operatorShort: null,
		direction: r.direction as Flight['direction'], eventTime: r.event_time,
		otherCode: r.other_code, otherName: r.other_name, otherCity: r.other_city,
		positions: JSON.parse(r.positions) as Position[]
	};
}

export function flightsForNight(airport: string, night: string): Flight[] {
	return (db().prepare(`SELECT * FROM flights WHERE airport = ? AND night = ? ORDER BY event_time`).all(airport, night) as FlightRow[]).map(rowToFlight);
}

export function flightById(id: string): Flight | null {
	const r = db().prepare(`SELECT * FROM flights WHERE id = ?`).get(id) as FlightRow | undefined;
	return r ? rowToFlight(r) : null;
}

interface IncidentRow {
	id: string; airport: string; night: string; t: number; lateral_nm: number; vertical_ft: number; dist_nm: number; severity: string;
	flight_a: string; flight_b: string; alt_a: number; alt_b: number; gs_a: number; gs_b: number; pos_a: string; pos_b: string;
}
function rowToIncident(r: IncidentRow): Incident {
	return {
		id: r.id, airport: r.airport, night: r.night, t: r.t, lateralNm: r.lateral_nm, verticalFt: r.vertical_ft, distNm: r.dist_nm,
		severity: r.severity as Incident['severity'], flightA: r.flight_a, flightB: r.flight_b, altA: r.alt_a, altB: r.alt_b, gsA: r.gs_a ?? 0, gsB: r.gs_b ?? 0,
		posA: JSON.parse(r.pos_a), posB: JSON.parse(r.pos_b)
	};
}

export function incidentsForNight(airport: string, night: string): Incident[] {
	return (db().prepare(`SELECT * FROM incidents WHERE airport = ? AND night = ? ORDER BY t`).all(airport, night) as IncidentRow[]).map(rowToIncident);
}
export function incidentsForAirport(airport: string, fromNight: string): Incident[] {
	return (db().prepare(`SELECT * FROM incidents WHERE airport = ? AND night >= ? ORDER BY night DESC, t`).all(airport, fromNight) as IncidentRow[]).map(rowToIncident);
}
export function incidentById(id: string): Incident | null {
	const r = db().prepare(`SELECT * FROM incidents WHERE id = ?`).get(id) as IncidentRow | undefined;
	return r ? rowToIncident(r) : null;
}

interface NightRow {
	airport: string; night: string; flights: number; arrivals: number; departures: number; airline: number; private: number; positions: number; incidents: number; complete: number;
}
function rowToNight(r: NightRow): NightSummary {
	return { ...r, complete: !!r.complete };
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
	flights: number; airline: number; private: number; incidents: number; nights: number;
}
export function totalsForAirport(airport: string, fromNight: string, toNight: string): Totals {
	const r = db()
		.prepare(`SELECT COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COUNT(*) nights FROM nights WHERE airport = ? AND night >= ? AND night <= ?`)
		.get(airport, fromNight, toNight) as Totals;
	return r;
}
export function totalsAll(fromNight: string, toNight: string): Totals {
	return db()
		.prepare(`SELECT COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COUNT(DISTINCT night) nights FROM nights WHERE night >= ? AND night <= ?`)
		.get(fromNight, toNight) as Totals;
}
export function totalsByAirport(fromNight: string, toNight: string): Record<string, Totals> {
	const rows = db()
		.prepare(`SELECT airport, COALESCE(SUM(flights),0) flights, COALESCE(SUM(airline),0) airline, COALESCE(SUM(private),0) private, COALESCE(SUM(incidents),0) incidents, COUNT(*) nights FROM nights WHERE night >= ? AND night <= ? GROUP BY airport`)
		.all(fromNight, toNight) as (Totals & { airport: string })[];
	const out: Record<string, Totals> = {};
	for (const r of rows) out[r.airport] = r;
	return out;
}

/* ---------- admin reads ---------- */

export interface RunRow {
	id: number; airport: string; night: string; started_at: number; finished_at: number | null; ok: number | null; message: string | null;
}
export function recentRuns(limit = 40): RunRow[] {
	return db().prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT ?`).all(limit) as RunRow[];
}
export interface RequestRow {
	id: number; value: string; email: string | null; created_at: number;
}
export function listRequests(limit = 200): RequestRow[] {
	return db().prepare(`SELECT * FROM requests ORDER BY id DESC LIMIT ?`).all(limit) as RequestRow[];
}
export function deleteRequest(id: number) {
	db().prepare(`DELETE FROM requests WHERE id = ?`).run(id);
}
export function incompleteNights(limit = 60): NightSummary[] {
	return (db().prepare(`SELECT * FROM nights WHERE complete = 0 ORDER BY night DESC LIMIT ?`).all(limit) as NightRow[]).map(rowToNight);
}
export function nightCounts(): { airport: string; nights: number; complete: number; first: string; last: string }[] {
	return db().prepare(`SELECT airport, COUNT(*) nights, SUM(complete) complete, MIN(night) first, MAX(night) last FROM nights GROUP BY airport ORDER BY airport`).all() as never;
}
