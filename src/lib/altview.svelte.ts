/** Correct raw pressure altitude to height above the airport. */
import { correctionAt, type AltCorrection, type AltSource } from './altimeter';

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

/** Corrected height above the airport for the explanatory datablock line and page figures. */
export function displayAlt(reportedFt: number, ctx: AltContext): { ft: number; mode: 'agl' } {
	// Source altitudes are quantised to 100 ft; showing finer than 50 ft above the field would be false precision.
	return { ft: Math.max(0, Math.round((reportedFt - ctx.offsetFt - ctx.elevationFt) / 50) * 50), mode: 'agl' };
}
