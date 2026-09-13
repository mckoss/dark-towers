<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('en-US', { hour12: false }) : '—');
</script>

<svelte:head><title>Configuration — Dark Towers</title></svelte:head>

<div class="admin-function">
<section class="section cell"><h1 class="page-headline">Configuration</h1></section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
<section class="section cell">		<dl class="config">
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
			<dt>Tracked airports</dt><dd>{data.airports.filter((a) => a.tracked).map((a) => a.code).join(', ') || 'none'} · <a href="/admin/airports">edit airports &amp; tower hours</a> · <a href="/admin/operators">airline names</a> · <a href="/admin/aircraft">aircraft wake categories</a> · <a href="/admin/basemap">report base maps</a></dd>
		</dl></section>
</div>
