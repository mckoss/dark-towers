/**
 * Web Mercator tile arithmetic, shared by the tile cache, the PDF report and
 * the /admin cache view. Client-safe: no node, no pdf-lib.
 */
import { fromLocalNm, type LatLon } from './geo';
import { AIRSPACE_RADIUS_NM } from './airports';

export const TILE_ATTRIBUTION = '© OpenStreetMap contributors, © CARTO';

/**
 * The live map reads tiles through our own cache. Uncached tiles redirect
 * upstream, so panning still works before the cache is warm.
 */
export const TILE_PROXY_URL = '/tiles/{z}/{x}/{y}.png';

/**
 * CARTO direct, as the map used before the cache existed. Requests from a
 * browser on the site's own origin come back clean; a keyless server-side fetch
 * comes back stamped "API KEY REQUIRED", which is why warming runs either in an
 * admin's browser or through a keyed `tile_url`.
 */
export const TILE_DIRECT_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

/** Fill `{s}/{z}/{x}/{y}` in a Leaflet-style template. */
export function fillTileUrl(template: string, z: number, x: number, y: number): string {
	return template
		.replace('{s}', 'abcd'[Math.abs(x + y) % 4])
		.replace('{z}', String(z))
		.replace('{x}', String(x))
		.replace('{y}', String(y))
		.replace('{r}', '');
}

export const TILE_PX = 256;
const MIN_Z = 1;
const MAX_Z = 19;
/** Cap per view, so warming one airport can never fan out into a huge fetch. */
export const MAX_TILES_PER_VIEW = 30;

/** The chart scales the PDF report draws. The close-up is what makes pattern work legible. */
export interface MapView {
	/** Identifier used in cache bookkeeping. */
	key: string;
	/** Half-extent of the square frame, in nautical miles. */
	halfNm: number;
	/** Range ring to draw, in nautical miles; 0 for none. */
	ring: number;
	caption: string;
}

export const MAP_VIEWS: MapView[] = [
	{ key: 'wide', halfNm: AIRSPACE_RADIUS_NM * 1.06, ring: AIRSPACE_RADIUS_NM, caption: `Within ${AIRSPACE_RADIUS_NM} nautical miles` },
	// No ring on the close-up: at this scale it reads as a boundary that means
	// something, and it does not.
	{ key: 'field', halfNm: 2, ring: 0, caption: 'Within 2 nautical miles of the field' }
];

export const lonToTileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const latToTileY = (lat: number, z: number) => {
	const s = Math.sin((lat * Math.PI) / 180);
	return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
export const tileXToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileYToLat = (y: number, z: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z));

/** Geographic box of a square map `halfNm` on each side of `center`. */
export function mapBounds(center: LatLon, halfNm: number) {
	const [north, east] = fromLocalNm(center, [halfNm, halfNm]);
	const [south, west] = fromLocalNm(center, [-halfNm, -halfNm]);
	return { north, south, east, west };
}

export interface TileRef {
	z: number;
	x: number;
	y: number;
	/** Geographic box this tile covers, for placing it in the report's projection. */
	north: number;
	south: number;
	west: number;
	east: number;
}

/**
 * Every tile covering a view, at the most detailed zoom that still fits the
 * budget — which leaves the tiles oversampled against the printed points, and
 * so sharp on paper.
 */
export function tilesForView(center: LatLon, halfNm: number, maxTiles = MAX_TILES_PER_VIEW): TileRef[] {
	const bounds = mapBounds(center, halfNm);
	for (let z = MAX_Z; z >= MIN_Z; z--) {
		const x0 = Math.floor(lonToTileX(bounds.west, z));
		const x1 = Math.floor(lonToTileX(bounds.east, z));
		const y0 = Math.floor(latToTileY(bounds.north, z));
		const y1 = Math.floor(latToTileY(bounds.south, z));
		if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles) continue;
		const tiles: TileRef[] = [];
		for (let x = x0; x <= x1; x++) {
			for (let y = y0; y <= y1; y++) {
				tiles.push({
					z,
					x,
					y,
					north: tileYToLat(y, z),
					south: tileYToLat(y + 1, z),
					west: tileXToLon(x, z),
					east: tileXToLon(x + 1, z)
				});
			}
		}
		return tiles;
	}
	return [];
}
