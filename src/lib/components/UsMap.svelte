<script lang="ts">
	/*
	 * US map with tracked-airport markers (see README "Maps → US map").
	 * d3-geo geoAlbersUsa fitted to a 960×560 viewBox over the vendored us-atlas
	 * states topology. Only tracked airports are drawn; circles sit on their true
	 * projected position and may overlap (no de-clustering by design).
	 * Renders fine on the server — no window access.
	 */
	import { geoAlbersUsa, geoPath } from 'd3-geo';
	import { feature, mesh } from 'topojson-client';
	import type { Topology, GeometryCollection } from 'topojson-specification';
	import type { FeatureCollection, Geometry } from 'geojson';
	import atlas from '$lib/data/us-atlas.json';

	export interface MapAirport {
		code: string;
		name: string;
		/** [lat, lon] */
		pos: [number, number];
		tracked: boolean;
		incidents: number;
	}

	interface Props {
		airports: MapAirport[];
		selected?: string;
		onselect?: (code: string) => void;
	}

	let { airports, selected, onselect }: Props = $props();

	const W = 960;
	const H = 560;

	const topo = atlas as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>;
	const states = feature(topo, topo.objects.states) as FeatureCollection<Geometry>;
	const borders = mesh(topo, topo.objects.states, (a, b) => a !== b);
	const projection = geoAlbersUsa().fitSize([W, H], states);
	const path = geoPath(projection);
	const statePaths = states.features.map((f) => path(f) ?? '');
	const borderPath = path(borders) ?? '';

	interface Node {
		code: string;
		name: string;
		incidents: number;
		x: number;
		y: number;
		r: number;
		label: string;
		labelX: number;
		labelY: number;
		anchor: 'start' | 'end';
	}

	const LABEL_SIZE = 12;
	const GAP = 6;

	let nodes = $derived.by<Node[]>(() => {
		const out: Node[] = [];
		for (const a of airports) {
			if (!a.tracked) continue;
			const p = projection([a.pos[1], a.pos[0]]);
			if (!p) continue;
			const incidents = Math.max(0, a.incidents ?? 0);
			const r = 9 + Math.sqrt(incidents) * 7;
			const label = incidents > 0 ? `${a.code} · ${incidents}` : a.code;
			const estWidth = label.length * LABEL_SIZE * 0.62;
			const flip = p[0] + r + GAP + estWidth > W - 10;
			out.push({
				code: a.code,
				name: a.name,
				incidents,
				x: p[0],
				y: p[1],
				r,
				label,
				labelX: flip ? p[0] - r - GAP : p[0] + r + GAP,
				labelY: p[1] + LABEL_SIZE * 0.36,
				anchor: flip ? 'end' : 'start'
			});
		}
		// Biggest first so small circles stay legible on top.
		return out.sort((m, n) => n.r - m.r);
	});
</script>

<svg
	class="us-map"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="xMidYMid meet"
	role="img"
	aria-label="Map of the United States showing tracked airports"
>
	<g class="states">
		{#each statePaths as d, i (i)}
			<path {d} />
		{/each}
	</g>
	<path class="borders" d={borderPath} />

	<g class="markers">
		{#each nodes as n (n.code)}
			<a
				href="/airport/{n.code}"
				class="marker"
				class:hot={n.incidents > 0}
				class:selected={selected === n.code}
				aria-label="Open the {n.code} record"
				onclick={(e) => {
					if (onselect) {
						e.preventDefault();
						onselect(n.code);
					}
				}}
			>
				<title>Open the {n.code} record</title>
				<circle class="fill" cx={n.x} cy={n.y} r={n.r} />
				<circle class="ring" cx={n.x} cy={n.y} r={n.r} />
				<circle class="dot" cx={n.x} cy={n.y} r={n.incidents > 0 ? 2.6 : 2.2} />
			</a>
		{/each}
	</g>

	<g class="labels" aria-hidden="true">
		{#each nodes as n (n.code)}
			<text class:hot={n.incidents > 0} x={n.labelX} y={n.labelY} text-anchor={n.anchor}>{n.label}</text>
		{/each}
	</g>
</svg>

<style>
	.us-map {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		font-family: var(--font);
	}
	.states path {
		fill: var(--ground-alt);
		stroke: none;
	}
	.borders {
		fill: none;
		stroke: var(--ink);
		stroke-width: 0.6;
		opacity: 0.35;
	}
	.marker {
		cursor: pointer;
		outline: none;
		border: none;
	}
	.marker .fill {
		fill: var(--ink);
		opacity: 0.12;
	}
	.marker .ring {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1.5;
		opacity: 0.6;
	}
	.marker .dot {
		fill: var(--ink);
	}
	.marker.hot .fill {
		fill: var(--accent);
		opacity: 0.22;
	}
	.marker.hot .ring {
		stroke: var(--accent);
		opacity: 0.85;
	}
	.marker.hot .dot {
		fill: var(--accent);
	}
	.marker:hover .fill,
	.marker:focus-visible .fill {
		opacity: 0.35;
	}
	.marker.selected .ring {
		stroke-width: 2.5;
		opacity: 1;
	}
	.marker:focus-visible .ring {
		stroke: var(--accent);
		stroke-width: 2.5;
		opacity: 1;
	}
	.labels text {
		font-size: 12px;
		font-weight: 700;
		fill: var(--ink);
		paint-order: stroke;
		stroke: var(--ground);
		stroke-width: 3.5px;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.labels text.hot {
		fill: var(--accent-text);
	}
</style>
