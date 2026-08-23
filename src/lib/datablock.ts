/**
 * ATC-style data block: what a controller's scope shows beside a target.
 *   line 1  callsign / friendly label
 *   line 2  altitude (hundreds of feet, three digits; above the field unless the reader chose reported) · climb/descent arrow · groundspeed (knots)
 * A third, plain-language line spells the same out for everyone else.
 */
export interface DataBlockInput {
	label: string;
	/** Feet, already in the unit named by `altUnit`. */
	altFt: number;
	/** Suffix for the plain-language line: "AGL" (default; above ground level, i.e. the field) or "reported". */
	altUnit?: string;
	/** Knots. */
	gsKt: number;
	/** Vertical rate sign: 1 climbing, -1 descending, 0 level/unknown. */
	trend?: number;
}

export function altitudeHundreds(altFt: number): string {
	return String(Math.max(0, Math.round(altFt / 100))).padStart(3, '0');
}

export function trendArrow(trend: number | undefined): string {
	return trend === undefined || trend === 0 ? '' : trend > 0 ? '↑' : '↓';
}

export function dataBlockLines(d: DataBlockInput): [string, string, string] {
	const arrow = trendArrow(d.trend);
	return [
		d.label,
		`${altitudeHundreds(d.altFt)}${arrow} ${String(Math.round(d.gsKt)).padStart(3, ' ')}`,
		`${Math.round(d.altFt).toLocaleString('en-US')} ft ${d.altUnit ?? 'AGL'}${arrow ? ' ' + arrow : ''} · ${Math.round(d.gsKt)} kt`
	];
}

function esc(s: string): string {
	return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** HTML for a data block; `color` is the aircraft's colour (accent / ink). */
export function dataBlockHtml(d: DataBlockInput, color: string): string {
	const [l1, l2, l3] = dataBlockLines(d);
	return `<div class="datablock" style="--db-color:${color}"><div class="db-id">${esc(l1)}</div><div class="db-atc">${esc(l2)}</div><div class="db-plain">${esc(l3)}</div></div>`;
}

/** Vertical trend from a vertical speed in ft/s; below ±1.5 ft/s (~±100 fpm) counts as level. */
export function trendOf(vsFtPerSec: number | undefined | null): number {
	if (vsFtPerSec == null || !Number.isFinite(vsFtPerSec)) return 0;
	return vsFtPerSec > 1.5 ? 1 : vsFtPerSec < -1.5 ? -1 : 0;
}
