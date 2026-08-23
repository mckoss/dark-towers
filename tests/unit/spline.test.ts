import { describe, expect, it } from 'vitest';
import { Spline, type TimedPoint } from '$lib/spline';

describe('Spline', () => {
	const wiggly: TimedPoint[] = [
		{ t: 0, v: [0, 0, 1000] },
		{ t: 10, v: [1, 2, 1100] },
		{ t: 25, v: [3, 1, 1250] },
		{ t: 30, v: [5, 4, 1300] },
		{ t: 60, v: [2, 6, 1600] }
	];

	it('passes through every input point', () => {
		const s = new Spline(wiggly);
		for (const p of wiggly) {
			const v = s.at(p.t)!;
			for (let i = 0; i < p.v.length; i++) expect(Math.abs(v[i] - p.v[i])).toBeLessThan(1e-9);
		}
	});

	it('is exactly linear for collinear, equally spaced points at constant speed', () => {
		const pts: TimedPoint[] = [0, 10, 20].map((t) => ({ t, v: [t * 0.3, -t * 0.1] }));
		const s = new Spline(pts);
		for (let t = 0; t <= 20; t += 0.5) {
			const v = s.at(t)!;
			expect(Math.abs(v[0] - t * 0.3)).toBeLessThan(1e-9);
			expect(Math.abs(v[1] + t * 0.1)).toBeLessThan(1e-9);
		}
	});

	it('stays on the line for constant-speed motion even with irregular spacing', () => {
		const pts: TimedPoint[] = [0, 7, 9, 30, 31, 45].map((t) => ({ t, v: [2 * t, 3 * t] }));
		const s = new Spline(pts);
		for (let t = 0; t <= 45; t += 0.25) {
			const v = s.at(t)!;
			expect(Math.abs(v[0] - 2 * t)).toBeLessThan(1e-9);
			expect(Math.abs(v[1] - 3 * t)).toBeLessThan(1e-9);
		}
	});

	it('velocityAt matches central finite differences of at()', () => {
		const s = new Spline(wiggly);
		const h = 1e-4;
		for (const t of [2, 9.9, 12, 20, 27, 29.5, 45, 59]) {
			const vel = s.velocityAt(t)!;
			const a = s.at(t - h)!,
				b = s.at(t + h)!;
			for (let i = 0; i < vel.length; i++) {
				const fd = (b[i] - a[i]) / (2 * h);
				expect(Math.abs(vel[i] - fd)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fd)));
			}
		}
	});

	it('clamps at() outside the span', () => {
		const s = new Spline(wiggly);
		expect(s.at(-100)).toEqual(wiggly[0].v);
		expect(s.at(1e6)).toEqual(wiggly[wiggly.length - 1].v);
	});

	it('handles empty, single-point and two-point tracks', () => {
		const empty = new Spline([]);
		expect(empty.at(5)).toBeNull();
		expect(empty.velocityAt(5)).toBeNull();
		expect(empty.svgPath()).toBe('');

		const one = new Spline([{ t: 5, v: [1, 2] }]);
		expect(one.at(0)).toEqual([1, 2]);
		expect(one.at(99)).toEqual([1, 2]);
		expect(one.velocityAt(5)).toBeNull();
		expect(one.svgPath()).toBe('M1.00,2.00');

		const two = new Spline([
			{ t: 0, v: [0, 0] },
			{ t: 10, v: [10, 0] }
		]);
		expect(two.at(5)![0]).toBeCloseTo(5, 9);
		expect(two.velocityAt(5)![0]).toBeCloseTo(1, 9);
	});

	it('svgPath starts with M and has one C per segment', () => {
		const s = new Spline(wiggly);
		const d = s.svgPath();
		expect(d.startsWith('M')).toBe(true);
		expect((d.match(/C/g) ?? []).length).toBe(wiggly.length - 1);
		expect(s.segments.length).toBe(wiggly.length - 1);
		// A projection is applied to all points.
		const flipped = s.svgPath((v) => [v[0] * 10, -v[1] * 10], 1);
		expect(flipped.startsWith('M0.0,-0.0') || flipped.startsWith('M0.0,0.0')).toBe(true);
		expect(flipped.endsWith('20.0,-60.0')).toBe(true);
	});

	it('reproduces a circular arc at midpoints to within 0.5% of the radius', () => {
		const R = 5;
		const pts: TimedPoint[] = [];
		for (let deg = 0; deg <= 180; deg += 10) {
			const a = (deg * Math.PI) / 180;
			pts.push({ t: deg, v: [R * Math.cos(a), R * Math.sin(a)] });
		}
		const s = new Spline(pts);
		let worst = 0;
		for (let deg = 5; deg < 180; deg += 10) {
			const [x, y] = s.at(deg)!;
			const a = (deg * Math.PI) / 180;
			// Radial error and error relative to the true point on the circle.
			worst = Math.max(worst, Math.abs(Math.hypot(x, y) - R), Math.hypot(x - R * Math.cos(a), y - R * Math.sin(a)));
		}
		expect(worst).toBeLessThan(0.005 * R);
	});

	it('keeps velocity continuous across segment joints', () => {
		const s = new Spline(wiggly);
		for (let i = 1; i < wiggly.length - 1; i++) {
			const t = wiggly[i].t;
			const before = s.velocityAt(t - 1e-7)!;
			const after = s.velocityAt(t + 1e-7)!;
			for (let k = 0; k < before.length; k++) expect(Math.abs(before[k] - after[k])).toBeLessThan(1e-3);
		}
	});
});
