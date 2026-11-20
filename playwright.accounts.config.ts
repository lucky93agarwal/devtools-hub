import { defineConfig, devices } from '@playwright/test';

/**
 * Accounts tests: the built site served by `wrangler dev` with the Worker API and a local
 * D1 database kept in .wrangler/e2e-state (wiped before each run). Build first, then
 * `npx playwright test -c playwright.accounts.config.ts`.
 */
export default defineConfig({
  testDir: './e2e-accounts',
  testMatch: '**/*.e2e.ts',
  // Files starting with _ are one-off checks (for example against the live site).
  testIgnore: '**/_*',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8790', trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e-accounts/serve.mjs',
    url: 'http://localhost:8790/api/auth/me',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
