<script lang="ts">
	/* Interactive national coverage map. Leaflet supplies pan, wheel/pinch/keyboard zoom and accessible controls. */
	import 'leaflet/dist/leaflet.css';
	import { onMount } from 'svelte';
	import { geoAlbersUsa } from 'd3-geo';
	import { feature } from 'topojson-client';
	import type { Topology, GeometryCollection } from 'topojson-specification';
	import type { FeatureCollection, Geometry } from 'geojson';
	import type { CoverageAirport } from '$lib/server/queries';
	import { coverageMarkerStyle, coverageOverlayOffset } from '$lib/coverage-map';
	import atlas from '$lib/data/us-atlas.json';

	interface Props { airports: CoverageAirport[]; }
	let { airports }: Props = $props();
	let mapEl: HTMLDivElement;
	let zoom = $state(0);

	const W = 960;
	const H = 560;
	const topo = atlas as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>;
	const states = feature(topo, topo.objects.states) as FeatureCollection<Geometry>;
	const projection = geoAlbersUsa().fitSize([W, H], states);
	// Draw the smallest dots last so their intentionally larger hit targets are
	// not swallowed by nearby high-volume tracked airports.
	const rank = { tracking: 0, requested: 1, available: 2 } as const;

	function details(airport: CoverageAirport): HTMLDivElement {
		const card = document.createElement('div');
		card.className = 'coverage-details';
		const title = document.createElement('strong');
		title.textContent = `${airport.code} · ${airport.name}`;
		const location = document.createElement('span');
		location.textContent = `${airport.city}, ${airport.state}`;
		const tower = document.createElement('span');
		tower.textContent = airport.towerLabel;
		const status = document.createElement('span');
		status.className = `coverage-status ${airport.status}`;
		status.textContent = airport.status === 'tracking' ? 'Tracking' : airport.status === 'requested' ? 'Requested — awaiting review' : 'Qualifies for tracking';
		card.append(title, location, tower, status);
		if (airport.status === 'tracking') {
			const activity = document.createElement('span');
			activity.textContent = `${airport.operations.toLocaleString('en-US')} operations in the last 30 days`;
			card.append(activity);
			if (airport.veryClose) {
				const alert = document.createElement('span');
				alert.className = 'coverage-alert';
				alert.textContent = 'Very close encounter recorded';
				card.append(alert);
			}
		}
		return card;
	}

	function popup(airport: CoverageAirport): HTMLDivElement {
		const card = details(airport);
		if (airport.status === 'requested') return card;
		const link = document.createElement('a');
		link.className = 'coverage-action';
		link.href = airport.status === 'tracking' ? `/airport/${airport.code}` : `/airports?request=${airport.code}#request-airport`;
		link.textContent = airport.status === 'tracking' ? 'View airport' : 'Request to add';
		card.append(link);
		return card;
	}

	onMount(() => {
		let disposed = false;
		let destroy: (() => void) | undefined;
		void import('leaflet').then(({ default: L }) => {
			if (disposed) return;
			const map = L.map(mapEl, {
				crs: L.CRS.Simple,
				minZoom: -2,
				attributionControl: false,
				zoomControl: true,
				doubleClickZoom: true,
				scrollWheelZoom: true,
				keyboard: true
			});
			const renderer = L.svg({ padding: 0.5 }).addTo(map);
			const coordsToLatLng = (coords: number[]) => {
				const point = projection([coords[0], coords[1]]) ?? [0, 0];
				return L.latLng(H - point[1], point[0]);
			};
			L.geoJSON(states, {
				coordsToLatLng,
				interactive: false,
				style: { renderer, color: '#201e1d', weight: 0.7, opacity: 0.34, fillColor: '#e7e5e4', fillOpacity: 1 }
			}).addTo(map);

			for (const airport of [...airports].sort((a, b) => rank[a.status] - rank[b.status])) {
				const point = projection([airport.pos[1], airport.pos[0]]);
				if (!point) continue;
				const style = coverageMarkerStyle(airport.status, airport.operations, airport.veryClose);
				const at: [number, number] = [H - point[1], point[0]];
				L.circleMarker(at, {
					renderer,
					radius: style.radius,
					color: style.color,
					weight: style.weight,
					opacity: style.opacity,
					fillColor: style.color,
					fillOpacity: style.fillOpacity,
					interactive: false,
					className: `coverage-dot ${airport.status}${airport.veryClose ? ' very-close' : ''}`
				}).addTo(map);
				// The transparent interaction target is intentionally larger than
				// small non-tracked dots, preserving accurate mouse and touch input.
				const marker = L.circleMarker(at, {
					renderer,
					radius: style.hitRadius,
					color: 'transparent',
					weight: 0,
					opacity: 0,
					fillColor: 'transparent',
					fillOpacity: 0,
					className: `coverage-marker ${airport.status}`
				});
				marker.bindTooltip(details(airport), { direction: 'top', offset: [0, -style.radius], className: 'coverage-tooltip' });
				marker.bindPopup(popup(airport), { closeButton: true, className: 'coverage-popup', offset: [0, -style.radius] });
				marker.on('tooltipopen', () => {
					const tooltip = marker.getTooltip()?.getElement();
					if (!tooltip) return;
					tooltip.style.marginLeft = '0px';
					tooltip.style.marginTop = '0px';
					requestAnimationFrame(() => {
						if (!tooltip.isConnected) return;
						const offset = coverageOverlayOffset(mapEl.getBoundingClientRect(), tooltip.getBoundingClientRect());
						tooltip.style.marginLeft = `${offset.x}px`;
						tooltip.style.marginTop = `${offset.y}px`;
						tooltip.style.setProperty('--coverage-arrow-shift-x', `${-offset.x}px`);
					});
				});
				marker.on('add', () => {
					const path = (marker as unknown as { _path?: SVGPathElement })._path;
					if (!path) return;
					path.dataset.code = airport.code;
					path.dataset.status = airport.status;
					path.dataset.radius = style.radius.toFixed(2);
					path.dataset.hitRadius = style.hitRadius.toFixed(2);
					path.style.pointerEvents = 'all';
					path.setAttribute('tabindex', '0');
					path.setAttribute('role', 'button');
					path.setAttribute('aria-label', `${airport.code}, ${airport.name}, ${airport.status}`);
					path.addEventListener('keydown', (event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						marker.openPopup();
					});
				});
				marker.addTo(map);
			}

			const bounds = L.latLngBounds([0, 0], [H, W]);
			map.fitBounds(bounds, { padding: [12, 12] });
			map.setMinZoom(map.getZoom());
			map.setMaxZoom(map.getZoom() + 6);
			zoom = map.getZoom();
			map.on('zoomend', () => { zoom = map.getZoom(); });
			destroy = () => map.remove();
		});
		return () => {
			disposed = true;
			destroy?.();
		};
	});
</script>

<div class="us-map" bind:this={mapEl} data-testid="us-map" data-zoom={zoom} aria-label="Interactive map of qualifying United States airports"></div>

<style>
	.us-map { width: 100%; height: 100%; min-height: 480px; border: 0; background: var(--ground) !important; }
	:global(.coverage-marker) { cursor: pointer; outline: none; }
	:global(.coverage-marker:focus) { stroke: var(--ink); stroke-opacity: 1; stroke-width: 2; }
	:global(.leaflet-tooltip.coverage-tooltip),
	:global(.leaflet-popup.coverage-popup .leaflet-popup-content-wrapper) {
		border: 1.5px solid var(--ink);
		border-radius: 0;
		background: var(--ground);
		box-shadow: 3px 3px 0 rgba(32, 30, 29, 0.22);
		color: var(--ink);
	}
	:global(.leaflet-tooltip.coverage-tooltip::before) { border-top-color: var(--ink); transform: translateX(var(--coverage-arrow-shift-x, 0)); }
	:global(.leaflet-popup.coverage-popup .leaflet-popup-tip) { background: var(--ground); }
	:global(.coverage-details) { display: flex; min-width: 190px; flex-direction: column; gap: 4px; font: 12px/1.35 var(--font); }
	:global(.coverage-details strong) { font-size: 13px; }
	:global(.coverage-status) { margin-top: 3px; font-weight: 750; text-transform: uppercase; letter-spacing: 0.06em; }
	:global(.coverage-status.tracking) { color: #a82d1d; }
	:global(.coverage-status.requested) { color: #315f82; }
	:global(.coverage-status.available) { color: var(--ink-60); }
	:global(.coverage-alert) { color: #a82d1d; font-weight: 750; }
	:global(.coverage-action) { display: inline-block; align-self: flex-start; margin-top: 7px; padding: 7px 9px; border: 0; background: var(--ink); color: var(--ground) !important; font-weight: 750; }
	@media (max-width: 760px) {
		.us-map { min-height: 430px; }
	}
</style>
