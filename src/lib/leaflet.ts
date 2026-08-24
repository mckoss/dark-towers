/**
 * Shared Leaflet base map for the flight-path map and the replay.
 * Browser-only: import dynamically or from onMount.
 *
 * Tiles come from CARTO `light_all` (NOT tile.openstreetmap.org, which 403s
 * non-browser origins). With `tiles: 'off'` the map draws 2/5/10 NM range
 * rings on the plain ground instead.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { destination, type LatLon } from './geo';
import { runwayOutline } from './runways';
import type { Runway } from './types';

export const TOKENS = {
	ground: '#f3f2f2',
	groundAlt: '#eae9e9',
	ink: '#201e1d',
	ink25: '#bab6b6',
	accent: '#ec3013',
	accentText: '#ae1800',
	runway: '#f0a500',
	runwayEdge: '#5d3c00'
};

export interface BaseMapOptions {
	tiles?: 'carto' | 'off';
	radiusNm?: number;
	interactive?: boolean;
	/** FAA physical runway geometry to draw above the base tiles. */
	runways?: Runway[];
}

export interface BaseMap {
	map: L.Map;
	/** Circle polygon points of the outer ring, handy for fitting. */
	ringBounds: L.LatLngBounds;
	destroy(): void;
}

/** A polygon approximating a geodesic circle (Leaflet's L.circle is fine too, but this fits bounds exactly). */
export function ringLatLngs(center: LatLon, radiusNm: number, n = 72): L.LatLngExpression[] {
	const pts: L.LatLngExpression[] = [];
	for (let i = 0; i < n; i++) {
		const [lat, lon] = destination(center, (360 * i) / n, radiusNm);
		pts.push([lat, lon]);
	}
	return pts;
}

export function createBaseMap(el: HTMLElement, center: LatLon, opts: BaseMapOptions = {}): BaseMap {
	const radiusNm = opts.radiusNm ?? 10;
	const interactive = opts.interactive ?? true;
	const map = L.map(el, {
		zoomControl: interactive,
		attributionControl: opts.tiles !== 'off',
		dragging: interactive,
		scrollWheelZoom: false,
		doubleClickZoom: interactive,
		touchZoom: interactive,
		boxZoom: false,
		keyboard: interactive
	});
	if (opts.tiles !== 'off') {
		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution: '© OpenStreetMap contributors, © CARTO',
			subdomains: 'abcd',
			maxZoom: 18,
			opacity: 0.9
		}).addTo(map);
	} else {
		for (const r of [2, 5]) {
			L.polygon(ringLatLngs(center, r), { color: TOKENS.ink, weight: 1, opacity: 0.25, fill: false, interactive: false }).addTo(map);
		}
	}
	for (const runway of opts.runways ?? []) {
		L.polygon(runwayOutline(runway), {
			className: 'runway-surface',
			color: TOKENS.runwayEdge,
			weight: 2,
			opacity: 0.95,
			fillColor: TOKENS.runway,
			fillOpacity: 0.82,
			lineCap: 'square',
			lineJoin: 'miter',
			interactive: false
		}).addTo(map);
		for (const end of runway.ends) {
			const label = L.marker(end.pos, {
				icon: L.divIcon({ className: 'runway-end-label', html: '<span></span>', iconSize: [0, 0], iconAnchor: [0, 0] }),
				interactive: false,
				zIndexOffset: -900
			}).addTo(map);
			const span = label.getElement()?.querySelector('span');
			if (span) span.textContent = end.id;
		}
	}
	const ring = L.polygon(ringLatLngs(center, radiusNm), {
		color: TOKENS.ink,
		weight: 2,
		opacity: 0.6,
		fill: false,
		interactive: false
	}).addTo(map);
	// Field marker: small ink square.
	L.marker(center, {
		icon: L.divIcon({ className: 'field-marker', html: '<span></span>', iconSize: [10, 10], iconAnchor: [5, 5] }),
		interactive: false
	}).addTo(map);
	const ringBounds = ring.getBounds();
	map.fitBounds(ringBounds, { padding: [8, 8] });
	return {
		map,
		ringBounds,
		destroy() {
			map.remove();
		}
	};
}

export { L };
