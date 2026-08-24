<script lang="ts">
	import { flightKind, flightLabel } from '$lib/flights';
	import { localTime } from '$lib/time';
	import AircraftHero from '$lib/components/AircraftHero.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const r = $derived(data.registry);
	const aircraftType = $derived(data.sightings.find((sighting) => sighting.flight.type)?.flight.type ?? null);
	const observedAirframe = $derived(data.sightings.find((sighting) => sighting.flight.airframe)?.flight.airframe ?? null);
	const observedCategory = $derived(data.sightings[0]?.flight.category ?? null);
	const ownerLocation = $derived(r ? [r.ownerCity, r.ownerState || r.ownerCountry].filter(Boolean).join(', ') : '');
	const flightAware = $derived(`https://www.flightaware.com/resources/registration/${encodeURIComponent(data.registration)}`);
	const faa = $derived(`https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(data.registration.slice(1))}`);
	const replayHref = (s: PageData['sightings'][number]) => `/airport/${s.airportCode}?night=${s.flight.night}&t=${s.flight.eventTime}#night-replay`;
	const isCloseApproach = (s: PageData['sightings'][number]) => s.closeApproaches.some((incident) => incident.kind !== 'wake-turbulence');
	const eventDate = (s: PageData['sightings'][number]) => new Intl.DateTimeFormat('en-US', { timeZone: s.tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(s.flight.eventTime));
</script>

<svelte:head>
	<title>{data.registration} aircraft — Dark Towers</title>
	<meta name="description" content="FAA registration details and Dark Towers sightings for {data.registration}." />
</svelte:head>

<section class="section split aircraft-head">
	<div class="cell-lg">
		<div class="kicker">Aircraft registration</div>
		<h1 class="page-headline">{data.registration}</h1>
		<p class="body">{r?.label ?? data.sightings[0]?.flight.type ?? 'Aircraft observed by Dark Towers'}</p>
		<AircraftHero type={aircraftType} registryLabel={r?.label} model={r?.model} airframe={r?.airframe ?? observedAirframe} category={observedCategory} />
	</div>
	<div class="cell-lg facts">
		{#if r}
			<dl>
				<dt>Manufacturer</dt><dd>{r.manufacturer}</dd>
				<dt>Model</dt><dd>{r.model}</dd>
				<dt>Year</dt><dd>{r.year ?? '—'}</dd>
				<dt>Airframe</dt><dd>{r.airframe}</dd>
				<dt>Registered owner</dt><dd>{r.ownerName ?? '—'}</dd>
				<dt>Owner location</dt><dd>{ownerLocation || '—'}</dd>
				<dt>Registration type</dt><dd>{r.registrantType ?? '—'}</dd>
				<dt>Registry date</dt><dd>{r.asOf}</dd>
			</dl>
			<p class="footnote">Current FAA registration information; the registered owner may be a lessor, trust, or holding company rather than the operator on a recorded flight.</p>
		{:else}
			<p class="body">No current FAA registration record is available, but Dark Towers has recorded this registration.</p>
		{/if}
		<div class="external"><a href={flightAware} target="_blank" rel="noreferrer">View on FlightAware ↗</a><a href={faa} target="_blank" rel="noreferrer">View FAA record ↗</a></div>
	</div>
</section>

<section class="section sightings">
	<div class="table-head"><div><div class="kicker">Dark Towers data</div><h2 class="section-heading">Recorded sightings</h2></div><div class="footnote">Newest first · {data.sightings.length} {data.sightings.length === 1 ? 'flight' : 'flights'}</div></div>
	<div class="rows">
		<div class="row table-header head"><div>When</div><div>Airport</div><div>Flight</div><div>Movement</div><div>Links</div></div>
		{#each data.sightings as sighting (sighting.flight.id)}
			<div class="row sighting" class:close-approach={isCloseApproach(sighting)} data-testid="aircraft-sighting" data-event-time={sighting.flight.eventTime}>
				<div><strong>{eventDate(sighting)}</strong><span>{localTime(sighting.tz, sighting.flight.eventTime, true)}</span></div>
				<div><strong>{sighting.airportCode}</strong><span>{sighting.airportName}</span></div>
				<div><strong>{flightLabel(sighting.flight)}</strong><span>{flightKind(sighting.flight)}{sighting.flight.type ? ` · ${sighting.flight.type}` : ''}</span></div>
				<div>{sighting.flight.direction === 'arrival' ? 'Arriving' : 'Leaving'}</div>
				<div class="links"><a href={replayHref(sighting)}>Watch flight</a>{#each sighting.closeApproaches as incident (incident.id)}<a href="/close-approach/{incident.id}">{incident.kind === 'wake-turbulence' ? 'Wake event' : 'Close approach'}</a>{/each}</div>
			</div>
		{:else}
			<div class="empty">No Dark Towers flights are stored for this registration yet.</div>
		{/each}
	</div>
</section>

<style>
	.aircraft-head .page-headline { margin-top: 12px; }
	.facts dl { display: grid; grid-template-columns: max-content 1fr; gap: 7px 18px; font-size: 14px; }
	.facts dt { color: var(--ink-60); }
	.facts dd { margin: 0; font-weight: 650; }
	.facts .footnote { margin-top: 18px; max-width: 56ch; line-height: 1.45; }
	.external { display: flex; flex-wrap: wrap; gap: 10px 20px; margin-top: 18px; font-weight: 750; }
	.sightings { padding: 0 var(--gutter) 64px; }
	.table-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding: 30px 0 18px; }
	.section-heading { margin-top: 5px; }
	.rows { border-top: var(--rule); }
	.row { display: grid; grid-template-columns: 190px minmax(150px, 1fr) minmax(180px, 1fr) 100px minmax(130px, 0.8fr); gap: 16px; align-items: center; padding: 14px 10px; border-bottom: var(--row-rule); font-size: 14px; }
	.row span { display: block; margin-top: 3px; color: var(--ink-60); font-size: 12px; }
	.row.close-approach { background: var(--accent-tint); }
	.links { display: flex; flex-wrap: wrap; gap: 5px 12px; font-size: 12px; font-weight: 800; }
	.empty { padding: 48px 10px; color: var(--ink-60); }
	@media (max-width: 760px) {
		.table-head { align-items: flex-start; flex-direction: column; }
		.row.head { display: none; }
		.row { grid-template-columns: 1fr 1fr; gap: 10px 16px; padding: 18px 7px; }
		.links { grid-column: 1 / -1; }
		.facts dl { grid-template-columns: 1fr; gap: 3px; }
		.facts dd + dt { margin-top: 7px; }
	}
</style>
