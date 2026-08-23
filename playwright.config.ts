import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
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
