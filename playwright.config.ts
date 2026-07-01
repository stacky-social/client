import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Stacky E2E smoke suite.
 * These are no-auth smoke tests that exercise release-critical flows using
 * local mock data — no real OAuth and no live backend required.
 */
// Point the suite at an already-running server with E2E_BASE_URL — e.g. a
// production build (`pnpm build && pnpm start -p 3012`) for the heavy stress
// specs, which crash the single-threaded dev server. When E2E_BASE_URL is set
// Playwright manages no server of its own (you own its lifecycle). Also handy
// for git worktrees, where the default dev server may boot the wrong checkout.
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3002';

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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev --port 3002',
        url: 'http://localhost:3002',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
