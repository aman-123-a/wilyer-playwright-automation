// =============================================================================
//  Enterprise Playwright configuration — Wilyer CMS QA Automation Platform.
//
//  Highlights:
//   • HTML + JSON + JUnit + list + Allure reporters, all under reports/
//   • Screenshot / video / trace captured on failure (trace on first retry)
//   • Retries (2 in CI, 1 locally) + full parallel execution
//   • Cached session per environment via the `setup` project → storageState
//   • Cross-browser projects (Chromium / Firefox / WebKit) + mobile viewports
//   • A headless `api` project for pure REST suites (no browser cost)
//
//  Target environment comes from TEST_ENV — see config/environments.ts and the
//  npm scripts (npm run cms | cms2 | cms3 | cms4 | live).
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import { ENV, ADMIN_STORAGE_STATE } from './config/env';

/** Everything Playwright generates lands here, namespaced by environment. */
const REPORTS = `reports/${ENV.NAME}`;

/**
 * Pure-REST suites live in tests/<module>/api/. They are claimed by the `api`
 * project and excluded from the browser projects — running them once per
 * browser would repeat identical HTTP calls five times for no added signal.
 */
const API_SPECS = /[\\/]api[\\/].*\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',

  // Verifies reachability + credentials, and prints the resolved target.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Per-test wall-clock budget. Long flows (uploads, exports) extend locally.
  timeout: 90_000,
  expect: { timeout: 12_000 },

  // Fail fast in CI if someone commits `test.only`.
  forbidOnly: ENV.IS_CI,

  // Parallelism — across files by default; serial suites opt in per-describe.
  // Capped: the CMS is slow, so one worker per CPU core causes navigation
  // stalls. 4 keeps load reasonable while staying parallel.
  fullyParallel: true,
  workers: ENV.IS_CI ? 2 : 4,

  // Retries absorb transient slow-app navigation timeouts. Higher in CI where
  // infra noise compounds with the slow external target.
  retries: ENV.IS_CI ? 2 : 1,

  outputDir: `${REPORTS}/test-results`,

  // Surfaces the environment on every HTML/Allure report, so an archived run
  // can always be traced back to the server it was executed against.
  metadata: {
    environment: ENV.NAME,
    label: ENV.LABEL,
    baseURL: ENV.BASE_URL,
    apiBaseURL: ENV.API_BASE_URL,
    apiConfidence: ENV.API_CONFIDENCE,
    destructive: ENV.ALLOW_DESTRUCTIVE,
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: `${REPORTS}/html`, open: 'never' }],
    ['json', { outputFile: `${REPORTS}/results.json` }],
    ['junit', { outputFile: `${REPORTS}/junit.xml` }],
    ['allure-playwright', { resultsDir: `${REPORTS}/allure-results`, detail: true }],
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
    // ── 1. Auth setup — runs first, writes storage/<env>/admin.json ─────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // ── 2. API suites — no browser UI, so they get their own fast project ───
    {
      name: 'api',
      testMatch: API_SPECS,
      use: { storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },

    // ── 3. Desktop browsers (reuse cached session) ──────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: API_SPECS,
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: API_SPECS,
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: API_SPECS,
      dependencies: ['setup'],
    },

    // ── 4. Mobile viewports ─────────────────────────────────────────────────
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: API_SPECS,
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: API_SPECS,
      dependencies: ['setup'],
    },
  ],
});
