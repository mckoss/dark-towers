import { describe, expect, it } from 'vitest';
import { fromLocalNm } from '$lib/geo';
import { findWakeIncidents, wakeMinimum } from '$lib/wake';
import type { Flight, Position, WakeCategory } from '$lib/types';
const O: [number, number] = [47.9079, -122.2816], T = Date.UTC(2026, 7, 15, 5);
function flight(id: string, type: string | null, delay: number): Flight {
	const positions: Position[] = [];
	for (let s = 0; s <= 360; s += 10) { const e = -9 + s / 20; const p = fromLocalNm(O, [e, 0]); positions.push({ t: T + delay + s * 1000, lat: p[0], lon: p[1], alt: 2000, gs: 180, hdg: 90, dist: Math.abs(e) }); }
	return { id, airport: 'KPAE', night: '2026-08-14', ident: id, tail: id, type, category: 'private', operator: null, operatorName: null, operatorShort: null, direction: 'arrival', eventTime: T + delay, otherCode: null, otherName: null, otherCity: null, positions };
}
const cats = new Map<string, WakeCategory>([['B744', 'B'], ['C172', 'I']]);
describe('FAA CWT wake detection', () => {
	it('uses the current approach matrix', () => { expect(wakeMinimum('B', 'I', true)).toBe(6); expect(wakeMinimum('E', 'I', true)).toBe(4); expect(wakeMinimum('F', 'I', false)).toBeNull(); });
	it('flags a small arrival six NM or less in trail of an upper-heavy arrival', () => {
		const event = findWakeIncidents(O, 'KPAE', '2026-08-14', [flight('heavy', 'B744', 0), flight('small', 'C172', 60_000)], cats);
		expect(event).toHaveLength(1); expect(event[0]).toMatchObject({ kind: 'wake-turbulence', flightA: 'heavy', flightB: 'small', requiredNm: 6, leaderCategory: 'B', followerCategory: 'I' });
	});
	it('never treats an unknown aircraft as a wake-producing leader', () => { expect(findWakeIncidents(O, 'KPAE', '2026-08-14', [flight('unknown', null, 0), flight('small', 'C172', 60_000)], cats)).toEqual([]); });
});
