<script lang="ts">
	/* Admin: airline operator names (ICAO code → names). Names resolve at render
	   time, so an edit applies to every stored flight. */
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Operators — Admin — Dark Towers</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="section split">
	<div class="cell">
		<div class="kicker"><a href="/admin">Admin</a> · Operators</div>
		<h1 class="page-headline">Airline names</h1>
		<p class="body">FlightAware identifies airlines by ICAO code (ASA, QXE…). This table turns <code>ASA1712</code> into "Alaska 1712" everywhere a flight is named. <code>operators.json</code> seeds codes that don't exist yet; the live table wins. Export after editing and commit the file.</p>
		<p class="row"><a class="btn" href="/admin/operators/export" data-testid="export-operators">Export JSON</a></p>
	</div>
	<div class="cell inset">
		<div class="table-header">Codes seen in flights with no name yet</div>
		{#if !data.unknown.length}
			<p class="body ok">None — every airline operator in the database has a name.</p>
		{:else}
			<ul class="unknown">
				{#each data.unknown as u (u.icao)}
					<li><strong>{u.icao}</strong> · {u.flights} flight(s), e.g. {u.example}
						<form method="POST" action="?/save" use:enhance class="inline">
							<input type="hidden" name="icao" value={u.icao} />
							<input name="name" placeholder="Full name" required /> <input name="short" placeholder="Short" />
							<button class="link-btn" type="submit">add</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.saved}<p class="flash">Saved {form.saved}.</p>{/if}

<section class="section cell">
	<h2 class="section-heading">Operators ({data.operators.length})</h2>
	<div class="grid">
		<div class="table-header">Code</div><div class="table-header">Full name (Kind column)</div><div class="table-header">Short name (flight labels)</div><div></div>
		{#each data.operators as o (o.icao)}
			<form method="POST" action="?/save" use:enhance class="contents" data-testid="operator-{o.icao}">
				<input type="hidden" name="icao" value={o.icao} />
				<div class="code">{o.icao}</div>
				<input name="name" value={o.name} required />
				<input name="short" value={o.short} />
				<span class="rowbtns"><button class="link-btn" type="submit">save</button>
					<button class="link-btn danger" type="submit" formaction="?/delete" onclick={(e) => { if (!confirm(`Delete ${o.icao}?`)) e.preventDefault(); }}>delete</button></span>
			</form>
		{/each}
		<form method="POST" action="?/save" use:enhance class="contents new">
			<input name="icao" placeholder="ICAO" maxlength="4" required />
			<input name="name" placeholder="Full name" required />
			<input name="short" placeholder="Short name" />
			<span class="rowbtns"><button class="link-btn" type="submit">add</button></span>
		</form>
	</div>
</section>

<style>
	.row { margin-top: 18px; }
	.ok { color: var(--ink-60); }
	.unknown { margin: 10px 0 0; padding: 0; list-style: none; font-size: 14px; }
	.unknown li { padding: 8px 0; border-bottom: var(--row-rule); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.inline { display: inline-flex; gap: 6px; }
	.inline input { padding: 6px 8px; border: 2px solid var(--hairline); font: inherit; font-size: 13px; width: 150px; }
	.flash { padding: 12px var(--gutter); background: var(--accent-tint); border-bottom: var(--row-rule); font-size: 14px; }
	.flash.error { color: var(--accent-text); font-weight: 700; }
	.grid { display: grid; grid-template-columns: 80px 1fr 1fr 110px; gap: 6px 16px; align-items: center; margin-top: 14px; }
	.contents { display: contents; }
	.code { font-weight: 800; }
	.grid input { padding: 8px 10px; border: 2px solid var(--hairline); background: #fff; font: inherit; font-size: 14px; }
	.grid input:focus { border-color: var(--ink); }
	.rowbtns { display: flex; gap: 10px; }
	.link-btn { background: none; border: none; padding: 0; color: var(--accent-text); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
	.link-btn.danger { color: var(--ink-45); }
	@media (max-width: 760px) { .grid { grid-template-columns: 1fr 1fr; } }
</style>
