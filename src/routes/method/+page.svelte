<script lang="ts">
	const sources = [
		{
			name: 'ADS-B',
			what: 'Automatic Dependent Surveillance–Broadcast. Nearly every aircraft carries a transponder that broadcasts its identity, position, altitude and speed about once a second, for anyone with a receiver to hear. It is how the FAA tracks aircraft today, and the source of every flight path on this site. The altitude it carries is measured against a standard air pressure, so we correct it to height above the field (AGL) using the airport\'s hourly weather reports; the raw figure is labelled "ADS-B altitude".'
		},
		{ name: 'FlightAware AeroAPI', what: 'arrival and departure records, and the ADS-B position signals each aircraft broadcast, collected by FlightAware\'s receiver network.' },
		{ name: 'FAA Chart Supplement and NASR data', what: 'the official published tower hours and facility record, plus the physical latitude and longitude of each runway end and the declared runway dimensions used for the amber map overlay.' },
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
			text: 'A flight counts once it comes within 10 nautical miles of the airport — about 11.5 road miles. Its path is then kept out to 20 nautical miles in both directions, so approaches, procedure turns and go-arounds are shown whole. Flights that never come inside 10 NM, or pass by while the tower was open, are dropped.'
		},
		{
			n: '03',
			title: 'Measure how close aircraft came to each other',
			text: 'Positions are lined up to a common clock and every pair of aircraft is measured. When two aircraft are less than 3 nautical miles apart and less than 1,000 feet apart vertically at the same moment, we flag it as a close approach.'
		}
	];

	/** The exact test. Every condition must hold at one and the same moment. */
	const criteria = [
		{ k: 'When', v: 'The tower was closed. Flights are checked only between the published closing and reopening times for that night.' },
		{ k: 'Where', v: 'Both aircraft were within 10 nautical miles of the airport — the point midway between them is inside the 10 NM ring.' },
		{ k: 'Side to side', v: 'Less than 3.00 nautical miles apart, measured over the ground.' },
		{ k: 'Vertically', v: 'Less than 1,000 feet apart, using the altitudes the aircraft reported. Both conditions must be true at the same instant; being inside one of them alone is normal and is not counted.' },
		{ k: 'Both flying', v: 'Each aircraft was more than 150 feet above the field (after the pressure correction) and moving faster than 40 knots. An aircraft on the runway, taxiing, or rolling out after landing does not count.' },
		{ k: 'Two aircraft', v: 'Two records of the same aircraft never count: the same tail number, or two tracks that ride on top of each other for most of their length (a callsign and a registration for one flight).' },
		{ k: 'Same clock', v: 'Positions are reported a few seconds apart, at different moments for each aircraft. Each path is smoothed through its reported points and both are read at the same instant, every second, so the distance is between where the aircraft actually were, not between their nearest reports.' },
		{ k: 'Counted once', v: 'Each pair of flights is counted at most once per night, at the moment they were closest. “Very close” means under 1 nautical mile and under 500 feet at that moment.' }
	];
	const wakeCriteria = [
		{ k: 'Aircraft class', v: 'Each ICAO aircraft type is assigned FAA Consolidated Wake Turbulence (CWT) category A through I. A is the A380; B–D are heavy jets; E is the Boeing 757; F–G are large aircraft; H–I are small aircraft. An unknown type is conservatively Category I as a follower, but can never be the leader that creates a flag.' },
		{ k: 'In trail', v: 'The follower must be behind the leader, travelling within 15° of the same direction, and pass within 0.50 NM of a point occupied by the leader earlier. Crossing, opposite-direction and merely nearby tracks do not count.' },
		{ k: 'Height', v: 'The aircraft must be within 2,500 feet vertically, and the follower cannot be more than 1,000 feet below the leader. Both must also pass the same airborne and 10 NM-ring tests used for close approaches.' },
		{ k: 'Spacing', v: 'The along-track spacing must be below the applicable FAA CWT minimum. On approach: A→B 5 NM; A→C/D 6; A→E/F/G 7; A→H/I 8. B→B 3, C/D 4, E/F/G/H 5, I 6. C→E/F/G 3.5, H 5, I 6. D→B 3, C/D 4, E/F/G 5, H/I 6. E→I and F→I are 4 NM. Blank FAA matrix cells are not flagged.' },
		{ k: 'Departures', v: 'For two departures the FAA “directly behind” matrix is used: the approach matrix above except B/C/D→I are 5 NM, C→H is 5 NM, D→H is 5 NM, and F→I has no distance minimum. Published same-runway departure time rules (generally 2 minutes, 3 behind an A380 or for certain intersection departures) are not inferred because ADS-B tracks do not reliably identify runway threshold or intersection use.' },
		{ k: 'Counted separately', v: 'A wake-turbulence event is not called a loss of 3 NM / 1,000 ft separation. It has its own label and count; the same pair can produce one event of each kind when both tests independently apply.' }
	];

	const limitations = [
		'Aircraft that do not broadcast ADS-B, or whose signal no receiver picked up, do not appear at all, so these counts are a floor, not a total.',
		'ADS-B altitude is measured against a standard air pressure, not the day\'s actual pressure, and in steps of 100 feet. Heights above the field (AGL) are corrected using the airport\'s hourly weather reports (the altimeter setting), interpolated between reports; a night with no weather report is shown uncorrected and says so. Expect about ±100 feet. The difference between two aircraft is not affected by this correction, so separation figures use the altitudes exactly as reported.',
		'Landing and takeoff times are sometimes estimated rather than measured; where the measured time is missing, the estimate is used.',
		'Coverage close to the ground is uneven, so the lowest parts of some flight paths are missing.',
		'An aircraft on the runway does not count. Any moment when either aircraft was within 150 feet of the field (after the pressure correction), or moving slower than 40 knots, is left out — so a landing roll beneath a passing aircraft is not flagged.'
	];

	const mike = 'mckoss@gmail.com';
	const kevin = 'kstoltz@citynetwork.com';
</script>

<svelte:head>
	<title>Method — Dark Towers</title>
	<meta name="description" content="What Dark Towers counts, where the data comes from, and who is behind it." />
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

<section class="section cell-lg">
	<h2 class="section-heading">What counts as a close approach</h2>
	<p class="copy">Every close approach on this site passed all of the following tests at one and the same moment. Nothing is flagged on judgement; the same rules are applied to every flight, and re-running them over the same data gives the same result.</p>
	<dl class="criteria">
		{#each criteria as c (c.k)}
			<dt>{c.k}</dt>
			<dd>{c.v}</dd>
		{/each}
	</dl>
	<p class="copy">
		Not counted: an aircraft sitting on the runway while another lands on it. Wake turbulence is tested separately below because it follows different rules from the 3 NM / 1,000 ft standard.
	</p>
</section>

<section class="section cell-lg">
	<h2 class="section-heading">What counts as a wake-turbulence event</h2>
	<p class="copy">Dark Towers applies the current terminal CWT “directly behind” and “on approach” matrices in FAA Order JO 7110.65BB, section 5-5-4. The detector deliberately does not apply the reduced 2.5 NM final-approach rule or the 1.5 NM / 500 ft Class B/C VFR-to-IFR provisions: those are facility- and operation-specific exceptions that this data cannot establish. The same deterministic test is applied once per second.</p>
	<dl class="criteria wake-criteria">
		{#each wakeCriteria as c (c.k)}<dt>{c.k}</dt><dd>{c.v}</dd>{/each}
	</dl>
	<p class="copy">Controller criteria: <a href="https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html">FAA JO 7110.65BB §5-5-4</a>. Departure timing rules: <a href="https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_9.html">§3-9-6</a>. Wake procedures and cautionary advisories: <a href="https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html">§§2-1-19–20</a>.</p>
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
			Dark Towers is not run by the FAA, an airport, an airline, or any government body. It is the work of
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
	.criteria {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0 24px;
		margin-top: 18px;
		max-width: 860px;
	}
	.criteria dt,
	.criteria dd {
		padding: 10px 0;
		border-bottom: var(--row-rule);
		font-size: 15px;
		line-height: 1.5;
	}
	.criteria dt {
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-size: 12px;
		padding-top: 13px;
	}
	.criteria dd {
		color: var(--ink-80);
	}
	@media (max-width: 640px) {
		.criteria {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.criteria dt {
			border-bottom: none;
			padding-bottom: 0;
		}
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
