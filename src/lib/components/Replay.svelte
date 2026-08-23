<script lang="ts">
	import { flightLabel } from '$lib/flights';
	/**
	 * Animated replay of a close approach. Both aircraft are sampled from their
	 * own timestamped tracks at one shared clock; the map is Leaflet (browser
	 * only, created in onMount).
	 */
	import { onMount, untrack } from 'svelte';
	import type { AirportConfig, Flight, Incident } from '$lib/types';
	import { buildReplay, glyphSizeFor, pairColors, silhouetteFor, SILHOUETTE_PATHS } from '$lib/replay';
	import { localClock } from '$lib/time';
	import type { BaseMap } from '$lib/leaflet';
	import type * as Leaflet from 'leaflet';

	interface Props {
		airport: AirportConfig;
		a: Flight;
		b: Flight;
		incident: Incident;
		others?: Flight[];
		tiles?: 'carto' | 'off';
		height?: number;
	}
	let { airport, a, b, incident, others = [], tiles = 'carto', height = 520 }: Props = $props();

	const STEPS = 300;
	const SPEEDS = [4, 8, 16];
	const ACCENT = '#ec3013';
	const INK = '#201e1d';

	// The model and map are built once per mount from the initial props; the
	// page keys this component on the incident id so a new incident remounts it.
	const { replay, start, end, span, colorA, colorB } = untrack(() => {
		const replay = buildReplay(airport.pos, a, b, incident.t);
		const start = replay?.start ?? incident.t;
		const end = replay?.end ?? incident.t;
		const [ca, cb] = pairColors(a, b);
		return {
			replay,
			start,
			end,
			span: Math.max(1, end - start),
			colorA: ca === 'accent' ? ACCENT : INK,
			colorB: cb === 'accent' ? ACCENT : INK
		};
	});

	let t = $state(start);
	let playing = $state(false);
	let speed = $state(8);
	let sample = $derived(replay ? replay.sampleAt(t) : null);
	let step = $derived(Math.round(((t - start) / span) * (STEPS - 1)));
	let atEnd = $derived(t >= end);

	// ---- playback ----
	let raf = 0;
	let last = 0;
	function tick(now: number) {
		if (!playing) return;
		const dt = last ? now - last : 0;
		last = now;
		t = Math.min(end, t + dt * speed);
		if (t >= end) {
			playing = false;
			return;
		}
		raf = requestAnimationFrame(tick);
	}
	function play() {
		if (!replay) return;
		if (playing) {
			playing = false;
			cancelAnimationFrame(raf);
			return;
		}
		if (t >= end) t = start;
		playing = true;
		last = 0;
		raf = requestAnimationFrame(tick);
	}
	function scrub(e: Event) {
		playing = false;
		cancelAnimationFrame(raf);
		const k = Number((e.currentTarget as HTMLInputElement).value);
		t = start + (k / (STEPS - 1)) * span;
	}

	// ---- map ----
	let mapEl: HTMLDivElement;
	let base: BaseMap | null = null;
	let L: typeof Leaflet | null = null;
	let glyph = 30;
	let ready = $state(false);
	let layers: {
		trailA: Leaflet.Polyline;
		trailB: Leaflet.Polyline;
		sep: Leaflet.Polyline;
		markA: Leaflet.Marker;
		markB: Leaflet.Marker;
		labelA: Leaflet.Marker;
		labelB: Leaflet.Marker;
	} | null = null;

	function glyphHtml(color: string, shape: keyof typeof SILHOUETTE_PATHS, g: number): string {
		const ring = Math.round(g * 1.3);
		return (
			`<div class="replay-ring" style="width:${ring}px;height:${ring}px"></div>` +
			`<svg class="replay-glyph" viewBox="0 0 40 40" width="${g}" height="${g}"><path fill="${color}" d="${SILHOUETTE_PATHS[shape]}"/></svg>`
		);
	}
	function labelHtml(color: string, text: string): string {
		return `<div class="replay-chip" style="color:${color};border-color:${color}">${text}</div>`;
	}

	onMount(() => {
		let cancelled = false;
		let ro: ResizeObserver | null = null;
		(async () => {
			const mod = await import('$lib/leaflet');
			if (cancelled || !replay) return;
			L = mod.L;
			base = mod.createBaseMap(mapEl, airport.pos, { tiles, interactive: false });
			const map = base.map;

			// Context: the night's other traffic, faint.
			for (const f of others) {
				if (f.positions.length < 2) continue;
				L.polyline(
					f.positions.map((p) => [p.lat, p.lon] as [number, number]),
					{ color: INK, weight: 1, opacity: 0.12, interactive: false }
				).addTo(map);
			}
			// Each aircraft's full path, dashed.
			for (const [f, color] of [
				[a, colorA],
				[b, colorB]
			] as const) {
				L.polyline(
					f.positions.map((p) => [p.lat, p.lon] as [number, number]),
					{ color, weight: 2.5, opacity: 0.5, dashArray: '5 6', interactive: false }
				).addTo(map);
			}

			// Fit tightly to the windowed paths, not the whole ring.
			const seen = [...replay.path('a'), ...replay.path('b')];
			map.fitBounds(L.latLngBounds(seen), { padding: [40, 40] });

			// Glyph size from the pixel separation at the closest pass.
			const c = replay.sampleAt(replay.closestT);
			const p = map.latLngToContainerPoint([c.a.lat, c.a.lon]);
			const q = map.latLngToContainerPoint([c.b.lat, c.b.lon]);
			glyph = glyphSizeFor(Math.hypot(p.x - q.x, p.y - q.y));

			const trailA = L.polyline([], { color: colorA, weight: 4, opacity: 0.95, interactive: false }).addTo(map);
			const trailB = L.polyline([], { color: colorB, weight: 3, opacity: 0.85, interactive: false }).addTo(map);
			const sep = L.polyline([], { color: ACCENT, weight: 1.5, opacity: 0.6, dashArray: '3 4', interactive: false }).addTo(map);
			const mk = (color: string, f: Flight) =>
				L!.marker([c.a.lat, c.a.lon], {
					interactive: false,
					zIndexOffset: 1000,
					icon: L!.divIcon({ className: 'replay-marker', iconSize: [0, 0], iconAnchor: [0, 0], html: glyphHtml(color, silhouetteFor(f.category, f.type), glyph) })
				}).addTo(map);
			const lb = (color: string, f: Flight) =>
				L!.marker([c.a.lat, c.a.lon], {
					interactive: false,
					zIndexOffset: -500,
					icon: L!.divIcon({ className: 'replay-label', iconSize: [0, 0], iconAnchor: [0, 0], html: labelHtml(color, flightLabel(f)) })
				}).addTo(map);
			layers = { trailA, trailB, sep, markA: mk(colorA, a), markB: mk(colorB, b), labelA: lb(colorA, a), labelB: lb(colorB, b) };

			ro = new ResizeObserver(() => {
				map.invalidateSize();
				map.fitBounds(L!.latLngBounds(seen), { padding: [40, 40] });
				draw();
			});
			ro.observe(mapEl);
			ready = true;
			draw();
		})();
		return () => {
			cancelled = true;
			ro?.disconnect();
			cancelAnimationFrame(raf);
			base?.destroy();
			base = null;
			layers = null;
		};
	});

	function trail(which: 'a' | 'b', upTo: number): [number, number][] {
		if (!replay) return [];
		const pts: [number, number][] = [];
		for (let x = start; x < upTo; x += 2000) {
			const s = replay.sampleAt(x)[which];
			pts.push([s.lat, s.lon]);
		}
		const s = replay.sampleAt(upTo)[which];
		pts.push([s.lat, s.lon]);
		return pts;
	}

	function placeLabel(marker: Leaflet.Marker, self: { lat: number; lon: number }, other: { lat: number; lon: number }) {
		if (!base) return;
		marker.setLatLng([self.lat, self.lon]);
		const el = marker.getElement()?.firstElementChild as HTMLElement | null;
		if (!el) return;
		const p = base.map.latLngToContainerPoint([self.lat, self.lon]);
		const q = base.map.latLngToContainerPoint([other.lat, other.lon]);
		let dx = p.x - q.x,
			dy = p.y - q.y;
		const len = Math.hypot(dx, dy) || 1;
		dx /= len;
		dy /= len;
		const reach = Math.max(18, glyph * 0.8);
		const ox = Math.round(dx * reach),
			oy = Math.round(dy * reach);
		el.style.transform = ox < -6 ? `translate(calc(-100% + ${ox}px), ${oy}px)` : `translate(${Math.max(ox, 10)}px, ${oy}px)`;
	}

	function placeGlyph(marker: Leaflet.Marker, s: { lat: number; lon: number; hdg: number; active: boolean }, alert: boolean) {
		marker.setLatLng([s.lat, s.lon]);
		const el = marker.getElement();
		if (!el) return;
		const svg = el.querySelector('svg') as SVGElement | null;
		if (svg) svg.style.transform = `translate(-50%, -50%) rotate(${s.hdg.toFixed(0)}deg)`;
		el.classList.toggle('alert', alert);
		// Before its track starts or after it ends the aircraft is parked at its
		// first/last report: show it faded instead of pretending it is flying.
		el.classList.toggle('parked', !s.active);
	}

	function draw() {
		if (!layers || !sample) return;
		layers.trailA.setLatLngs(trail('a', t));
		layers.trailB.setLatLngs(trail('b', t));
		layers.sep.setLatLngs(
			sample.a.active && sample.b.active
				? [
						[sample.a.lat, sample.a.lon],
						[sample.b.lat, sample.b.lon]
					]
				: []
		);
		placeGlyph(layers.markA, sample.a, sample.inside);
		placeGlyph(layers.markB, sample.b, sample.inside);
		placeLabel(layers.labelA, sample.a, sample.b);
		placeLabel(layers.labelB, sample.b, sample.a);
	}

	$effect(() => {
		// Re-draw whenever the clock moves (reads `sample` and `ready`).
		void sample;
		if (ready) draw();
	});

	const fmtNm = (n: number) => `${n.toFixed(2)} NM`;
	const fmtFt = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`;
</script>

<div class="replay">
	<div class="map" bind:this={mapEl} style="--replay-h: {height}px" aria-label="Replay map">
		{#if !replay}
			<div class="unavailable">Replay unavailable — not enough position data for both aircraft.</div>
		{/if}
	</div>
	<div class="controls">
		<button class="btn" data-testid="replay-play" onclick={play} disabled={!replay}>
			{playing ? 'Pause' : atEnd ? 'Replay again' : 'Play replay'}
		</button>
		<input
			class="scrubber"
			data-testid="replay-scrubber"
			type="range"
			min="0"
			max={STEPS - 1}
			step="1"
			value={step}
			oninput={scrub}
			aria-label="Replay position"
			disabled={!replay}
		/>
		<div class="speeds" role="group" aria-label="Replay speed">
			{#each SPEEDS as s (s)}
				<button class:on={speed === s} onclick={() => (speed = s)} aria-pressed={speed === s}>{s}×</button>
			{/each}
		</div>
		<div class="readout tabular">
			<div>
				<div class="readout-label">Local time</div>
				<div class="readout-value" data-testid="replay-time">{localClock(airport.tz, t, true)}</div>
			</div>
			<div>
				<div class="readout-label">Lateral</div>
				<div class="readout-value figure" class:accent={sample?.inside} data-testid="replay-lateral">
					{sample ? fmtNm(sample.lateralNm) : '—'}
				</div>
			</div>
			<div>
				<div class="readout-label">Vertical</div>
				<div class="readout-value figure" class:accent={sample?.inside} data-testid="replay-vertical">
					{sample ? fmtFt(sample.verticalFt) : '—'}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.replay {
		display: block;
		width: 100%;
	}
	.map {
		position: relative;
		width: 100%;
		height: var(--replay-h, 520px);
		background: var(--ground-alt);
	}
	.unavailable {
		padding: 16px var(--gutter);
		font-size: 13px;
		color: var(--ink-60);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px;
		padding: 14px var(--gutter);
		border-top: var(--rule);
		background: var(--ground);
	}
	.controls .btn {
		padding: 11px 18px;
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		min-width: 132px;
	}
	.controls .btn:disabled {
		background: var(--ink-25);
		cursor: default;
	}
	.scrubber {
		flex: 1;
		min-width: 160px;
		accent-color: var(--accent);
		cursor: pointer;
		margin: 0;
	}
	.speeds {
		display: flex;
		border: 2px solid var(--ink);
	}
	.speeds button {
		padding: 9px 13px;
		border: none;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-align: left;
	}
	.speeds button + button {
		border-left: 2px solid var(--ink);
	}
	.speeds button.on {
		background: var(--ink);
		color: #fff;
	}
	.readout {
		display: flex;
		align-items: baseline;
		gap: 18px;
		margin-left: auto;
	}
	.readout-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-45);
		line-height: 1;
	}
	.readout-value {
		font-size: 16px;
		font-weight: 700;
		line-height: 1.3;
		color: var(--ink);
		white-space: nowrap;
	}
	.readout-value.figure {
		font-size: 18px;
		font-weight: 900;
		line-height: 1.2;
	}
	.readout-value.accent {
		color: var(--accent);
	}
	@media (max-width: 760px) {
		.map {
			height: 320px;
		}
		.controls {
			gap: 10px;
			padding: 10px var(--gutter);
		}
		.readout {
			margin-left: 0;
			width: 100%;
		}
	}

	/* Leaflet divIcon content lives outside Svelte's scope. */
	:global(.replay-marker) {
		position: relative;
	}
	:global(.replay-marker .replay-glyph) {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -50%);
		filter: drop-shadow(0 0 2px rgba(243, 242, 242, 0.95));
	}
	:global(.replay-marker .replay-ring) {
		position: absolute;
		left: 0;
		top: 0;
		border: 2px solid #ec3013;
		border-radius: 50% !important;
		display: none;
		transform: translate(-50%, -50%);
	}
	:global(.replay-marker.alert .replay-glyph) {
		animation: dtw-alert 0.5s steps(1, end) infinite;
	}
	:global(.replay-marker.alert .replay-ring) {
		display: block;
		animation: dtw-ring 0.9s ease-out infinite;
	}
	:global(.replay-label .replay-chip) {
		position: absolute;
		white-space: nowrap;
		font: 800 12px/1 var(--font);
		background: #f3f2f2;
		padding: 3px 5px;
		border: 1px solid currentColor;
	}
	@keyframes -global-dtw-alert {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.25;
		}
	}
	@keyframes -global-dtw-ring {
		0% {
			transform: translate(-50%, -50%) scale(0.6);
			opacity: 0.85;
		}
		100% {
			transform: translate(-50%, -50%) scale(2.1);
			opacity: 0;
		}
	}
	:global(.replay-marker.parked) {
		opacity: 0.35;
	}
</style>
