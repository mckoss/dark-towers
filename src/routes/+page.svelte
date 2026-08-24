<script lang="ts">
	/* Home — "map-first" layout (README §1). Copy here must never name a specific airport. */
	import UsMap from '$lib/components/UsMap.svelte';

	let { data } = $props();

	const fmt = (n: number) => n.toLocaleString('en-US');
	let empty = $derived(data.totals.flights === 0);

	let mapAirports = $derived(
		data.airports.map((a) => ({
			code: a.code,
			name: a.name,
			pos: a.pos,
			tracked: a.tracked,
			incidents: a.stats?.incidents ?? 0
		}))
	);
</script>

<svelte:head>
	<title>Dark Towers — Flights with no tower on duty</title>
	<meta
		name="description"
		content="Airliners are landing at airports where nobody is in the tower. Dark Towers records the flights and close approaches that happen while control towers are closed."
	/>
</svelte:head>

<section class="split section hero">
	<div class="cell-lg">
		<h1 class="hero-headline">
			Airliners are landing at airports where nobody is in the tower.
		</h1>
		<p class="body lede">
			Dozens of airports with regular passenger service have part-time or no-time control tower service:
			a tower that closes for the night, or no tower at all. The airline flights arrive and depart
			regardless. With no controller on duty, nothing is directing the traffic — airline and small-plane
			pilots announce themselves on a shared radio channel and are left to spot each other to avoid
			collisions. This site records what happens during those hours.
		</p>
	</div>

	<div class="stats">
		<div class="stat">
			<div class="big-stat" class:muted={empty}>{empty ? '—' : fmt(data.totals.flights)}</div>
			<div class="stat-label">Flights in and out with the tower closed</div>
		</div>
		<div class="stat">
			<div class="big-stat" class:muted={empty}>{empty ? '—' : fmt(data.totals.airline)}</div>
			<div class="stat-label">Flown by passenger airlines</div>
		</div>
		<div class="stat">
			<div class="big-stat" class:accent={!empty} class:muted={empty}>
				{empty ? '—' : fmt(data.totals.incidents)}
			</div>
			<div class="stat-label">Close approaches below the separation standard</div>
		</div>
		<div class="stat">
			<div class="big-stat" class:accent={!empty} class:muted={empty}>{empty ? '—' : fmt(data.totals.wakeIncidents)}</div>
			<div class="stat-label">Wake-turbulence events below FAA in-trail spacing</div>
		</div>
		<div class="footnote period">Data from last 30 days</div>
	</div>
</section>

<section class="section map-row">
	<div class="map-plate">
		<UsMap airports={mapAirports} />
	</div>
	<div class="legend">
		<div class="legend-title">Close approaches, last 30 days</div>
		<div class="legend-row"><span class="swatch swatch-accent"></span> Tracked airport — circle grows with the count</div>
		<div class="legend-row"><span class="swatch swatch-ink"></span> Tracked airport — none found</div>
	</div>
</section>

<section class="section cta">
	<p class="body">Not seeing your airport? Ask us to start tracking it.</p>
	<a class="btn" href="/airports">Airport list and submissions</a>
</section>

<style>
	.hero-headline {
		max-width: 18ch;
		text-wrap: pretty;
	}
	.lede {
		margin-top: 28px;
		max-width: 54ch;
	}

	.stats {
		display: grid;
		grid-template-rows: 1fr 1fr 1fr 1fr auto;
	}
	.stat {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 24px var(--gutter);
		border-bottom: var(--row-rule);
	}
	.stat:nth-of-type(4) {
		border-bottom: none;
	}
	.stat .big-stat {
		min-width: 100px;
	}
	.stat .stat-label {
		max-width: 26ch;
	}
	.period {
		padding: 0 var(--gutter) 20px;
	}

	.map-row {
		position: relative;
	}
	.map-plate {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 640px;
		padding: 24px;
	}
	.map-plate :global(svg) {
		max-height: 100%;
	}
	.legend {
		position: absolute;
		left: 24px;
		bottom: 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 20px;
		background: var(--ground);
		border: 2px solid var(--ink);
	}
	.legend-title {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.legend-row {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: var(--ink-80);
	}
	.swatch {
		display: block;
		flex-shrink: 0;
		border-radius: 50% !important; /* the one deliberate circle: it depicts the map marker */
	}
	.swatch-accent {
		width: 20px;
		height: 20px;
		border: 1.5px solid var(--accent);
		background: rgba(236, 48, 19, 0.22);
	}
	.swatch-ink {
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--ink);
		background: rgba(32, 30, 29, 0.12);
	}

	.cta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
		padding: 44px var(--gutter) 52px;
	}
	.cta .body {
		max-width: 62ch;
	}
	.cta .btn {
		white-space: nowrap;
		border: none;
	}

	@media (max-width: 760px) {
		.lede {
			margin-top: 20px;
		}
		.stat {
			padding: 18px var(--gutter);
		}
		.period {
			padding-bottom: 16px;
		}
		.map-plate {
			height: auto;
			padding: 16px var(--gutter);
		}
		.legend {
			position: static;
			margin: 0 var(--gutter) var(--gutter);
		}
		.cta {
			flex-direction: column;
			align-items: flex-start;
			gap: 20px;
			padding: 32px var(--gutter) 40px;
		}
	}
</style>
