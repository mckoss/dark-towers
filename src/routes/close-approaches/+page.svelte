<script lang="ts">
	import { localTime, nightLabel } from '$lib/time';
	import AircraftIdentity from '$lib/components/AircraftIdentity.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')}'`;
	const nm = (n: number) => `${n.toFixed(2)} NM`;
	const heading = $derived(data.airport ? `Close approaches at ${data.airport.name}` : 'Close approaches');
	const periodLabel = $derived(data.night ? `Night of ${nightLabel(data.night)}` : data.period.label);
	const sortOptions = [
		{ value: 'closest', label: 'Closest' },
		{ value: 'airport', label: 'Airport' },
		{ value: 'date', label: 'Date' }
	] as const;
	function sortHref(sort: 'closest' | 'airport' | 'date'): string {
		const q = new URLSearchParams();
		if (data.airport) q.set('airport', data.airport.code);
		if (data.night) q.set('night', data.night);
		else if (data.period.month) q.set('month', data.period.month);
		if (sort !== 'closest') q.set('sort', sort);
		const query = q.toString();
		return `/close-approaches${query ? `?${query}` : ''}`;
	}
</script>

<svelte:head>
	<title>{heading} — Dark Towers</title>
</svelte:head>

<section class="section head">
	<div class="table-header">Below the controller separation standard</div>
	<h1>{heading}</h1>
	<p>{periodLabel} · {data.rows.length.toLocaleString('en-US')} {data.rows.length === 1 ? 'event' : 'events'}</p>
</section>

<section class="section listing" aria-label="Close approaches">
	<div class="sort-bar">
		<div>
			<div class="table-header">Sort by</div>
			<div class="sort-note">Closest uses straight-line proximity; airport and date groups rank their closest approaches first.</div>
		</div>
		<nav class="sort-options" aria-label="Sort close approaches">
			{#each sortOptions as option (option.value)}
				<a href={sortHref(option.value)} class:active={data.sort === option.value} aria-current={data.sort === option.value ? 'page' : undefined}>{option.label}</a>
			{/each}
		</nav>
	</div>
	<div class="row table-header thead">
		<div>When</div>
		<div>Airport</div>
		<div>Aircraft</div>
		<div>Lateral</div>
		<div>Vertical</div>
		<div></div>
	</div>
	{#each data.rows as incident (incident.id)}
		<div class="row item" data-testid="approach-row" data-airport={incident.airportCode} data-night={incident.night} data-lateral={incident.lateralNm} data-vertical={incident.verticalFt}>
			<a class="row-link" href="/close-approach/{incident.id}" aria-label="Watch replay of {incident.identA} and {incident.identB}"></a>
			<div class="when tabular"><strong>{nightLabel(incident.night)}</strong><span>{localTime(incident.tz, incident.t, true)}</span></div>
			<div><strong>{incident.airportCode}</strong><span>{incident.airportName}</span></div>
			<div class="pair"><AircraftIdentity identity={incident.identityA} /><span>×</span><AircraftIdentity identity={incident.identityB} /></div>
			<div class="tabular">{nm(incident.lateralNm)}</div>
			<div class="tabular">{ft(incident.verticalFt)}</div>
			<div class="watch">Watch replay →</div>
		</div>
	{:else}
		<div class="empty">No close approaches were detected in this period.</div>
	{/each}
</section>

<style>
	.head {
		padding: 32px var(--gutter) 28px;
	}
	h1 {
		margin-top: 7px;
		font-size: clamp(30px, 5vw, 52px);
		font-weight: 900;
		letter-spacing: -0.04em;
	}
	.head p {
		margin-top: 10px;
		color: var(--ink-60);
	}
	.listing {
		padding: 0 var(--gutter) 64px;
	}
	.sort-bar {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		padding: 12px 0;
		border-top: var(--rule);
	}
	.sort-note {
		margin-top: 4px;
		font-size: 12px;
		color: var(--ink-60);
	}
	.sort-options {
		display: flex;
		border: 2px solid var(--ink);
	}
	.sort-options a {
		padding: 8px 13px;
		border: none;
		color: var(--ink);
		font-size: 12px;
		font-weight: 800;
	}
	.sort-options a + a {
		border-left: 2px solid var(--ink);
	}
	.sort-options a:hover,
	.sort-options a:focus-visible {
		background: var(--ground-alt);
		color: var(--ink);
	}
	.sort-options a.active {
		background: var(--ink);
		color: white;
	}
	.row {
		display: grid;
		grid-template-columns: 190px minmax(140px, 1fr) minmax(180px, 1.2fr) 95px 95px 125px;
		align-items: center;
		gap: 16px;
		padding: 14px 10px;
		border-bottom: var(--row-rule);
	}
	.thead {
		border-top: var(--rule);
	}
	.item {
		position: relative;
		color: inherit;
	}
	.row-link { position: absolute; inset: 0; z-index: 1; border: 0; }
	.item > :not(.row-link) { position: relative; z-index: 2; pointer-events: none; }
	.item :global(.identity-link) { pointer-events: auto; }
	.item:hover,
	.item:focus-visible {
		background: var(--ground-alt);
		color: inherit;
		outline: none;
	}
	.item span {
		display: block;
		margin-top: 3px;
		font-size: 12px;
		color: var(--ink-60);
	}
	.pair {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 7px;
		font-weight: 700;
	}
	.watch {
		font-size: 12px;
		font-weight: 800;
		color: var(--accent);
	}
	.empty {
		padding: 48px 10px;
		color: var(--ink-60);
	}
	@media (max-width: 800px) {
		.sort-bar {
			align-items: flex-start;
			flex-direction: column;
		}
		.thead { display: none; }
		.row {
			grid-template-columns: 1fr 1fr;
			gap: 12px 18px;
			padding: 18px 4px;
		}
		.pair { grid-column: 1 / -1; }
		.watch { text-align: right; }
	}
</style>
