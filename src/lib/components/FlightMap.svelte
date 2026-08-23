<script lang="ts">
	import { flightLabel } from '$lib/flights';
	import { dataBlockHtml, trendOf } from '$lib/datablock';
	import { altView, displayAlt, NO_CORRECTION, type AltContext } from '$lib/altview.svelte';
	/*
	 * Flight-path map (README "Maps → Flight-path map"). Leaflet base map from
	 * $lib/leaflet (CARTO tiles, 10 NM ring, field marker, fitted bounds); each
	 * flight's positions are drawn as a smooth time-parameterised spline,
	 * sampled every ~2 s of flight time into an L.polyline.
	 * Browser-only: the map is created in $effect after mount.
	 */
	import { onMount } from 'svelte';
	import type { Flight } from '$lib/types';
	import { Spline } from '$lib/spline';
	import type { BaseMap } from '$lib/leaflet';
	import type LeafletNS from 'leaflet';

	interface Props {
		center: [number, number];
		flights: Flight[];
		focus?: string | null;
		height?: number;
		tiles?: 'carto' | 'off';
		/** Altimeter readings + field elevation so hover altitudes can be shown above the field. */
		alt?: AltContext;
		onfocus?: (id: string | null) => void;
	}

	let { center, flights, focus = null, height = 520, tiles = 'carto', alt = NO_CORRECTION, onfocus }: Props = $props();

	const SAMPLE_MS = 2000;

	let el: HTMLDivElement;
	let base: BaseMap | null = $state.raw(null);
	let L: typeof LeafletNS | null = null;
	let layer: LeafletNS.LayerGroup | null = null;
	const lines = new Map<string, LeafletNS.Polyline>();
	const splines = new Map<string, { spline: Spline; samples: { t: number; lat: number; lon: number }[] }>();
	let hoverDot: LeafletNS.CircleMarker | null = null;
	let hoverTip: LeafletNS.Tooltip | null = null;

	/** Spline over [lat, lon, alt ft, gs kt] and its 2 s samples (kept for hover lookups). */
	function sampled(f: Flight): [number, number][] {
		const pts = f.positions.map((p) => ({ t: p.t, v: [p.lat, p.lon, p.alt, p.gs] }));
		if (pts.length < 2) return pts.map((p) => [p.v[0], p.v[1]]);
		const s = new Spline(pts);
		const samples: { t: number; lat: number; lon: number }[] = [];
		for (let t = s.t0; t < s.t1; t += SAMPLE_MS) {
			const v = s.at(t)!;
			samples.push({ t, lat: v[0], lon: v[1] });
		}
		const last = s.at(s.t1)!;
		samples.push({ t: s.t1, lat: last[0], lon: last[1] });
		splines.set(f.id, { spline: s, samples });
		return samples.map((p) => [p.lat, p.lon]);
	}

	/** Nearest sampled instant on a flight's path to a map point (screen-space). */
	function nearestTime(f: Flight, latlng: LeafletNS.LatLng): number | null {
		const entry = splines.get(f.id);
		if (!entry || !base) return null;
		const p = base.map.latLngToContainerPoint(latlng);
		let best = entry.samples[0],
			bestD = Infinity;
		for (const s of entry.samples) {
			const q = base.map.latLngToContainerPoint([s.lat, s.lon]);
			const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
			if (d < bestD) {
				bestD = d;
				best = s;
			}
		}
		return best.t;
	}

	function showBlock(f: Flight, t: number) {
		const entry = splines.get(f.id);
		if (!entry || !base || !L) return;
		const v = entry.spline.at(t)!;
		const vel = entry.spline.velocityAt(t);
		const color = f.category === 'airline' ? '#ec3013' : '#201e1d';
		const shown = displayAlt(v[2], alt, altView.mode);
		const html = dataBlockHtml({ label: `${flightLabel(f)}${f.type ? ' · ' + f.type : ''}`, altFt: shown.ft, altUnit: shown.mode === 'agl' ? 'AGL' : 'ADS-B', gsKt: v[3], trend: trendOf(vel ? vel[2] * 1000 : null) }, color);
		const at: LeafletNS.LatLngExpression = [v[0], v[1]];
		if (!hoverDot) hoverDot = L.circleMarker(at, { radius: 4, color, weight: 2, fillColor: '#f3f2f2', fillOpacity: 1, interactive: false }).addTo(base.map);
		else hoverDot.setLatLng(at).setStyle({ color });
		if (!hoverTip) hoverTip = L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'track-tip', interactive: false }).setLatLng(at).setContent(html).addTo(base.map);
		else hoverTip.setLatLng(at).setContent(html);
	}

	function hideBlock() {
		hoverDot?.remove();
		hoverTip?.remove();
		hoverDot = null;
		hoverTip = null;
	}

	function style(f: Flight, focused: string | null): LeafletNS.PathOptions {
		const airline = f.category === 'airline';
		const base: LeafletNS.PathOptions = airline
			? { color: '#ec3013', weight: 2.5, opacity: 1 }
			: { color: '#201e1d', weight: 1.75, opacity: 0.55 };
		if (!focused) return base;
		if (f.id === focused) return { ...base, weight: 4, opacity: 1 };
		return { ...base, opacity: 0.16 };
	}

	function draw() {
		if (!base || !L) return;
		layer?.remove();
		lines.clear();
		splines.clear();
		hideBlock();
		layer = L.layerGroup().addTo(base.map);
		for (const f of flights) {
			if (f.positions.length < 2) continue;
			const line = L.polyline(sampled(f), { ...style(f, focus), lineCap: 'round', lineJoin: 'round' });
			line.on('mouseover', (e: LeafletNS.LeafletMouseEvent) => {
				onfocus?.(f.id);
				const t = nearestTime(f, e.latlng);
				if (t != null) showBlock(f, t);
			});
			line.on('mousemove', (e: LeafletNS.LeafletMouseEvent) => {
				const t = nearestTime(f, e.latlng);
				if (t != null) showBlock(f, t);
			});
			line.on('mouseout', () => {
				onfocus?.(null);
				hideBlock();
			});
			line.addTo(layer);
			lines.set(f.id, line);
		}
	}

	function restyle() {
		for (const f of flights) {
			const line = lines.get(f.id);
			if (line) {
				line.setStyle(style(f, focus));
				if (f.id === focus) line.bringToFront();
			}
		}
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			const mod = await import('$lib/leaflet');
			if (cancelled) return;
			L = mod.L;
			base = mod.createBaseMap(el, center, { tiles, radiusNm: 10 });
		})();
		return () => {
			cancelled = true;
			layer?.remove();
			base?.destroy();
			base = null;
		};
	});

	// Redraw whenever the map exists and the flight set changes.
	$effect(() => {
		void flights;
		if (base) draw();
	});
	// Restyle (cheap) when only focus changes.
	$effect(() => {
		void focus;
		if (base) restyle();
	});
</script>

<div class="flight-map" bind:this={el} style:height="{height}px" aria-label="Map of flight paths near the airport"></div>

<style>
	.flight-map {
		width: 100%;
		background: var(--ground-alt);
	}
</style>
