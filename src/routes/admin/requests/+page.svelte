<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('en-US', { hour12: false }) : '—');
</script>

<svelte:head><title>Airport requests — Dark Towers</title></svelte:head>

<div class="admin-function">
<section class="section cell"><h1 class="page-headline">Airport requests</h1></section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.deleted}<p class="flash">Request #{form.deleted} deleted.</p>{/if}
{#if form?.accepted}<p class="flash">Added {form.accepted} to the airport list and hourly polling schedule.</p>{/if}

<section class="section cell">
	<h2 class="section-heading">Airport requests ({data.requests.length})</h2>
	<div class="grid requests">
		<div class="table-header">When</div><div class="table-header">Request</div><div class="table-header">FAA tower record</div><div class="table-header">Requester</div><div class="table-header">Comment</div><div></div>
		{#each data.requests as r (r.id)}
			<div class="tabular">{when(r.created_at)}</div><div>{r.value}{#if r.code && r.code !== r.value} <span class="muted-text">→ {r.code}</span>{/if}{#if r.kind === 'reference'}<br /><span class="muted-text">reference · quiet {r.quiet_start}:00–{r.quiet_end}:00</span>{/if}</div><div class="tabular">{r.assessment ?? '—'}</div><div>{r.name ?? '—'}<br /><span class="muted-text">{r.email ?? '—'}</span></div><div>{r.comment ?? '—'}</div>
			<div class="request-actions">
				<form method="POST" action="?/acceptRequest" use:enhance><input type="hidden" name="id" value={r.id} /><button class="link-btn" type="submit">review &amp; accept</button></form>
				<form method="POST" action="?/deleteRequest" use:enhance><input type="hidden" name="id" value={r.id} /><button class="link-btn muted-text" type="submit">delete</button></form>
			</div>
			{#if form?.candidate && form?.requestId === r.id}
				<div class="request-candidate" data-testid="request-candidate">
					<div><strong>{form.candidate.code} · {form.candidate.name}</strong><br />{form.candidate.city}, {form.candidate.state} · {form.candidate.icao}</div>
					<div>
						<strong>FAA:</strong> {form.candidate.tower === 'none' ? 'no control tower' : `tower ${form.candidate.towerHours}`}<br />
						<strong>Kind:</strong> {form.candidate.kind}<br />
						<strong>Nightly window:</strong>
						{#if !form.candidate.schedule}
							needs quiet hours — add it from <a href="/admin/airports">Airports</a>
						{:else if form.candidate.schedule.open == null}
							all night
						{:else}
							{form.candidate.schedule.close}:00–{form.candidate.schedule.open}:00
						{/if}
						· {form.candidate.tz}
					</div>
					<form method="POST" action="?/confirmRequest" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<button class="btn btn-ink" type="submit" disabled={!form.candidate.schedule}>Confirm and start tracking</button>
					</form>
				</div>
			{/if}
		{:else}
			<div class="muted-text">No requests yet.</div>
		{/each}
	</div>
</section>
</div>
