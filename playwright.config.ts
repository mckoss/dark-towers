import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	// Keep the retry for traces, but never let a retry turn a real CI failure green.
	failOnFlakyTests: !!process.env.CI,
	// Multiple Chromium processes occasionally exhaust the hosted runner and crash
	// before a test begins. Local runs can still use all available workers.
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		// Full Chromium's modern headless mode is more reliable than the separate
		// chrome-headless-shell binary, which intermittently segfaults on CI runners.
		channel: 'chromium',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'npm run build && SCHEDULER=off DTW_NO_AUTH=1 CONFIG_JSON={} NASR_JSON=tests/fixtures/nasr.json REGISTRY_JSON=tests/fixtures/registry.json npm run preview -- --port 4173',
		url: 'http://localhost:4173/api/health',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	]
});
