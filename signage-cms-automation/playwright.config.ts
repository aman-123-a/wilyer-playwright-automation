// =============================================================================
//  Production Playwright configuration — Digital Signage CMS (TypeScript).
//
//  Requirements covered here:
//   • HTML + Allure + JSON + JUnit + list reporters
//   • Screenshot / video / trace captured on failure (trace on first retry)
//   • Retries + full parallel execution (worker-capped for the slow live app)
//   • Cached admin session via the `setup` project → storageState (auth reuse)
//   • Cross-browser projects (Chromium / Firefox / WebKit)
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import { ENV, ADMIN_STORAGE_STATE } from './src/config/env';

export default defineConfig({
  testDir: './src/tests',

  // One-time health check (app reachable + artifact dirs) before the suite.
  globalSetup: './src/helpers/global-setup.ts',
  globalTeardown: './src/helpers/global-teardown.ts',

  // Per-test wall-clock budget. The live CMS is slow; uploads/exports need room.
  timeout: 90_000,
  expect: { timeout: 12_000 },

  // Fail fast in CI if someone commits `test.only`.
  forbidOnly: ENV.IS_CI,

  // Parallel across files. Workers are capped: the live CMS stalls under one
  // worker per core, so 2 (CI) / 4 (local) keeps load sane while staying parallel.
  fullyParallel: true,
  workers: ENV.IS_CI ? 2 : 4,

  // Retries absorb transient slow-app navigation timeouts.
  retries: ENV.IS_CI ? 2 : 1,

  outputDir: './test-results',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true }],
  ],

  use: {
    baseURL: ENV.BASE_URL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Diagnostics captured automatically on failure / retry.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',

    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    testIdAttribute: 'data-testid',
  },

  // Auth happens once in global-setup (filter-proof) → .auth/admin.json, which
  // every project below reuses via storageState. Tests start authenticated.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: ADMIN_STORAGE_STATE },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: ADMIN_STORAGE_STATE },
    },
  ],
});
