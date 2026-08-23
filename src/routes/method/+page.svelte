<script lang="ts">
	const sources = [
		{ name: 'FlightAware AeroAPI', what: 'arrival and departure records, and the position signals each aircraft broadcasts.' },
		{ name: 'FAA Chart Supplement', what: 'the official published tower hours for each airport.' },
		{ name: 'Published airline schedules', what: 'to tell passenger flights apart from private ones.' },
		{ name: 'OpenStreetMap and CARTO', what: 'basemap tiles.' }
	];

	const steps = [
		{
			n: '01',
			title: 'Collect every flight while the tower is closed',
			text: 'For each night we list every arrival and departure between the tower closing and reopening the next morning, in local time. Flights are grouped by the evening they belong to, so a 1 a.m. landing is filed under the night before.'
		},
		{
			n: '02',
			title: 'Keep only the paths close to the airport',
			text: 'Each flight’s path is trimmed to the positions within 10 nautical miles of the airport — about 11.5 road miles — and within the hours the tower was closed. Flights that pass nearby at other times are dropped.'
		},
		{
			n: '03',
			title: 'Measure how close aircraft came to each other',
			text: 'Positions are lined up to a common clock and every pair of aircraft is measured. When two aircraft are less than 3 nautical miles apart and less than 1,000 feet apart vertically at the same moment, we flag it as a close approach.'
		}
	];

	const limitations = [
		'Aircraft that do not broadcast a position signal do not appear at all, so these counts are a floor, not a total.',
		'Broadcast altitude is not corrected for local air pressure, so altitude figures carry roughly ±100 feet.',
		'Landing and takeoff times are sometimes estimated rather than measured; where the measured time is missing, the estimate is used.',
		'Coverage close to the ground is uneven, so the lowest parts of some flight paths are missing.',
		'An aircraft on the runway does not count. Any moment when either aircraft was within 150 feet of the field elevation, or moving slower than 40 knots, is left out — so a landing roll beneath a passing aircraft is not flagged.'
	];

	const mike = 'mckoss@gmail.com';
	const kevin = 'kstoltz@citynetwork.com';
</script>

<svelte:head>
	<title>Method — Dark Tower Watch</title>
	<meta name="description" content="What Dark Tower Watch counts, where the data comes from, and who is behind it." />
</svelte:head>

<section class="section split">
	<div class="cell-lg">
		<div class="kicker">Method</div>
		<h1 class="page-headline headline">What this site counts, and how.</h1>
		<p class="body intro">
			Many smaller airports have control towers that are staffed only part of the day, and some have no tower at
			all. Those hours, where they exist, were set when the airport had no passenger flights. They have not
			changed. The passenger flights have arrived. This site does not argue that from anecdote — it counts the
			flights.
		</p>
	</div>
	<div class="cell-lg inset">
		<div class="table-header">Sources</div>
		<ul class="sources">
			{#each sources as s (s.name)}
				<li><strong>{s.name}</strong> — {s.what}</li>
			{/each}
		</ul>
	</div>
</section>

<section class="section steps">
	{#each steps as step (step.n)}
		<div class="step">
			<div class="step-n">{step.n}</div>
			<h2 class="section-heading step-title">{step.title}</h2>
			<p class="step-text">{step.text}</p>
		</div>
	{/each}
</section>

<section class="section field cell-lg">
	<div class="kicker standard-kicker">The standard</div>
	<p class="poster standard">
		With a controller on duty, aircraft are kept at least 3 nautical miles apart, or 1,000 feet apart vertically.
		When the tower is closed, nothing enforces this safety margin.
	</p>
</section>

<section class="section halves">
	<div class="cell">
		<h2 class="section-heading">What a flagged event is, and what it is not</h2>
		<p class="copy">
			A flag means two aircraft were closer than a controller would have allowed. It is not a finding that either
			pilot did anything wrong, and it is not an official ruling of any kind. When the tower is closed, pilots
			flying by sight are legally permitted to fly closer than these distances as long as they see each other and
			keep clear. That is the point: a passenger airliner coming in to land and a training aircraft circling the
			field share the same air with nothing between them but a radio call and a pair of eyes.
		</p>
	</div>
	<div class="cell">
		<h2 class="section-heading">Known limitations</h2>
		<ul class="limits">
			{#each limitations as l (l)}
				<li>{l}</li>
			{/each}
		</ul>
	</div>
</section>

<section id="who-we-are" class="section split">
	<div class="cell-lg">
		<div class="kicker">Who we are</div>
		<h2 class="who-headline">A citizen project, built on public data.</h2>
		<p class="copy who-copy">
			Dark Tower Watch is not run by the FAA, an airport, an airline, or any government body. It is the work of
			two residents who live under these flight paths. Everything on the site is drawn from publicly available
			ADS-B position data — the same signals aircraft broadcast for anyone to receive — and from published tower
			hours and airline schedules. Nothing here is confidential, and none of it required special access.
		</p>
		<p class="copy who-copy">If you see something we have wrong, tell us. Corrections improve the record.</p>
	</div>
	<div class="cell-lg inset">
		<div class="table-header">Contact</div>
		<div class="contacts">
			<div>
				<div class="contact-name">Mike Koss</div>
				<a href="mailto:{mike}?subject=Dark%20Tower%20Watch">{mike}</a>
			</div>
			<div>
				<div class="contact-name">Kevin Stoltz</div>
				<a href="mailto:{kevin}?subject=Dark%20Tower%20Watch">{kevin}</a>
			</div>
			<a class="btn feedback" href="mailto:{mike},{kevin}?subject=Dark%20Tower%20Watch%20feedback">Send us feedback</a>
		</div>
	</div>
</section>

<style>
	.headline {
		margin-top: 20px;
		max-width: 18ch;
	}
	.intro {
		margin-top: 24px;
		max-width: 58ch;
	}
	.sources,
	.limits {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink-80);
	}
	.sources strong {
		color: var(--ink);
		font-weight: 700;
	}
	.limits {
		gap: 12px;
		line-height: 1.6;
	}

	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.step {
		padding: 36px var(--gutter) 40px;
	}
	.step + .step {
		border-left: var(--row-rule);
	}
	.step-n {
		font-size: 40px;
		font-weight: 900;
		letter-spacing: -0.03em;
		line-height: 0.9;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.step-title {
		margin-top: 18px;
		letter-spacing: -0.01em;
	}
	.step-text {
		margin-top: 12px;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ink-80);
	}

	.standard-kicker {
		opacity: 0.8;
	}
	.standard {
		margin-top: 18px;
		max-width: 26ch;
	}

	.halves {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.halves > * + * {
		border-left: var(--rule);
	}
	.copy {
		margin-top: 14px;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ink-80);
	}

	.who-headline {
		margin-top: 18px;
		font-size: 32px;
		font-weight: 900;
		line-height: 1.05;
		letter-spacing: -0.025em;
		max-width: 24ch;
	}
	.who-copy {
		margin-top: 18px;
		max-width: 58ch;
		font-size: 16px;
	}
	.who-copy + .who-copy {
		margin-top: 14px;
	}
	.contacts {
		margin-top: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
	}
	.contact-name {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.contacts a:not(.btn) {
		display: inline-block;
		margin-top: 4px;
		font-size: 16px;
	}
	.feedback {
		border-bottom: none;
	}

	@media (max-width: 760px) {
		.steps,
		.halves {
			grid-template-columns: 1fr;
		}
		.step + .step,
		.halves > * + * {
			border-left: none;
			border-top: var(--rule);
		}
		.step {
			padding: 28px var(--gutter);
		}
	}
</style>
