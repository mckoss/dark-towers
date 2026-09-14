<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let airport = $state('');
	$effect(() => { airport = data.selected; });
	let scope = $state('range');
</script>

<svelte:head><title>Remove airport data — Dark Towers</title></svelte:head>

<section class="section cell">
	<div class="kicker">Data management</div>
	<h1 class="page-headline">Remove airport data</h1>
	<p class="body">Remove collected nights, flights, and close-approach and wake events for one airport. The airport, its hours, and raw cached responses are kept.</p>
	<p class="body">If data was collected during the wrong hours, <a href="/admin/airports">correct the airport’s collection hours</a> first. The scheduler can collect removed nights again. To keep collection stopped, turn off tracking for that airport.</p>
	<p class="body">Removal applies to whole nights, not individual hours. You can rebuild removed nights from the cache using <a href="/admin/pipeline">Pipeline → Backfill</a>; missing responses may require API calls.</p>
	{#if form?.error}<p class="feedback" role="alert">{form.error}</p>{/if}
	{#if form?.removed}
		<p class="feedback" role="status">Removed {form.removed.nights} nights, {form.removed.flights} flights, and {form.removed.incidents} events for {form.removed.code}. Raw cached responses and airport settings were kept.</p>
		<a href="/admin/data">Back to data & diagnostics →</a>
	{/if}
	<form method="POST" action="?/preview" use:enhance class="selection">
		<label>Airport
			<select name="airport" bind:value={airport} required>
				<option value="" disabled>Choose an airport</option>
				{#each data.airports as a (a.code)}<option value={a.code}>{a.code} · {a.name}</option>{/each}
			</select>
		</label>
		<label>Nights to remove
			<select name="scope" bind:value={scope}>
				<option value="range">Date range</option>
				<option value="all">All collected nights</option>
			</select>
		</label>
		{#if scope === 'range'}
			<label>First night <input type="date" name="from" required /></label>
			<label>Last night <input type="date" name="to" required /></label>
		{/if}
		<button class="btn btn-ink" type="submit">Preview removal</button>
	</form>
	{#if form?.preview}
		{@const p = form.preview}
		<section class="preview" aria-label="Removal preview">
			<h2 class="section-heading">{p.code} · {p.name}</h2>
			<p class="body">{p.from ? `${p.from} through ${p.to} (inclusive)` : 'All collected nights'}: {p.nights} nights, {p.flights} flights, {p.incidents} events.</p>
			{#if p.nights || p.flights || p.incidents}
				<form method="POST" action="?/remove" use:enhance class="selection">
					<input type="hidden" name="airport" value={p.code} />
					<input type="hidden" name="scope" value={p.from ? 'range' : 'all'} />
					<input type="hidden" name="from" value={p.from ?? ''} />
					<input type="hidden" name="to" value={p.to ?? ''} />
					<label>Type {p.code} to confirm <input name="confirm" autocomplete="off" required /></label>
					<button class="btn" type="submit">Remove {p.code} data</button>
				</form>
			{:else}<p class="body">There is no data to remove for this selection.</p>{/if}
		</section>
	{/if}
</section>

<style>
	h1, p { margin-top: 16px; }
	p { max-width: 70ch; }
	.selection { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; margin-top: 24px; }
	label { display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 600; max-width: 100%; }
	input, select { padding: 10px; border: 2px solid var(--ink); background: var(--ground); color: var(--ink); font: inherit; max-width: 100%; min-width: 0; }
	.preview { border-top: var(--rule); margin-top: 32px; padding-top: 24px; }
	.feedback { padding: 16px; background: var(--accent-tint); border-left: 2px solid var(--accent); }
</style>
