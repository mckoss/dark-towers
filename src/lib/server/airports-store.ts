/**
 * Airports and tower-hour schedules live in the database so they can be
 * edited online (/admin/airports). `airports.json` at the repo root is the
 * seed: on startup, rows whose id is missing are INSERTED; rows that already
 * exist are never modified by the file (the database wins). Use "Export JSON"
 * in admin to bring the file back in line, and `drift()` to see differences.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AirportConfig, AirportStatus, TowerSchedule } from '$lib/types';
import { towerHoursOn } from '$lib/airports';
import { todayKey } from '$lib/time';
import { db } from './db';

export interface AirportJson {
	id: string;
	code: string;
	icao: string;
	name: string;
	city: string;
	state: string;
	tz: string;
	lat: number;
	lon: number;
	elevation_ft: number;
	carriers: string[];
	status: AirportStatus;
	tracked: boolean;
	schedules: TowerSchedule[];
}
export interface SeedFile {
	$comment?: string;
	airports: AirportJson[];
}

export const SEED_PATH = path.resolve(process.env.AIRPORTS_JSON ?? 'airports.json');

export function readSeedFile(p = SEED_PATH): SeedFile {
	return JSON.parse(fs.readFileSync(p, 'utf8')) as SeedFile;
}

/* ---------- schema ---------- */

export function migrateAirports() {
	db().exec(`
	CREATE TABLE IF NOT EXISTS airports (
		id TEXT PRIMARY KEY,
		code TEXT NOT NULL UNIQUE,
		icao TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		city TEXT NOT NULL,
		state TEXT NOT NULL,
		tz TEXT NOT NULL,
		lat REAL NOT NULL,
		lon REAL NOT NULL,
		elevation_ft INTEGER NOT NULL DEFAULT 0,
		carriers TEXT NOT NULL DEFAULT '[]',
		status TEXT NOT NULL DEFAULT 'requested',
		tracked INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER,
		updated_by TEXT
	);
	CREATE TABLE IF NOT EXISTS tower_schedules (
		id TEXT PRIMARY KEY,
		airport_id TEXT NOT NULL REFERENCES airports(id) ON DELETE CASCADE,
		effective_from TEXT NOT NULL,
		effective_to TEXT,
		open INTEGER,
		close INTEGER,
		note TEXT NOT NULL DEFAULT '',
		updated_at INTEGER,
		updated_by TEXT
	);
	CREATE INDEX IF NOT EXISTS tower_schedules_airport ON tower_schedules (airport_id, effective_from);
	-- Ids deleted online. The insert-only seed skips these so a deletion is not
	-- undone by a restart while the row is still in airports.json.
	CREATE TABLE IF NOT EXISTS seed_tombstones (
		id TEXT PRIMARY KEY,
		deleted_at INTEGER NOT NULL,
		deleted_by TEXT
	);
	`);
}

/* ---------- seed (insert-only) ---------- */

export interface SeedResult {
	airportsInserted: number;
	schedulesInserted: number;
}

export function seedFromJson(seed: SeedFile = readSeedFile()): SeedResult {
	migrateAirports();
	const d = db();
	const insA = d.prepare(
		`INSERT OR IGNORE INTO airports (id, code, icao, name, city, state, tz, lat, lon, elevation_ft, carriers, status, tracked)
		 VALUES (@id, @code, @icao, @name, @city, @state, @tz, @lat, @lon, @elevation_ft, @carriers, @status, @tracked)`
	);
	const insS = d.prepare(
		`INSERT OR IGNORE INTO tower_schedules (id, airport_id, effective_from, effective_to, open, close, note)
		 SELECT @id, @airport_id, @from, @to, @open, @close, @note
		 WHERE NOT EXISTS (SELECT 1 FROM seed_tombstones WHERE id = @id)`
	);
	let airportsInserted = 0,
		schedulesInserted = 0;
	d.transaction(() => {
		for (const a of seed.airports) {
			const r = insA.run({ ...a, carriers: JSON.stringify(a.carriers), tracked: a.tracked ? 1 : 0 });
			airportsInserted += r.changes;
			for (const s of a.schedules) {
				schedulesInserted += insS.run({ ...s, airport_id: a.id }).changes;
			}
		}
	})();
	return { airportsInserted, schedulesInserted };
}

let seeded = false;
/** Seed once per process (idempotent anyway). */
export function ensureAirports() {
	if (seeded) return;
	seeded = true;
	migrateAirports();
	try {
		const r = seedFromJson();
		if (r.airportsInserted || r.schedulesInserted) console.log(`[airports] seeded ${r.airportsInserted} airport(s), ${r.schedulesInserted} schedule(s) from ${SEED_PATH}`);
	} catch (e) {
		console.warn(`[airports] seed file not loaded: ${e instanceof Error ? e.message : e}`);
	}
}

/* ---------- reads ---------- */

interface ARow {
	id: string; code: string; icao: string; name: string; city: string; state: string; tz: string; lat: number; lon: number;
	elevation_ft: number; carriers: string; status: string; tracked: number; updated_at: number | null; updated_by: string | null;
}
interface SRow {
	id: string; airport_id: string; effective_from: string; effective_to: string | null; open: number | null; close: number | null; note: string;
	updated_at: number | null; updated_by: string | null;
}

function rowToSchedule(r: SRow): TowerSchedule {
	return { id: r.id, from: r.effective_from, to: r.effective_to, open: r.open, close: r.close, note: r.note };
}

export interface AirportRecord extends AirportConfig {
	id: string;
	updatedAt: number | null;
	updatedBy: string | null;
}

function toRecord(r: ARow, schedules: TowerSchedule[]): AirportRecord {
	const base: AirportRecord = { id: r.id, code: r.code, icao: r.icao, name: r.name, city: r.city, state: r.state, tz: r.tz, pos: [r.lat, r.lon], elevationFt: r.elevation_ft, carriers: JSON.parse(r.carriers) as string[], status: r.status as AirportStatus, tracked: !!r.tracked, schedules, towerHours: null, updatedAt: r.updated_at, updatedBy: r.updated_by };
	base.towerHours = towerHoursOn(base, todayKey(r.tz));
	return base;
}

export function listAirports(): AirportRecord[] {
	ensureAirports();
	const d = db();
	const rows = d.prepare(`SELECT * FROM airports ORDER BY tracked DESC, status, code`).all() as ARow[];
	const sched = d.prepare(`SELECT * FROM tower_schedules ORDER BY effective_from`).all() as SRow[];
	const by = new Map<string, TowerSchedule[]>();
	for (const s of sched) {
		if (!by.has(s.airport_id)) by.set(s.airport_id, []);
		by.get(s.airport_id)!.push(rowToSchedule(s));
	}
	return rows.map((r) => toRecord(r, by.get(r.id) ?? []));
}

export function getAirport(codeOrIcao: string): AirportRecord | undefined {
	ensureAirports();
	const c = codeOrIcao.toUpperCase();
	const r = db().prepare(`SELECT * FROM airports WHERE code = ? OR icao = ?`).get(c, c) as ARow | undefined;
	if (!r) return undefined;
	const sched = (db().prepare(`SELECT * FROM tower_schedules WHERE airport_id = ? ORDER BY effective_from`).all(r.id) as SRow[]).map(rowToSchedule);
	return toRecord(r, sched);
}

export function trackedAirports(): AirportRecord[] {
	return listAirports().filter((a) => a.tracked);
}

/* ---------- writes (online editing) ---------- */

export interface AirportEdit {
	name: string; city: string; state: string; tz: string; lat: number; lon: number; elevation_ft: number; carriers: string[]; status: AirportStatus; tracked: boolean;
}

export function updateAirport(id: string, e: AirportEdit, by: string) {
	ensureAirports();
	db()
		.prepare(`UPDATE airports SET name=@name, city=@city, state=@state, tz=@tz, lat=@lat, lon=@lon, elevation_ft=@elevation_ft, carriers=@carriers, status=@status, tracked=@tracked, updated_at=@now, updated_by=@by WHERE id=@id`)
		.run({ ...e, id, carriers: JSON.stringify(e.carriers), tracked: e.tracked ? 1 : 0, now: Date.now(), by });
}

export function createAirport(a: Omit<AirportJson, 'schedules'>, by: string) {
	ensureAirports();
	db()
		.prepare(`INSERT INTO airports (id, code, icao, name, city, state, tz, lat, lon, elevation_ft, carriers, status, tracked, updated_at, updated_by)
		 VALUES (@id, @code, @icao, @name, @city, @state, @tz, @lat, @lon, @elevation_ft, @carriers, @status, @tracked, @now, @by)`)
		.run({ ...a, carriers: JSON.stringify(a.carriers), tracked: a.tracked ? 1 : 0, now: Date.now(), by });
}

export function upsertSchedule(airportId: string, s: TowerSchedule, by: string) {
	ensureAirports();
	db()
		.prepare(`INSERT INTO tower_schedules (id, airport_id, effective_from, effective_to, open, close, note, updated_at, updated_by)
		 VALUES (@id, @airport_id, @from, @to, @open, @close, @note, @now, @by)
		 ON CONFLICT(id) DO UPDATE SET effective_from=excluded.effective_from, effective_to=excluded.effective_to, open=excluded.open, close=excluded.close, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
		.run({ ...s, airport_id: airportId, now: Date.now(), by });
}

export function deleteSchedule(id: string, by = '') {
	const d = db();
	d.transaction(() => {
		d.prepare(`DELETE FROM tower_schedules WHERE id = ?`).run(id);
		d.prepare(`INSERT OR REPLACE INTO seed_tombstones (id, deleted_at, deleted_by) VALUES (?, ?, ?)`).run(id, Date.now(), by);
	})();
}

export function tombstones(): Set<string> {
	return new Set((db().prepare(`SELECT id FROM seed_tombstones`).all() as { id: string }[]).map((r) => r.id));
}

/* ---------- export & drift ---------- */

export function exportJson(): SeedFile {
	const comment = (() => {
		try {
			return readSeedFile().$comment;
		} catch {
			return undefined;
		}
	})();
	return {
		$comment: comment,
		airports: listAirports().map((a) => ({
			id: a.id, code: a.code, icao: a.icao, name: a.name, city: a.city, state: a.state, tz: a.tz, lat: a.pos[0], lon: a.pos[1], elevation_ft: a.elevationFt,
			carriers: a.carriers, status: a.status, tracked: a.tracked, schedules: a.schedules
		}))
	};
}

export interface Drift {
	/** "airport:PAE" or "schedule:PAE-2024-01-01" */
	key: string;
	airport: string;
	/** Field → [json value, live value]. */
	diffs: Record<string, [unknown, unknown]>;
	/** Present in JSON but not live (would be inserted on next start). */
	missingLive?: boolean;
	/** Present in JSON but deleted online; the seed will keep skipping it until removed from the file. */
	deletedLive?: boolean;
	/** Present live but not in JSON. */
	missingJson?: boolean;
}

/** Differences between airports.json and the live tables, per id. Never applies anything. */
export function drift(seed: SeedFile = readSeedFile()): Drift[] {
	const live = exportJson();
	const dead = tombstones();
	const out: Drift[] = [];
	const liveA = new Map(live.airports.map((a) => [a.id, a]));
	const jsonA = new Map(seed.airports.map((a) => [a.id, a]));
	const fields: (keyof Omit<AirportJson, 'schedules' | 'id'>)[] = ['code', 'icao', 'name', 'city', 'state', 'tz', 'lat', 'lon', 'elevation_ft', 'carriers', 'status', 'tracked'];
	for (const [id, j] of jsonA) {
		const l = liveA.get(id);
		if (!l) {
			out.push({ key: `airport:${id}`, airport: id, diffs: {}, missingLive: true });
			continue;
		}
		const diffs: Drift['diffs'] = {};
		for (const f of fields) if (JSON.stringify(j[f]) !== JSON.stringify(l[f])) diffs[f] = [j[f], l[f]];
		if (Object.keys(diffs).length) out.push({ key: `airport:${id}`, airport: id, diffs });
		const liveS = new Map(l.schedules.map((s) => [s.id, s]));
		for (const s of j.schedules) {
			const ls = liveS.get(s.id);
			if (!ls) {
				out.push({ key: `schedule:${s.id}`, airport: id, diffs: {}, ...(dead.has(s.id) ? { deletedLive: true } : { missingLive: true }) });
				continue;
			}
			const sd: Drift['diffs'] = {};
			for (const f of ['from', 'to', 'open', 'close', 'note'] as const) if (JSON.stringify(s[f]) !== JSON.stringify(ls[f])) sd[f] = [s[f], ls[f]];
			if (Object.keys(sd).length) out.push({ key: `schedule:${s.id}`, airport: id, diffs: sd });
		}
		for (const ls of l.schedules) if (!j.schedules.some((s) => s.id === ls.id)) out.push({ key: `schedule:${ls.id}`, airport: id, diffs: {}, missingJson: true });
	}
	for (const [id] of liveA) if (!jsonA.has(id)) out.push({ key: `airport:${id}`, airport: id, diffs: {}, missingJson: true });
	return out;
}

/** Apply the JSON version of one drifted row to the live table (explicit admin choice). */
export function applyJsonRow(key: string, by: string, seed: SeedFile = readSeedFile()) {
	const [kind, id] = key.split(':');
	if (kind === 'airport') {
		const j = seed.airports.find((a) => a.id === id);
		if (!j) throw new Error('not in JSON');
		if (getAirportById(id)) updateAirport(id, { name: j.name, city: j.city, state: j.state, tz: j.tz, lat: j.lat, lon: j.lon, elevation_ft: j.elevation_ft, carriers: j.carriers, status: j.status, tracked: j.tracked }, by);
		else {
			createAirport(j, by);
			for (const s of j.schedules) upsertSchedule(id, s, by);
		}
	} else if (kind === 'schedule') {
		for (const a of seed.airports) {
			const s = a.schedules.find((x) => x.id === id);
			if (s) {
				db().prepare(`DELETE FROM seed_tombstones WHERE id = ?`).run(id);
				return upsertSchedule(a.id, s, by);
			}
		}
		throw new Error('not in JSON');
	}
}

function getAirportById(id: string): boolean {
	return !!db().prepare(`SELECT 1 FROM airports WHERE id = ?`).get(id);
}

/** Nights already stored whose window would change under the schedule now on file. */
export function nightsAffectedBySchedule(airport: AirportRecord, from: string, to: string | null): string[] {
	const rows = db().prepare(`SELECT night FROM nights WHERE airport = ? AND night >= ? ${to ? 'AND night <= ?' : ''} ORDER BY night`).all(...(to ? [airport.icao, from, to] : [airport.icao, from])) as { night: string }[];
	return rows.map((r) => r.night);
}
