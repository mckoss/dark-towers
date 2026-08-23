/**
 * Pressure-altitude correction.
 *
 * Transponders broadcast altitude against the standard 29.92 inHg datum, not
 * against the day's actual pressure, so every reported altitude is off by
 * the same amount: roughly 1,000 ft per inch of mercury the local altimeter
 * setting differs from standard. The difference between two aircraft is
 * unaffected (both carry the same bias), but comparing a reported altitude
 * to the ground requires the correction — hence these helpers.
 *
 * Readings come from the airport's hourly weather reports (METAR/SPECI); the
 * offset at any instant is interpolated between the bracketing reports.
 */

/** One altimeter-setting report: [unix ms, inches of mercury]. */
export type AltimeterReading = [number, number];

export const STANDARD_INHG = 29.92126;

/**
 * Feet to SUBTRACT from a reported (pressure) altitude to get true altitude,
 * for a given altimeter setting. Positive when pressure is below standard
 * (aircraft read high), negative when above (aircraft read low).
 * ISA: the pressure altitude of the altimeter-setting level.
 */
export function pressureOffsetFt(altimeterInHg: number): number {
	return 145366.45 * (1 - Math.pow(altimeterInHg / STANDARD_INHG, 0.190284));
}

/** Altimeter setting at t, linearly interpolated between readings; null with no readings. */
export function altimeterAt(readings: AltimeterReading[] | null | undefined, t: number): number | null {
	if (!readings || readings.length === 0) return null;
	if (t <= readings[0][0]) return readings[0][1];
	const last = readings[readings.length - 1];
	if (t >= last[0]) return last[1];
	for (let i = 1; i < readings.length; i++) {
		const [t1, v1] = readings[i];
		if (t <= t1) {
			const [t0, v0] = readings[i - 1];
			return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
		}
	}
	return last[1];
}

/** Offset (feet to subtract from reported altitude) at t; 0 when no readings are available. */
export function offsetAt(readings: AltimeterReading[] | null | undefined, t: number): number {
	const a = altimeterAt(readings, t);
	return a == null ? 0 : pressureOffsetFt(a);
}

/** Parse the Iowa State ASOS archive CSV ("station,valid,alti" rows, UTC) into readings. */
export function parseAsosCsv(csv: string): AltimeterReading[] {
	const out: AltimeterReading[] = [];
	for (const line of csv.split('\n')) {
		const m = /^[A-Z0-9]+,(\d{4}-\d{2}-\d{2} \d{2}:\d{2}),([0-9.]+)\s*$/.exec(line.trim());
		if (!m) continue;
		const t = Date.parse(m[1].replace(' ', 'T') + ':00Z');
		const v = Number(m[2]);
		if (Number.isFinite(t) && Number.isFinite(v) && v > 25 && v < 35) out.push([t, v]);
	}
	out.sort((a, b) => a[0] - b[0]);
	return out;
}

/**
 * Self-calibration from the tracks themselves: the lowest reported altitude
 * of each track that came within `radiusNm` of the field, taken at the 25th
 * percentile across tracks (arrivals usually stop reporting a little above
 * the runway, so the lowest quarter is the best ground proxy). Returns the
 * feet to subtract from reported altitudes (reported ground − field), or
 * null with fewer than `minTracks` usable tracks. Quantised to 100 ft by the
 * source, so treat as ±50 ft.
 */
export function groundOffsetFt(
	tracks: { positions: { alt: number; dist: number }[] }[],
	elevationFt: number,
	opts: { radiusNm?: number; minTracks?: number } = {}
): { offsetFt: number; tracks: number } | null {
	const radius = opts.radiusNm ?? 1.5;
	const minTracks = opts.minTracks ?? 4;
	const mins: number[] = [];
	for (const f of tracks) {
		let low = Infinity;
		for (const p of f.positions) if (p.dist < radius && p.alt < low) low = p.alt;
		if (Number.isFinite(low)) mins.push(low);
	}
	if (mins.length < minTracks) return null;
	mins.sort((a, b) => a - b);
	const p25 = mins[Math.floor((mins.length - 1) * 0.25)];
	return { offsetFt: p25 - elevationFt, tracks: mins.length };
}

/** An on-field report: [unix ms, feet to subtract] (reported altitude minus field elevation). */
export type OnFieldPoint = [number, number];

/** On-field reports within this much of an instant calibrate it directly. */
export const ON_FIELD_WINDOW_MS = 3600_000;

/**
 * Direct ground references: reports from aircraft plainly on the field
 * (inside `radiusNm` and slower than `maxKt`), each as the feet to subtract
 * from reported altitude. Sorted by time.
 */
export function onFieldPoints(
	tracks: { positions: { t: number; alt: number; gs: number; dist: number }[] }[],
	elevationFt: number,
	opts: { radiusNm?: number; maxKt?: number } = {}
): OnFieldPoint[] {
	const radius = opts.radiusNm ?? 1.2;
	const maxKt = opts.maxKt ?? 40;
	const out: OnFieldPoint[] = [];
	for (const f of tracks) for (const p of f.positions) if (p.dist < radius && p.gs < maxKt) out.push([p.t, p.alt - elevationFt]);
	out.sort((a, b) => a[0] - b[0]);
	return out;
}

export type AltSource = 'on-field' | 'weather' | 'tracks' | 'none';

/** Everything a night knows about its pressure correction. */
export interface AltCorrection {
	/** Hourly altimeter settings. */
	readings: AltimeterReading[] | null;
	/** Direct on-field reports. */
	onField: OnFieldPoint[] | null;
	/** Night-wide estimate from the lowest points of tracks near the field. */
	tracksOffsetFt: number | null;
}

/**
 * Correction at an instant, best source first: the median of on-field reports
 * within ±1 h (a direct measurement of the transponders), else the
 * interpolated altimeter setting, else the track estimate, else nothing.
 */
export function correctionAt(c: AltCorrection | null | undefined, t: number): { offsetFt: number; source: AltSource; points: number } {
	if (!c) return { offsetFt: 0, source: 'none', points: 0 };
	const near = (c.onField ?? []).filter(([pt]) => Math.abs(pt - t) <= ON_FIELD_WINDOW_MS).map(([, v]) => v).sort((a, b) => a - b);
	if (near.length > 0) return { offsetFt: near[Math.floor(near.length / 2)], source: 'on-field', points: near.length };
	if (c.readings && c.readings.length > 0) return { offsetFt: offsetAt(c.readings, t), source: 'weather', points: 0 };
	if (c.tracksOffsetFt != null) return { offsetFt: c.tracksOffsetFt, source: 'tracks', points: 0 };
	return { offsetFt: 0, source: 'none', points: 0 };
}

export function correctionOffsetAt(c: AltCorrection | null | undefined, t: number): number {
	return correctionAt(c, t).offsetFt;
}

export function hasCorrection(c: AltCorrection | null | undefined): boolean {
	return !!c && ((c.onField?.length ?? 0) > 0 || (c.readings?.length ?? 0) > 0 || c.tracksOffsetFt != null);
}
