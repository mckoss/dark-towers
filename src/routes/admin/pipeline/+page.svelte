<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	let { data, form } = $props();
	const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('en-US', { hour12: false }) : '—');
	/** One-line failure description: AeroAPI errors arrive as 'STATUS {json}'; show the human detail. */
	const brief = (m: string | null) => {
		if (!m) return '—';
		const j = m.match(/^(\d{3})\s*(\{.*\})\s*$/s);
		if (j) {
			try {
				const e = JSON.parse(j[2]);
				return `${j[1]} · ${e.detail ?? e.title ?? ''}`.trim();
			} catch { /* fall through */ }
		}
		return m.length > 120 ? m.slice(0, 117) + '…' : m;
	};

	const running = $derived(!!data.job && !data.job.finishedAt);

	onMount(() => {
		// Poll while a job is running so the log updates.
		const id = setInterval(() => {
			if (running) invalidateAll();
		}, 3000);
		return () => clearInterval(id);
	});

</script>

<svelte:head><title>Pipeline — Dark Towers</title></svelte:head>

<div class="admin-function">
<section class="section cell"><h1 class="page-headline">Pipeline</h1></section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.started}<p class="flash">Started {form.started}.</p>{/if}
{#if form?.deletedNightData}<p class="flash">{form.deletedNightData}</p>{/if}

<section class="section split">
	<div class="cell">
		<h2 class="section-heading">Run the pipeline</h2>
		<p class="hint activity">
			{#if data.schedulerOn}Scheduler is on: this runs by itself hourly at :07.{:else}Scheduler is <strong>off</strong> — nights are only collected when started here.{/if}
			Last 24 hours: {data.activity.runs === 0 ? 'no runs' : `${data.activity.runs} run${data.activity.runs === 1 ? '' : 's'}, ${data.activity.apiCalls} API call${data.activity.apiCalls === 1 ? '' : 's'}`}{data.activity.failed ? `, ${data.activity.failed} failed` : ''}{#if data.activity.lastAt}; last {when(data.activity.lastAt)} {data.activity.lastOk ? '✓' : '✗'}{/if}. Failures appear under Problems below.
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
		<h3 class="sub">Delete derived night data</h3>
		<form method="POST" action="?/deleteNightData" use:enhance class="row ingest repair">
			<label>Airport
				<select name="airport">
					{#each data.airports as a (a.code)}<option value={a.code}>{a.code} · {a.name}</option>{/each}
				</select>
			</label>
			<label>From <input name="from" type="date" required /></label>
			<label>To <input name="to" type="date" required /></label>
			<label>Confirm <input name="confirm" type="text" autocomplete="off" placeholder="DELETE" required /></label>
			<button class="btn btn-ink" type="submit" disabled={running}>Delete nights</button>
			<span class="hint">Removes only SQLite summaries, flights, and incidents for the selected airport dates. Raw cached API files stay on disk so ingest/backfill can recompute them.</span>
		</form>
	</div>
	<div class="cell">
		<h2 class="section-heading">Current job</h2>
		{#if data.job}
			<p class="body"><strong>{data.job.name}</strong> · started {when(data.job.startedAt)} · {data.job.finishedAt ? (data.job.ok ? 'finished OK' : 'FAILED') : 'running…'}</p>
			<pre class="log">{data.job.log.slice(-40).join('\n')}</pre>
		{:else}
			<p class="body muted-text">No job has run since the server started ({when(data.booted)}). The scheduler’s hourly catch-up will show here when it fires.</p>
		{/if}
	</div>
</section>

<section class="section cell">
	<h2 class="section-heading">Problems</h2>
	<p class="hint">Failed runs from the last two days, one row per distinct failure. Routine successes are summarised in the activity line above.</p>
	<div class="grid problems">
		<div class="table-header">Last seen</div><div class="table-header">Airport</div><div class="table-header">Night</div><div class="table-header">Times</div><div class="table-header">What failed</div>
		{#each data.problems as p (p.airport + p.night + (p.message ?? ''))}
			<div class="tabular">{when(p.lastAt)}</div><div>{p.airport}</div><div>{p.night}</div><div class="tabular">{p.times}×</div><div class="msg">{brief(p.message)}</div>
		{:else}
			<div class="muted-text">No failed runs in the last two days.</div>
		{/each}
	</div>
</section>
</div>
