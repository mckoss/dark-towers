import fs from 'node:fs';
import path from 'node:path';
import { settings } from './settings';

/**
 * Runtime configuration.
 *  - Settings (API key, admins, Google OAuth): see ./settings.ts — one
 *    settings.json locally, or the same JSON in env SETTINGS_JSON on Railway.
 *  - DATA_DIR: where raw API responses and the SQLite database live. On
 *    Railway mount a volume here. Defaults to ./data.
 */

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, 'db', 'darktowers.sqlite');

export function flightAwareApiKey(): string | null {
	return settings().api_key ?? null;
}

export function ensureDirs() {
	fs.mkdirSync(RAW_DIR, { recursive: true });
	fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

/** Whether the in-process scheduler should run (off during tests/builds). */
export const SCHEDULER_ENABLED = (process.env.SCHEDULER ?? 'on') !== 'off';
