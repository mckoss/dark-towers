<script lang="ts">
	import { enhance } from '$app/forms';
	import { towerHoursLabel } from '$lib/airports';
	import type { AirportWithStats } from '$lib/server/queries';
	import type { AirportStatus } from '$lib/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const statusLabel: Record<AirportStatus, string> = { tracking: 'Tracking', requested: 'Requested' };
	const statusClass: Record<AirportStatus, string> = { tracking: 'pill-accent', requested: 'pill-ghost' };

	const incidents = (a: AirportWithStats) => (a.stats ? String(a.stats.incidents) : '—');
	const flights = (a: AirportWithStats) => (a.stats ? String(a.stats.flights) : '—');
	const hasIncidents = (a: AirportWithStats) => (a.stats?.incidents ?? 0) > 0;
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
			service: a tower that closes while those flights are still arriving and leaving, or no tower at all.
		</p>
	</div>
	<div class="stat-grid">
		<div class="stat">
			<div class="big-stat">{data.stats.tracked}</div>
			<div class="stat-label">Airports tracked</div>
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
						<div class="dim city">{a.city}, {a.state}<span class="m-hours"> · {towerHoursLabel(a)}</span></div>
						<div class="dim hours">{towerHoursLabel(a)}</div>
						<div class="tabular num">{flights(a)}</div>
						<div class="inc tabular" class:accent={hasIncidents(a)} class:muted={!hasIncidents(a)}>{incidents(a)}</div>
						<div><span class="pill {statusClass[a.status]}">{statusLabel[a.status]}</span></div>
						<div class="arrow">→</div>
					</a>
				{:else}
					<div class="row inert">
						<div class="code">{a.code}</div>
						<div class="name">{a.name}</div>
						<div class="dim city">{a.city}, {a.state}<span class="m-hours"> · {towerHoursLabel(a)}</span></div>
						<div class="dim hours">{towerHoursLabel(a)}</div>
						<div class="tabular num">{flights(a)}</div>
						<div class="inc tabular" class:accent={hasIncidents(a)} class:muted={!hasIncidents(a)}>{incidents(a)}</div>
						<div><span class="pill {statusClass[a.status]}">{statusLabel[a.status]}</span></div>
						<div class="arrow"></div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</section>

<section class="section field split request">
	<div class="cell-lg">
		<h2 class="poster">If your airport has passenger flights and part-time or no-time tower service, put it on the map.</h2>
	</div>
	<div class="cell-lg">
		{#if form?.submitted}
			<div class="confirm" data-testid="request-ok">{form.message}</div>
		{:else}
			<form method="POST" use:enhance>
				<input type="text" name="value" placeholder="Airport code, or city and state" maxlength="120" required aria-label="Airport code, or city and state" />
				<input type="email" name="email" placeholder="Email (optional)" maxlength="200" aria-label="Email (optional)" />
				<button type="submit" class="btn btn-ink">Send request</button>
				{#if form?.error}
					<div class="confirm error" role="alert">{form.error}</div>
				{/if}
			</form>
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
	input {
		width: 100%;
		padding: 14px;
		border: 2px solid transparent;
		background: #fff;
		color: var(--ink);
		font-family: inherit;
		font-size: 15px;
	}
	input::placeholder {
		color: var(--ink-45);
	}
	form .btn {
		align-self: flex-start;
	}
	.confirm {
		padding: 16px 18px;
		background: rgba(255, 255, 255, 0.18);
		border: 2px solid #fff;
		font-size: 15px;
		line-height: 1.5;
	}

	@media (max-width: 760px) {
		.stat {
			padding: 20px var(--gutter);
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
	}
</style>
