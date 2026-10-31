import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. They run against the production build, so build first:
 * `npm run build`, then `npm run e2e`. Only Chromium is used, to keep CI fast.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    // The service worker caches pages between tests; only the offline test turns it on.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/serve.mjs dist/devtools-hub/browser 4317',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: false,
  },
});
