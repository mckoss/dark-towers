import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage of every route against the built app with the sample
 * KPAE data (nights of 2026-08-12 … 08-18). Runs in desktop and mobile
 * projects (see playwright.config.ts).
 */

const NIGHT_WITH_INCIDENTS = '2026-08-17';

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
		// Non-tracked airports are listed but not linked.
		await expect(page.getByText('Bellingham International')).toBeVisible();
		await expect(page.locator('a[title="Open the BLI record"]')).toHaveCount(0);
		await pae.click();
		await expect(page).toHaveURL(/\/airport\/PAE/);
	});

	test('request form confirms a submission without promising review', async ({ page }) => {
		await page.goto('/airports');
		await page.getByPlaceholder(/Airport code/).fill('KMMH');
		await page.getByRole('button', { name: 'Send request' }).click();
		await expect(page.getByText(/Thanks — KMMH has been added to the request list/)).toBeVisible();
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
	});

	test('selecting a calendar night reloads the panel and shows close approaches', async ({ page }) => {
		await page.goto('/airport/PAE');
		await page.getByRole('button', { name: /Mon 17/ }).click();
		await expect(page).toHaveURL(/night=2026-08-17/);
		await expect(page.getByText('Night of Monday, August 17')).toBeVisible();
		const cards = page.getByRole('link', { name: /Replay this close approach/ });
		await expect(cards.first()).toBeVisible();
		expect(await cards.count()).toBeGreaterThan(0);
		// The hours the night covers sit under the title.
		await expect(page.getByTestId('night-hours')).toContainText(/Tower closed \d+:00 [ap]m to \d+:00 [ap]m/);
	});

	test('the whole night can be replayed from controls under the map', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		const play = page.getByTestId('night-play');
		await expect(play).toBeVisible();
		await expect(play).toHaveText(/Replay the night/);
		await expect(page.getByTestId('night-airborne')).toHaveText('—');
		// A red pip on the scrubber for every close approach that night.
		expect(await page.getByTestId('night-pip').count()).toBeGreaterThan(0);
		const before = await page.getByTestId('night-time').textContent();
		await play.click();
		await page.waitForTimeout(1500);
		expect(await page.getByTestId('night-time').textContent()).not.toBe(before);
		await expect(page.getByTestId('night-airborne')).toHaveText(/^\d+$/);
		await play.click();
		await expect(play).toHaveText(/Resume/);
	});

	test('a night without close approaches shows the honest empty state', async ({ page }) => {
		await page.goto('/airport/PAE?night=2026-08-16');
		await expect(page.getByText(/No two aircraft came within 3 nautical miles/)).toBeVisible();
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
		await page.goto('/airport/BLI');
		await expect(page.getByText(/Nightly detail for BLI is not published yet/)).toBeVisible();
		await expect(page.getByRole('link', { name: /Paine Field/ })).toHaveAttribute('href', '/airport/PAE');
	});
});

test.describe('close approach', () => {
	test('opens from a card, shows the figures and plays the replay', async ({ page }) => {
		await page.goto(`/airport/PAE?night=${NIGHT_WITH_INCIDENTS}`);
		await page.getByRole('link', { name: /Replay this close approach/ }).first().click();
		await expect(page).toHaveURL(/\/close-approach\/PAE-/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/came within .* NM and .*' of each other/);
		await expect(page.getByText(/one is enough/)).toBeVisible();
		await expect(page.getByText(/Nearest approach · \d+:\d\d:\d\d [ap]m/)).toBeVisible();
		await expect(page.getByTestId('nearest-moment')).toContainText('kt');
		// Altitudes default to height above the field; the reader can switch to raw reported altitude.
		await expect(page.getByTestId('alt-note')).toContainText(/AGL = height above the field: ADS-B altitude, corrected [−+][\d,]+'/);
		await page.getByRole('button', { name: 'Show ADS-B altitudes' }).click();
		await expect(page.getByTestId('alt-note')).toContainText(/ADS-B altitude: the figure each aircraft broadcast/);
		await expect(page.getByTestId('nearest-moment')).toContainText('ft ADS-B');
		await page.getByRole('button', { name: 'Show heights AGL' }).click();
		await expect(page.getByText("What we know, and don't")).toBeVisible();
		// Editorial rule: never claim what is or is not in an FAA record.
		expect(await page.locator('main').textContent()).toMatch(/do not know whether this event was reported/i);

		const play = page.getByTestId('replay-play');
		await expect(play).toBeVisible();
		await expect(page.getByTestId('replay-pip')).toBeAttached();
		const before = await page.getByTestId('replay-time').textContent();
		await play.click();
		await page.waitForTimeout(1500);
		const after = await page.getByTestId('replay-time').textContent();
		expect(after).not.toBe(before);
		await expect(page.getByTestId('replay-lateral')).toContainText('NM');
		await expect(page.getByTestId('replay-vertical')).toContainText('ft');
		// Scrubbing to the end lands on the closest pass region and stops.
		const scrubber = page.getByTestId('replay-scrubber');
		await scrubber.evaluate((el: HTMLInputElement) => {
			el.value = el.max;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.waitForTimeout(200);
		await expect(page.getByTestId('replay-time')).not.toHaveText(before ?? '');
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
		await expect(page.getByText(/at least 3 nautical miles apart/)).toBeVisible();
		await expect(page.getByText('Known limitations')).toBeVisible();
		// The exact test is spelled out, condition by condition.
		await expect(page.getByRole('heading', { name: 'What counts as a close approach' })).toBeVisible();
		await expect(page.locator('.criteria dt')).toHaveCount(8);
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
	test('lists airports from the database, exports the seed JSON, and edits a schedule', async ({ page, request }) => {
		await page.goto('/admin/airports');
		await expect(page.getByRole('heading', { name: 'Airports and tower hours' })).toBeVisible();
		await expect(page.getByTestId('airport-PAE')).toBeVisible();
		const exp = await request.get('/admin/airports/export');
		expect(exp.ok()).toBeTruthy();
		const json = await exp.json();
		expect(json.airports.find((a: { code: string }) => a.code === 'PAE').schedules.length).toBeGreaterThan(0);

		// Add a future schedule row for an untracked airport (no stored nights → no re-ingest warning).
		const card = page.getByTestId('airport-DDC');
		await card.getByRole('button', { name: /DDC/ }).click();
		const newRow = card.locator('form.new');
		await newRow.locator('input[name="from"]').fill('2030-01-01');
		await newRow.locator('input[name="open"]').fill('6');
		await newRow.locator('input[name="close"]').fill('20');
		await newRow.locator('input[name="note"]').fill('e2e test row');
		await newRow.getByRole('button', { name: 'add' }).click();
		await expect(page.getByText('Saved DDC.')).toBeVisible();
		// It now drifts from the seed file (live-only row).
		await expect(page.getByText(/schedule:DDC-2030-01-01/)).toBeVisible();
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
