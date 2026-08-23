<script lang="ts">
	/* Airport detail (README "Screens / Views → 3. Airport detail"). Every
	   string comes from the airport record; nothing is hard-coded. */
	import { goto } from '$app/navigation';
	import { towerHoursLabel, hoursClosed, hourLabel, towerHoursOn, AIRSPACE_RADIUS_NM } from '$lib/airports';
	import { nightLabel } from '$lib/time';
	import { monthLabel } from '$lib/monthLabel';
	import FlightMap from '$lib/components/FlightMap.svelte';
	import { altContextFor } from '$lib/altview.svelte';
	import { median } from '$lib/util';
	import NightCalendar from '$lib/components/NightCalendar.svelte';
	import CloseApproachCard from '$lib/components/CloseApproachCard.svelte';
	import FlightLog from '$lib/components/FlightLog.svelte';

	let { data } = $props();

	const airport = $derived(data.airport);
	/** "Tower closed 9:00 pm to 7:00 am" for the selected night, or "No tower at any hour". */
	function nightHours(night: string): string {
		const h = towerHoursOn(airport, night);
		return h ? `Tower closed ${hourLabel(h.close)} to ${hourLabel(h.open)}` : 'No tower at any hour';
	}
	// One pressure correction for the whole map, evaluated at the middle of the night's traffic.
	const altCtx = $derived(altContextFor(data.nightSummary, airport.elevationFt, median(data.flights.map((f) => f.eventTime)) ?? 0));
	const hasDetail = $derived(data.hasAnyData);
	const periodPhrase = $derived(data.period.month ? data.period.label : 'the last 30 days');
	const nightFlights = $derived(data.nightSummary?.flights ?? data.flights.length);
	const nightAirline = $derived(data.nightSummary?.airline ?? data.flights.filter((f) => f.category === 'airline').length);
	const nightPrivate = $derived(data.nightSummary?.private ?? data.flights.filter((f) => f.category === 'private').length);
	const hasTracks = $derived(data.flights.some((f) => f.positions.length > 1));

	let focus: string | null = $state(null);



	function selectNight(n: string) {
		focus = null;
		const q = new URLSearchParams({ night: n });
		if (data.period.month) q.set('month', data.period.month);
		goto(`?${q}`, { keepFocus: true, noScroll: true });
	}

	function windowHref(month: string | null): string {
		return month ? `?month=${month}` : '?';
	}

	const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<svelte:head>
	<title>{airport.code} · {airport.name} — Dark Towers</title>
</svelte:head>

<section class="section split">
	<div class="cell">
		<div class="kicker">Tracked nightly · within {AIRSPACE_RADIUS_NM} nautical miles</div>
		<div class="title">
			<h1 class="code">{airport.code}</h1>
			<div class="name-block">
				<div class="name">{airport.name}</div>
				<div class="place">{airport.city}, {airport.state} · {airport.icao}</div>
			</div>
		</div>
	</div>
	<div class="facts">
		<div class="fact">
			<div class="fact-label">Tower hours</div>
			<div class="fact-value">{towerHoursLabel(airport)}</div>
		</div>
		<div class="fact">
			<div class="fact-label">Hours closed</div>
			<div class="fact-value">{hoursClosed(airport)} of 24</div>
		</div>
		<div class="fact">
			<div class="fact-label">Airlines serving</div>
			<div class="fact-value">{airport.carriers.join(', ')}</div>
		</div>
		<div class="fact">
			<div class="fact-label">Detailed data</div>
			<div class="fact-value">{hasDetail ? 'Nightly' : 'Not yet'}</div>
		</div>
	</div>
</section>

<div class="stats-kicker table-header">Over {periodPhrase} · when the tower was closed</div>
<section class="section stats">
	<div class="stat"><div class="stat-n">{fmt(data.totals.flights)}</div><div class="stat-label">Flights in and out</div></div>
	<div class="stat"><div class="stat-n">{fmt(data.totals.airline)}</div><div class="stat-label">Passenger airline</div></div>
	<div class="stat"><div class="stat-n">{fmt(data.totals.private)}</div><div class="stat-label">Private and training aircraft</div></div>
	<div class="stat"><div class="stat-n accent">{fmt(data.totals.incidents)}</div><div class="stat-label">Close approaches</div></div>
</section>

{#if !hasDetail}
	<section class="section empty">
		<h2 class="empty-title">Nightly detail for {airport.code} is not published yet.</h2>
		<p class="empty-body">The totals above cover {periodPhrase}. Flight paths and individual close approaches are available for Paine Field.</p>
		<a class="btn" href="/airport/PAE">See the Paine Field record</a>
	</section>
{:else}
	<section class="section calendar">
		<div class="cal-head">
			<h2 class="cal-title">{data.period.label}</h2>
			<nav class="cal-nav" aria-label="Time window">
				{#if data.nav.prev}
					<a class="cal-step" href={windowHref(data.nav.prev)} data-testid="window-prev">← {monthLabel(data.nav.prev)}</a>
				{:else}
					<span class="cal-step disabled">← Earlier</span>
				{/if}
				{#if !data.nav.isDefault}
					{#if data.nav.next}
						<a class="cal-step" href={windowHref(data.nav.next)} data-testid="window-next">{monthLabel(data.nav.next)} →</a>
					{/if}
					<a class="cal-step latest" href={windowHref(null)} data-testid="window-latest">Last 30 days →</a>
				{/if}
			</nav>
		</div>
		<NightCalendar calendar={data.calendar} selected={data.selectedNight} onselect={selectNight} />
	</section>

	{#if data.selectedNight}
		<section class="section split night">
			<div class="night-left">
				<div class="night-head">
					<div class="table-header">Flight paths within {AIRSPACE_RADIUS_NM} nautical miles, tower closed</div>
					<h2 class="night-title">Night of {nightLabel(data.selectedNight)}</h2>
					<div class="night-hours" data-testid="night-hours">{nightHours(data.selectedNight)}</div>
				</div>
				{#if hasTracks}
					<FlightMap center={airport.pos} flights={data.flights} {focus} height={560} alt={altCtx} tz={airport.tz} incidents={data.incidents} replay onfocus={(id) => (focus = id)} />
				{:else}
					<div class="no-tracks inset">Flight paths for this night are not available.</div>
				{/if}
				<div class="map-legend">
					<span><i class="line-accent"></i>Passenger airline</span>
					<span><i class="line-ink"></i>Private and training aircraft</span>
					<span><i class="ring"></i>{AIRSPACE_RADIUS_NM} nautical mile ring</span>
				</div>
			</div>
			<div class="night-right">
				<div class="night-head"><div class="table-header">Close approaches this night</div></div>
				{#if data.incidents.length}
					{#each data.incidents as inc (inc.id)}
						<CloseApproachCard incident={inc} identA={data.idents[inc.flightA] ?? '?'} identB={data.idents[inc.flightB] ?? '?'} tz={airport.tz} />
					{/each}
				{:else}
					<p class="no-incidents">No two aircraft came within 3 nautical miles and 1,000 feet of each other this night, across all {nightFlights} flights.</p>
				{/if}
				<div class="night-totals">
					<div class="table-header">That night, in total</div>
					<div class="totals-grid">
						<div><div class="tot-n">{nightFlights}</div><div class="tot-label">Flights</div></div>
						<div><div class="tot-n">{nightAirline}</div><div class="tot-label">Passenger airline</div></div>
						<div><div class="tot-n">{nightPrivate}</div><div class="tot-label">Private and training</div></div>
					</div>
				</div>
			</div>
		</section>

		<section class="log">
			<h2 class="log-title">Flight log — {nightLabel(data.selectedNight)}</h2>
			<FlightLog flights={data.flights} tz={airport.tz} {focus} onfocus={(id) => (focus = id)} />
		</section>
	{/if}
{/if}

<style>
	.title {
		display: flex;
		align-items: flex-start;
		gap: 18px;
		margin-top: 14px;
		flex-wrap: wrap;
	}
	.code {
		font-size: 66px;
		font-weight: 900;
		line-height: 0.85;
		letter-spacing: -0.04em;
	}
	.name {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1;
		/* Cap height of the 22px name sits level with the cap height of the 66px code. */
		margin-top: 3px;
	}
	.place {
		margin-top: 6px;
	}
	.place {
		font-size: 15px;
		color: var(--ink-60);
	}
	.facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.fact {
		padding: 22px 20px;
	}
	.fact:nth-child(-n + 2) {
		border-bottom: var(--row-rule);
	}
	.fact:nth-child(odd) {
		border-right: var(--row-rule);
	}
	.fact-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-45);
	}
	.fact-value {
		margin-top: 8px;
		font-size: 20px;
		font-weight: 700;
	}
	.stats-kicker {
		padding: 20px var(--gutter) 0;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	.stat {
		padding: 28px 20px;
	}
	.stat + .stat {
		border-left: var(--row-rule);
	}
	.stat-n {
		font-size: 44px;
		font-weight: 900;
		line-height: 0.9;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}
	.stat .stat-label {
		margin-top: 10px;
		font-size: 11px;
	}
	.empty {
		padding: 48px var(--gutter) 64px;
	}
	.empty-title {
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.empty-body {
		margin: 12px 0 24px;
		max-width: 60ch;
		font-size: 16px;
		line-height: 1.55;
		color: var(--ink-60);
	}
	.empty .btn {
		border: none;
	}
	.cal-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px 24px;
	}
	.cal-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
	}
	.cal-step {
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.04em;
		border: 2px solid var(--ink);
		border-right: none;
		color: var(--ink);
	}
	.cal-step:last-child {
		border-right: 2px solid var(--ink);
	}
	.cal-step:hover {
		background: var(--ground-alt);
		color: var(--ink);
	}
	.cal-step.latest {
		background: var(--ink);
		color: #fff;
	}
	.cal-step.disabled {
		color: var(--ink-25);
		border-color: var(--hairline);
	}
	.calendar {
		padding: 36px var(--gutter);
	}
	.cal-title {
		margin-bottom: 20px;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.night-head {
		padding: 20px var(--gutter);
		border-bottom: var(--row-rule);
	}
	.night-hours {
		margin-top: 4px;
		font-size: 13px;
		color: var(--ink-45);
	}
	.night-title {
		margin-top: 6px;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.no-tracks {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 240px;
		padding: 24px;
		font-size: 15px;
		color: var(--ink-60);
	}
	.map-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 24px;
		padding: 14px var(--gutter);
		border-top: var(--row-rule);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-60);
	}
	.map-legend span {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.map-legend i {
		display: block;
	}
	.line-accent {
		width: 20px;
		height: 3px;
		background: var(--accent);
	}
	.line-ink {
		width: 20px;
		height: 2px;
		background: var(--ink);
	}
	.ring {
		width: 10px;
		height: 10px;
		border: 1px solid var(--ink);
		border-radius: 50% !important;
	}
	.no-incidents {
		padding: 24px;
		font-size: 15px;
		line-height: 1.55;
		color: var(--ink-60);
		border-bottom: var(--row-rule);
	}
	.night-totals {
		padding: 24px;
	}
	.totals-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		margin-top: 16px;
		background: var(--hairline);
		border: 1px solid var(--hairline);
	}
	.totals-grid > div {
		background: var(--ground);
		padding: 16px;
	}
	.tot-n {
		font-size: 30px;
		font-weight: 900;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.tot-label {
		margin-top: 6px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-60);
	}
	.log {
		padding: 36px var(--gutter) 64px;
	}
	.log-title {
		margin-bottom: 20px;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	@media (max-width: 760px) {
		.code {
			font-size: 52px;
		}
		.stats {
			grid-template-columns: 1fr 1fr;
		}
		.stat + .stat {
			border-left: none;
		}
		.stat:nth-child(even) {
			border-left: var(--row-rule);
		}
		.stat:nth-child(-n + 2) {
			border-bottom: var(--row-rule);
		}
		.stat-n {
			font-size: 36px;
		}
		.calendar,
		.log {
			padding: 28px var(--gutter);
		}
	}
</style>
