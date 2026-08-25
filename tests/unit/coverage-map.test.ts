import { describe, expect, it } from 'vitest';
import { COVERAGE_ALERT, COVERAGE_GREY, COVERAGE_HIT_RADIUS_MIN, TRACKING_RADIUS_MAX, coverageMarkerStyle, trackingRadius } from '../../src/lib/coverage-map';

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

	it('shrinks non-tracked dots without shrinking their interaction target', () => {
		const requested = coverageMarkerStyle('requested', 0, false);
		const available = coverageMarkerStyle('available', 0, false);
		expect(requested.radius).toBeLessThan(6);
		expect(available.radius).toBeLessThan(requested.radius);
		expect(requested.hitRadius).toBe(COVERAGE_HIT_RADIUS_MIN);
		expect(available.hitRadius).toBe(COVERAGE_HIT_RADIUS_MIN);
	});
});
