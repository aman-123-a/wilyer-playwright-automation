// =============================================================================
//  Enterprise Playwright configuration — CMS E2E (TypeScript).
//
//  Highlights:
//   • HTML + JSON + JUnit + list + Allure reporters
//   • Screenshot / video / trace captured on failure (trace on first retry)
//   • Retries (2 in CI, 0 locally) + full parallel execution
//   • Cached admin session via global-setup → storageState (auth reuse)
//   • Cross-browser projects (Chromium / Firefox / WebKit) + mobile viewports
//   • A dedicated `setup` project authenticates once before everything else
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import { ENV, ADMIN_STORAGE_STATE } from './config/env';

export default defineConfig({
  testDir: './tests',

  // Authenticates the app + caches an admin session before the suite runs.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Per-test wall-clock budget. Long flows (uploads, exports) extend locally.
  timeout: 90_000,
  expect: { timeout: 12_000 },

  // Fail fast in CI if someone commits `test.only`.
  forbidOnly: ENV.IS_CI,

  // Parallelism — across files by default; serial suites opt in per-describe.
  // Capped: the live CMS is slow, so flooding it with one worker per CPU core
  // causes navigation stalls. 4 keeps load reasonable while staying parallel.
  fullyParallel: true,
  workers: ENV.IS_CI ? 2 : 4,

  // Retries absorb transient slow-app navigation timeouts. Higher in CI where
  // infra noise compounds with the slow external target.
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

  projects: [
    // ── 1. Auth setup — runs first, produces .auth/admin.json ───────────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // ── 2. Desktop browsers (reuse cached admin session) ────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },

    // ── 3. Mobile viewports ─────────────────────────────────────────────────
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
});
