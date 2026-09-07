<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const cats = 'ABCDEFGHI'.split('');
</script>

<svelte:head>
	<title>Aircraft wake categories — Admin — Dark Towers</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="section cell">
	<div class="kicker"><a href="/admin">Admin</a> · Aircraft</div>
	<h1 class="page-headline">Wake categories</h1>
	<p class="body">ICAO aircraft types mapped to the FAA's Consolidated Wake Turbulence categories. Unknown types are treated as Category I followers but can never lead a wake flag.</p>
</section>

{#if form?.error}<p class="flash" role="alert">{form.error}</p>{/if}

<section class="section cell">
	<h2 class="section-heading">Unclassified types seen in flights</h2>
	<p>{data.unknown.map((u: { type: string; flights: number }) => `${u.type} (${u.flights})`).join(', ') || 'None'}</p>
</section>

<section class="section cell">
	<div class="grid">
		<b class="table-header">Type</b><b class="table-header">CWT</b><b class="table-header">Description</b><span></span>
		{#each data.aircraft as a (a.type)}
			<form class="contents" method="POST" action="?/save" use:enhance>
				<label class="grid-field"><span>Type</span><input name="type" value={a.type} readonly /></label>
				<label class="grid-field"><span>CWT</span>
					<select name="category">
						{#each cats as c}<option value={c} selected={c === a.category}>{c}</option>{/each}
					</select>
				</label>
				<label class="grid-field"><span>Description</span><input name="description" value={a.description} /></label>
				<span class="rowbtns"><button type="submit">save</button> <button type="submit" formaction="?/delete">delete</button></span>
			</form>
		{/each}
		<form class="contents" method="POST" action="?/save" use:enhance>
			<label class="grid-field"><span>Type</span><input name="type" placeholder="ICAO type" required /></label>
			<label class="grid-field"><span>CWT</span>
				<select name="category">
					{#each cats as c}<option>{c}</option>{/each}
				</select>
			</label>
			<label class="grid-field"><span>Description</span><input name="description" placeholder="Description" /></label>
			<span class="rowbtns"><button type="submit">add</button></span>
		</form>
	</div>
</section>

<style>
	.grid { display: grid; grid-template-columns: 110px 80px 1fr 140px; gap: 8px 14px; align-items: center; }
	.contents, .grid-field { display: contents; }
	.grid-field span { display: none; }
	.grid input, .grid select { padding: 8px; border: 1px solid var(--hairline); background: #fff; font: inherit; }
	.flash { padding: 12px; color: var(--accent-text); }
	.rowbtns { display: flex; gap: 8px; }
	@media (max-width: 700px) {
		.grid { display: block; }
		.grid > .table-header, .grid > span:empty { display: none; }
		.contents {
			display: grid;
			grid-template-columns: 1fr;
			gap: 10px;
			padding: 12px 0;
			border-bottom: var(--row-rule);
		}
		.grid-field {
			display: flex;
			flex-direction: column;
			gap: 4px;
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			color: var(--ink-60);
		}
		.grid-field span { display: inline; }
		.grid input, .grid select { width: 100%; min-width: 0; }
	}
</style>
