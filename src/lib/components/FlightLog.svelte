<script lang="ts">
	import { flightKind, flightLabel } from '$lib/flights';
	import { aircraftIdentity } from '$lib/aircraft';
	import AircraftIdentity from './AircraftIdentity.svelte';
	/* Flight log table (README §3). Row hover reports the flight id via onfocus
	   so the map can highlight the matching track. */
	import type { Flight, Incident } from '$lib/types';
	import { localTime } from '$lib/time';

	interface Props {
		flights: Flight[];
		tz: string;
		night: string;
		incidents?: Incident[];
		focus?: string | null;
		onfocus?: (id: string | null) => void;
	}
	let { flights, tz, night, incidents = [], focus = null, onfocus }: Props = $props();
	const closeApproachFlights = $derived.by(() => {
		const ids = new Set<string>();
		for (const incident of incidents) {
			if (incident.kind === 'wake-turbulence') continue;
			ids.add(incident.flightA);
			ids.add(incident.flightB);
		}
		return ids;
	});

	const kind = (f: Flight) => flightKind(f);
	const other = (f: Flight) => (f.otherCode ? `${f.otherName ?? f.otherCode} (${f.otherCode})` : 'Unknown');
</script>

<div class="log" aria-label="Flight log">
	<div class="row head table-header">
		<div>Time</div>
		<div>Kind of flight</div>
		<div>Arriving or leaving</div>
		<div>Flight</div>
		<div>Aircraft</div>
		<div>Other airport</div>
	</div>
	{#each flights as f (f.id)}
		<div
			class="row"
			role="group"
			class:focused={f.id === focus}
			class:close-approach={closeApproachFlights.has(f.id)}
			data-testid="flight-log-row"
			onmouseenter={() => onfocus?.(f.id)}
			onmouseleave={() => onfocus?.(null)}
			onfocusin={() => onfocus?.(f.id)}
			onfocusout={() => onfocus?.(null)}
		>
			<a class="row-link" href={`?night=${encodeURIComponent(night)}&t=${f.eventTime}#night-replay`} aria-label="View ${flightLabel(f)} in the night replay"></a>
			<div class="time tabular">{localTime(tz, f.eventTime)}</div>
			<div class="kind" class:airline={f.category === 'airline'}><span class="swatch" class:airline={f.category === 'airline'}></span>{kind(f)}</div>
			<div class="dim movement">{f.direction === 'arrival' ? 'Arriving' : 'Leaving'}</div>
			<div class="ident"><AircraftIdentity identity={aircraftIdentity(f)} />{#if closeApproachFlights.has(f.id)}<span class="sr-only"> — close approach participant</span>{/if}</div>
			<div class="dim type">{f.type ?? '—'}</div>
			<div class="dim other">{other(f)}</div>
		</div>
	{/each}
</div>

<style>
	.row {
		position: relative;
		display: grid;
		grid-template-columns: 92px 150px 110px 1fr 90px 1.4fr;
		align-items: center;
		column-gap: 12px;
		padding: 11px 0;
		border-bottom: var(--row-rule);
		font-size: 14px;
		color: inherit;
		text-decoration: none;
	}
	.row-link { position: absolute; inset: 0; z-index: 0; border: 0; }
	.row > :not(.row-link) { position: relative; z-index: 1; pointer-events: none; }
	.row .ident { pointer-events: none; }
	.row .ident :global(.identity-link) { pointer-events: auto; }
	.row.head {
		border-top: var(--rule);
		padding: 10px 0;
	}
	.row:not(.head):hover,
	.row:not(.head):has(.row-link:focus-visible),
	.row.focused {
		background: var(--ground-alt);
	}
	.row.close-approach {
		background: var(--accent-tint);
	}
	.row.close-approach:hover,
	.row.close-approach:focus-visible,
	.row.close-approach.focused {
		background: #ffe0d9;
	}
	.row:not(.head):has(.row-link:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.time {
		font-weight: 600;
	}
	.kind {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink-60);
	}
	.kind.airline {
		color: var(--ink);
		font-weight: 600;
	}
	.swatch {
		display: block;
		width: 8px;
		height: 8px;
		flex: none;
		background: var(--ink-25);
	}
	.swatch.airline {
		background: var(--accent);
	}
	.ident {
		font-weight: 600;
	}
	.dim {
		color: var(--ink-60);
	}
	@media (max-width: 760px) {
		.row.head {
			display: none;
		}
		.row {
			grid-template-columns: 92px 1fr 1fr;
			grid-template-areas:
				'time kind dir'
				'ident type other';
			row-gap: 4px;
			font-size: 13px;
		}
		.time { grid-area: time; }
		.kind { grid-area: kind; }
		.movement { grid-area: dir; }
		.ident { grid-area: ident; }
		.type { grid-area: type; }
		.other { grid-area: other; }
	}
</style>
