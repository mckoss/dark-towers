export type CloseApproachSort = 'closest' | 'airport' | 'date';

export interface SortableCloseApproach {
	id: string;
	airportCode: string;
	night: string;
	t: number;
	lateralNm: number;
	verticalFt: number;
}

const FT_PER_NM = 6076.12;

/** Straight-line separation in nautical miles. Lower is closer. */
export function closenessScore(incident: Pick<SortableCloseApproach, 'lateralNm' | 'verticalFt'>): number {
	return Math.hypot(incident.lateralNm, incident.verticalFt / FT_PER_NM);
}

export function sortCloseApproaches<T extends SortableCloseApproach>(rows: T[], mode: CloseApproachSort): T[] {
	const byCloseness = (a: T, b: T) => closenessScore(a) - closenessScore(b) || b.t - a.t || a.id.localeCompare(b.id);
	return [...rows].sort((a, b) => {
		if (mode === 'airport') return a.airportCode.localeCompare(b.airportCode) || byCloseness(a, b);
		if (mode === 'date') return b.night.localeCompare(a.night) || byCloseness(a, b);
		return byCloseness(a, b);
	});
}
