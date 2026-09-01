<script lang="ts">
	import { enhance } from '$app/forms';
	import { hourLabel, isReference } from '$lib/airports';
	import type { AirportListRow } from '$lib/server/queries';
	import type { AirportStatus } from '$lib/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const statusLabel: Record<AirportStatus, string> = { tracking: 'Tracking', requested: 'Requested' };
	const statusClass: Record<AirportStatus, string> = { tracking: 'pill-accent', requested: 'pill-ghost' };
	/** Reference airports carry their own pill, whatever their tracking status. */
	const pillLabel = (a: AirportListRow) => (isReference(a) ? 'Reference' : statusLabel[a.status]);
	const pillClass = (a: AirportListRow) => (isReference(a) ? 'pill-ghost' : statusClass[a.status]);

	const incidents = (a: AirportListRow) => (a.stats ? String(a.stats.incidents) : '—');
	const flights = (a: AirportListRow) => (a.stats ? String(a.stats.flights) : '—');
	const hasIncidents = (a: AirportListRow) => (a.stats?.incidents ?? 0) > 0;
	const candidate = $derived(form?.candidate ?? data.candidate);
	/** A 24-hour tower can only join as a reference airport, and only with quiet hours and a reason. */
	const isReferenceCandidate = $derived(candidate?.track === 'reference');
	const hourOptions = Array.from({ length: 25 }, (_, h) => ({ value: h, label: hourLabel(h) }));
	const matches = $derived(form?.matches ?? []);
	const requestError = $derived(form?.error ?? data.requestError);
	const signInHref = $derived(candidate ? `/auth/google?next=${encodeURIComponent(`/airports?request=${candidate.id}#request-airport`)}` : '');
</script>

<svelte:head>
	<title>Airports tracked — Dark Towers</title>
</svelte:head>

<section class="section split">
	<div class="cell-lg">
		<div class="kicker">Coverage</div>
		<h1 class="page-headline">Airports tracked</h1>
		<p class="body intro">
			We track airports with regular passenger service <strong>and</strong> part-time or no-time control tower
			service: a tower that closes while those flights are still arriving and leaving, or no tower at all. A few
			airports with a 24-hour tower are listed as <strong>reference airports</strong>, watched during their own
			quiet hours so those nights can be compared.
		</p>
	</div>
	<div class="stat-grid">
		<div class="stat">
			<div class="big-stat">{data.stats.tracked}</div>
			<div class="stat-label">Airports tracked</div>
			{#if data.stats.reference}<div class="stat-aside">+{data.stats.reference} reference</div>{/if}
		</div>
		<div class="stat">
			<div class="big-stat accent">{data.stats.incidents}</div>
			<div class="stat-label">Close approaches</div>
		</div>
		<div class="stat">
			<div class="big-stat">{data.stats.requested}</div>
			<div class="stat-label">Requested</div>
		</div>
		<div class="stat">
			<div class="big-stat">{data.stats.nights}</div>
			<div class="stat-label">Nights covered</div>
		</div>
	</div>
</section>

<section class="section" id="airport-list">
	<div class="table-head">
		<h2 class="section-heading">All airports</h2>
		<div class="footnote">Counts from last 30 days</div>
	</div>
	<div class="table-wrap">
		<div class="table">
			<div class="row header table-header" role="row">
				<div>Code</div>
				<div>Airport</div>
				<div>City</div>
				<div>Tower hours</div>
				<div>Flights</div>
				<div>Close approaches</div>
				<div>Status</div>
				<div></div>
			</div>
			{#each data.airports as a (a.code)}
				{#if a.tracked}
					<a class="row tracked" href="/airport/{a.code}" title="Open the {a.code} record">
						<div class="code">{a.code}</div>
						<div class="name">{a.name}</div>
						<div class="dim city">{a.city}, {a.state}<span class="m-hours"> · {a.towerLabel}</span></div>
						<div class="dim hours">{a.towerLabel}{#if isReference(a)}<span class="ref-mark" title="Reference airport">†</span>{/if}</div>
						<div class="tabular num">{flights(a)}</div>
						<div class="inc tabular" class:accent={hasIncidents(a)} class:muted={!hasIncidents(a)}>{incidents(a)}</div>
						<div><span class="pill {pillClass(a)}">{pillLabel(a)}</span></div>
						<div class="arrow">→</div>
					</a>
				{:else}
					<div class="row inert">
						<div class="code">{a.code}</div>
						<div class="name">{a.name}</div>
						<div class="dim city">{a.city}, {a.state}<span class="m-hours"> · {a.towerLabel}</span></div>
						<div class="dim hours">{a.towerLabel}{#if isReference(a)}<span class="ref-mark" title="Reference airport">†</span>{/if}</div>
						<div class="tabular num">{flights(a)}</div>
						<div class="inc tabular" class:accent={hasIncidents(a)} class:muted={!hasIncidents(a)}>{incidents(a)}</div>
						<div><span class="pill {pillClass(a)}">{pillLabel(a)}</span></div>
						<div class="arrow"></div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
	{#if data.airports.some(isReference)}
		<p class="table-note" id="reference-note" data-testid="reference-note">
			<strong>† Reference airport.</strong> The tower here is staffed 24 hours. The hours shown are the airport's own
			published quiet hours, when the passenger airlines have agreed not to schedule flights — a voluntary agreement,
			not a federal rule. We watch these nights for comparison with airports whose tower is closed, and they are not
			counted in the totals above.
		</p>
	{/if}
</section>

<section class="section field split request" id="request-airport">
	<div class="cell-lg">
		<h2 class="poster">If your airport has passenger flights and part-time or no-time tower service, put it on the map.</h2>
	</div>
	<div class="cell-lg">
		{#if form?.submitted}
			<div class="confirm" data-testid="request-ok">{form.message}</div>
		{:else if candidate}
			<div class="candidate" data-testid="request-candidate">
				<div class="kicker">Confirm the FAA record</div>
				<h3>{candidate.id} · {candidate.name}</h3>
				<dl>
					<dt>Location</dt><dd>{candidate.city}, {candidate.state}</dd>
					<dt>Codes</dt><dd>{candidate.id}{candidate.icao ? ` · ${candidate.icao}` : ''}</dd>
					<dt>Elevation</dt><dd>{candidate.elevFt.toLocaleString()} ft</dd>
					<dt>Tower</dt><dd>{candidate.towerLabel}</dd>
					<dt>Passenger service</dt><dd>FAA Part 139 air-carrier airport</dd>
				</dl>
				{#if isReferenceCandidate}
					<p class="candidate-note">
						The tower here is staffed 24 hours, so this is not a dark airport. It can still be listed as a
						<strong>reference airport</strong>: we watch the hours the passenger airlines have agreed not to fly, so those
						nights can be compared with airports whose tower is closed. Tell us those quiet hours and why this airport is
						worth comparing. Reference airports are marked as such and are not counted in the site's totals.
					</p>
				{:else}
					<p class="candidate-note">This airport is not already listed and meets the tower and passenger-service checks. Confirm the record above to continue; these airport details cannot be edited.</p>
				{/if}
				{#if data.user}
					<form method="POST" action="?/submit" use:enhance>
						<input type="hidden" name="code" value={candidate.id} />
						<label>Your name <input type="text" name="name" value={data.user.name ?? ''} maxlength="120" autocomplete="name" required /></label>
						<label>Verified email <output>{data.user.email}</output></label>
						{#if isReferenceCandidate}
							<div class="quiet-hours">
								<label>Quiet hours start
									<select name="quiet_start" required data-testid="quiet-start">
										{#each hourOptions as o (o.value)}<option value={o.value} selected={o.value === 22}>{o.label}</option>{/each}
									</select>
								</label>
								<label>Quiet hours end
									<select name="quiet_end" required data-testid="quiet-end">
										{#each hourOptions as o (o.value)}<option value={o.value} selected={o.value === 7}>{o.label}</option>{/each}
									</select>
								</label>
							</div>
							<label>Why this airport, and where do these hours come from? <textarea name="comment" maxlength="2000" rows="4" required placeholder="For example: the airport authority publishes a voluntary curfew from 10 pm to 7 am, so these hours show what flies when airlines have agreed not to."></textarea></label>
						{:else}
							<label>Comment (optional) <textarea name="comment" maxlength="2000" rows="4" placeholder="Tell us anything useful about passenger service or tower hours"></textarea></label>
						{/if}
						<button type="submit" class="btn btn-ink">Submit airport request</button>
					</form>
				{:else if data.googleConfigured}
					<p class="candidate-note">Google sign-in is required before submitting so the request includes a verified email address.</p>
					<a class="btn btn-ink" href={signInHref}>Continue with Google</a>
				{:else}
					<div class="confirm error" role="alert">Google sign-in is temporarily unavailable, so this request cannot be submitted yet.</div>
				{/if}
				<a class="lookup-again" href="/airports#request-airport">Look up a different airport</a>
				{#if requestError}<div class="confirm error" role="alert">{requestError}</div>{/if}
			</div>
		{:else}
			<form method="POST" action="?/lookup" use:enhance>
				<input type="text" name="value" placeholder="Airport code, city, or state" maxlength="120" required aria-label="Airport code, city, or state" />
				<button type="submit" class="btn btn-ink">Look up airport</button>
				{#if requestError}
					<div class="confirm error" role="alert">{requestError}</div>
				{/if}
			</form>
			{#if matches.length}
				<div class="matches" data-testid="request-results">
					<div class="kicker">Qualifying airports</div>
					<p>These FAA Part 139 airports have a part-time tower or no tower.</p>
					{#each matches as airport (airport.id)}
						<div class="match" data-testid="request-result">
							<div><strong>{airport.id} · {airport.name}</strong><span>{airport.city}, {airport.state} · {airport.towerLabel}</span></div>
							{#if airport.status === 'available'}
								<a class="btn btn-ink" href="/airports?request={airport.id}#request-airport">Review {airport.id}</a>
							{:else if airport.status === 'listed'}
								<span class="pill pill-ghost">Already on list</span>
							{:else}
								<span class="pill pill-ghost">Already requested</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.intro {
		margin-top: 20px;
		max-width: 58ch;
	}
	.page-headline {
		margin-top: 18px;
		max-width: 20ch;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.stat {
		padding: 24px;
	}
	.stat:nth-child(odd) {
		border-right: var(--row-rule);
	}
	.stat:nth-child(-n + 2) {
		border-bottom: var(--row-rule);
	}
	.stat .stat-label {
		margin-top: 8px;
		font-size: 11px;
	}

	.ref-mark {
		margin-left: 4px;
		color: var(--accent);
		font-weight: 600;
	}
	.stat-aside {
		margin-top: 4px;
		font-size: 11px;
		color: var(--ink-45);
	}
	.table-note {
		max-width: 78ch;
		padding: 18px var(--gutter) 28px;
		font-size: 13px;
		line-height: 1.55;
		color: var(--ink-60);
	}

	.table-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		padding: 32px var(--gutter) 20px;
	}
	.table-wrap {
		padding: 0 var(--gutter) 40px;
	}
	.table {
		border-top: var(--rule);
	}
	.row {
		display: grid;
		grid-template-columns: 80px 1.5fr 1fr 1fr 100px 120px 128px 36px;
		align-items: center;
		border-bottom: var(--row-rule);
		padding: 14px 0;
		color: var(--ink);
		font-size: 14px;
	}
	.row.header {
		padding: 10px 0;
	}
	a.row {
		border-bottom: var(--row-rule);
		cursor: pointer;
	}
	a.row:hover {
		background: var(--ground-alt);
		color: var(--ink);
		border-bottom-color: var(--hairline);
	}
	.row.inert {
		opacity: 0.6;
		cursor: default;
	}
	.code {
		font-size: 17px;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.name {
		font-weight: 500;
		padding-right: 12px;
	}
	.dim {
		color: var(--ink-60);
	}
	.m-hours {
		display: none;
	}
	.num {
		font-size: 15px;
	}
	.inc {
		font-size: 20px;
		font-weight: 800;
	}
	.arrow {
		font-size: 18px;
		font-weight: 700;
		color: var(--accent-text);
		text-align: right;
	}

	.request .poster {
		max-width: 20ch;
	}
	.request > * + * {
		border-left: 2px solid #fff;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	input, textarea, output {
		width: 100%;
		padding: 14px;
		border: 2px solid transparent;
		background: #fff;
		color: var(--ink);
		font-family: inherit;
		font-size: 15px;
	}
	textarea { resize: vertical; }
	output { display: block; background: rgba(255, 255, 255, 0.65); }
	input::placeholder {
		color: var(--ink-45);
	}
	form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
	form .btn {
		align-self: flex-start;
	}
	.candidate h3 { margin-top: 8px; font-size: 24px; line-height: 1.1; }
	.candidate dl { display: grid; grid-template-columns: max-content 1fr; gap: 7px 18px; margin: 18px 0 0; font-size: 14px; }
	.candidate dt { color: var(--ink-60); }
	.candidate dd { margin: 0; font-weight: 650; }
	.candidate-note { margin: 16px 0; font-size: 13px; line-height: 1.5; }
	.lookup-again { display: inline-block; margin-top: 16px; color: inherit; font-size: 13px; text-decoration: underline; }
	.confirm {
		padding: 16px 18px;
		background: rgba(255, 255, 255, 0.18);
		border: 2px solid #fff;
		font-size: 15px;
		line-height: 1.5;
	}
	.matches { margin-top: 24px; border-top: 2px solid #fff; }
	.matches > .kicker { margin-top: 20px; }
	.matches > p { margin: 8px 0 12px; font-size: 13px; line-height: 1.45; }
	.match { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid rgba(255, 255, 255, 0.55); }
	.match strong, .match span { display: block; }
	.match strong { font-size: 15px; }
	.match div > span { margin-top: 3px; font-size: 12px; line-height: 1.35; }
	.match .btn { flex: none; padding: 10px 12px; font-size: 11px; }
	.match > .pill { flex: none; }

	@media (max-width: 760px) {
		.stat {
			padding: 20px var(--gutter);
		}
		.ref-mark {
		margin-left: 4px;
		color: var(--accent);
		font-weight: 600;
	}
	.stat-aside {
		margin-top: 4px;
		font-size: 11px;
		color: var(--ink-45);
	}
	.table-note {
		max-width: 78ch;
		padding: 18px var(--gutter) 28px;
		font-size: 13px;
		line-height: 1.55;
		color: var(--ink-60);
	}

	.table-head {
			flex-direction: column;
			gap: 6px;
		}
		.row.header {
			display: none;
		}
		.row {
			grid-template-columns: 1fr 36px;
			grid-template-areas:
				'code arrow'
				'name arrow'
				'meta arrow'
				'inc arrow';
			row-gap: 2px;
			padding: 16px 0;
		}
		.row > * {
			display: none;
		}
		.code {
			display: block;
			grid-area: code;
			font-size: 24px;
			letter-spacing: -0.01em;
		}
		.name {
			display: block;
			grid-area: name;
			padding: 0;
		}
		.city {
			display: block;
			grid-area: meta;
			font-size: 13px;
		}
		.m-hours {
			display: inline;
		}
		.inc {
			display: block;
			grid-area: inc;
			margin-top: 4px;
		}
		.inc::after {
			content: ' close approaches';
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: var(--ink-60);
		}
		.arrow {
			display: block;
			grid-area: arrow;
			align-self: center;
		}
		.request > * + * {
			border-left: none;
			border-top: 2px solid #fff;
		}
		.match { align-items: flex-start; flex-direction: column; }
	}
</style>
