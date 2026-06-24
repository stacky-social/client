import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Stacky E2E suite.
 * No-auth tests that exercise the app using local mock data — no real OAuth
 * and no live backend required.
 *
 * Port is configurable via E2E_PORT (default 3002) so the suite can run in an
 * isolated dev server — e.g. parallel git worktrees or CI — without colliding
 * with another `pnpm dev` already bound to 3002.
 */
const PORT = process.env.E2E_PORT || '3002';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
