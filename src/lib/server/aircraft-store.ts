import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import type { WakeCategory } from '$lib/types';

export interface AircraftWake { type: string; category: WakeCategory; description: string }
interface AircraftFile { $comment?: string; aircraft: AircraftWake[] }
const SEED_PATH = path.resolve(process.env.AIRCRAFT_JSON ?? 'aircraft.json');

export function migrateAircraft() {
	db().exec(`CREATE TABLE IF NOT EXISTS aircraft_wake (type TEXT PRIMARY KEY, category TEXT NOT NULL, description TEXT NOT NULL, updated_at INTEGER, updated_by TEXT)`);
}
let seeded = false;
export function ensureAircraft() {
	if (seeded) return;
	seeded = true;
	migrateAircraft();
	try {
		const file = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as AircraftFile;
		const ins = db().prepare(`INSERT OR IGNORE INTO aircraft_wake (type, category, description) VALUES (?, ?, ?)`);
		db().transaction(() => { for (const a of file.aircraft) ins.run(a.type.toUpperCase(), a.category, a.description); })();
	} catch (e) { console.warn(`[aircraft] seed file not loaded: ${e instanceof Error ? e.message : e}`); }
}
export function listAircraft(): AircraftWake[] { ensureAircraft(); return db().prepare(`SELECT type, category, description FROM aircraft_wake ORDER BY type`).all() as AircraftWake[]; }
export function aircraftCategoryMap(): Map<string, WakeCategory> { return new Map(listAircraft().map((a) => [a.type, a.category])); }
export function upsertAircraft(a: AircraftWake, by: string) {
	ensureAircraft();
	db().prepare(`INSERT INTO aircraft_wake (type, category, description, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(type) DO UPDATE SET category=excluded.category, description=excluded.description, updated_at=excluded.updated_at, updated_by=excluded.updated_by`).run(a.type.toUpperCase(), a.category, a.description.trim(), Date.now(), by);
}
export function deleteAircraft(type: string) { ensureAircraft(); db().prepare(`DELETE FROM aircraft_wake WHERE type = ?`).run(type.toUpperCase()); }
export function unknownAircraft(): { type: string; flights: number }[] { ensureAircraft(); return db().prepare(`SELECT type, COUNT(*) flights FROM flights WHERE type IS NOT NULL AND type NOT IN (SELECT type FROM aircraft_wake) GROUP BY type ORDER BY flights DESC`).all() as { type: string; flights: number }[]; }
