<script lang="ts">
	import { localTime, nightLabel } from '$lib/time';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')}'`;
	const nm = (n: number) => `${n.toFixed(2)} NM`;
	const heading = $derived(data.airport ? `Close approaches at ${data.airport.name}` : 'Close approaches');
	const periodLabel = $derived(data.night ? `Night of ${nightLabel(data.night)}` : data.period.label);
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
	<div class="row table-header thead">
		<div>When</div>
		<div>Airport</div>
		<div>Aircraft</div>
		<div>Lateral</div>
		<div>Vertical</div>
		<div></div>
	</div>
	{#each data.rows as incident (incident.id)}
		<a class="row item" href="/close-approach/{incident.id}">
			<div class="when tabular"><strong>{nightLabel(incident.night)}</strong><span>{localTime(incident.tz, incident.t, true)}</span></div>
			<div><strong>{incident.airportCode}</strong><span>{incident.airportName}</span></div>
			<div class="pair">{incident.identA} × {incident.identB}</div>
			<div class="tabular">{nm(incident.lateralNm)}</div>
			<div class="tabular">{ft(incident.verticalFt)}</div>
			<div class="watch">Watch replay →</div>
		</a>
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
		color: inherit;
	}
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
