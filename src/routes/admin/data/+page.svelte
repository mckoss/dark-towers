<script lang="ts">
	let { data } = $props();
	/** Human-readable bytes: 412 KB, 38.2 MB, 1.4 GB. */
	const size = (n: number) => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
		if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
		return `${(n / 1024 ** 3).toFixed(2)} GB`;
	};


</script>

<svelte:head><title>Data & diagnostics — Dark Towers</title></svelte:head>

<div class="admin-function">
<section class="section cell"><h1 class="page-headline">Data & diagnostics</h1></section>

<section class="section cell">
	<h2 class="section-heading">Data on hand</h2>
	<div class="grid counts">
		<div class="table-header">Airport</div><div class="table-header">Nights</div><div class="table-header">Complete</div><div class="table-header">First</div><div class="table-header">Last</div>
		{#each data.counts as c (c.airport)}
			<div>{c.airport}</div><div class="tabular">{c.nights}</div><div class="tabular">{c.complete}</div><div>{c.first}</div><div>{c.last}</div>
		{/each}
	</div>
	<h3 class="sub">Storage</h3>
	<div class="grid storage">
		<div class="table-header">What</div><div class="table-header">Path</div><div class="table-header">Files</div><div class="table-header">Size</div>
		{#each data.storage.rows as r (r.label)}
			<div>{r.label}</div><div class="mono">{r.path}</div><div class="tabular">{r.files.toLocaleString()}</div><div class="tabular">{size(r.bytes)}</div>
		{/each}
		<div><strong>Total</strong></div><div></div><div></div><div class="tabular"><strong>{size(data.storage.totalBytes)}</strong></div>
	</div>
	<h3 class="sub">Pressure correction check</h3>
	<p class="hint">Feet subtracted from ADS-B altitude to get true altitude, chosen per moment in priority order: <em>On-field</em> reports (inside 1.2 NM, under 40 kt; median over the night, count in brackets — at any instant the median of those within ±1 h applies), then <em>Weather</em> is from the hourly altimeter setting (range over the night); <em>Tracks</em> is the lowest reported altitude of tracks near the runway, 25th percentile (±50 ft). They should roughly agree; a large gap points at a bad field elevation or a weather outage.</p>
	<div class="grid altcheck">
		<div class="table-header">Airport</div><div class="table-header">Night</div><div class="table-header">On-field</div><div class="table-header">Altimeter</div><div class="table-header">Weather</div><div class="table-header">Tracks</div>
		{#each data.altimeter as n (n.airport + n.night)}
			<div>{n.airport}</div><div>{n.night}</div><div class="tabular">{n.onFieldFt != null ? `${n.onFieldFt} (${n.onFieldPoints})` : '—'}</div><div class="tabular">{n.range}</div><div class="tabular">{n.weatherFt}</div><div class="tabular">{n.groundFt != null ? `${n.groundFt} (${n.groundTracks})` : '—'}</div>
		{/each}
	</div>
	{#if data.incomplete.length}
		<h3 class="sub">Incomplete nights ({data.incomplete.length})</h3>
		<p class="hint">Flight counts stored but one or more tracks missing. The scheduler retries nights within the last 9 days; older ones need imported tracks.</p>
		<div class="chips">
			{#each data.incomplete as n (n.airport + n.night)}<a class="chip" href="/airport/{n.airport.replace(/^K/, '')}?night={n.night}">{n.airport} {n.night} · {n.flights} flights</a>{/each}
		</div>
	{/if}
</section>
</div>
