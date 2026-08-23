<script lang="ts">
	/* Admin console — unlinked, noindex, admins only (see hooks.server.ts). */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();

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
	<title>Admin — Dark Tower Watch</title>
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
			<dt>AeroAPI history</dt><dd>{data.historyEnabled ? 'enabled (Standard+ tier)' : 'off — live window only (10 days)'}</dd>
			<dt>Scheduler depth</dt><dd>{data.historyDays} nights</dd>
			<dt>Tracked airports</dt><dd>{data.airports.filter((a) => a.tracked).map((a) => a.code).join(', ') || 'none'}</dd>
		</dl>
	</div>
</section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.started}<p class="flash">Started {form.started}.</p>{/if}
{#if form?.deleted}<p class="flash">Request #{form.deleted} deleted.</p>{/if}

<section class="section split">
	<div class="cell">
		<h2 class="section-heading">Run the pipeline</h2>
		<form method="POST" action="?/catchup" use:enhance class="row">
			<button class="btn" type="submit" disabled={running}>Catch up now</button>
			<span class="hint">Ingests every tracked airport's recent nights that aren't complete (what the hourly scheduler does).</span>
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
		<p class="hint">Cached nights cost no API calls. {#if !data.historyEnabled}Nights older than 10 days need <code>"aeroapi_history": true</code> (Standard tier or above); until then they are recorded as misses and retried automatically once history is enabled.{/if}</p>
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
		<div class="table-header">When</div><div class="table-header">Request</div><div class="table-header">Email</div><div></div>
		{#each data.requests as r (r.id)}
			<div class="tabular">{when(r.created_at)}</div><div>{r.value}</div><div>{r.email ?? '—'}</div>
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
	.runs { grid-template-columns: 170px 70px 110px 80px 1fr; }
	.requests { grid-template-columns: 170px 1fr 1fr 60px; }
	.msg { color: var(--ink-60); }
	.sub { margin-top: 24px; font-size: 16px; font-weight: 800; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
	.chip { padding: 6px 10px; border: 1px solid var(--hairline); font-size: 13px; }
	.link-btn { background: none; border: none; padding: 0; color: var(--accent-text); font: inherit; cursor: pointer; text-decoration: underline; }
	@media (max-width: 760px) {
		.grid { grid-template-columns: 1fr 1fr; }
	}
</style>
