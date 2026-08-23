/**
 * Airline operator names: ICAO 3-letter code → full and short names. Same
 * pattern as airports: operators.json seeds insert-only; the database is the
 * source of truth; names are resolved at render time so edits apply to
 * history. Deletions are tombstoned so a restart doesn't resurrect them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';

export interface Operator {
	icao: string;
	name: string;
	short: string;
}
export interface OperatorsFile {
	$comment?: string;
	operators: Operator[];
}

export const OPERATORS_SEED_PATH = path.resolve(process.env.OPERATORS_JSON ?? 'operators.json');

export function readOperatorsSeed(p = OPERATORS_SEED_PATH): OperatorsFile {
	return JSON.parse(fs.readFileSync(p, 'utf8')) as OperatorsFile;
}

export function migrateOperators() {
	db().exec(`
	CREATE TABLE IF NOT EXISTS operators (
		icao TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		short TEXT NOT NULL,
		updated_at INTEGER,
		updated_by TEXT
	);
	CREATE TABLE IF NOT EXISTS seed_tombstones (
		id TEXT PRIMARY KEY,
		deleted_at INTEGER NOT NULL,
		deleted_by TEXT
	);
	`);
}

export function seedOperators(seed: OperatorsFile = readOperatorsSeed()): number {
	migrateOperators();
	const ins = db().prepare(
		`INSERT OR IGNORE INTO operators (icao, name, short) SELECT @icao, @name, @short WHERE NOT EXISTS (SELECT 1 FROM seed_tombstones WHERE id = 'operator:' || @icao)`
	);
	let n = 0;
	db().transaction(() => {
		for (const o of seed.operators) n += ins.run({ icao: o.icao.toUpperCase(), name: o.name, short: o.short }).changes;
	})();
	return n;
}

let seeded = false;
export function ensureOperators() {
	if (seeded) return;
	seeded = true;
	migrateOperators();
	try {
		const n = seedOperators();
		if (n) console.log(`[operators] seeded ${n} operator(s) from ${OPERATORS_SEED_PATH}`);
	} catch (e) {
		console.warn(`[operators] seed file not loaded: ${e instanceof Error ? e.message : e}`);
	}
}

export function listOperators(): Operator[] {
	ensureOperators();
	return db().prepare(`SELECT icao, name, short FROM operators ORDER BY icao`).all() as Operator[];
}

/** Map of ICAO → operator for fast lookups while decorating flights. */
export function operatorMap(): Map<string, Operator> {
	return new Map(listOperators().map((o) => [o.icao, o]));
}

export function upsertOperator(o: Operator, by: string) {
	ensureOperators();
	const d = db();
	d.transaction(() => {
		d.prepare(`DELETE FROM seed_tombstones WHERE id = ?`).run(`operator:${o.icao.toUpperCase()}`);
		d.prepare(
			`INSERT INTO operators (icao, name, short, updated_at, updated_by) VALUES (@icao, @name, @short, @now, @by)
			 ON CONFLICT(icao) DO UPDATE SET name=excluded.name, short=excluded.short, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
		).run({ icao: o.icao.toUpperCase(), name: o.name.trim(), short: o.short.trim(), now: Date.now(), by });
	})();
}

export function deleteOperator(icao: string, by: string) {
	const d = db();
	d.transaction(() => {
		d.prepare(`DELETE FROM operators WHERE icao = ?`).run(icao.toUpperCase());
		d.prepare(`INSERT OR REPLACE INTO seed_tombstones (id, deleted_at, deleted_by) VALUES (?, ?, ?)`).run(`operator:${icao.toUpperCase()}`, Date.now(), by);
	})();
}

export function exportOperatorsJson(): OperatorsFile {
	let comment: string | undefined;
	try {
		comment = readOperatorsSeed().$comment;
	} catch {
		/* no file */
	}
	return { $comment: comment, operators: listOperators() };
}

/** Operator codes seen in stored flights that have no name yet — the admin's to-do list. */
export function unknownOperators(): { icao: string; flights: number; example: string }[] {
	ensureOperators();
	return db()
		.prepare(
			`SELECT f.operator icao, COUNT(*) flights, MIN(f.ident) example FROM flights f
			 WHERE f.category = 'airline' AND f.operator IS NOT NULL AND f.operator NOT IN (SELECT icao FROM operators)
			 GROUP BY f.operator ORDER BY flights DESC`
		)
		.all() as { icao: string; flights: number; example: string }[];
}
