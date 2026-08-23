/**
 * How altitudes are shown. Default is height above the field (reported
 * pressure altitude corrected by the hour's altimeter setting, minus field
 * elevation). Anyone who wants the raw transponder figure can switch to
 * "reported"; the choice is remembered in this browser.
 */
import { aglFt, type AltimeterReading } from './altimeter';

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

/** What a page needs to turn a reported altitude into height above the field. */
export interface AltContext {
	readings: AltimeterReading[] | null | undefined;
	elevationFt: number;
}

/** Altitude to display for a reported altitude at time t, in the current mode. */
export function displayAlt(reportedFt: number, t: number, ctx: AltContext, mode: AltMode = altView.mode): { ft: number; mode: AltMode } {
	if (mode === 'reported') return { ft: reportedFt, mode };
	// Source altitudes are quantised to 100 ft; showing finer than 50 ft above the field would be false precision.
	return { ft: Math.max(0, Math.round(aglFt(reportedFt, t, ctx.readings, ctx.elevationFt) / 50) * 50), mode };
}

/** "650 ft AGL" / "1,100 ft reported". */
export function altLabel(reportedFt: number, t: number, ctx: AltContext, mode: AltMode = altView.mode): string {
	const d = displayAlt(reportedFt, t, ctx, mode);
	return `${d.ft.toLocaleString('en-US')} ft ${d.mode === 'agl' ? 'AGL' : 'reported'}`;
}
