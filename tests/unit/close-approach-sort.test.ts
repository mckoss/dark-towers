import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOSE_APPROACH_SORT, airlineShareLabel, closenessScore, isCloseApproachSort, sortCloseApproaches, sortNightIncidents, type SortableCloseApproach } from '$lib/close-approach-sort';

const row = (id: string, over: Partial<SortableCloseApproach> = {}): SortableCloseApproach => ({
	id,
	airportCode: 'PAE',
	night: '2026-08-17',
	t: 1,
	lateralNm: 1,
	verticalFt: 500,
	...over
});

describe('close-approach sorting', () => {
	it('combines lateral and vertical separation as physical straight-line proximity', () => {
		expect(closenessScore(row('lateral', { lateralNm: 1, verticalFt: 0 }))).toBe(1);
		expect(closenessScore(row('vertical', { lateralNm: 0, verticalFt: 6076.12 }))).toBe(1);
	});

	it('defaults to absolute closeness across airports and dates', () => {
		const rows = [row('far', { lateralNm: 2, verticalFt: 700 }), row('closest', { airportCode: 'BLI', night: '2026-08-15', lateralNm: 0.2, verticalFt: 100 })];
		expect(sortCloseApproaches(rows, 'closest').map((r) => r.id)).toEqual(['closest', 'far']);
	});

	it('sorts groups by airport or newest date, then by closeness within each group', () => {
		const rows = [
			row('pae-far', { lateralNm: 2 }),
			row('bli-far', { airportCode: 'BLI', lateralNm: 2 }),
			row('pae-close', { lateralNm: 0.2 }),
			row('bli-close', { airportCode: 'BLI', lateralNm: 0.2 }),
			row('older-close', { airportCode: 'YKM', night: '2026-08-16', lateralNm: 0.1 })
		];
		expect(sortCloseApproaches(rows, 'airport').map((r) => r.id)).toEqual(['bli-close', 'bli-far', 'pae-close', 'pae-far', 'older-close']);
		expect(sortCloseApproaches(rows, 'date').map((r) => r.id)).toEqual(['bli-close', 'pae-close', 'bli-far', 'pae-far', 'older-close']);
	});

	it('puts every passenger-airline event ahead of every private-only one, closest within each group', () => {
		const rows = [
			row('private-closest', { lateralNm: 0.1, verticalFt: 50 }),
			row('airline-far', { lateralNm: 2.8, verticalFt: 900, airlineInvolved: true }),
			row('private-near', { lateralNm: 0.4, verticalFt: 100 }),
			row('airline-close', { lateralNm: 0.8, verticalFt: 200, airlineInvolved: true })
		];
		expect(sortCloseApproaches(rows, 'airliner').map((r) => r.id)).toEqual(['airline-close', 'airline-far', 'private-closest', 'private-near']);
		// Choosing "Closest" must still mean closest — airline involvement is ignored there.
		expect(sortCloseApproaches(rows, 'closest').map((r) => r.id)).toEqual(['private-closest', 'private-near', 'airline-close', 'airline-far']);
	});

	it('is the default sort, and only recognises the four real modes', () => {
		expect(DEFAULT_CLOSE_APPROACH_SORT).toBe('airliner');
		for (const mode of ['airliner', 'closest', 'airport', 'date']) expect(isCloseApproachSort(mode)).toBe(true);
		for (const bad of ['', 'nearest', null, undefined, 42]) expect(isCloseApproachSort(bad)).toBe(false);
	});

	it('orders a night airliner-first then chronologically, for the card list', () => {
		const night = [
			{ id: 'private-early', t: 100 },
			{ id: 'airline-late', t: 300, airlineInvolved: true },
			{ id: 'private-late', t: 400 },
			{ id: 'airline-early', t: 200, airlineInvolved: true }
		];
		expect(sortNightIncidents(night).map((r) => r.id)).toEqual(['airline-early', 'airline-late', 'private-early', 'private-late']);
	});

	it('writes the airline share phrase in one place, in plain language', () => {
		expect(airlineShareLabel(3)).toBe('3 with a passenger airline');
		expect(airlineShareLabel(1000)).toBe('1,000 with a passenger airline');
	});
});
