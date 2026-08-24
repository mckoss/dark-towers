/**
 * ATC-style data block: what a controller's scope shows beside a target.
 *   line 1  callsign / friendly label
 *   line 2  raw ADS-B pressure altitude (hundreds of feet, three digits) · climb/descent arrow · groundspeed (knots)
 * A third, plain-language line gives the corrected height or raw report selected by the reader.
 */
export interface DataBlockInput {
	label: string;
	/** Raw ADS-B pressure altitude in feet; always used by the compact ATC line. */
	altFt: number;
	/** Corrected/display altitude for the plain-language line; defaults to `altFt`. */
	plainAltFt?: number;
	/** Suffix for the plain-language line: "AGL" (default; above ground level, i.e. the field) or "ADS-B" (raw broadcast altitude). */
	altUnit?: string;
	/** Knots. */
	gsKt: number;
	/** Vertical rate sign: 1 climbing, -1 descending, 0 level/unknown. */
	trend?: number;
	/** Local time at this position, already formatted (e.g. "9:36:50 pm"); shown as a last line when given. */
	time?: string;
	/** Optional current-registry link and compact facts for the identity line. */
	aircraft?: {
		href: string;
		registration: string;
		description: string;
		ownerName?: string | null;
		ownerLocation?: string | null;
		asOf?: string | null;
	};
}

export function altitudeHundreds(altFt: number): string {
	return String(Math.max(0, Math.round(altFt / 100))).padStart(3, '0');
}

export function trendArrow(trend: number | undefined): string {
	return trend === undefined || trend === 0 ? '' : trend > 0 ? '↑' : '↓';
}

export function dataBlockLines(d: DataBlockInput): [string, string, string] {
	const arrow = trendArrow(d.trend);
	const plainAltFt = d.plainAltFt ?? d.altFt;
	return [
		d.label,
		`${altitudeHundreds(d.altFt)}${arrow} ${String(Math.round(d.gsKt)).padStart(3, ' ')}`,
		`${Math.round(plainAltFt).toLocaleString('en-US')} ft ${d.altUnit ?? 'AGL'}${arrow ? ' ' + arrow : ''} · ${Math.round(d.gsKt)} kt`
	];
}

function esc(s: string): string {
	return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** HTML for a data block; `color` is the aircraft's colour (accent / ink). */
export function dataBlockHtml(d: DataBlockInput, color: string): string {
	const [l1, l2, l3] = dataBlockLines(d);
	const time = d.time ? `<div class="db-time">${esc(d.time)}</div>` : '';
	const owner = d.aircraft?.ownerName ? `<span>Registered to ${esc(d.aircraft.ownerName)}</span>` : '';
	const location = d.aircraft?.ownerLocation ? `<span>${esc(d.aircraft.ownerLocation)}</span>` : '';
	const identity = d.aircraft
		? `<span class="db-identity"><a href="${esc(d.aircraft.href)}">${esc(l1)}</a><span class="db-aircraft-popover" role="tooltip"><strong>${esc(d.aircraft.registration)} · ${esc(d.aircraft.description)}</strong>${owner}${location}${d.aircraft.asOf ? `<span class="as-of">FAA registry · ${esc(d.aircraft.asOf)}</span>` : ''}</span></span>`
		: esc(l1);
	return `<div class="datablock" style="--db-color:${color}"><div class="db-id">${identity}</div><div class="db-atc">${esc(l2)}</div><div class="db-plain">${esc(l3)}</div>${time}</div>`;
}

/** Vertical trend from a vertical speed in ft/s; below ±1.5 ft/s (~±100 fpm) counts as level. */
export function trendOf(vsFtPerSec: number | undefined | null): number {
	if (vsFtPerSec == null || !Number.isFinite(vsFtPerSec)) return 0;
	return vsFtPerSec > 1.5 ? 1 : vsFtPerSec < -1.5 ? -1 : 0;
}
