import type { CoverageStatus } from '$lib/server/queries';
import type { AirportKind } from '$lib/types';

export const COVERAGE_GREY = '#737675';
export const COVERAGE_ALERT = '#dc3e27';
export const TRACKING_RADIUS_MAX = 18;
export const COVERAGE_HIT_RADIUS_MIN = 9;

interface Rectangle {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Pixel adjustment that keeps an overlay fully inside its container. */
export function coverageOverlayOffset(container: Rectangle, overlay: Rectangle, padding = 8): { x: number; y: number } {
	const minLeft = container.left + padding;
	const maxRight = container.right - padding;
	const minTop = container.top + padding;
	const maxBottom = container.bottom - padding;
	return {
		x: overlay.left < minLeft ? minLeft - overlay.left : overlay.right > maxRight ? maxRight - overlay.right : 0,
		y: overlay.top < minTop ? minTop - overlay.top : overlay.bottom > maxBottom ? maxBottom - overlay.bottom : 0
	};
}

/** Logarithmic operation scaling prevents a high-volume airport dominating the map. */
export function trackingRadius(operations: number): number {
	const radius = 6 + Math.log1p(Math.max(0, operations)) * 1.6;
	return Math.min(TRACKING_RADIUS_MAX, radius);
}

export function coverageMarkerStyle(status: CoverageStatus, operations: number, veryClose: boolean, kind: AirportKind = 'dark') {
	const radius = status === 'tracking' ? trackingRadius(operations) : status === 'requested' ? 3 : 2;
	return {
		radius,
		hitRadius: Math.max(COVERAGE_HIT_RADIUS_MIN, radius),
		color: veryClose ? COVERAGE_ALERT : COVERAGE_GREY,
		weight: status === 'tracking' ? 2 : 1,
		opacity: status === 'tracking' ? 1 : 0.72,
		// A reference airport is drawn hollow and dashed: watched, but not one of the dark towers.
		fillOpacity: kind === 'reference' ? 0.12 : status === 'tracking' ? 0.48 : 0.3,
		dashArray: kind === 'reference' ? '3 3' : undefined
	};
}
