/** Great-circle helpers. All distances in nautical miles, angles in degrees. */

export const EARTH_RADIUS_NM = 3440.065;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = [number, number];

export function distanceNm(a: LatLon, b: LatLon): number {
	const p1 = rad(a[0]),
		p2 = rad(b[0]);
	const dp = rad(b[0] - a[0]),
		dl = rad(b[1] - a[1]);
	const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
	return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Initial bearing from a to b, 0–360. */
export function bearing(a: LatLon, b: LatLon): number {
	const p1 = rad(a[0]),
		p2 = rad(b[0]),
		dl = rad(b[1] - a[1]);
	const y = Math.sin(dl) * Math.cos(p2);
	const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
	return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `nm` away from `from` along `brg`. */
export function destination(from: LatLon, brg: number, nm: number): LatLon {
	const d = nm / EARTH_RADIUS_NM,
		b = rad(brg),
		p1 = rad(from[0]),
		l1 = rad(from[1]);
	const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
	const l2 =
		l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
	return [deg(p2), deg(l2)];
}

/** Local flat-earth projection around an origin: returns [east, north] in NM. Good to <0.1% inside 10 NM. */
export function toLocalNm(origin: LatLon, p: LatLon): [number, number] {
	const kLat = (Math.PI / 180) * EARTH_RADIUS_NM;
	const kLon = kLat * Math.cos(rad(origin[0]));
	return [(p[1] - origin[1]) * kLon, (p[0] - origin[0]) * kLat];
}

export function fromLocalNm(origin: LatLon, en: [number, number]): LatLon {
	const kLat = (Math.PI / 180) * EARTH_RADIUS_NM;
	const kLon = kLat * Math.cos(rad(origin[0]));
	return [origin[0] + en[1] / kLat, origin[1] + en[0] / kLon];
}
