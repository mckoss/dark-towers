/**
 * Time-zone helpers without a dependency. Nights are keyed by the local date
 * of the evening on which the tower closed ("the night of Aug 18").
 */

const DAY_MS = 86_400_000;

/** Offset of `tz` from UTC, in minutes, at the instant `utcMs`. */
export function tzOffsetMinutes(tz: string, utcMs: number): number {
	const f = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const p: Record<string, number> = {};
	for (const { type, value } of f.formatToParts(new Date(utcMs))) {
		if (type !== 'literal') p[type] = Number(value);
	}
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
	return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** UTC ms for a wall-clock time in `tz`. `hour` may be 24 (= midnight ending the day). */
export function zonedToUtc(tz: string, y: number, m: number, d: number, hour = 0, minute = 0): number {
	const guess = Date.UTC(y, m - 1, d, hour, minute);
	const off1 = tzOffsetMinutes(tz, guess);
	const utc1 = guess - off1 * 60_000;
	const off2 = tzOffsetMinutes(tz, utc1);
	return off2 === off1 ? utc1 : guess - off2 * 60_000;
}

/** Local calendar parts for an instant. */
export function localParts(tz: string, utcMs: number) {
	const off = tzOffsetMinutes(tz, utcMs);
	const d = new Date(utcMs + off * 60_000);
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		hour: d.getUTCHours(),
		minute: d.getUTCMinutes(),
		second: d.getUTCSeconds(),
		weekday: d.getUTCDay()
	};
}

export function pad2(n: number): string {
	return n < 10 ? '0' + n : String(n);
}

export function dateKey(y: number, m: number, d: number): string {
	return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseDateKey(key: string): [number, number, number] {
	const [y, m, d] = key.split('-').map(Number);
	return [y, m, d];
}

export function addDays(key: string, n: number): string {
	const [y, m, d] = parseDateKey(key);
	const t = Date.UTC(y, m - 1, d) + n * DAY_MS;
	const dt = new Date(t);
	return dateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Today's local date key in `tz`. */
export function todayKey(tz: string, now = Date.now()): string {
	const p = localParts(tz, now);
	return dateKey(p.year, p.month, p.day);
}

export interface NightWindow {
	night: string;
	/** UTC ms, inclusive. */
	start: number;
	/** UTC ms, exclusive. */
	end: number;
}

/**
 * The UTC window during which the tower is closed for the night beginning on
 * local date `night`. With tower hours {open:7, close:21} that is 21:00 on
 * `night` to 07:00 the next day. With no tower, it's the full local day.
 */
export function nightWindow(tz: string, tower: { open: number; close: number } | null, night: string): NightWindow {
	const [y, m, d] = parseDateKey(night);
	if (!tower) {
		return { night, start: zonedToUtc(tz, y, m, d, 0), end: zonedToUtc(tz, y, m, d, 24) };
	}
	const [ny, nm, nd] = parseDateKey(addDays(night, 1));
	return { night, start: zonedToUtc(tz, y, m, d, tower.close), end: zonedToUtc(tz, ny, nm, nd, tower.open) };
}

/** Which night an instant belongs to (null if the tower was open). */
export function nightOf(tz: string, tower: { open: number; close: number } | null, utcMs: number): string | null {
	const p = localParts(tz, utcMs);
	const key = dateKey(p.year, p.month, p.day);
	if (!tower) return key;
	if (p.hour >= tower.close) return key;
	if (p.hour < tower.open) return addDays(key, -1);
	return null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Monday, August 18" */
export function nightLabel(night: string): string {
	const [y, m, d] = parseDateKey(night);
	const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${WEEKDAYS[wd]}, ${MONTHS[m - 1]} ${d}`;
}


export function weekdayShort(night: string): string {
	const [y, m, d] = parseDateKey(night);
	return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3);
}

export function dayOfMonth(night: string): number {
	return parseDateKey(night)[2];
}

/** "9:41 pm" local. */
export function localTime(tz: string, utcMs: number, seconds = false): string {
	const p = localParts(tz, utcMs);
	const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
	const s = seconds ? `:${pad2(p.second)}` : '';
	return `${h12}:${pad2(p.minute)}${s} ${p.hour < 12 ? 'am' : 'pm'}`;
}

/** Short zone abbreviation in effect at an instant, e.g. "PDT" / "PST" (falls back to a GMT offset where none is defined). */
export function zoneAbbr(tz: string, utcMs: number): string {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(utcMs));
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

/** "9:36:50 pm PDT" — local time with the zone abbreviation. */
export function localTimeZoned(tz: string, utcMs: number, seconds = false): string {
	return `${localTime(tz, utcMs, seconds)} ${zoneAbbr(tz, utcMs)}`;
}
