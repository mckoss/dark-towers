<script lang="ts">
	import { flightLabel } from '$lib/flights';
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
		onfocus?: (id: string | null) => void;
	}

	let { center, flights, focus = null, height = 520, tiles = 'carto', onfocus }: Props = $props();

	const SAMPLE_MS = 2000;

	let el: HTMLDivElement;
	let base: BaseMap | null = $state.raw(null);
	let L: typeof LeafletNS | null = null;
	let layer: LeafletNS.LayerGroup | null = null;
	const lines = new Map<string, LeafletNS.Polyline>();

	function sampled(f: Flight): [number, number][] {
		const pts = f.positions.map((p) => ({ t: p.t, v: [p.lat, p.lon] }));
		if (pts.length < 2) return pts.map((p) => [p.v[0], p.v[1]]);
		const s = new Spline(pts);
		const out: [number, number][] = [];
		for (let t = s.t0; t < s.t1; t += SAMPLE_MS) {
			const v = s.at(t)!;
			out.push([v[0], v[1]]);
		}
		const last = s.at(s.t1)!;
		out.push([last[0], last[1]]);
		return out;
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
		layer = L.layerGroup().addTo(base.map);
		for (const f of flights) {
			if (f.positions.length < 2) continue;
			const line = L.polyline(sampled(f), { ...style(f, focus), lineCap: 'round', lineJoin: 'round' });
			line.bindTooltip(`${flightLabel(f)} · ${f.type ?? 'Unknown type'}`, { sticky: true, direction: 'top', className: 'track-tip' });
			line.on('mouseover', () => onfocus?.(f.id));
			line.on('mouseout', () => onfocus?.(null));
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

<div class="flight-map" bind:this={el} style:height="{height}px" aria-label="Map of flight paths within 10 nautical miles"></div>

<style>
	.flight-map {
		width: 100%;
		background: var(--ground-alt);
	}
	:global(.leaflet-tooltip.track-tip) {
		border-radius: 0;
		border: 1px solid var(--ink);
		background: var(--ground);
		color: var(--ink);
		font-family: var(--font);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		box-shadow: none;
		padding: 4px 8px;
	}
	:global(.leaflet-tooltip.track-tip::before) {
		display: none;
	}
</style>
