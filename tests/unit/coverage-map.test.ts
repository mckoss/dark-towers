import { describe, expect, it } from 'vitest';
import { COVERAGE_ALERT, COVERAGE_GREY, COVERAGE_HIT_RADIUS_MIN, TRACKING_RADIUS_MAX, coverageMarkerStyle, coverageOverlayOffset, trackingRadius } from '../../src/lib/coverage-map';

describe('coverage map marker sizing', () => {
	it('uses a capped logarithmic scale for tracked airport operations', () => {
		expect(trackingRadius(0)).toBe(6);
		expect(trackingRadius(100)).toBeGreaterThan(trackingRadius(10));
		expect(trackingRadius(100) - trackingRadius(10)).toBeLessThan(trackingRadius(10) - trackingRadius(0));
		expect(trackingRadius(1_000_000)).toBe(TRACKING_RADIUS_MAX);
	});

	it('uses red only for airports with a very-close event', () => {
		expect(coverageMarkerStyle('tracking', 100, true).color).toBe(COVERAGE_ALERT);
		expect(coverageMarkerStyle('tracking', 100, false).color).toBe(COVERAGE_GREY);
		expect(coverageMarkerStyle('requested', 0, false).color).toBe(COVERAGE_GREY);
		expect(coverageMarkerStyle('available', 0, false).color).toBe(COVERAGE_GREY);
	});

	it('draws a reference airport hollow and dashed, at full tracked size', () => {
		const dark = coverageMarkerStyle('tracking', 100, false);
		const reference = coverageMarkerStyle('tracking', 100, false, 'reference');
		expect(reference.radius).toBe(dark.radius);
		expect(reference.dashArray).toBe('3 3');
		expect(dark.dashArray).toBeUndefined();
		expect(reference.fillOpacity).toBeLessThan(dark.fillOpacity);
	});

	it('shrinks non-tracked dots without shrinking their interaction target', () => {
		const requested = coverageMarkerStyle('requested', 0, false);
		const available = coverageMarkerStyle('available', 0, false);
		expect(requested.radius).toBeLessThan(6);
		expect(available.radius).toBeLessThan(requested.radius);
		expect(requested.hitRadius).toBe(COVERAGE_HIT_RADIUS_MIN);
		expect(available.hitRadius).toBe(COVERAGE_HIT_RADIUS_MIN);
	});
});

describe('coverage map overlay placement', () => {
	const container = { left: 100, top: 50, right: 500, bottom: 350 };

	it('leaves a fully visible airport card in place', () => {
		expect(coverageOverlayOffset(container, { left: 200, top: 100, right: 400, bottom: 220 })).toEqual({ x: 0, y: 0 });
	});

	it('shifts airport cards inward at every display edge', () => {
		expect(coverageOverlayOffset(container, { left: 90, top: 100, right: 290, bottom: 220 })).toEqual({ x: 18, y: 0 });
		expect(coverageOverlayOffset(container, { left: 350, top: 100, right: 510, bottom: 220 })).toEqual({ x: -18, y: 0 });
		expect(coverageOverlayOffset(container, { left: 200, top: 40, right: 400, bottom: 160 })).toEqual({ x: 0, y: 18 });
		expect(coverageOverlayOffset(container, { left: 200, top: 240, right: 400, bottom: 360 })).toEqual({ x: 0, y: -18 });
	});
});
