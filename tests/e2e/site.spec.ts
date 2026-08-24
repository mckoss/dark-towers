import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * End-to-end coverage of every route against the built app with the sample
 * KPAE data (nights of 2026-08-12 … 08-18). Runs in desktop and mobile
 * projects (see playwright.config.ts).
 */

const NIGHT_WITH_INCIDENTS = '2026-08-17';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

async function expectNoOverlaps(blocks: Locator) {
	const rects = await blocks.evaluateAll((nodes) =>
		nodes.map((node) => {
			const r = node.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
		})
	);
	for (let i = 0; i < rects.length; i++) {
		for (let j = i + 1; j < rects.length; j++) {
			const overlap = Math.min(rects[i].right, rects[j].right) > Math.max(rects[i].left, rects[j].left) && Math.min(rects[i].bottom, rects[j].bottom) > Math.max(rects[i].top, rects[j].top);
			expect(overlap, `datablocks ${i} and ${j} overlap`).toBe(false);
		}
	}
}

test.describe('home', () => {
	test('renders headline, 30-night figures and the US map, naming no airport in copy', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Airliners are landing at airports');
		await expect(page.getByText('Data from last 30 days')).toBeVisible();
		// Tracked airport marker on the map links to its record.
		const marker = page.locator('a[href="/airport/PAE"]').first();
		await expect(marker).toHaveAttribute('aria-label', /Open the PAE record/);
		// Copy (not the map labels) never names an airport.
		const copy = await page.locator('main h1, main p').allTextContents();
		expect(copy.join(' ')).not.toMatch(/Paine|Everett|PAE\b/);
		await expect(page.getByRole('link', { name: /Airport list and submissions/ })).toHaveAttribute('href', '/airports');
	});

	test('health endpoint reports the sample nights', async ({ request }) => {
		const res = await request.get('/api/health');
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.nights).toBeGreaterThanOrEqual(4);
	});

	test('serves a PWA manifest and service worker', async ({ request }) => {
		const m = await request.get('/manifest.webmanifest');
		expect(m.ok()).toBeTruthy();
		expect((await m.json()).display).toBe('standalone');
		const sw = await request.get('/service-worker.js');
		expect(sw.ok()).toBeTruthy();
	});

	test('shows the application version in the header', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.brand-version')).toHaveText(`v${version}`);
	});

	test('close-approach statistic opens the replayable event table', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: /Close approaches below the separation standard/ }).click();
		await expect(page).toHaveURL(/\/close-approaches$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Close approaches');
		const replay = page.getByRole('link', { name: /Watch replay/ }).first();
		await expect(replay).toHaveAttribute('href', /\/close-approach\/PAE-/);
	});

	test('close approaches default to closest and can be grouped by date or airport', async ({ page }) => {
		const rows = page.getByTestId('approach-row');
		const values = () => rows.evaluateAll((nodes) => nodes.map((node) => ({
			airport: node.getAttribute('data-airport')!,
			night: node.getAttribute('data-night')!,
			score: Math.hypot(Number(node.getAttribute('data-lateral')), Number(node.getAttribute('data-vertical')) / 6076.12)
		})));
		const expectClosestWithin = (items: { score: number }[]) => {
			for (let i = 1; i < items.length; i++) expect(items[i].score).toBeGreaterThanOrEqual(items[i - 1].score);
		};

		await page.goto('/close-approaches');
		await expect(page.getByRole('link', { name: 'Closest', exact: true })).toHaveAttribute('aria-current', 'page');
		expectClosestWithin(await values());

		await page.getByRole('link', { name: 'Date', exact: true }).click();
		await expect(page).toHaveURL(/sort=date/);
		const byDate = await values();
		for (let i = 1; i < byDate.length; i++) {
			expect(byDate[i].night <= byDate[i - 1].night).toBe(true);
			if (byDate[i].night === byDate[i - 1].night) expect(byDate[i].score).toBeGreaterThanOrEqual(byDate[i - 1].score);
		}

		await page.getByRole('link', { name: 'Airport', exact: true }).click();
		await expect(page).toHaveURL(/sort=airport/);
		const byAirport = await values();
		for (let i = 1; i < byAirport.length; i++) {
			expect(byAirport[i].airport >= byAirport[i - 1].airport).toBe(true);
			if (byAirport[i].airport === byAirport[i - 1].airport) expect(byAirport[i].score).toBeGreaterThanOrEqual(byAirport[i - 1].score);
		}

		await page.getByRole('link', { name: 'Closest', exact: true }).click();
		await expect(page).toHaveURL(/\/close-approaches$/);
	});
});

test.describe('navigation', () => {
	test('header links reach every section', async ({ page, isMobile }) => {
		await page.goto('/');
		if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
		await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Airports' }).click();
		await expect(page).toHaveURL(/\/airports$/);
		if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
		await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Method' }).click();
		await expect(page).toHaveURL(/\/method$/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('What this site counts');
	});

	test('unknown routes show the designed 404 page', async ({ page }) => {
		const res = await page.goto('/no-such-page');
		expect(res?.status()).toBe(404);
		await expect(page.getByText(/This page doesn.t exist\./)).toBeVisible();
	});
});

test.describe('airports', () => {
	test('lists airports; tracked rows open the airport record', async ({ page }) => {
		await page.goto('/airports');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Airports tracked');
		await expect(page.getByText('Counts from last 30 days')).toBeVisible();
		const pae = page.locator('a[title="Open the PAE record"]');
		await expect(pae).toBeVisible();
		await expect(page.getByText('Bellingham International')).toBeVisible();
		await pae.click();
		await expect(page).toHaveURL(/\/airport\/PAE/);
	});

	test('request lookup qualifies a new airport before collecting verified contact details', async ({ page, isMobile }) => {
		await page.goto('/airports');
		await page.getByPlaceholder(/Airport code/).fill('SEA');
		await page.getByRole('button', { name: 'Look up airport' }).click();
		await expect(page.getByRole('alert')).toContainText(/staffed 24 hours/);
		await page.getByPlaceholder(/Airport code/).fill('PAE');
		await page.getByRole('button', { name: 'Look up airport' }).click();
		await expect(page.getByRole('alert')).toContainText(/already on the Dark Towers airport list/);

		const code = isMobile ? 'ACV' : 'MMH';
		await page.getByPlaceholder(/Airport code/).fill(code);
		await page.getByRole('button', { name: 'Look up airport' }).click();
		const candidate = page.getByTestId('request-candidate');
		await expect(candidate).toContainText(code);
		await expect(candidate).toContainText('no control tower');
		await expect(candidate).toContainText('FAA Part 139 air-carrier airport');
		await expect(candidate.locator('input[name="value"]')).toHaveCount(0);
		await expect(candidate.getByText('open@localhost')).toBeVisible();
		await candidate.getByLabel('Your name').fill(isMobile ? 'Mobile Reader' : 'Desktop Reader');
		const comment = `${isMobile ? 'Mobile' : 'Desktop'} request comment`;
		await candidate.getByLabel('Comment (optional)').fill(comment);
		await candidate.getByRole('button', { name: 'Submit airport request' }).click();
		await expect(page.getByTestId('request-ok')).toContainText(`request for ${code}`);
		await page.goto('/admin');
		await expect(page.getByText(comment)).toBeVisible();
		const text = await page.locator('main').textContent();
		expect(text).not.toMatch(/we will review|within \d+ (days|hours)/i);
	});
});

test.describe('airport detail', () => {
	test('shows the record, calendar and flight log for the latest night', async ({ page }) => {
		await page.goto('/airport/PAE');
		await expect(page.getByText('Snohomish County (Paine Field)').first()).toBeVisible();
		await expect(page.getByText('7:00 am – 9:00 pm').first()).toBeVisible();
		await expect(page.getByText(/Night of /)).toBeVisible();
		await expect(page.getByText(/Flight log/)).toBeVisible();
		// Airline flights are named in plain language, with the callsign secondary.
		await expect(page.getByText(/(Horizon|Alaska|Southwest) \d+/).first()).toBeVisible();
		// No process metrics on the page.
		expect(await page.locator('main').textContent()).not.toMatch(/positions analy/i);
		// FAA physical runway endpoints are overlaid above the pale base map.
		await expect(page.locator('.runway-surface')).toHaveCount(2);
		await expect(page.locator('.runway-highlight')).toHaveCount(2);
		await expect(page.locator('.runway-casing')).toHaveCount(0);
		await expect(page.locator('.runway-end-label')).toHaveCount(4);
		await expect(page.locator('.field-marker')).toHaveCount(0);
		await expect(page.getByTestId('map-legend')).toContainText('FAA runway layout');
	});

	test('selecting a calendar night reloads the panel and shows close approaches', async ({ page }) => {
		await page.goto('/airport/PAE');
		await page.getByRole('button', { name: /Mon 17/ }).click();
		await expect(page).toHaveURL(/night=2026-08-17/);
		await expect(page.getByText('Night of Monday, August 17')).toBeVisible();
		const cards = page.getByRole('link', { name: /Replay this close approach/ });
		await expect(cards.first()).toBeVisible();
		expect(await cards.count()).toBeGreaterThan(0);
		// Hovering a night shows its flight and close-approach counts.
		await page.getByRole('button', { name: /Mon 17/ }).hover();
		await expect(page.getByTestId('cal-tip')).toContainText(/\d+ flights\s*\d+ airline\s*\d+ close approach/);
		// The hours the night covers sit under the title.
		await expect(page.getByTestId('night-hours')).toContainText(/Tower closed \d+:00 [ap]m to \d+:00 [ap]m/);
	});

	test('the whole night can be replayed from controls under the map', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		const play = page.getByTestId('night-play');
		await expect(play).toBeVisible();
		await expect(play).toHaveAttribute('aria-label', 'Play');
		// A red pip on the scrubber for every close approach that night.
		expect(await page.getByTestId('night-pip').count()).toBeGreaterThan(0);
		const before = await page.getByTestId('night-time').getAttribute('data-t');
		await play.click();
		// The replay can pause for 2.5 s on an event almost immediately after
		// the first report; wait for the shared clock to continue past that hold.
		await expect.poll(() => page.getByTestId('night-time').getAttribute('data-t'), { timeout: 6000 }).not.toBe(before);
		await play.click();
		await expect(play).toHaveAttribute('aria-label', 'Play');
		const replayBlocks = page.locator('.replay-label-offset .datablock');
		await expect(replayBlocks.first().locator('.db-id')).toContainText(/ · \S+/);
		await expect(page.locator('.replay-label-leader').first()).toBeVisible();
		expect(await page.locator('.replay-label-offset').first().evaluate((node) => getComputedStyle(node).transitionTimingFunction)).toContain('ease-in-out');
		await page.waitForTimeout(250);
		await expectNoOverlaps(replayBlocks);
		// Single-step: +15 s then −15 s returns to the same clock reading.
		const paused = await page.getByTestId('night-time').getAttribute('data-t');
		await page.getByTestId('night-forward').click();
		expect(await page.getByTestId('night-time').getAttribute('data-t')).not.toBe(paused);
		await page.getByTestId('night-back').click();
		expect(await page.getByTestId('night-time').getAttribute('data-t')).toBe(paused);
		// Moving beyond the currently visible aircraft leaves its datablock in
		// the pane for the half-second fade instead of removing it immediately.
		const scrubber = page.getByTestId('night-scrubber');
		await scrubber.evaluate((input: HTMLInputElement) => {
			input.value = input.max;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		const fading = page.locator('.replay-label-offset:not(.visible)');
		await expect(fading.first()).toBeAttached({ timeout: 300 });
		expect(await fading.first().evaluate((node) => getComputedStyle(node).transitionDuration)).toContain('0.5s');
		await expect(fading).toHaveCount(0, { timeout: 1200 });
	});

	test('flight log links seek a shareable whole-night replay and leave it paused', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		const flight = page.locator('section.log a.row').first();
		const href = await flight.getAttribute('href');
		expect(href).toMatch(/^\?night=2026-08-17&t=\d+#night-replay$/);
		const requested = new URL(href!, 'http://localhost').searchParams.get('t');
		await flight.click();
		await expect(page).toHaveURL(new RegExp(`night=${NIGHT_WITH_INCIDENTS}&t=${requested}#night-replay`));
		await expect(page.getByTestId('night-play')).toHaveAttribute('aria-label', 'Play');
		await expect(page.getByTestId('night-time')).toHaveAttribute('data-t', requested!);
	});

	test('close-approach statistics preserve airport and night filters', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		await expect(page.locator('a.stat-link[href="/close-approaches?airport=PAE"]')).toBeVisible();
		await page.locator('.total-link').click();
		await expect(page).toHaveURL(new RegExp(`/close-approaches\\?airport=PAE&night=${NIGHT_WITH_INCIDENTS}`));
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Paine Field');
		await expect(page.getByText(`Night of Monday, August 17`)).toBeVisible();
	});

	test('keeps aircraft trails attached while a mobile pinch zoom is in progress', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'Pinch zoom is a mobile-only interaction');
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		const scrubber = page.getByTestId('night-scrubber');
		await scrubber.evaluate((input: HTMLInputElement) => {
			input.value = '500';
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		const trail = page.locator('.leaflet-overlay-pane path[stroke-opacity="0.95"]').first();
		const marker = page.locator('.replay-marker').first();
		// Leaflet's icon host intentionally has a 0 × 0 box; its child SVG is visible.
		await expect(marker.locator('svg')).toBeAttached();
		await expect(trail).toBeAttached();
		await page.getByTestId('night-play').click();
		const before = await marker.getAttribute('style');
		await expect.poll(() => marker.getAttribute('style')).not.toBe(before);

		const box = await page.locator('.flight-map').boundingBox();
		expect(box).not.toBeNull();
		const x = box!.x + box!.width / 2;
		const y = box!.y + box!.height / 2;
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [
				{ x: x - 30, y, id: 1 },
				{ x: x + 30, y, id: 2 }
			]
		});
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{ x: x - 70, y, id: 1 },
				{ x: x + 70, y, id: 2 }
			]
		});
		const duringPinch = await marker.getAttribute('style');
		await page.waitForTimeout(300);
		expect(await marker.getAttribute('style')).toBe(duringPinch);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => marker.getAttribute('style')).not.toBe(duringPinch);
	});

	test('a night without close approaches shows the honest empty state', async ({ page }) => {
		await page.goto('/airport/PAE?night=2026-08-16');
		await expect(page.getByText(/No separation or wake-turbulence events were detected/)).toBeVisible();
	});

	test('can step back through calendar-month windows and return to the last 30 days', async ({ page }) => {
		await page.goto('/airport/PAE');
		await expect(page.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
		await page.getByTestId('window-prev').click();
		await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
		await expect(page.getByRole('heading', { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/ })).toBeVisible();
		// Deep-linking a 2024 night implies its month window.
		await page.goto('/airport/PAE?night=2024-06-20');
		await expect(page.getByRole('heading', { name: 'June 2024' })).toBeVisible();
		await expect(page.getByText('Night of Thursday, June 20')).toBeVisible();
		await expect(page.getByText(/Over June 2024/)).toBeVisible();
		await page.getByTestId('window-latest').click();
		await expect(page.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
	});

	test('an airport without data explains that nightly detail is not published yet', async ({ page }) => {
		// Deterministic against the CI fixture (only PAE has nights). A local database
		// where the scheduler has already collected this airport shows the calendar instead.
		await page.goto('/airport/BLI');
		const empty = page.getByText(/Nightly detail for BLI is not published yet/);
		const calendar = page.getByRole('button', { name: /— \d+ flights/ }).first();
		await expect(empty.or(calendar)).toBeVisible();
		if (await empty.isVisible()) await expect(page.getByRole('link', { name: /Paine Field/ })).toHaveAttribute('href', '/airport/PAE');
	});
});

test.describe('close approach', () => {
	test('opens from a card, shows the figures and plays the replay', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		await page.getByRole('link', { name: /Replay this close approach/ }).first().click();
		await expect(page).toHaveURL(/\/close-approach\/PAE-/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/ and /);
		await expect(page.locator('.runway-surface')).toHaveCount(2);
		await expect(page.getByText(/\d+' at \d+\.\d\d NM/)).toBeVisible();
		await expect(page.getByText("At least 1,000'")).toBeVisible();
		await expect(page.getByText(/vertical separation when aircraft are within 3 NM/)).toBeVisible();
		await expect(page.getByText(/Nearest approach · \d+:\d\d:\d\d [ap]m/)).toBeVisible();
		await expect(page.getByTestId('nearest-moment')).toContainText('kt');
		// The explanatory figures and the lower datablock line consistently show AGL;
		// the compact ATC line always retains raw pressure altitude.
		await expect(page.getByTestId('alt-note')).toContainText(/Altitudes shown are AGL .*corrected [−+][\d,]+'/);
		await expect(page.getByRole('button', { name: /altitudes/i })).toHaveCount(0);
		// Editorial rule: never claim what is or is not in an FAA record.
		expect(await page.locator('main').textContent()).not.toMatch(/reported to the FAA|FAA record/i);

		const play = page.getByTestId('replay-play');
		await expect(play).toBeVisible();
		await expect(page.getByTestId('replay-pip')).toBeAttached();
		const replayLabels = page.locator('.replay-label .db-id');
		await expect(replayLabels.nth(0)).toContainText(' · ');
		await expect(replayLabels.nth(1)).toContainText(' · ');
		await expect(page.locator('.replay-label .db-plain').first()).toContainText(/ft AGL/);
		const atcLine = page.locator('.replay-label-offset.visible .db-atc').first();
		await expect(atcLine).toBeVisible();
		await expect(atcLine).toHaveText(/^\d{3}[↑↓]?\s+\d{1,3}$/);
		await expect(page.locator('.replay-label-leader')).toHaveCount(await page.locator('.replay-label-offset').count());
		await expectNoOverlaps(page.locator('.replay-label-offset .datablock'));
		// Playback starts on its own once the map is up.
		await expect(play).toHaveAttribute('aria-label', 'Pause');
		const clock = page.getByTestId('replay-time');
		const before = await clock.getAttribute('data-t');
		expect(before).not.toBeNull();
		// The replay intentionally holds for 2.5 s at the closest moment, so
		// retry until playback resumes instead of assuming one second is enough.
		await expect(clock).not.toHaveAttribute('data-t', before!);
		await expect(page.getByTestId('replay-lateral')).toContainText('NM');
		// Stepping pauses playback and moves the clock by 15 s.
		await page.getByTestId('replay-forward').click();
		await expect(play).toHaveAttribute('aria-label', /Play|Replay/);
		const stepped = await page.getByTestId('replay-time').getAttribute('data-t');
		await page.getByTestId('replay-back').click();
		expect(await page.getByTestId('replay-time').getAttribute('data-t')).not.toBe(stepped);
		await expect(page.getByTestId('replay-vertical')).toContainText('ft');
		// Scrubbing to the end lands on the closest pass region and stops.
		const scrubber = page.getByTestId('replay-scrubber');
		await scrubber.evaluate((el: HTMLInputElement) => {
			el.value = el.max;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.waitForTimeout(200);
		expect(await page.getByTestId('replay-time').getAttribute('data-t')).not.toBe(before);
	});

	test('unknown incident id is a 404', async ({ page }) => {
		const res = await page.goto('/close-approach/PAE-00000000-nope');
		expect(res?.status()).toBe(404);
	});
});

test.describe('method', () => {
	test('states sources, the rule, limitations and contacts in plain language', async ({ page }) => {
		await page.goto('/method');
		await expect(page.getByText('FlightAware')).toBeVisible();
		await expect(page.getByText(/within 3 nautical miles .* at least 1,000 feet apart vertically/)).toBeVisible();
		await expect(page.getByText('Known limitations')).toBeVisible();
		// The exact test is spelled out, condition by condition.
		await expect(page.getByRole('heading', { name: 'What counts as a close approach' })).toBeVisible();
		await expect(page.locator('.criteria dt')).toHaveCount(14);
		await expect(page.getByRole('heading', { name: 'What counts as a wake-turbulence event' })).toBeVisible();
		await expect(page.getByText(/more than 150 feet above the field/)).toBeVisible();
		await expect(page.locator('#who-we-are')).toBeVisible();
		await expect(page.getByRole('link', { name: 'mckoss@gmail.com' })).toHaveAttribute('href', /^mailto:mckoss@gmail\.com/);
		await expect(page.getByRole('link', { name: 'Send us feedback' })).toHaveAttribute('href', /^mailto:.*kstoltz/);
		const text = (await page.locator('main').textContent()) ?? '';
		expect(text).not.toMatch(/loss of separation|general aviation|air carrier/i);
	});
});

test.describe('admin', () => {
	test('is unlinked, noindex, and gated (open mode in tests; anonymous users are sent to sign-in otherwise)', async ({ page, request }) => {
		// The e2e server runs with DTW_NO_AUTH=1 so the console is reachable.
		const res = await page.goto('/admin');
		expect(res?.headers()['x-robots-tag']).toContain('noindex');
		await expect(page.getByRole('heading', { name: 'Pipeline console' })).toBeVisible();
		await expect(page.getByText(/Open mode/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Catch up now' })).toBeVisible();
		// Data on hand reflects the sample database.
		await expect(page.getByText('KPAE').first()).toBeVisible();
		// Nothing in the public chrome links to /admin.
		await page.goto('/');
		expect(await page.locator('a[href^="/admin"]').count()).toBe(0);
		const robots = await (await request.get('/robots.txt')).text();
		expect(robots).toMatch(/Disallow: \/admin/);
	});

	test('sign-in endpoint refuses when Google is not configured', async ({ request }) => {
		const res = await request.get('/auth/google', { maxRedirects: 0 });
		expect([302, 503]).toContain(res.status());
	});
});

test.describe('admin airports', () => {
	test('looks up a three-letter code and shows FAA data before confirmation', async ({ page }) => {
		await page.goto('/admin/airports');
		await page.getByLabel('Airport code').fill('STS');
		await page.getByRole('button', { name: 'Look up airport' }).click();
		const candidate = page.getByTestId('airport-candidate');
		await expect(candidate).toContainText('STS');
		await expect(candidate).toContainText('CHARLES M SCHULZ/SONOMA COUNTY');
		await expect(candidate).toContainText('0700-2000');
		await expect(candidate).toContainText('America/Los_Angeles');
		await expect(candidate.getByRole('button', { name: 'Confirm and start tracking' })).toBeVisible();
	});

	test('lists airports from the database, exports the seed JSON, and edits a schedule', async ({ page, request }) => {
		await page.goto('/admin/airports');
		await expect(page.getByRole('heading', { name: 'Airports and tower hours' })).toBeVisible();
		await expect(page.getByTestId('airport-PAE')).toBeVisible();
		const exp = await request.get('/admin/airports/export');
		expect(exp.ok()).toBeTruthy();
		const json = await exp.json();
		expect(json.airports.find((a: { code: string }) => a.code === 'PAE').schedules.length).toBeGreaterThan(0);
		const pae = page.getByTestId('airport-PAE');
		await pae.getByRole('button', { name: /PAE/ }).click();
		await expect(pae.getByText('Observed in stored airline flights; updates automatically.')).toBeVisible();

		// Add a future schedule row for an untracked airport (no stored nights → no re-ingest warning).
		const card = page.getByTestId('airport-SBA');
		await card.getByRole('button', { name: /SBA/ }).click();
		const newRow = card.locator('form.new');
		await newRow.locator('input[name="from"]').fill('2030-01-01');
		await newRow.locator('input[name="open"]').fill('6');
		await newRow.locator('input[name="close"]').fill('20');
		await newRow.locator('input[name="note"]').fill('e2e test row');
		await newRow.getByRole('button', { name: 'add' }).click();
		await expect(page.getByText('Saved SBA.')).toBeVisible();
		// It now drifts from the seed file (live-only row).
		await expect(page.getByText(/schedule:SBA-2030-01-01/)).toBeVisible();
	});
});

test.describe('admin operators', () => {
	test('lists operator names, exports JSON, and renames apply at render time', async ({ page, request }) => {
		await page.goto('/admin/operators');
		await expect(page.getByRole('heading', { name: 'Airline names' })).toBeVisible();
		const exp = await request.get('/admin/operators/export');
		expect((await exp.json()).operators.some((o: { icao: string }) => o.icao === 'QXE')).toBe(true);
		const row = page.getByTestId('operator-QXE');
		await row.locator('input[name="short"]').fill('Horizon (e2e)');
		await row.getByRole('button', { name: 'save' }).click();
		await expect(page.getByText('Saved QXE.')).toBeVisible();
		await page.goto('/airport/PAE?night=2026-08-14');
		await expect(page.getByText(/Horizon \(e2e\) \d+/).first()).toBeVisible();
		// restore
		await page.goto('/admin/operators');
		await row.locator('input[name="short"]').fill('Horizon');
		await row.getByRole('button', { name: 'save' }).click();
		await expect(page.getByText('Saved QXE.')).toBeVisible();
	});
});
