import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Stacky E2E smoke suite.
 * These are no-auth smoke tests that exercise release-critical flows using
 * local mock data — no real OAuth and no live backend required.
 */
export default defineConfig({
  testDir: './e2e',
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --port 3002',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
