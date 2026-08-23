<script lang="ts">
	import { flightLabel } from '$lib/flights';
	import { dataBlockHtml, trendOf } from '$lib/datablock';
	import { altView, displayAlt, NO_CORRECTION, type AltContext } from '$lib/altview.svelte';
	import { localTime, localTimeZoned } from '$lib/time';
	import { PAUSE_ICON, PLAY_ICON, REPLAY_ICON } from './Replay.svelte';
	import { aircraftKind, assignLanes, glyphHtml, MILITARY_BLUE, silhouetteFor } from '$lib/replay';
	import { SEPARATION_LATERAL_NM, SEPARATION_VERTICAL_FT } from '$lib/airports';
	import { distanceNm } from '$lib/geo';
	import type { Incident } from '$lib/types';
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
		/** Airport time zone, for the time shown in the hover block. */
		tz?: string;
		/** The night's close approaches; the pair flashes when the replay clock passes each one. */
		incidents?: Incident[];
		/** Show the whole-night replay controls under the map. */
		replay?: boolean;
		onfocus?: (id: string | null) => void;
	}

	let { center, flights, focus = null, height = 520, tiles = 'carto', alt = NO_CORRECTION, tz = 'UTC', incidents = [], replay = false, onfocus }: Props = $props();

	const SAMPLE_MS = 2000;

	// ---- whole-night replay ----
	// One shared clock over the span of every track; each flight's spline is
	// sampled at that instant, so aircraft that were really in the air
	// together appear together. Speeds are high because a night is ~10 h.
	const SPEEDS = [60, 240, 900];
	const STEPS = 1000;
	const TRAIL_MS = 180_000;
	const GLYPH_PX = 30;
	const ACCENT = '#ec3013';
	const INK = '#201e1d';
	const span = $derived.by(() => {
		let t0 = Infinity,
			t1 = -Infinity;
		for (const f of flights) for (const p of f.positions) {
			if (p.t < t0) t0 = p.t;
			if (p.t > t1) t1 = p.t;
		}
		return t0 < t1 ? { start: t0, end: t1 } : null;
	});
	let t = $state(0);
	let playing = $state(false);
	let speed = $state(240);
	let started = $state(false);
	const step = $derived(span ? Math.round(((t - span.start) / (span.end - span.start)) * (STEPS - 1)) : 0);
	const atEnd = $derived(!!span && t >= span.end);
	let raf = 0;
	let last = 0;
	// At each close approach the playback stops on the closest moment, the
	// pair flashes HOLD_FLASHES times, then playback continues.
	const HOLD_FLASHES = 5;
	const FLASH_MS = 500;
	let holding = $state(false);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	const visited = new Set<string>();
	const sortedIncidents = $derived([...incidents].sort((x, y) => x.t - y.t));
	// Time marks under the scrubber, in two rows so labels never overlap.
	const MARK_W = 52;
	let marksW = $state(0);
	const marks = $derived.by(() => {
		if (!span) return [] as { x: number; frac: number; text: string; kind: 'start' | 'end' | 'pip'; lane: number }[];
		const len = span.end - span.start;
		const inner = Math.max(0, marksW - 6);
		// Close approaches take rows 0–1; the start and end times always sit on row 2.
		const pips = sortedIncidents.map((inc) => {
			const frac = (inc.t - span.start) / len;
			return { frac, text: localTime(tz, inc.t), kind: 'pip' as const, x: 3 + inner * frac };
		});
		const lanes = assignLanes(pips.map((m) => m.x), MARK_W);
		return [
			...pips.map((m, i) => ({ ...m, lane: lanes[i] })),
			{ frac: 0, text: localTime(tz, span.start), kind: 'start' as const, x: 1, lane: 2 },
			{ frac: 1, text: localTime(tz, span.end), kind: 'end' as const, x: marksW - 1, lane: 2 }
		];
	});
	/** Intervals (as fractions of the span) when at least one flight of a kind is in the air, merged. */
	function bandsFor(kind: 'airline' | 'private' | 'military'): { from: number; to: number }[] {
		if (!span) return [];
		const ivs = flights
			.filter((f) => (kind === 'military' ? aircraftKind(f) === 'military' : f.category === kind && aircraftKind(f) !== 'military') && f.positions.length > 1)
			.map((f) => ({ from: f.positions[0].t, to: f.positions[f.positions.length - 1].t }))
			.sort((x, y) => x.from - y.from);
		const merged: { from: number; to: number }[] = [];
		for (const iv of ivs) {
			const last = merged[merged.length - 1];
			if (last && iv.from <= last.to) last.to = Math.max(last.to, iv.to);
			else merged.push({ ...iv });
		}
		const len = span.end - span.start;
		return merged.map((m) => ({ from: (m.from - span.start) / len, to: (m.to - span.start) / len }));
	}
	const airlineBands = $derived(bandsFor('airline'));
	// Drawn bottom to top: private, military, airline — airline always shows through.
	const privateBands = $derived(bandsFor('private'));
	const militaryBands = $derived(bandsFor('military'));
	function tick(now: number) {
		if (!playing || !span || holding) return;
		const dt = last ? now - last : 0;
		last = now;
		let next = Math.min(span.end, t + dt * speed);
		// Did the clock pass a close approach we have not paused on yet?
		const hit = sortedIncidents.find((inc) => !visited.has(inc.id) && inc.t > t && inc.t <= next);
		if (hit) {
			visited.add(hit.id);
			next = hit.t;
			t = next;
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
		if (t >= span.end) {
			playing = false;
			return;
		}
		raf = requestAnimationFrame(tick);
	}
	function clearHold() {
		clearTimeout(holdTimer);
		holding = false;
	}
	function play() {
		if (!span) return;
		if (playing) {
			playing = false;
			cancelAnimationFrame(raf);
			clearHold();
			return;
		}
		if (!started || t >= span.end) {
			t = span.start;
			visited.clear();
		}
		started = true;
		playing = true;
		last = 0;
		raf = requestAnimationFrame(tick);
	}
	/** Pause and move the clock by ±15 s for a frame-by-frame look. */
	const STEP_MS = 15_000;
	function nudge(dir: -1 | 1) {
		if (!span) return;
		playing = false;
		cancelAnimationFrame(raf);
		clearHold();
		if (!started) {
			started = true;
			t = span.start;
		}
		t = Math.min(span.end, Math.max(span.start, t + dir * STEP_MS));
		for (const inc of incidents) if (inc.t <= t) visited.add(inc.id);
	}
	function scrub(e: Event) {
		if (!span) return;
		playing = false;
		cancelAnimationFrame(raf);
		clearHold();
		started = true;
		const k = Number((e.currentTarget as HTMLInputElement).value);
		t = span.start + (k / (STEPS - 1)) * (span.end - span.start);
		// Close approaches behind the new position count as seen; those ahead will pause again.
		visited.clear();
		for (const inc of incidents) if (inc.t <= t) visited.add(inc.id);
	}
	const glyphs = new Map<string, { mark: LeafletNS.Marker; label: LeafletNS.Marker; trail: LeafletNS.Polyline }>();
	let sepLines: LeafletNS.Polyline[] = [];
	/** Pairs inside the minima at t (from the recorded incidents, ±90 s, checked live). */
	function alertPairs(at: number): [Flight, Flight][] {
		const out: [Flight, Flight][] = [];
		for (const inc of incidents) {
			if (Math.abs(inc.t - at) > 90_000) continue;
			const a = flights.find((f) => f.id === inc.flightA),
				b = flights.find((f) => f.id === inc.flightB);
			const ea = a && splines.get(a.id),
				eb = b && splines.get(b.id);
			if (!a || !b || !ea || !eb) continue;
			const va = ea.spline.at(at),
				vb = eb.spline.at(at);
			if (!va || !vb) continue;
			if (at < ea.spline.t0 || at > ea.spline.t1 || at < eb.spline.t0 || at > eb.spline.t1) continue;
			const lateral = distanceNm([va[0], va[1]], [vb[0], vb[1]]);
			if (lateral < SEPARATION_LATERAL_NM && Math.abs(va[2] - vb[2]) < SEPARATION_VERTICAL_FT) out.push([a, b]);
		}
		return out;
	}
	function drawReplay() {
		if (!base || !L) return;
		const map = base.map;
		if (!started) {
			for (const g of glyphs.values()) {
				g.mark.remove();
				g.label.remove();
				g.trail.remove();
			}
			glyphs.clear();
			for (const l of sepLines) l.remove();
			sepLines = [];
			return;
		}
		const alerts = alertPairs(t);
		const alertIds = new Set(alerts.flatMap(([a, b]) => [a.id, b.id]));
		for (const f of flights) {
			const entry = splines.get(f.id);
			const active = !!entry && t >= entry.spline.t0 && t <= entry.spline.t1;
			let g = glyphs.get(f.id);
			if (!active) {
				if (g) {
					g.mark.remove();
					g.label.remove();
					g.trail.remove();
					glyphs.delete(f.id);
				}
				continue;
			}
			const color = aircraftKind(f) === 'military' ? MILITARY_BLUE : f.category === 'airline' ? ACCENT : INK;
			const v = entry!.spline.at(t)!;
			const vel = entry!.spline.velocityAt(t);
			const at: LeafletNS.LatLngExpression = [v[0], v[1]];
			if (!g) {
				g = {
					mark: L.marker(at, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: 'replay-marker', iconSize: [0, 0], iconAnchor: [0, 0], html: glyphHtml(color, silhouetteFor(f.category, f.type, f.ident), GLYPH_PX) }) }).addTo(map),
					label: L.marker(at, { interactive: false, zIndexOffset: -500, icon: L.divIcon({ className: 'replay-label', iconSize: [0, 0], iconAnchor: [0, 0], html: '' }) }).addTo(map),
					trail: L.polyline([], { color, weight: f.category === 'airline' ? 4 : 3, opacity: 0.95, interactive: false }).addTo(map)
				};
				glyphs.set(f.id, g);
			}
			g.mark.setLatLng(at);
			const el = g.mark.getElement();
			if (el) {
				const hdg = vel && (Math.abs(vel[0]) > 1e-9 || Math.abs(vel[1]) > 1e-9) ? ((Math.atan2(vel[1] * Math.cos((v[0] * Math.PI) / 180), vel[0]) * 180) / Math.PI + 360) % 360 : 0;
				const svg = el.querySelector('svg') as SVGElement | null;
				if (svg) svg.style.transform = `translate(-50%, -50%) rotate(${hdg.toFixed(0)}deg)`;
				el.classList.toggle('alert', alertIds.has(f.id));
			}
			// Trail: the last three minutes of flight.
			const pts: [number, number][] = [];
			for (let x = Math.max(entry!.spline.t0, t - TRAIL_MS); x < t; x += SAMPLE_MS) {
				const q = entry!.spline.at(x)!;
				pts.push([q[0], q[1]]);
			}
			pts.push([v[0], v[1]]);
			g.trail.setLatLngs(pts);
			// Data block, offset to the right of the glyph.
			g.label.setLatLng(at);
			const host = g.label.getElement();
			if (host) {
				const shown = displayAlt(v[2], alt, altView.mode);
				host.innerHTML = dataBlockHtml({ label: flightLabel(f), altFt: shown.ft, altUnit: shown.mode === 'agl' ? 'AGL' : 'ADS-B', gsKt: v[3], trend: trendOf(vel ? vel[2] * 1000 : null) }, color);
				const inner = host.firstElementChild as HTMLElement | null;
				if (inner) inner.style.transform = `translate(${Math.round(GLYPH_PX * 0.7)}px, -50%)`;
			}
		}
		for (const l of sepLines) l.remove();
		sepLines = alerts.map(([a, b]) => {
			const va = splines.get(a.id)!.spline.at(t)!,
				vb = splines.get(b.id)!.spline.at(t)!;
			return L!.polyline(
				[
					[va[0], va[1]],
					[vb[0], vb[1]]
				],
				{ color: ACCENT, weight: 1.5, opacity: 0.7, dashArray: '3 4', interactive: false }
			).addTo(map);
		});
	}

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
		const color = aircraftKind(f) === 'military' ? MILITARY_BLUE : f.category === 'airline' ? '#ec3013' : '#201e1d';
		const shown = displayAlt(v[2], alt, altView.mode);
		const html = dataBlockHtml({ label: `${flightLabel(f)}${f.type ? ' · ' + f.type : ''}`, altFt: shown.ft, altUnit: shown.mode === 'agl' ? 'AGL' : 'ADS-B', gsKt: v[3], trend: trendOf(vel ? vel[2] * 1000 : null), time: localTimeZoned(tz, t, true) }, color);
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
		const kind = aircraftKind(f);
		const base: LeafletNS.PathOptions =
			kind === 'military'
				? { color: MILITARY_BLUE, weight: 2.5, opacity: 0.9 }
				: f.category === 'airline'
					? { color: '#ec3013', weight: 2.5, opacity: 1 }
					: { color: '#201e1d', weight: 1.75, opacity: 0.55 };
		if (!focused) return base;
		if (f.id === focused) return { ...base, weight: 4, opacity: 1 };
		return { ...base, opacity: 0.16 };
	}

	function draw() {
		if (!base || !L) return;
		playing = false;
		cancelAnimationFrame(raf);
		clearHold();
		visited.clear();
		started = false;
		t = span?.start ?? 0;
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
	// Advance the replay whenever the clock (or the altitude mode) changes.
	$effect(() => {
		void t;
		void started;
		void altView.mode;
		if (base) drawReplay();
	});
	onMount(() => () => {
		cancelAnimationFrame(raf);
		clearTimeout(holdTimer);
	});
</script>

<div class="replay-map-wrap">
	<div class="flight-map" bind:this={el} style:height="{height}px" aria-label="Map of flight paths near the airport"></div>
	{#if replay && span}
		<div class="replay-clock" data-testid="night-time" data-t={started ? t : span.start}>{localTimeZoned(tz, started ? t : span.start)}</div>
	{/if}
</div>
{#if replay}
	<div class="replay-controls" data-testid="night-replay">
		<button class="btn play" data-testid="night-play" onclick={play} disabled={!span} aria-label={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'} title={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}>
			{@html playing ? PAUSE_ICON : atEnd ? REPLAY_ICON : PLAY_ICON}
		</button>
		<div class="replay-track-col">
		<div class="replay-track">
			{#each privateBands as b, i (i)}
				<span class="replay-band private" data-testid="night-private-band" style="--from: {b.from.toFixed(4)}; --to: {b.to.toFixed(4)}"></span>
			{/each}
			{#each militaryBands as b, i (i)}
				<span class="replay-band military" data-testid="night-military-band" style="--from: {b.from.toFixed(4)}; --to: {b.to.toFixed(4)}"></span>
			{/each}
			{#each airlineBands as b, i (i)}
				<span class="replay-band" data-testid="night-airline-band" style="--from: {b.from.toFixed(4)}; --to: {b.to.toFixed(4)}"></span>
			{/each}
			<input class="replay-scrubber" data-testid="night-scrubber" type="range" min="0" max={STEPS - 1} step="1" value={step} oninput={scrub} aria-label="Replay position" disabled={!span} />
			{#if span}
				{#each sortedIncidents as inc (inc.id)}
					<span class="replay-pip" data-testid="night-pip" style="--pip: {((inc.t - span.start) / (span.end - span.start)).toFixed(4)}" title="Close approach at {localTimeZoned(tz, inc.t)}"></span>
				{/each}
			{/if}
		</div>
		{#if span}
			<div class="replay-marks" data-testid="night-marks" bind:clientWidth={marksW}>
				{#each marks.filter((m) => m.lane >= 0) as m, i (m.kind + i)}
					<span class="mark {m.kind === 'pip' ? 'pip-mark' : m.kind} lane-{m.lane}" class:edge-left={m.kind === 'pip' && m.x < MARK_W / 2} class:edge-right={m.kind === 'pip' && marksW - m.x < MARK_W / 2} style="--pip: {m.frac.toFixed(4)}">{m.text}</span>
				{/each}
			</div>
		{/if}
		</div>
		<div class="replay-speeds" role="group" aria-label="Step 15 seconds">
			<button onclick={() => nudge(-1)} disabled={!span} aria-label="Back 15 seconds" data-testid="night-back" title="Back 15 seconds">−15s</button>
			<button onclick={() => nudge(1)} disabled={!span} aria-label="Forward 15 seconds" data-testid="night-forward" title="Forward 15 seconds">+15s</button>
		</div>
		<div class="replay-speeds" role="group" aria-label="Replay speed">
			{#each SPEEDS as sp (sp)}
				<button class:on={speed === sp} onclick={() => (speed = sp)} aria-pressed={speed === sp}>{sp}×</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.flight-map {
		width: 100%;
		background: var(--ground-alt);
	}
</style>
