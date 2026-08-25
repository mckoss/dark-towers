import type { CoverageStatus } from '$lib/server/queries';

export const COVERAGE_GREY = '#737675';
export const COVERAGE_ALERT = '#dc3e27';
export const TRACKING_RADIUS_MAX = 18;
export const COVERAGE_HIT_RADIUS_MIN = 9;

/** Logarithmic operation scaling prevents a high-volume airport dominating the map. */
export function trackingRadius(operations: number): number {
	const radius = 6 + Math.log1p(Math.max(0, operations)) * 1.6;
	return Math.min(TRACKING_RADIUS_MAX, radius);
}

export function coverageMarkerStyle(status: CoverageStatus, operations: number, veryClose: boolean) {
	const radius = status === 'tracking' ? trackingRadius(operations) : status === 'requested' ? 3 : 2;
	return {
		radius,
		hitRadius: Math.max(COVERAGE_HIT_RADIUS_MIN, radius),
		color: veryClose ? COVERAGE_ALERT : COVERAGE_GREY,
		weight: status === 'tracking' ? 2 : 1,
		opacity: status === 'tracking' ? 1 : 0.72,
		fillOpacity: status === 'tracking' ? 0.48 : 0.3
	};
}
