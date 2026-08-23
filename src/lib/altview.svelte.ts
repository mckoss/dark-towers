/**
 * How altitudes are shown. Default is height above the field (reported
 * pressure altitude corrected by the hour's altimeter setting, minus field
 * elevation). Anyone who wants the raw transponder figure can switch to
 * "reported"; the choice is remembered in this browser.
 */
import { correctionAt, type AltCorrection, type AltSource } from './altimeter';

export type AltMode = 'agl' | 'reported';

const KEY = 'dtw-alt-mode';

function load(): AltMode {
	try {
		return localStorage.getItem(KEY) === 'reported' ? 'reported' : 'agl';
	} catch {
		return 'agl';
	}
}

export const altView = $state<{ mode: AltMode }>({ mode: 'agl' });

/** Call once in the browser to pick up the remembered choice. */
export function initAltView() {
	altView.mode = load();
}

export function setAltMode(mode: AltMode) {
	altView.mode = mode;
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		/* private mode etc. */
	}
}

/**
 * One correction for a whole page: every altitude on screen gets the same
 * offset, so two aircraft are never corrected differently from each other.
 */
export interface AltContext {
	/** Feet subtracted from every ADS-B altitude on the page. */
	offsetFt: number;
	source: AltSource;
	/** On-field reports behind the offset (when source is on-field). */
	points: number;
	elevationFt: number;
}

/** Evaluate a night's correction once, at the instant the page is about (the closest moment, or the middle of the night). */
export function altContextFor(night: { altimeter?: AltCorrection['readings']; onField?: AltCorrection['onField']; groundOffsetFt?: number | null } | null | undefined, elevationFt: number, at: number): AltContext {
	const c = night ? { readings: night.altimeter ?? null, onField: night.onField ?? null, tracksOffsetFt: night.groundOffsetFt ?? null } : null;
	const r = correctionAt(c, at);
	return { offsetFt: Math.round(r.offsetFt), source: r.source, points: r.points, elevationFt };
}

export const NO_CORRECTION: AltContext = { offsetFt: 0, source: 'none', points: 0, elevationFt: 0 };

/** Altitude to display for a reported altitude at time t, in the current mode. */
export function displayAlt(reportedFt: number, ctx: AltContext, mode: AltMode = altView.mode): { ft: number; mode: AltMode } {
	if (mode === 'reported') return { ft: reportedFt, mode };
	// Source altitudes are quantised to 100 ft; showing finer than 50 ft above the field would be false precision.
	return { ft: Math.max(0, Math.round((reportedFt - ctx.offsetFt - ctx.elevationFt) / 50) * 50), mode };
}

/** "650 ft AGL" / "1,100 ft ADS-B" (the raw broadcast pressure altitude). */
export function altLabel(reportedFt: number, ctx: AltContext, mode: AltMode = altView.mode): string {
	const d = displayAlt(reportedFt, ctx, mode);
	return `${d.ft.toLocaleString('en-US')} ft ${d.mode === 'agl' ? 'AGL' : 'ADS-B'}`;
}
