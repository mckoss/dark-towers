<script lang="ts">
	import Replay from '$lib/components/Replay.svelte';
	import MapLegend from '$lib/components/MapLegend.svelte';
	import { AIRSPACE_RADIUS_NM } from '$lib/airports';
	import { flightLabel, flightSubLabel } from '$lib/flights';
	import { pairColors, WINDOW_AFTER_MS, WINDOW_BEFORE_MS } from '$lib/replay';
	import { localTime, localTimeZoned, nightLabel } from '$lib/time';
	import { altContextFor, altView, displayAlt, setAltMode, type AltContext } from '$lib/altview.svelte';
	import type { Flight } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const { incident, airport, a, b, others, related } = $derived(data);

	// Altitudes: above the field by default (reported pressure altitude corrected
	// by the hour's altimeter setting), or raw as reported if the reader asks.
	// One correction for the whole page, fixed at the closest moment: the
	// replay, the sidebar and the cards all use it, so both aircraft are
	// always corrected by the same amount.
	const altCtx: AltContext = $derived(altContextFor(data.night, airport.elevationFt, incident.t));
	const altSource = $derived(altCtx.source);
	const correction = $derived(altCtx.offsetFt);
	const showAlt = (reported: number) => {
		const d = displayAlt(reported, altCtx, altView.mode);
		return `${d.ft.toLocaleString('en-US')} ft ${d.mode === 'reported' ? 'ADS-B' : 'AGL'}`;
	};
	const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('en-US')}'`;

	const colors = $derived(pairColors(a, b));
	/** Whether any other aircraft was airborne inside the replay window (decides the grey legend row). */
	const concurrentOthers = $derived.by(() => {
		const start = incident.t - WINDOW_BEFORE_MS,
			end = incident.t + WINDOW_AFTER_MS;
		return others.some((f) => f.positions.length > 1 && f.positions[0].t <= end && f.positions[f.positions.length - 1].t >= start);
	});
	/** Key for the replay map: the pair's two colours by kind (both accent/ink when they share a kind), other traffic, the ring. */
	const legend = $derived.by(() => {
		const kindLabel = (f: Flight) => (f.category === 'airline' ? 'Passenger airline' : 'Private and training aircraft');
		const items = [
			{ kind: colors[0], label: a.category === b.category ? flightLabel(a) : kindLabel(a) },
			{ kind: colors[1], label: a.category === b.category ? flightLabel(b) : kindLabel(b) }
		];
		const grey = concurrentOthers ? [{ kind: 'grey' as const, label: 'Other aircraft flying at the time' }] : [];
		return [...items, ...grey, { kind: 'ring' as const, label: `${AIRSPACE_RADIUS_NM} nautical mile ring` }];
	});
	const nm = (n: number) => `${n.toFixed(2)} NM`;
	const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')}'`;
	const feet = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`;

	const kindLabel = (f: Flight) => (f.category === 'airline' ? 'Passenger airline' : 'Private or training');
	const describe = (f: Flight) => `${kindLabel(f)}${f.type ? ` · ${f.type}` : ''}`;

	function movement(f: Flight): string {
		const other = f.otherCity ?? f.otherName ?? f.otherCode;
		if (f.direction === 'arrival') return other ? `arriving from ${other}` : 'arriving';
		return other ? `leaving for ${other}` : 'leaving';
	}
</script>

<svelte:head>
	<title>{flightLabel(a)} and {flightLabel(b)} · close approach · Dark Towers</title>
</svelte:head>

<section class="section head">
	<div class="meta">
		<a class="back" href="/airport/{airport.code}">← {airport.name}</a>
		<span class="ref">{nightLabel(incident.night)}</span>
	</div>
	<h1 class="headline">{flightLabel(a)} and {flightLabel(b)} — <span class:accent-text={incident.severity === 'very-close'}>{incident.severity === 'very-close' ? 'very close approach' : 'close approach'} at {localTimeZoned(airport.tz, incident.t)}</span></h1>
</section>

<section class="section split">
	<div class="replay-col">
		{#key incident.id}
			<Replay {airport} {a} {b} {incident} {others} alt={altCtx} />
		{/key}
		<MapLegend items={legend} />
	</div>
	<div class="facts">
		<div class="fact">
			<div class="table-header">Nearest approach · {localTime(airport.tz, incident.t, true)}</div>
			<div class="fact-row">
				<div class="figure accent tabular">{ft(incident.verticalFt)} <span class="at">at</span> {nm(incident.lateralNm)}</div>
			</div>
			<div class="at-moment" data-testid="nearest-moment">
				{#each [{ f: a, alt: incident.altA, gs: incident.gsA, swatch: colors[0] }, { f: b, alt: incident.altB, gs: incident.gsB, swatch: colors[1] }] as row (row.f.id)}
					<div class="moment-row">
						<span class="swatch" class:swatch-accent={row.swatch === 'accent'} class:swatch-ink={row.swatch === 'ink'}></span>
						<span class="who">
							<span class="who-name">{flightLabel(row.f)}{#if flightSubLabel(row.f)}<span class="who-sub">{flightSubLabel(row.f)}</span>{/if}</span>
							<span class="who-desc">{describe(row.f)} · {movement(row.f)}</span>
						</span>
						<span class="tabular">{showAlt(row.alt)}</span>
						<span class="tabular">{row.gs} kt</span>
					</div>
				{/each}
			</div>
			<div class="alt-note" data-testid="alt-note">
				{#if altView.mode === 'agl'}
					{#if altSource === 'on-field'}
						AGL = height above the field: ADS-B altitude, corrected {signed(-correction)} — {altCtx.points === 1 ? 'an aircraft' : `${altCtx.points} reports from aircraft`} on the field within an hour of this moment read {signed(correction)} against the field elevation of {airport.elevationFt.toLocaleString('en-US')}'. Source altitudes come in 100' steps.
					{:else if altSource === 'weather'}
						AGL = height above the field: ADS-B altitude, corrected {signed(-correction)} for the air pressure at {localTime(airport.tz, incident.t, true)}, minus the field elevation of {airport.elevationFt.toLocaleString('en-US')}'. Source altitudes come in 100' steps.
					{:else if altSource === 'tracks'}
						AGL = height above the field: ADS-B altitude, corrected {signed(-correction)} from the lowest points of that night's tracks near the runway, minus the field elevation of {airport.elevationFt.toLocaleString('en-US')}'. Source altitudes come in 100' steps.
					{:else}
						AGL = height above the field ({airport.elevationFt.toLocaleString('en-US')}'), uncorrected: no ground reference for this night.
					{/if}
					<button type="button" class="alt-switch" onclick={() => setAltMode('reported')}>Show ADS-B altitudes</button>
				{:else}
					ADS-B altitude: the figure each aircraft broadcast, which is measured against a standard air pressure and not corrected for the day's weather or the field elevation.
					<button type="button" class="alt-switch" onclick={() => setAltMode('agl')}>Show heights AGL</button>
				{/if}
			</div>
		</div>
		<div class="fact">
			<div class="table-header">What a controller requires</div>
			<div class="fact-row">
				<div class="figure tabular small">3 NM <span class="at">or</span> 1,000'</div>
				<div class="caption">at least 3 NM apart side to side, or at least 1,000' apart vertically — one is enough</div>
			</div>
		</div>
	</div>
</section>


<section class="others">
	<h2 class="others-heading">Other close approaches at {airport.name}</h2>
	<div class="row table-header thead">
		<div>When</div>
		<div>Aircraft</div>
		<div>Lateral</div>
		<div>Vertical</div>
	</div>
	{#each related as r (r.id)}
		<a class="row item" href="/close-approach/{r.id}">
			<div class="ref tabular">{nightLabel(r.night)} · {localTime(airport.tz, r.t)}</div>
			<div class="pair">{r.identA} × {r.identB}</div>
			<div class="num tabular">{nm(r.lateralNm)}</div>
			<div class="num tabular">{ft(r.verticalFt)}</div>
		</a>
	{:else}
		<div class="empty">No other close approaches in the last 30 days.</div>
	{/each}
</section>

<style>
	/* Kept short so the map below is in view on arrival. */
	.head {
		padding: 14px var(--gutter) 16px;
	}
	.back {
		font-size: 13px;
		font-weight: 600;
		border: none;
		margin-right: 10px;
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.ref {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-45);
	}
	.headline {
		margin-top: 10px;
		font-size: 26px;
		font-weight: 900;
		line-height: 1.1;
		letter-spacing: -0.02em;
		word-spacing: 0.08em;
	}
	.headline .accent-text {
		color: var(--accent);
	}
	.facts {
		display: grid;
		grid-template-rows: auto auto;
		align-content: start;
	}
	.fact {
		padding: 24px;
		border-bottom: var(--row-rule);
	}
	.fact:last-child {
		border-bottom: none;
	}
	.at-moment {
		margin-top: 14px;
		border-top: var(--row-rule);
		font-size: 14px;
	}
	.alt-note {
		margin-top: 12px;
		font-size: 12px;
		color: var(--ink-45);
	}
	.alt-switch {
		display: block;
		margin-top: 6px;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--ink);
		text-decoration: underline;
		cursor: pointer;
	}
	.moment-row {
		display: grid;
		grid-template-columns: 12px minmax(0, 1fr) auto auto;
		gap: 12px;
		align-items: center;
		padding: 8px 0;
		border-bottom: var(--row-rule);
	}
	.moment-row .swatch {
		width: 12px;
		height: 12px;
	}
	.moment-row .tabular {
		white-space: nowrap;
		text-align: right;
	}
	.moment-row .who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.who-name {
		font-weight: 700;
	}
	.who-sub {
		margin-left: 0.45em;
		font-weight: 400;
		color: var(--ink-45);
	}
	.who-desc {
		font-size: 12px;
		color: var(--ink-60);
	}
	.at {
		font-size: 0.5em;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-60);
		margin: 0 0.15em;
	}
	.figure.small {
		font-size: 32px;
	}
	.fact-row {
		display: flex;
		align-items: baseline;
		gap: 14px;
		margin-top: 10px;
	}
	.figure {
		font-size: 48px;
		font-weight: 900;
		letter-spacing: -0.03em;
		line-height: 0.9;
		white-space: nowrap;
	}
	.caption {
		font-size: 14px;
		color: var(--ink-60);
	}
	.replay-col {
		min-width: 0;
	}
	.swatch {
		display: block;
		width: 22px;
		height: 4px;
	}
	.swatch-accent {
		background: var(--accent);
	}
	.swatch-ink {
		background: var(--ink);
	}
	.others {
		padding: 36px var(--gutter) 64px;
	}
	.others-heading {
		margin-bottom: 16px;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.row {
		display: grid;
		grid-template-columns: 260px 1fr 120px 120px;
		align-items: center;
		gap: 0 12px;
	}
	.thead {
		padding: 10px 0;
		border-top: var(--rule);
		border-bottom: var(--row-rule);
	}
	.item {
		padding: 16px 0;
		border-bottom: var(--row-rule);
		color: var(--ink);
	}
	.item:hover {
		background: var(--ground-alt);
		color: var(--ink);
	}
	.item .ref {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: none;
	}
	.pair {
		font-size: 16px;
		font-weight: 600;
	}
	.num {
		font-size: 16px;
		font-weight: 800;
		color: var(--accent);
	}
	.empty {
		padding: 16px 0;
		font-size: 15px;
		color: var(--ink-60);
		border-bottom: var(--row-rule);
	}
	@media (max-width: 760px) {
		.headline {
			font-size: 22px;
		}
		.fact {
			padding: 20px var(--gutter);
		}
		.figure {
			font-size: 40px;
		}
		.row {
			grid-template-columns: 1fr 1fr;
			gap: 4px 12px;
		}
		.thead {
			display: none;
		}
		.item .ref {
			grid-column: 1 / -1;
		}
		.pair {
			grid-column: 1 / -1;
		}
	}
</style>
