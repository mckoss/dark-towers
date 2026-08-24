<script lang="ts">
	import { flightKind, flightLabel, flightSubLabel } from '$lib/flights';
	/* Flight log table (README §3). Row hover reports the flight id via onfocus
	   so the map can highlight the matching track. */
	import type { Flight } from '$lib/types';
	import { localTime } from '$lib/time';

	interface Props {
		flights: Flight[];
		tz: string;
		night: string;
		focus?: string | null;
		onfocus?: (id: string | null) => void;
	}
	let { flights, tz, night, focus = null, onfocus }: Props = $props();

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
		<a
			class="row"
			class:focused={f.id === focus}
			href={`?night=${encodeURIComponent(night)}&t=${f.eventTime}#night-replay`}
			onmouseenter={() => onfocus?.(f.id)}
			onmouseleave={() => onfocus?.(null)}
			onfocus={() => onfocus?.(f.id)}
			onblur={() => onfocus?.(null)}
		>
			<div class="time tabular">{localTime(tz, f.eventTime)}</div>
			<div class="kind" class:airline={f.category === 'airline'}><span class="swatch" class:airline={f.category === 'airline'}></span>{kind(f)}</div>
			<div class="dim">{f.direction === 'arrival' ? 'Arriving' : 'Leaving'}</div>
			<div class="ident">{flightLabel(f)}{#if flightSubLabel(f)}<span class="tail">{flightSubLabel(f)}</span>{/if}</div>
			<div class="dim">{f.type ?? '—'}</div>
			<div class="dim">{other(f)}</div>
		</a>
	{/each}
</div>

<style>
	.row {
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
	.row.head {
		border-top: var(--rule);
		padding: 10px 0;
	}
	.row:not(.head):hover,
	.row:not(.head):focus-visible,
	.row.focused {
		background: var(--ground-alt);
	}
	.row:not(.head):focus-visible {
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
	.tail {
		margin-left: 0.45em;
		font-weight: 400;
		color: var(--ink-45);
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
		.row > :nth-child(3) { grid-area: dir; }
		.ident { grid-area: ident; }
		.row > :nth-child(5) { grid-area: type; }
		.row > :nth-child(6) { grid-area: other; }
	}
</style>
