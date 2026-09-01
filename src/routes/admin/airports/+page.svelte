<script lang="ts">
	/* Admin: airports and tower-hour schedules. The database is the source of
	   truth; airports.json is the seed. Export JSON to re-sync the file. */
	import { enhance } from '$app/forms';
	import { hourLabel } from '$lib/airports';

	let { data, form } = $props();
	let open: Record<string, boolean> = $state({});
	const toggle = (id: string) => (open[id] = !open[id]);
	const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-US', { hour12: false }) : '—');
	const hoursText = (o: number | null, c: number | null) => (o == null || c == null ? 'No tower' : `${hourLabel(o)} – ${hourLabel(c)}`);
	/** The nightly window we collect: from close to the next day's open. */
	const watchText = (o: number | null, c: number | null) => (o == null || c == null ? 'all night' : `${hourLabel(c)} – ${hourLabel(o)}`);
	const hourOptions = Array.from({ length: 25 }, (_, h) => h);
</script>

<svelte:head>
	<title>Airports — Admin — Dark Towers</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="section split">
	<div class="cell">
		<div class="kicker"><a href="/admin">Admin</a> · Airports</div>
		<h1 class="page-headline">Airports and tower hours</h1>
		<p class="body">Edits here take effect immediately. The checked-in <code>airports.json</code> only seeds airports that don't exist yet — it never overwrites these rows. After editing, download the export and commit it so a fresh environment matches.</p>
		<p class="row"><a class="btn" href="/admin/airports/export" data-testid="export-json">Export JSON</a></p>
	</div>
	<div class="cell inset">
		<div class="table-header">Seed file vs live</div>
		{#if data.driftError}
			<p class="hint">Could not read airports.json: {data.driftError}</p>
		{:else if !data.drift.length}
			<p class="body ok">No differences — airports.json matches the live tables.</p>
		{:else}
			<p class="hint">{data.drift.length} difference(s). Nothing is applied automatically; choose per row.</p>
			<ul class="drift">
				{#each data.drift as d (d.key)}
					<li>
						<strong>{d.key}</strong>
						{#if d.deletedLive}
							— deleted online; still in JSON (remove it from the file, or apply JSON to restore)
						{:else if d.missingLive}
							— in JSON, not live (will be inserted on next start)
						{:else if d.missingJson}
							— live only (not in JSON; export to add it)
						{:else}
							{#each Object.entries(d.diffs) as [field, [j, l]] (field)}
								<div class="diff"><span>{field}:</span> JSON <code>{JSON.stringify(j)}</code> · live <code>{JSON.stringify(l)}</code></div>
							{/each}
						{/if}
						{#if !d.missingJson}
							<form method="POST" action="?/applyJson" use:enhance class="inline"><input type="hidden" name="key" value={d.key} /><button class="link-btn" type="submit">apply JSON</button></form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

{#if form?.error}<p class="flash error" role="alert">{form.error}</p>{/if}
{#if form?.saved}<p class="flash">Saved {form.saved}.</p>{/if}
{#if form?.affected}
	<div class="flash warn">
		<strong>{form.affected.nights.length} stored night(s) at {form.affected.airport} fall inside the period you changed</strong> — their flight lists were fetched for the old window. Re-fetching costs API calls (roughly one per flight plus one per night).
		<form method="POST" action="?/reingest" use:enhance class="inline">
			<input type="hidden" name="airport" value={form.affected.airport} />
			<input type="hidden" name="nights" value={form.affected.nights.join(',')} />
			<button class="btn btn-ink" type="submit">Re-ingest {form.affected.nights.length} night(s)</button>
		</form>
	</div>
{/if}

<section class="section cell">
	<h2 class="section-heading">Airports ({data.airports.length})</h2>
	<div class="list">
		{#each data.airports as a (a.id)}
			<div class="airport" data-testid="airport-{a.code}">
				<button class="head" onclick={() => toggle(a.id)} aria-expanded={!!open[a.id]}>
					<span class="code">{a.code}</span>
					<span class="name">{a.name} <span class="dim">· {a.city}, {a.state} · {a.icao}</span></span>
					<span class="pill {a.status === 'tracking' ? 'pill-accent' : 'pill-ghost'}">{a.status}</span>
					<span class="dim">{a.kind === 'reference' ? 'reference' : 'dark'} · {a.tracked ? 'tracked' : 'not tracked'} · watched {watchText(a.towerHours?.open ?? null, a.towerHours?.close ?? null)}</span>
					<span class="caret">{open[a.id] ? '▾' : '▸'}</span>
				</button>
				{#if open[a.id]}
					<div class="detail">
						<form method="POST" action="?/airport" use:enhance class="grid-form">
							<input type="hidden" name="id" value={a.id} />
							<label>Name <input name="name" value={a.name} required /></label>
							<label>City <input name="city" value={a.city} /></label>
							<label>State <input name="state" value={a.state} maxlength="2" /></label>
							<label>Time zone <input name="tz" value={a.tz} required /></label>
							<label>Latitude <input name="lat" value={a.pos[0]} required /></label>
							<label>Longitude <input name="lon" value={a.pos[1]} required /></label>
							<label>Elevation (ft) <input name="elevation_ft" value={a.elevationFt} required /></label>
							<label>Airlines
								<output>{a.carriers.join(', ') || 'None yet'}</output>
								<span class="field-note">{a.carriersObserved ? 'Observed in stored airline flights; updates automatically.' : 'Seed fallback until airline flights are observed.'}</span>
							</label>
							<label>Status
								<select name="status" value={a.status}>
									<option value="tracking">tracking</option><option value="requested">requested</option>
								</select>
							</label>
							<label>Kind
								<select name="kind" value={a.kind}>
									<option value="dark">dark — tower closed or absent</option><option value="reference">reference — 24-hour tower, quiet hours</option>
								</select>
								<span class="field-note">Reference airports are watched during their quiet hours and kept out of the site totals.</span>
							</label>
							<label class="check"><input type="checkbox" name="tracked" checked={a.tracked} /> Collect nightly (costs API calls)</label>
							<div class="actions"><button class="btn btn-ink" type="submit">Save airport</button><span class="dim">last edit {when(a.updatedAt)}{a.updatedBy ? ` by ${a.updatedBy}` : ''}</span></div>
						</form>

						<h3 class="sub">Tower hours</h3>
						<p class="hint">Effective-dated rows; the latest "from" wins on overlap. Leave open/close blank for a period with no tower. Open/close bound the hours we do <em>not</em> collect, so the night runs from close to the next open — at a reference airport that means open = the morning end of the quiet hours and close = the evening start. Cite the FAA Chart Supplement (and its effective date) in the note.</p>
						<div class="sched">
							<div class="table-header">From</div><div class="table-header">To</div><div class="table-header">Open</div><div class="table-header">Close</div><div class="table-header">Note</div><div></div>
							{#each a.schedules as s (s.id)}
								<form method="POST" action="?/schedule" use:enhance class="contents">
									<input type="hidden" name="airport" value={a.id} /><input type="hidden" name="id" value={s.id} />
									<input name="from" value={s.from} size="10" /><input name="to" value={s.to ?? ''} size="10" placeholder="open-ended" />
									<input name="open" value={s.open ?? ''} size="3" /><input name="close" value={s.close ?? ''} size="3" />
									<input name="note" value={s.note} />
									<span class="rowbtns"><button class="link-btn" type="submit">save</button>
										<button class="link-btn danger" type="submit" formaction="?/deleteSchedule" onclick={(e) => { if (!confirm(`Delete schedule ${s.id}?`)) e.preventDefault(); }}>delete</button></span>
								</form>
							{/each}
							<form method="POST" action="?/schedule" use:enhance class="contents new">
								<input type="hidden" name="airport" value={a.id} />
								<input name="from" placeholder="YYYY-MM-DD" size="10" required /><input name="to" placeholder="open-ended" size="10" />
								<input name="open" placeholder="7" size="3" /><input name="close" placeholder="21" size="3" />
								<input name="note" placeholder="Chart Supplement NW, eff. 2026-09-04" />
								<span class="rowbtns"><button class="link-btn" type="submit">add</button></span>
							</form>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</section>

<section class="section cell">
	<h2 class="section-heading">Add an airport</h2>
	<p class="hint">Enter the three-letter code. The FAA record supplies the airport details and tower hours; nothing is saved until you confirm. An airport whose tower is staffed 24 hours can only be added as a reference airport, and needs its published quiet hours.</p>
	<form method="POST" action="?/lookupAirport" use:enhance class="lookup-form">
		<label>Airport code <input name="code" placeholder="BLI" value={form?.code ?? ''} required minlength="3" maxlength="3" autocomplete="off" /></label>
		<button class="btn btn-ink" type="submit">Look up airport</button>
	</form>
	{#if form?.candidate}
		<div class="candidate" data-testid="airport-candidate">
			<div>
				<div class="code">{form.candidate.code}</div>
				<strong>{form.candidate.name}</strong>
				<p class="body">{form.candidate.city}, {form.candidate.state} · {form.candidate.icao}</p>
			</div>
			<dl>
				<dt>Location</dt><dd>{form.candidate.lat.toFixed(4)}, {form.candidate.lon.toFixed(4)} · {form.candidate.elevationFt.toLocaleString()} ft</dd>
				<dt>Time zone</dt><dd>{form.candidate.tz}</dd>
				<dt>FAA tower record</dt><dd>{form.candidate.tower === 'none' ? 'No control tower' : form.candidate.towerHours}</dd>
				<dt>Kind</dt><dd>{form.candidate.kind === 'reference' ? 'reference — 24-hour tower, watched during quiet hours' : 'dark — tower closed or absent'}</dd>
				{#if form.candidate.schedule}
					<dt>Nightly window</dt><dd>{watchText(form.candidate.schedule.open, form.candidate.schedule.close)} local · effective {form.candidate.schedule.from}</dd>
				{/if}
			</dl>
			<form method="POST" action="?/confirmAirport" use:enhance class="confirm-form">
				<input type="hidden" name="code" value={form.candidate.code} />
				{#if form.candidate.needsQuietHours}
					<p class="hint">This airport's tower is staffed 24 hours. Give the quiet hours the airport publishes — the evening start and the morning end — and note the source in the schedule after adding it.</p>
					<label>Quiet from
						<select name="quiet_start" required data-testid="quiet-start">
							{#each hourOptions as h (h)}<option value={h} selected={h === 22}>{hourLabel(h)}</option>{/each}
						</select>
					</label>
					<label>Quiet to
						<select name="quiet_end" required data-testid="quiet-end">
							{#each hourOptions as h (h)}<option value={h} selected={h === 7}>{hourLabel(h)}</option>{/each}
						</select>
					</label>
				{/if}
				<button class="btn btn-ink" type="submit">Confirm and start tracking</button>
			</form>
		</div>
	{/if}
</section>

<style>
	.row { margin-top: 18px; }
	.ok { color: var(--ink-60); }
	.hint { font-size: 13px; color: var(--ink-45); max-width: 70ch; margin-top: 8px; }
	.drift { margin: 10px 0 0; padding: 0; list-style: none; font-size: 13px; }
	.drift li { padding: 8px 0; border-bottom: var(--row-rule); }
	.diff { color: var(--ink-60); margin-left: 12px; }
	.diff span { font-weight: 700; color: var(--ink); }
	.inline { display: inline; margin-left: 8px; }
	.flash { padding: 12px var(--gutter); background: var(--accent-tint); border-bottom: var(--row-rule); font-size: 14px; }
	.flash.error { color: var(--accent-text); font-weight: 700; }
	.flash.warn { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; }
	.list { margin-top: 12px; border-top: var(--rule); }
	.airport { border-bottom: var(--row-rule); }
	.head { display: grid; grid-template-columns: 70px 1fr auto auto 20px; gap: 16px; align-items: center; width: 100%; padding: 12px 0; background: none; border: none; text-align: left; cursor: pointer; font: inherit; color: inherit; }
	.head:hover { background: var(--ground-alt); }
	.code { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
	.dim { color: var(--ink-60); font-size: 13px; }
	.caret { color: var(--ink-45); }
	.detail { padding: 8px 0 24px 86px; }
	.grid-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 20px; }
	.grid-form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-60); }
	.grid-form label.check { flex-direction: row; align-items: center; text-transform: none; letter-spacing: 0; font-size: 14px; font-weight: 600; color: var(--ink); grid-column: span 2; }
	.grid-form input, .grid-form select, .sched input { padding: 8px 10px; border: 2px solid var(--hairline); background: #fff; font: inherit; font-size: 14px; }
	.grid-form output { min-height: 20px; padding: 8px 10px; border: 2px solid var(--hairline); background: var(--ground-alt); color: var(--ink); font-size: 14px; text-transform: none; letter-spacing: 0; }
	.field-note { font-size: 11px; font-weight: 500; line-height: 1.35; letter-spacing: 0; text-transform: none; }
	.grid-form input:focus, .sched input:focus { border-color: var(--ink); }
	.actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; }
	.lookup-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-top: 14px; }
	.lookup-form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-60); }
	.lookup-form input { width: 130px; padding: 10px 12px; border: 2px solid var(--ink); background: #fff; font: 20px/1 inherit; font-weight: 800; text-transform: uppercase; }
	.candidate { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr auto; gap: 24px; align-items: center; margin-top: 18px; padding: 18px; border: 2px solid var(--ink); background: var(--ground-alt); }
	.candidate dl { display: grid; grid-template-columns: max-content 1fr; gap: 5px 14px; margin: 0; font-size: 13px; }
	.candidate dt { color: var(--ink-60); }
	.candidate dd { margin: 0; font-weight: 600; }
	.confirm-form { display: flex; flex-direction: column; gap: 10px; }
	.confirm-form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-60); }
	.confirm-form select { padding: 8px 10px; border: 2px solid var(--hairline); background: #fff; font: inherit; font-size: 14px; }
	.sub { margin-top: 28px; font-size: 16px; font-weight: 800; }
	.sched { display: grid; grid-template-columns: 120px 120px 64px 64px 1fr 110px; gap: 6px 10px; align-items: center; margin-top: 10px; }
	.contents { display: contents; }
	.rowbtns { display: flex; gap: 10px; }
	.link-btn { background: none; border: none; padding: 0; color: var(--accent-text); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
	.link-btn.danger { color: var(--ink-45); }
	@media (max-width: 760px) {
		.head { grid-template-columns: 60px 1fr 20px; }
		.head .pill, .head .dim { display: none; }
		.detail { padding-left: 0; }
		.grid-form { grid-template-columns: 1fr; }
		.candidate { grid-template-columns: 1fr; }
		.sched { grid-template-columns: 1fr 1fr; }
	}
</style>
