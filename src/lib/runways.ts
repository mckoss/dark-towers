import { bearing, destination, type LatLon } from './geo';
import type { Runway } from './types';

const FEET_PER_NM = 6076.12;

/** Geographic runway rectangle using FAA physical endpoints and declared width. */
export function runwayOutline(runway: Runway): LatLon[] {
	const [a, b] = runway.ends.map((end) => end.pos) as [LatLon, LatLon];
	const heading = bearing(a, b);
	const halfWidthNm = runway.widthFt / FEET_PER_NM / 2;
	return [
		destination(a, heading - 90, halfWidthNm),
		destination(b, heading - 90, halfWidthNm),
		destination(b, heading + 90, halfWidthNm),
		destination(a, heading + 90, halfWidthNm)
	];
}
