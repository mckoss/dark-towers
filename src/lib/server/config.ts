import fs from 'node:fs';
import path from 'node:path';

/**
 * Runtime configuration.
 *  - FLIGHTAWARE_API_KEY: env var (Railway). Locally, falls back to the
 *    gitignored settings.json ({ "api_key": "..." }) at the repo root.
 *  - DATA_DIR: where raw API responses and the SQLite database live. On
 *    Railway mount a volume here. Defaults to ./data.
 */

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, 'db', 'darktowers.sqlite');

let cachedKey: string | null | undefined;

export function flightAwareApiKey(): string | null {
	if (cachedKey !== undefined) return cachedKey;
	const env = process.env.FLIGHTAWARE_API_KEY?.trim();
	if (env) return (cachedKey = env);
	for (const p of [path.resolve('settings.json'), path.join(DATA_DIR, 'settings.json')]) {
		try {
			const s = JSON.parse(fs.readFileSync(p, 'utf8'));
			if (typeof s.api_key === 'string' && s.api_key.trim()) return (cachedKey = s.api_key.trim());
		} catch {
			/* not present */
		}
	}
	return (cachedKey = null);
}

export function ensureDirs() {
	fs.mkdirSync(RAW_DIR, { recursive: true });
	fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

/** Whether the in-process scheduler should run (off during tests/builds). */
export const SCHEDULER_ENABLED = (process.env.SCHEDULER ?? 'on') !== 'off';
