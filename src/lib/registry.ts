/**
 * FAA aircraft registry (the "Releasable Aircraft" database), reduced to a
 * tail-number → make/model/airframe table. Used to describe aircraft whose
 * FlightAware record carries no type code, and to tell helicopters from
 * airplanes regardless of source. Pure functions; the download and cache
 * live in $lib/server/registry.
 */

export type Airframe = 'airplane' | 'helicopter' | 'other';

export interface RegistryData {
	/** Date the FAA file was produced (YYYY-MM-DD). */
	asOf: string;
	/** MFR MDL CODE → [manufacturer, model, airframe]. */
	models: Record<string, [string, string, Airframe]>;
	/** N-number (without the leading N) → MFR MDL CODE. */
	tails: Record<string, string>;
}

export interface RegistryEntry {
	manufacturer: string;
	model: string;
	airframe: Airframe;
	/** Short display form, e.g. "BELL 429" or "PILATUS PC-12/47E". */
	label: string;
}

/** TYPE-ACFT codes: 4 fixed-wing single, 5 fixed-wing multi, 6 rotorcraft, 9 gyroplane; the rest are gliders, balloons, etc. */
export function airframeOf(typeAcft: string): Airframe {
	const t = typeAcft.trim();
	if (t === '4' || t === '5') return 'airplane';
	if (t === '6' || t === '9') return 'helicopter';
	return 'other';
}

const split = (line: string) => line.split(',').map((s) => s.trim());

/** Parse ACFTREF.txt (CODE, MFR, MODEL, TYPE-ACFT, …). */
export function parseModels(text: string): RegistryData['models'] {
	const out: RegistryData['models'] = {};
	for (const line of text.split(/\r?\n/)) {
		const f = split(line.replace(/^﻿/, ''));
		if (f.length < 4 || f[0] === 'CODE' || !f[0]) continue;
		out[f[0]] = [f[1], f[2], airframeOf(f[3])];
	}
	return out;
}

/**
 * Build the compact table from MASTER.txt lines (streamed) and the model
 * reference file. Only models that some registered aircraft uses are kept.
 */
export async function buildRegistry(asOf: string, acftref: string, masterLines: AsyncIterable<string> | Iterable<string>): Promise<RegistryData> {
	const allModels = parseModels(acftref);
	const tails: Record<string, string> = {};
	const used = new Set<string>();
	for await (const line of masterLines) {
		const f = split(line.replace(/^﻿/, ''));
		if (f.length < 3 || f[0] === 'N-NUMBER' || !f[0] || !f[2]) continue;
		tails[f[0]] = f[2];
		used.add(f[2]);
	}
	const models: RegistryData['models'] = {};
	for (const code of used) if (allModels[code]) models[code] = allModels[code];
	return { asOf, models, tails };
}

/** Normalise "N433LF" / "n433lf" / "433LF" to the registry key; null for non-US registrations. */
export function registryKey(tail: string | null | undefined): string | null {
	if (!tail) return null;
	const t = tail.trim().toUpperCase().replace(/^N/, '');
	return /^[1-9][0-9A-Z]{0,4}$/.test(t) ? t : null;
}

/** First word of the manufacturer name, which is almost always the familiar brand ("BELL TEXTRON CANADA LTD" → "BELL"). */
function brand(mfr: string): string {
	return mfr.split(/\s+/)[0] ?? mfr;
}

export function lookupRegistry(data: RegistryData | null, tail: string | null | undefined): RegistryEntry | null {
	const key = registryKey(tail);
	if (!data || !key) return null;
	const code = data.tails[key];
	const m = code ? data.models[code] : undefined;
	if (!m) return null;
	const [manufacturer, model, airframe] = m;
	return { manufacturer, model, airframe, label: `${brand(manufacturer)} ${model}`.trim() };
}
