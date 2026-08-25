<script lang="ts">
	/* Home — "map-first" layout (README §1). Copy here must never name a specific airport. */
	import UsMap from '$lib/components/UsMap.svelte';

	let { data } = $props();

	const fmt = (n: number) => n.toLocaleString('en-US');
	let empty = $derived(data.totals.flights === 0);

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
		<div class="table-header period">In the last 30 days…</div>
		<div class="stat">
			<div class="big-stat" class:muted={empty}>{empty ? '—' : fmt(data.totals.flights)}</div>
			<div class="stat-label">Flights in and out with the tower closed</div>
		</div>
		<div class="stat">
			<div class="big-stat" class:muted={empty}>{empty ? '—' : fmt(data.totals.airline)}</div>
			<div class="stat-label">Flown by passenger airlines</div>
		</div>
		<a class="stat stat-link" href="/close-approaches">
			<div class="big-stat" class:accent={!empty} class:muted={empty}>
				{empty ? '—' : fmt(data.totals.incidents)}
			</div>
			<div class="stat-label">Close approaches below the separation standard</div>
		</a>
		<div class="stat">
			<div class="big-stat" class:accent={!empty} class:muted={empty}>{empty ? '—' : fmt(data.totals.wakeIncidents)}</div>
			<div class="stat-label">Wake-turbulence events below FAA in-trail spacing</div>
		</div>
	</div>
</section>

<section class="section map-row">
	<div class="map-plate">
		<UsMap airports={data.airports} />
	</div>
	<div class="legend">
		<div class="legend-title">Airport activity · last 30 days</div>
		<div class="legend-row"><span class="swatch swatch-alert"></span> Very close encounter recorded</div>
		<div class="legend-row"><span class="swatch swatch-tracking"></span> Tracking — size reflects operations (log scale)</div>
		<div class="legend-row"><span class="swatch swatch-requested"></span> Requested — awaiting review</div>
		<div class="legend-row"><span class="swatch swatch-available"></span> Qualifies — available to request</div>
		<div class="legend-help">Drag to pan · scroll, pinch, or use ± to zoom</div>
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
		grid-template-rows: auto 1fr 1fr 1fr 1fr;
	}
	.stat {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 24px var(--gutter);
		border-bottom: var(--row-rule);
		color: inherit;
	}
	.stat-link:hover,
	.stat-link:focus-visible {
		background: var(--ground-alt);
		color: inherit;
	}
	.stat:last-child {
		border-bottom: none;
	}
	.stat .big-stat {
		min-width: 100px;
	}
	.stat .stat-label {
		max-width: 26ch;
	}
	.period {
		padding: 18px var(--gutter) 14px;
		border-bottom: var(--row-rule);
	}

	.map-row {
		position: relative;
	}
	.map-plate {
		height: 640px;
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
	.swatch-tracking {
		width: 18px;
		height: 18px;
		border: 2px solid #737675;
		background: rgba(115, 118, 117, 0.48);
	}
	.swatch-alert {
		width: 18px;
		height: 18px;
		border: 2px solid #dc3e27;
		background: rgba(220, 62, 39, 0.48);
	}
	.swatch-requested {
		width: 8px;
		height: 8px;
		border: 1px solid #737675;
		background: rgba(115, 118, 117, 0.3);
	}
	.swatch-available { width: 5px; height: 5px; border: 1px solid #737675; background: rgba(115, 118, 117, 0.3); }
	.legend-help { margin-top: 3px; font-size: 11px; color: var(--ink-60); }

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
			padding: 14px var(--gutter) 12px;
		}
		.map-plate {
			height: 480px;
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
