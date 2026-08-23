import { describe, expect, it } from 'vitest';
import { bearing, destination, distanceNm, fromLocalNm, toLocalNm, type LatLon } from '$lib/geo';

const KPAE: LatLon = [47.9079, -122.2816];
const KBLI: LatLon = [48.7929, -122.5375];

describe('distanceNm', () => {
	it('KPAE → KBLI is about 54 NM', () => {
		const d = distanceNm(KPAE, KBLI);
		expect(Math.abs(d - 54)).toBeLessThan(1);
	});
	it('is symmetric and zero to itself', () => {
		expect(distanceNm(KPAE, KBLI)).toBeCloseTo(distanceNm(KBLI, KPAE), 10);
		expect(distanceNm(KPAE, KPAE)).toBe(0);
	});
	it('one degree of latitude is 60 NM', () => {
		expect(distanceNm([0, 0], [1, 0])).toBeCloseTo(60.04, 1);
	});
});

describe('bearing', () => {
	it('is 0 due north and 90 due east', () => {
		expect(bearing([47, -122], [48, -122])).toBeCloseTo(0, 6);
		expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 6);
	});
	it('is 180 due south and 270 due west', () => {
		expect(bearing([48, -122], [47, -122])).toBeCloseTo(180, 6);
		expect(bearing([0, 1], [0, 0])).toBeCloseTo(270, 6);
	});
	it('KPAE → KBLI is roughly north-north-west', () => {
		const b = bearing(KPAE, KBLI);
		expect(b).toBeGreaterThan(340);
		expect(b).toBeLessThan(355);
	});
});

describe('destination', () => {
	it('round-trips with distanceNm and bearing', () => {
		for (const brg of [0, 45, 137, 250, 359]) {
			const p = destination(KPAE, brg, 7.5);
			expect(distanceNm(KPAE, p)).toBeCloseTo(7.5, 6);
			expect(bearing(KPAE, p)).toBeCloseTo(brg, 4);
		}
	});
});

describe('toLocalNm / fromLocalNm', () => {
	it('round-trips within 1e-6 degrees', () => {
		for (const p of [KPAE, [47.95, -122.1], [47.8, -122.45], [48.05, -122.3]] as LatLon[]) {
			const back = fromLocalNm(KPAE, toLocalNm(KPAE, p));
			expect(Math.abs(back[0] - p[0])).toBeLessThan(1e-6);
			expect(Math.abs(back[1] - p[1])).toBeLessThan(1e-6);
		}
	});
	it('puts the origin at [0,0] and orients east/north', () => {
		expect(toLocalNm(KPAE, KPAE)).toEqual([0, 0]);
		const [e, n] = toLocalNm(KPAE, destination(KPAE, 0, 5));
		expect(Math.abs(e)).toBeLessThan(0.01);
		expect(n).toBeCloseTo(5, 2);
		const [e2, n2] = toLocalNm(KPAE, destination(KPAE, 90, 5));
		expect(e2).toBeCloseTo(5, 2);
		expect(Math.abs(n2)).toBeLessThan(0.01);
	});
	it('agrees with distanceNm within 0.5% inside 10 NM', () => {
		for (let brg = 0; brg < 360; brg += 30) {
			for (const nm of [1, 5, 9.9]) {
				const p = destination(KPAE, brg, nm);
				const [e, n] = toLocalNm(KPAE, p);
				const flat = Math.hypot(e, n);
				const great = distanceNm(KPAE, p);
				expect(Math.abs(flat - great) / great).toBeLessThan(0.005);
			}
		}
	});
});
