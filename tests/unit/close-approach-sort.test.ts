import { describe, expect, it } from 'vitest';
import { closenessScore, sortCloseApproaches, type SortableCloseApproach } from '$lib/close-approach-sort';

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
});
