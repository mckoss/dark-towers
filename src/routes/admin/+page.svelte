<script lang="ts">
	/* Admin console — unlinked, noindex, admins only (see hooks.server.ts). */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	/** Human-readable bytes: 412 KB, 38.2 MB, 1.4 GB. */
	const size = (n: number) => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
		if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
		return `${(n / 1024 ** 3).toFixed(2)} GB`;
	};

	const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('en-US', { hour12: false }) : '—');
	const running = $derived(!!data.job && !data.job.finishedAt);

	onMount(() => {
		// Poll while a job is running so the log updates.
		const id = setInterval(() => {
			if (running) invalidateAll();
		}, 3000);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>Admin — Dark Towers</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="section split">
	<div class="cell">
		<div class="kicker">Admin</div>
		<h1 class="page-headline">Pipeline console</h1>
		<p class="body">Signed in as <strong>{data.user.email}</strong>.</p>
		{#if data.user.email === 'open@localhost'}
			<p class="body accent">Open mode (DTW_NO_AUTH) — no sign-in required. Do not run this way in production.</p>
		{:else}
			<form method="POST" action="/auth/signout" class="signout"><button class="btn btn-ghost" type="submit">Sign out</button></form>
		{/if}
	</div>
	<div class="cell inset">
		<div class="table-header">Configuration</div>
		<dl class="config">
			<dt>FlightAware key</dt><dd>{data.apiKeyPresent ? 'present' : 'MISSING'}</dd>
			<dt>Google sign-in</dt><dd>{data.googleConfigured ? 'configured' : 'not configured'}</dd>
			<dt>Admins</dt><dd>{data.admins.join(', ')}</dd>
			<dt>AeroAPI tier</dt>
			<dd>
				{#if data.historyOverride != null}
					extended history forced {data.historyOverride ? 'on' : 'off'} by <code>aeroapi_history</code> in config
				{:else if data.capability?.extendedHistory}
					<strong>Standard or Premium</strong> — extended history available: any past night can be fetched and backfilled · checked {when(data.capability.checkedAt)}
				{:else if data.capability}
					<strong>Personal</strong> — live window only: flights and tracks from the last 10 days, 10 queries a minute. Upgrading to Standard adds extended history (backfill of any past night, and retry of nights already recorded as "too old") · checked {when(data.capability.checkedAt)}
				{:else}
					not yet checked on this key
				{/if}
				<form method="POST" action="?/probe" use:enhance class="inline"><button class="link-btn" type="submit">re-check</button></form>
				{#if form?.probed}<span class="muted-text"> · {form.probed}</span>{/if}
			</dd>
			<dt>FAA facility data</dt><dd>{data.nasrCycle ? `NASR cycle ${data.nasrCycle}` : 'not downloaded yet'} · refreshed daily at 04:41</dd>
			<dt>FAA aircraft registry</dt><dd>{data.registry ? `${data.registry.aircraft.toLocaleString()} aircraft, as of ${data.registry.asOf}` : 'not downloaded yet'} · refreshed monthly</dd>
			<dt>Scheduler depth</dt><dd>{data.historyDays} nights</dd>
			<dt>Tracked airports</dt><dd>{data.airports.filter((a) => a.tracked).map((a) => a.code).join(', ') || 'none'} · <a href="/admin/airports">edit airports &amp; tower hours</a> · <a href="/admin/operators">airline names</a></dd>
		</dl>
	</div>
</section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.started}<p class="flash">Started {form.started}.</p>{/if}
{#if form?.deleted}<p class="flash">Request #{form.deleted} deleted.</p>{/if}

<section class="section split">
	<div class="cell">
		<h2 class="section-heading">Run the pipeline</h2>
		<p class="hint activity">
			{#if data.schedulerOn}Scheduler is on: this runs by itself hourly at :07.{:else}Scheduler is <strong>off</strong> — nights are only collected when started here.{/if}
			Last 24 hours: {data.activity.runs === 0 ? 'no runs' : `${data.activity.runs} run${data.activity.runs === 1 ? '' : 's'}, ${data.activity.apiCalls} API call${data.activity.apiCalls === 1 ? '' : 's'}`}{data.activity.failed ? `, ${data.activity.failed} failed` : ''}{#if data.activity.lastAt}; last {when(data.activity.lastAt)} {data.activity.lastOk ? '✓' : '✗'}{/if}. Details under Recent runs below.
		</p>
		<form method="POST" action="?/catchup" use:enhance class="row">
			<button class="btn" type="submit" disabled={running}>Catch up now</button>
			<span class="hint">Runs the same catch-up immediately: every tracked airport's recent nights that aren't complete.</span>
		</form>
		<form method="POST" action="?/ingest" use:enhance class="row ingest">
			<label>Airport
				<select name="airport">
					{#each data.airports as a (a.code)}<option value={a.code}>{a.code} · {a.name}</option>{/each}
				</select>
			</label>
			<label>Night <input name="night" type="date" required /></label>
			<label class="check"><input name="force" type="checkbox" /> re-fetch flight list</label>
			<button class="btn btn-ink" type="submit" disabled={running}>Ingest night</button>
		</form>
		<form method="POST" action="?/backfill" use:enhance class="row ingest">
			<label>Airport
				<select name="airport">
					{#each data.airports as a (a.code)}<option value={a.code}>{a.code} · {a.name}</option>{/each}
				</select>
			</label>
			<label>Nights <input name="nights" type="number" min="1" max="365" value="30" /></label>
			<button class="btn btn-ink" type="submit" disabled={running}>Backfill</button>
			<span class="hint">Oldest first; skips complete nights; stops on the first API error. Use when an airport is newly approved.</span>
		</form>
		<p class="hint">Cached nights cost no API calls. {#if !data.historyEnabled}Nights older than 10 days need extended history, which this key does not have (Standard tier or above); until then they are recorded as misses and retried automatically once a key with extended history is in place.{/if}</p>
	</div>
	<div class="cell">
		<h2 class="section-heading">Current job</h2>
		{#if data.job}
			<p class="body"><strong>{data.job.name}</strong> · started {when(data.job.startedAt)} · {data.job.finishedAt ? (data.job.ok ? 'finished OK' : 'FAILED') : 'running…'}</p>
			<pre class="log">{data.job.log.slice(-40).join('\n')}</pre>
		{:else}
			<p class="body muted-text">No job has run since the server started.</p>
		{/if}
	</div>
</section>

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

<section class="section cell">
	<h2 class="section-heading">Recent runs</h2>
	<div class="grid runs">
		<div class="table-header">Started</div><div class="table-header">Airport</div><div class="table-header">Night</div><div class="table-header">Result</div><div class="table-header">Message</div>
		{#each data.runs as r (r.id)}
			<div class="tabular">{when(r.started_at)}</div><div>{r.airport}</div><div>{r.night}</div>
			<div class={r.ok === 0 ? 'accent' : ''}>{r.ok == null ? 'running' : r.ok ? 'ok' : 'failed'}</div>
			<div class="msg">{r.message ?? ''}</div>
		{:else}
			<div class="muted-text">No runs recorded.</div>
		{/each}
	</div>
</section>

<section class="section cell">
	<h2 class="section-heading">Airport requests ({data.requests.length})</h2>
	<div class="grid requests">
		<div class="table-header">When</div><div class="table-header">Request</div><div class="table-header">FAA tower record</div><div class="table-header">Email</div><div></div>
		{#each data.requests as r (r.id)}
			<div class="tabular">{when(r.created_at)}</div><div>{r.value}{#if r.code && r.code !== r.value} <span class="muted-text">→ {r.code}</span>{/if}</div><div class="tabular">{r.assessment ?? '—'}</div><div>{r.email ?? '—'}</div>
			<form method="POST" action="?/deleteRequest" use:enhance><input type="hidden" name="id" value={r.id} /><button class="link-btn" type="submit">delete</button></form>
		{:else}
			<div class="muted-text">No requests yet.</div>
		{/each}
	</div>
</section>

<style>
	.signout { margin-top: 20px; }
	.config { display: grid; grid-template-columns: max-content 1fr; gap: 8px 20px; margin: 12px 0 0; font-size: 14px; }
	.config dt { color: var(--ink-60); }
	.config dd { margin: 0; font-weight: 600; }
	.flash { padding: 12px var(--gutter); background: var(--accent-tint); border-bottom: var(--row-rule); font-size: 14px; }
	.flash.error { color: var(--accent-text); font-weight: 700; }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 16px; }
	.ingest label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-60); }
	.ingest label.check { flex-direction: row; align-items: center; text-transform: none; letter-spacing: 0; }
	.ingest select, .ingest input[type='date'] { padding: 10px 12px; border: 2px solid var(--ink); background: #fff; font: inherit; font-size: 14px; }
	.hint { margin-top: 10px; font-size: 13px; color: var(--ink-45); max-width: 60ch; }
	.log { margin-top: 12px; padding: 12px; background: var(--ground-alt); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; max-height: 320px; overflow: auto; }
	.muted-text { color: var(--ink-45); }
	.grid { display: grid; gap: 8px 20px; margin-top: 14px; font-size: 14px; align-items: baseline; }
	.grid > * { padding-bottom: 8px; border-bottom: var(--row-rule); }
	.counts { grid-template-columns: 80px 80px 90px 120px 120px; }
	.storage { grid-template-columns: 220px 1fr 90px 100px; }
	.mono { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; color: var(--ink-60); }
	.altcheck { grid-template-columns: 70px 100px 100px 80px 120px 110px 110px; max-height: 320px; overflow: auto; }
	.runs { grid-template-columns: 170px 70px 110px 80px 1fr; }
	.requests { grid-template-columns: 170px 1fr 1fr 1fr 60px; }
	.msg { color: var(--ink-60); }
	.sub { margin-top: 24px; font-size: 16px; font-weight: 800; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
	.chip { padding: 6px 10px; border: 1px solid var(--hairline); font-size: 13px; }
	.inline { display: inline; margin-left: 6px; }
	.link-btn { background: none; border: none; padding: 0; color: var(--accent-text); font: inherit; cursor: pointer; text-decoration: underline; }
	@media (max-width: 760px) {
		.grid { grid-template-columns: 1fr 1fr; }
	}
</style>
