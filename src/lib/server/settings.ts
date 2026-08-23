/**
 * Single settings source.
 *
 *   Local dev:  ./settings.json (gitignored)
 *   Railway:    env SETTINGS_JSON = the file's contents, verbatim
 *
 * Individual env vars are NOT the primary mechanism; FLIGHTAWARE_API_KEY is
 * honoured only as an override for backwards compatibility.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
	api_key?: string;
	/** Emails allowed into /admin. */
	admins: string[];
	google?: { client_id: string; client_secret: string };
	/** Random string used to sign session cookies. Generated if missing (sessions then reset on restart). */
	session_secret?: string;
	/** Public origin used to build the OAuth redirect URL, e.g. https://darktowerwatch.org */
	public_origin?: string;
}

let cached: Settings | undefined;

export function settings(): Settings {
	if (cached) return cached;
	let raw: unknown = {};
	let source = 'defaults';
	const env = process.env.SETTINGS_JSON?.trim();
	if (env) {
		raw = JSON.parse(env);
		source = 'SETTINGS_JSON';
	} else {
		for (const p of [path.resolve(process.env.SETTINGS_FILE ?? 'settings.json'), path.join(path.resolve(process.env.DATA_DIR ?? 'data'), 'settings.json')]) {
			try {
				raw = JSON.parse(fs.readFileSync(p, 'utf8'));
				source = p;
				break;
			} catch {
				/* try next */
			}
		}
	}
	const s = (raw ?? {}) as Partial<Settings>;
	cached = {
		api_key: process.env.FLIGHTAWARE_API_KEY?.trim() || s.api_key?.trim() || undefined,
		admins: (s.admins ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
		google: s.google?.client_id && s.google?.client_secret ? s.google : undefined,
		session_secret: s.session_secret,
		public_origin: s.public_origin
	};
	if (process.env.NODE_ENV !== 'test') console.log(`[settings] loaded from ${source}; ${cached.admins.length} admin(s); google sign-in ${cached.google ? 'configured' : 'NOT configured'}`);
	return cached;
}

/** For tests. */
export function resetSettingsCache() {
	cached = undefined;
}

/**
 * Local/LAN escape hatch, as in mbbb-music: DTW_NO_AUTH=1 runs /admin open with
 * a synthetic admin so settings.json can stay production-ready. Never set this
 * in production.
 */
export function openMode(): boolean {
	return /^(1|true|yes|on)$/i.test(process.env.DTW_NO_AUTH ?? '');
}

export function isAdmin(email: string | null | undefined): boolean {
	return !!email && settings().admins.includes(email.trim().toLowerCase());
}
