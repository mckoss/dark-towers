import { describe, expect, it } from 'vitest';
import { altimeterAt, correctionAt, groundOffsetFt, offsetAt, onFieldPoints, parseAsosCsv, pressureOffsetFt } from '../../src/lib/altimeter';
import { closestApproach } from '../../src/lib/separation';
import { Spline } from '../../src/lib/spline';

describe('pressureOffsetFt', () => {
	it('is zero at standard pressure and ~1,000 ft per inch', () => {
		expect(pressureOffsetFt(29.92126)).toBeCloseTo(0, 3);
		expect(pressureOffsetFt(28.92)).toBeGreaterThan(900);
		expect(pressureOffsetFt(28.92)).toBeLessThan(1000);
		// High pressure: aircraft read low, so the offset to subtract is negative.
		expect(pressureOffsetFt(30.17)).toBeCloseTo(-229, 0);
	});
});

describe('altimeterAt / offsetAt', () => {
	const readings: [number, number][] = [
		[0, 30.0],
		[3600_000, 30.1],
		[7200_000, 29.9]
	];
	it('interpolates between readings and clamps outside', () => {
		expect(altimeterAt(readings, -10)).toBe(30.0);
		expect(altimeterAt(readings, 1800_000)).toBeCloseTo(30.05, 6);
		expect(altimeterAt(readings, 5400_000)).toBeCloseTo(30.0, 6);
		expect(altimeterAt(readings, 99_999_999)).toBe(29.9);
		expect(altimeterAt([], 0)).toBeNull();
		expect(altimeterAt(null, 0)).toBeNull();
	});
	it('offset is zero without readings', () => {
		expect(offsetAt(null, 0)).toBe(0);
		// 30.17 → reported reads ~229 ft low.
		expect(offsetAt([[0, 30.17]], 0)).toBeCloseTo(-229, 0);
	});
});

describe('parseAsosCsv', () => {
	it('parses station,valid,alti rows in UTC and skips junk', () => {
		const csv = 'station,valid,alti\nPAE,2026-08-17 00:53,30.17\nPAE,2026-08-17 01:53,M\nPAE,2026-08-17 02:53,30.15\n';
		const r = parseAsosCsv(csv);
		expect(r).toEqual([
			[Date.parse('2026-08-17T00:53:00Z'), 30.17],
			[Date.parse('2026-08-17T02:53:00Z'), 30.15]
		]);
	});
});

describe('groundOffsetFt', () => {
	const track = (low: number, dist = 0.5) => ({ positions: [{ alt: low + 1000, dist: 5 }, { alt: low, dist }] });
	it('takes the 25th percentile of per-track minima near the field', () => {
		const tracks = [track(400), track(500), track(500), track(500), track(600), track(600), track(700), track(1200, 3)];
		const r = groundOffsetFt(tracks, 607);
		expect(r).toEqual({ offsetFt: 500 - 607, tracks: 7 });
	});
	it('needs enough tracks', () => {
		expect(groundOffsetFt([track(500), track(500)], 607)).toBeNull();
	});
});

describe('closestApproach with altOffset', () => {
	// Two aircraft level at reported 900 ft over a 607 ft field, 1 NM apart.
	const pts = (east: number, alt: number) =>
		Array.from({ length: 60 }, (_, i) => ({ t: i * 1000, v: [east, i * 0.01, alt, 120] }));
	it('excludes a pair that is on the ground once the pressure correction is applied', () => {
		const a = new Spline(pts(0, 900)),
			b = new Spline(pts(1, 900));
		// Raw: 293 ft AGL → airborne → flagged.
		expect(closestApproach(a, b, { elevationFt: 607 })).not.toBeNull();
		// Low pressure night: aircraft read 300 ft high → really on the ground → excluded.
		expect(closestApproach(a, b, { elevationFt: 607, altOffset: () => 300 })).toBeNull();
	});
});

describe('onFieldPoints / correctionAt', () => {
	const H = 3600_000;
	const rep = (t: number, alt: number, gs = 20, dist = 0.3) => ({ positions: [{ t, alt, gs, dist }] });
	it('collects slow on-field reports as [t, offset]', () => {
		const pts = onFieldPoints([rep(2 * H, 600), rep(H, 500), rep(3 * H, 500, 120), rep(4 * H, 500, 20, 5)], 607);
		expect(pts).toEqual([
			[H, -107],
			[2 * H, -7]
		]);
	});
	it('uses on-field reports within an hour, else weather, else tracks', () => {
		const c = { readings: [[0, 30.0]] as [number, number][], onField: [[H, -107], [2 * H, -7], [2 * H + 1, 93]] as [number, number][], tracksOffsetFt: -50 };
		// Within an hour of t=2H: three reports → median.
		expect(correctionAt(c, 2 * H)).toEqual({ offsetFt: -7, source: 'on-field', points: 3 });
		// Only the first report is within an hour of t=0.5H... no: t=0 → report at H is exactly 1 h away → counts.
		expect(correctionAt(c, 0)).toEqual({ offsetFt: -107, source: 'on-field', points: 1 });
		// Nothing within an hour → weather.
		const w = correctionAt(c, 10 * H);
		expect(w.source).toBe('weather');
		expect(w.offsetFt).toBeCloseTo(pressureOffsetFt(30.0), 6);
		expect(correctionAt({ readings: [], onField: [], tracksOffsetFt: -50 }, 0)).toEqual({ offsetFt: -50, source: 'tracks', points: 0 });
		expect(correctionAt({ readings: null, onField: null, tracksOffsetFt: null }, 0).source).toBe('none');
		expect(correctionAt(null, 0).offsetFt).toBe(0);
	});
});
