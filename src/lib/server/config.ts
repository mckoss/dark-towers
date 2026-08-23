/**
 * Runtime configuration — ONE source.
 *
 *   Local dev:  ./config.json (gitignored; see config.example.json)
 *   Railway:    env CONFIG_JSON = the file's contents, verbatim
 *
 * Keys: api_key, admins, google{client_id,client_secret}, session_secret,
 * public_origin, data_dir, db_path, scheduler, history_days.
 *
 * A few env vars are honoured as overrides for tests and one-off runs
 * (DATA_DIR, DB_PATH, SCHEDULER, FLIGHTAWARE_API_KEY, DTW_NO_AUTH); they are
 * not the intended way to configure a deployment.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Config {
	api_key?: string;
	/** Emails allowed into /admin. */
	admins: string[];
	google?: { client_id: string; client_secret: string };
	/** Random string used to sign session cookies. Generated if missing (sessions then reset on restart). */
	session_secret?: string;
	/** Public origin used to build the OAuth redirect URL, e.g. https://darktowerwatch.org */
	public_origin?: string;
	/** Where raw API responses and the SQLite database live (Railway: the volume mount). Default ./data */
	data_dir: string;
	db_path: string;
	/** Run the hourly nightly-capture job inside the server. Default true. */
	scheduler: boolean;
	/** How many nights back the scheduler backfills (AeroAPI personal tier reaches 10 days). Default 9. */
	history_days: number;
}

let cached: Config | undefined;

export function config(): Config {
	if (cached) return cached;
	let raw: Record<string, unknown> = {};
	let source = 'defaults';
	const env = process.env.CONFIG_JSON?.trim();
	if (env) {
		raw = JSON.parse(env);
		source = 'CONFIG_JSON';
	} else {
		for (const p of [path.resolve(process.env.CONFIG_FILE ?? 'config.json')]) {
			try {
				raw = JSON.parse(fs.readFileSync(p, 'utf8'));
				source = p;
				break;
			} catch {
				/* not present */
			}
		}
	}
	const s = raw as Partial<Config> & { admins?: string[] };
	const dataDir = path.resolve(process.env.DATA_DIR ?? s.data_dir ?? 'data');
	cached = {
		api_key: process.env.FLIGHTAWARE_API_KEY?.trim() || s.api_key?.trim() || undefined,
		admins: (s.admins ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean),
		google: s.google?.client_id && s.google?.client_secret ? s.google : undefined,
		session_secret: s.session_secret,
		public_origin: s.public_origin,
		data_dir: dataDir,
		db_path: process.env.DB_PATH ?? s.db_path ?? path.join(dataDir, 'db', 'darktowers.sqlite'),
		scheduler: process.env.SCHEDULER ? process.env.SCHEDULER !== 'off' : (s.scheduler ?? true),
		history_days: Number(process.env.HISTORY_DAYS ?? s.history_days ?? 9)
	};
	if (process.env.NODE_ENV !== 'test') {
		console.log(`[config] loaded from ${source}; data_dir=${cached.data_dir}; ${cached.admins.length} admin(s); google sign-in ${cached.google ? 'configured' : 'NOT configured'}; scheduler ${cached.scheduler ? 'on' : 'off'}`);
	}
	return cached;
}

/** For tests. */
export function resetConfigCache() {
	cached = undefined;
}

export const DATA_DIR = config().data_dir;
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const DB_PATH = config().db_path;
export const SCHEDULER_ENABLED = config().scheduler;

export function flightAwareApiKey(): string | null {
	return config().api_key ?? null;
}

export function ensureDirs() {
	fs.mkdirSync(RAW_DIR, { recursive: true });
	fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

/**
 * Local/LAN escape hatch (as in mbbb-music): DTW_NO_AUTH=1 runs /admin open
 * with a synthetic admin so config.json can stay production-ready. Never set
 * this in production.
 */
export function openMode(): boolean {
	return /^(1|true|yes|on)$/i.test(process.env.DTW_NO_AUTH ?? '');
}

export function isAdmin(email: string | null | undefined): boolean {
	return !!email && config().admins.includes(email.trim().toLowerCase());
}
