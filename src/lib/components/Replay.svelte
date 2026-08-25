<script lang="ts" module>
	/** Standard transport icons: play (triangle), pause (two bars), replay (loop). */
	export const PLAY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 1.5v13l11-6.5z"/></svg>';
	export const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.5 1.5h4v13h-4zM9.5 1.5h4v13h-4z"/></svg>';
	export const REPLAY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path fill="currentColor" d="M14.5 1.5v5h-5z"/></svg>';
</script>

<script lang="ts">
	import { flightLabel } from '$lib/flights';
	import { dataBlockHtml, trendOf } from '$lib/datablock';
	import { dataBlockAircraft } from '$lib/aircraft';
	import { displayAlt, NO_CORRECTION, type AltContext } from '$lib/altview.svelte';
	/**
	 * Animated replay of a close approach. Both aircraft are sampled from their
	 * own timestamped tracks at one shared clock; the map is Leaflet (browser
	 * only, created in onMount).
	 */
	import { onMount, untrack } from 'svelte';
	import type { AirportConfig, Flight, Incident } from '$lib/types';
	import { buildReplay, glyphHtml, glyphSizeFor, pairColors, silhouetteFor } from '$lib/replay';
	import {
		applyReplayLabelPlacement,
		cardinalDirectionAway,
		layoutCloseApproachLabels,
		planCloseApproachLabelRoute,
		updateReplayLabel,
		type CloseApproachLabelPlacement,
		type ReplayLabelElements,
		type ReplayLabelTarget
	} from '$lib/replay-label-layout';
	import { buildTrackSpline } from '$lib/separation';
	import { fromLocalNm } from '$lib/geo';
	import { localTime, localTimeZoned } from '$lib/time';
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
		/** Altimeter readings for the night; with field elevation they turn reported altitudes into height above the field. */
		alt?: AltContext;
		/** Begin playback as soon as the map is ready (default false). */
		autoplay?: boolean;
	}
	let { airport, a, b, incident, others = [], tiles = 'carto', height = 520, alt = { ...NO_CORRECTION, elevationFt: airport.elevationFt }, autoplay = false }: Props = $props();

	const STEPS = 300;
	const SPEEDS = [8, 16, 32];
	const ACCENT = '#ec3013';
	const INK = '#201e1d';
	const GREY = '#8a8785';
	const dataLabel = (f: Flight) => `${flightLabel(f)}${f.type ? ` · ${f.type}` : ''}`;

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

	// Other aircraft flying during the replay window: shown as animated grey
	// glyphs only. The incident pair alone gets tracks and data blocks.
	const concurrent = untrack(() =>
		others
			.map((f) => ({ f, track: buildTrackSpline(airport.pos, f) }))
			.filter((x): x is { f: Flight; track: NonNullable<typeof x.track> } => !!x.track && x.track.spline.t0 <= end && x.track.spline.t1 >= start)
	);
	const otherLayers = new Map<string, { mark: Leaflet.Marker }>();
	const LABEL_PLAN_FRAMES = 61;
	let labelPlan: { key: string; frames: CloseApproachLabelPlacement[][] } | null = null;
	type LabelDraw = { target: ReplayLabelTarget; elements: ReplayLabelElements; color: string };

	/** Closest moment as a fraction of the replay window (scrubber pip position). */
	const pipFrac = untrack(() => (incident.t - start) / span);
	let t = $state(start);
	let playing = $state(false);
	let speed = $state(16);
	let sample = $derived(replay ? replay.sampleAt(t) : null);
	let step = $derived(Math.round(((t - start) / span) * (STEPS - 1)));
	let atEnd = $derived(t >= end);

	// ---- playback ----
	let raf = 0;
	let last = 0;
	// Playback stops on the closest moment, the pair flashes HOLD_FLASHES
	// times, then continues.
	const HOLD_FLASHES = 5;
	const FLASH_MS = 500;
	let holding = $state(false);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let heldClosest = false;
	function clearHold() {
		clearTimeout(holdTimer);
		holding = false;
	}
	function tick(now: number) {
		if (!playing || holding) return;
		const dt = last ? now - last : 0;
		last = now;
		let next = Math.min(end, t + dt * speed);
		if (!heldClosest && incident.t > t && incident.t <= next) {
			heldClosest = true;
			t = incident.t;
			holding = true;
			holdTimer = setTimeout(() => {
				holding = false;
				if (playing) {
					last = 0;
					raf = requestAnimationFrame(tick);
				}
			}, HOLD_FLASHES * FLASH_MS);
			return;
		}
		t = next;
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
			clearHold();
			return;
		}
		if (t >= end) {
			t = start;
			heldClosest = false;
		}
		playing = true;
		last = 0;
		raf = requestAnimationFrame(tick);
	}
	/** Pause and move the clock by ±15 s for a frame-by-frame look. */
	const STEP_MS = 15_000;
	function nudge(dir: -1 | 1) {
		if (!replay) return;
		playing = false;
		cancelAnimationFrame(raf);
		clearHold();
		t = Math.min(end, Math.max(start, t + dir * STEP_MS));
		heldClosest = t >= incident.t;
	}
	/** Choosing a speed also resumes playback if it was paused. */
	function setSpeed(s: number) {
		speed = s;
		if (!playing) play();
	}
	function scrub(e: Event) {
		playing = false;
		cancelAnimationFrame(raf);
		clearHold();
		const k = Number((e.currentTarget as HTMLInputElement).value);
		t = start + (k / (STEPS - 1)) * span;
		heldClosest = t >= incident.t;
	}

	// ---- map ----
	let mapEl: HTMLDivElement;
	let base: BaseMap | null = null;
	let L: typeof Leaflet | null = null;
	let glyph = 36;
	let ready = $state(false);
	let mapZooming = false;
	let drawDeferred = false;
	let layers: {
		trailA: Leaflet.Polyline;
		trailB: Leaflet.Polyline;
		markA: Leaflet.Marker;
		markB: Leaflet.Marker;
		labelA: Leaflet.Marker;
		labelB: Leaflet.Marker;
	} | null = null;

	/** ATC-style data block beside each aircraft (label / altitude·trend·speed). */
	function labelHtml(color: string, f: Flight, s?: { alt: number; gs: number; vs: number; active: boolean; phase: 'before' | 'active' | 'after' }): string {
		const text = dataLabel(f);
		const aircraft = dataBlockAircraft(f);
		// Before its first report or after its last, the aircraft is parked at
		// that report; its altitude and speed then are not known, so show none.
		if (!s || s.phase !== 'active') {
			const note = !s ? '' : s.phase === 'after' ? ' · track ended' : ' · not yet reporting';
			return `<div class="replay-chip" style="color:${color};border-color:${color}">${aircraft ? `<a href="${aircraft.href}">${text}</a>` : text}${note}</div>`;
		}
		const shown = displayAlt(s.alt, alt);
		return dataBlockHtml({ label: text, altFt: s.alt, plainAltFt: shown.ft, altUnit: shown.mode === 'agl' ? 'AGL' : 'ADS-B', gsKt: s.gs, trend: trendOf(s.vs), aircraft }, color);
	}

	onMount(() => {
		let cancelled = false;
		let ro: ResizeObserver | null = null;
		(async () => {
			const mod = await import('$lib/leaflet');
			if (cancelled || !replay) return;
			L = mod.L;
			base = mod.createBaseMap(mapEl, airport.pos, { tiles, runways: airport.runways });
			const map = base.map;
			// Persistent dashed paths stay beneath the datablocks. The live snake
			// trails share a higher pane with their aircraft silhouettes.
			map.createPane('replay-labels').style.zIndex = '550';
			map.createPane('replay-aircraft').style.zIndex = '600';
			map.on('zoomstart', () => {
				mapZooming = true;
			});
			map.on('zoomend', () => {
				mapZooming = false;
				labelPlan = null;
				if (drawDeferred) {
					drawDeferred = false;
					draw();
				}
			});

			// Each aircraft's full path, dashed.
			for (const [f, color] of [
				[a, colorA],
				[b, colorB]
			] as const) {
				L.polyline(
					f.positions.map((p) => [p.lat, p.lon] as [number, number]),
					{ className: 'replay-whole-path', color, weight: 2.5, opacity: 0.5, dashArray: '5 6', interactive: false }
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

			const trailA = L.polyline([], { pane: 'replay-aircraft', className: 'replay-snake', color: colorA, weight: 4, opacity: 0.95, interactive: false }).addTo(map);
			const trailB = L.polyline([], { pane: 'replay-aircraft', className: 'replay-snake', color: colorB, weight: 3, opacity: 0.85, interactive: false }).addTo(map);
			const mk = (color: string, f: Flight) =>
				L!.marker([c.a.lat, c.a.lon], {
					interactive: false,
					pane: 'replay-aircraft',
					icon: L!.divIcon({ className: 'replay-marker replay-marker-focus', iconSize: [0, 0], iconAnchor: [0, 0], html: glyphHtml(color, silhouetteFor(f), glyph) })
				}).addTo(map);
			const lb = (color: string, f: Flight) =>
				L!.marker([c.a.lat, c.a.lon], {
					interactive: true,
					pane: 'replay-labels',
					icon: L!.divIcon({ className: 'replay-label', iconSize: [0, 0], iconAnchor: [0, 0], html: labelHtml(color, f) })
				}).addTo(map);
			layers = { trailA, trailB, markA: mk(colorA, a), markB: mk(colorB, b), labelA: lb(colorA, a), labelB: lb(colorB, b) };

			ro = new ResizeObserver(() => {
				labelPlan = null;
				map.invalidateSize();
				map.fitBounds(L!.latLngBounds(seen), { padding: [40, 40] });
				draw();
			});
			ro.observe(mapEl);
			ready = true;
			draw();
			// Start playing as soon as the map is up, unless the reader asked for reduced motion.
			if (autoplay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) play();
		})();
		return () => {
			cancelled = true;
			ro?.disconnect();
			cancelAnimationFrame(raf);
			clearTimeout(holdTimer);
			base?.destroy();
			base = null;
			layers = null;
			labelPlan = null;
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

	function collectLabel(
		labels: LabelDraw[],
		id: string,
		marker: Leaflet.Marker,
		self: { lat: number; lon: number; alt: number; gs: number; vs: number; active: boolean; phase: 'before' | 'active' | 'after' },
		color: string,
		flight: Flight,
		radius = glyph / 2
	) {
		if (!base) return;
		marker.setLatLng([self.lat, self.lon]);
		const host = marker.getElement();
		if (!host) return;
		const elements = updateReplayLabel(host, labelHtml(color, flight, self));
		const p = base.map.latLngToContainerPoint([self.lat, self.lon]);
		const airportPoint = base.map.latLngToContainerPoint(airport.pos);
		labels.push({
			target: { id, x: p.x, y: p.y, width: elements.offset.offsetWidth, height: elements.offset.offsetHeight, radius, preferred: cardinalDirectionAway(p, airportPoint) },
			elements,
			color
		});
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

	/** Other aircraft in the air at t: animated grey glyph only. */
	function drawOthers() {
		if (!base || !L) return;
		const map = base.map;
		for (const { f, track } of concurrent) {
			const sp = track.spline;
			const active = t >= sp.t0 && t <= sp.t1;
			let g = otherLayers.get(f.id);
			if (!active) {
				if (g) {
					g.mark.remove();
					otherLayers.delete(f.id);
				}
				continue;
			}
			const v = sp.at(t)!;
			const vel = sp.velocityAt(t);
			const [lat, lon] = fromLocalNm(airport.pos, [v[0], v[1]]);
			if (!g) {
				g = {
					mark: L.marker([lat, lon], { interactive: false, pane: 'replay-aircraft', icon: L.divIcon({ className: 'replay-marker replay-marker-other', iconSize: [0, 0], iconAnchor: [0, 0], html: glyphHtml(GREY, silhouetteFor(f), Math.round(glyph * 0.85)) }) }).addTo(map)
				};
				otherLayers.set(f.id, g);
			}
			g.mark.setLatLng([lat, lon]);
			const el = g.mark.getElement();
			if (el) {
				const hdg = vel && (Math.abs(vel[0]) > 1e-9 || Math.abs(vel[1]) > 1e-9) ? ((Math.atan2(vel[0], vel[1]) * 180) / Math.PI + 360) % 360 : 0;
				const svg = el.querySelector('svg') as SVGElement | null;
				if (svg) svg.style.transform = `translate(-50%, -50%) rotate(${hdg.toFixed(0)}deg)`;
			}
		}
	}

	function routePlan(labels: LabelDraw[], viewport: { width: number; height: number }): CloseApproachLabelPlacement[][] {
		if (!replay || !base) return [];
		const key = `${viewport.width}:${viewport.height}:${labels.map(({ target }) => `${target.id}:${target.width}:${target.height}:${target.radius}`).join('|')}`;
		if (labelPlan?.key === key) return labelPlan.frames;
		const airportPoint = base.map.latLngToContainerPoint(airport.pos);
		const frames: ReplayLabelTarget[][] = [];
		for (let index = 0; index < LABEL_PLAN_FRAMES; index++) {
			const at = start + (index / (LABEL_PLAN_FRAMES - 1)) * span;
			const routeSample = replay.sampleAt(at);
			frames.push(labels.map(({ target }, labelIndex) => {
				const state = labelIndex === 0 ? routeSample.a : routeSample.b;
				const point = base!.map.latLngToContainerPoint([state.lat, state.lon]);
				return { ...target, x: point.x, y: point.y, preferred: cardinalDirectionAway(point, airportPoint) };
			}));
		}
		labelPlan = { key, frames: planCloseApproachLabelRoute(frames, viewport) };
		return labelPlan.frames;
	}

	function interpolatePlan(frames: CloseApproachLabelPlacement[][]): CloseApproachLabelPlacement[] {
		const progress = Math.max(0, Math.min(frames.length - 1, ((t - start) / span) * (frames.length - 1)));
		const fromIndex = Math.floor(progress);
		const toIndex = Math.min(frames.length - 1, fromIndex + 1);
		const mix = progress - fromIndex;
		return frames[fromIndex].map((from, index) => {
			const to = frames[toIndex][index];
			return { ...from, slot: 'route', x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix };
		});
	}

	function draw() {
		if (!layers || !sample || !base) return;
		// Leaflet transforms marker and SVG panes during pinch zoom. Defer replay
		// geometry updates until both panes share the new pixel origin.
		if (mapZooming) {
			drawDeferred = true;
			return;
		}
		const labels: LabelDraw[] = [];
		drawOthers();
		layers.trailA.setLatLngs(trail('a', t));
		layers.trailB.setLatLngs(trail('b', t));
		placeGlyph(layers.markA, sample.a, sample.inside);
		placeGlyph(layers.markB, sample.b, sample.inside);
		collectLabel(labels, a.id, layers.labelA, sample.a, colorA, a);
		collectLabel(labels, b.id, layers.labelB, sample.b, colorB, b);
		const size = base.map.getSize();
		const viewport = { width: size.x, height: size.y };
		const targets = labels.map(({ target }) => target);
		const frames = routePlan(labels, viewport);
		const planned = interpolatePlan(frames);
		const preferred = new Map(planned.map((placement) => [placement.id, placement]));
		// While moving, interpolate the globally optimized route. A temporary
		// crossing is acceptable during a fast slew. Paused and held moments use
		// an exact joint solve so their stabilized blocks never overlap.
		const placements = playing && !holding ? planned : layoutCloseApproachLabels(targets, viewport, preferred);
		for (const placement of placements) {
			const label = labels.find(({ target }) => target.id === placement.id)!;
			applyReplayLabelPlacement(label.elements, placement, label.target, label.target.radius, label.color, true);
		}
	}

	$effect(() => {
		// Re-draw whenever the clock or label stabilization mode changes.
		void sample;
		void playing;
		void holding;
		if (ready) draw();
	});

	const fmtNm = (n: number) => `${n.toFixed(2)} NM`;
	const fmtFt = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`;
</script>

<div class="replay">
	<div class="replay-map-wrap">
		<div class="map" bind:this={mapEl} style="--replay-h: {height}px" aria-label="Replay map">
			{#if !replay}
				<div class="unavailable">Replay unavailable — not enough position data for both aircraft.</div>
			{/if}
		</div>
		{#if replay}
			<div class="replay-clock" data-testid="replay-time" data-t={t}>{localTimeZoned(airport.tz, t)}</div>
		{/if}
	</div>
	<div class="replay-controls">
		<button class="btn play" data-testid="replay-play" onclick={play} disabled={!replay} aria-label={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'} title={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}>
			{@html playing ? PAUSE_ICON : atEnd ? REPLAY_ICON : PLAY_ICON}
		</button>
		<div class="replay-track-col">
		<div class="replay-track">
			<input
				class="replay-scrubber"
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
			<span class="replay-pip" data-testid="replay-pip" style="--pip: {((incident.t - start) / span).toFixed(4)}" title="Closest moment"></span>
		</div>
		<div class="replay-marks" data-testid="replay-marks">
			<span class="mark start lane-2">{localTime(airport.tz, start)}</span>
			<span class="mark end lane-2">{localTime(airport.tz, end)}</span>
			<span class="mark pip-mark lane-0" style="--pip: {pipFrac.toFixed(4)}">{localTime(airport.tz, incident.t)}</span>
		</div>
		</div>
		<div class="replay-speeds" role="group" aria-label="Step 15 seconds">
			<button onclick={() => nudge(-1)} disabled={!replay} aria-label="Back 15 seconds" data-testid="replay-back" title="Back 15 seconds">−15s</button>
			<button onclick={() => nudge(1)} disabled={!replay} aria-label="Forward 15 seconds" data-testid="replay-forward" title="Forward 15 seconds">+15s</button>
		</div>
		<div class="replay-speeds" role="group" aria-label="Replay speed">
			{#each SPEEDS as s (s)}
				<button class:on={speed === s} onclick={() => setSpeed(s)} aria-pressed={speed === s}>{s}×</button>
			{/each}
		</div>
		<div class="replay-readout tabular">
			<div>
				<div class="replay-readout-label">Lateral</div>
				<div class="replay-readout-value figure" class:accent={sample?.inside} data-testid="replay-lateral">
					{sample ? fmtNm(sample.lateralNm) : '—'}
				</div>
			</div>
			<div>
				<div class="replay-readout-label">Vertical</div>
				<div class="replay-readout-value figure" class:accent={sample?.inside} data-testid="replay-vertical">
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
	@media (max-width: 760px) {
		.map {
			height: 320px;
		}
	}
</style>
