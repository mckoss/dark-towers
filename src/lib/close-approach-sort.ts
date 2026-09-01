export type CloseApproachSort = 'airliner' | 'closest' | 'airport' | 'date';

/** The default: the site's argument is about airliners, so those events lead. */
export const DEFAULT_CLOSE_APPROACH_SORT: CloseApproachSort = 'airliner';

export function isCloseApproachSort(value: unknown): value is CloseApproachSort {
	return value === 'airliner' || value === 'closest' || value === 'airport' || value === 'date';
}

export interface SortableCloseApproach {
	id: string;
	airportCode: string;
	night: string;
	t: number;
	lateralNm: number;
	verticalFt: number;
	airlineInvolved?: boolean;
}

const FT_PER_NM = 6076.12;

/** Straight-line separation in nautical miles. Lower is closer. */
export function closenessScore(incident: Pick<SortableCloseApproach, 'lateralNm' | 'verticalFt'>): number {
	return Math.hypot(incident.lateralNm, incident.verticalFt / FT_PER_NM);
}

export function sortCloseApproaches<T extends SortableCloseApproach>(rows: T[], mode: CloseApproachSort): T[] {
	const byCloseness = (a: T, b: T) => closenessScore(a) - closenessScore(b) || b.t - a.t || a.id.localeCompare(b.id);
	const airlineFirst = (a: T, b: T) => Number(!!b.airlineInvolved) - Number(!!a.airlineInvolved);
	return [...rows].sort((a, b) => {
		if (mode === 'airport') return a.airportCode.localeCompare(b.airportCode) || byCloseness(a, b);
		if (mode === 'date') return b.night.localeCompare(a.night) || byCloseness(a, b);
		// 'airliner' puts every passenger-airline event ahead of every private-only one; 'closest'
		// stays pure proximity so the label keeps meaning what it says.
		if (mode === 'airliner') return airlineFirst(a, b) || byCloseness(a, b);
		return byCloseness(a, b);
	});
}

/** Airliner-involved first, then chronological — for the airport-night card list. */
export function sortNightIncidents<T extends { t: number; airlineInvolved?: boolean }>(rows: T[]): T[] {
	return [...rows].sort((a, b) => Number(!!b.airlineInvolved) - Number(!!a.airlineInvolved) || a.t - b.t);
}

/** "3 with a passenger airline" — the one place this phrase is written. */
export function airlineShareLabel(airline: number): string {
	return `${airline.toLocaleString('en-US')} with a passenger airline`;
}
