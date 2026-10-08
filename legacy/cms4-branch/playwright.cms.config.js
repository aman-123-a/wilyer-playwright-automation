// =============================================================================
//  Enterprise CMS Regression Suite — Playwright configuration
// =============================================================================
//  Dedicated config so this suite is isolated from the repo's existing tests.
//
//  Run:   npx playwright test --config=playwright.cms.config.js
//         npm run cms            (see package.json scripts)
//
//  Features wired here (all required by the suite spec):
//   • HTML + JSON + list + JUnit reporters       (CI-consumable + human-readable)
//   • Trace on first retry                        (Trace Viewer)
//   • Screenshot only on failure
//   • Video retained on failure only
//   • Retries (2 in CI, 1 locally)
//   • Full parallel execution across files
//   • Single chromium project (extend `projects` for cross-browser)
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import { ENV } from './utils/cms/env.js';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/cms-suite',

  // Verifies the app is reachable and caches an admin session before the run.
  globalSetup: './global-setup.cms.js',

  // Per-test wall-clock budget. Long flows (uploads, exports) raise this locally.
  timeout: 90_000,
  expect: { timeout: 12_000 },

  // Fail the whole run fast if someone commits `test.only`.
  forbidOnly: isCI,

  // Parallelism — across files by default; serial suites opt in per-describe.
  fullyParallel: true,
  workers: isCI ? 2 : undefined,

  // Retries: more forgiving in CI where infra noise is higher.
  retries: isCI ? 2 : 1,

  // Where artifacts (screenshots, video, trace) land.
  outputDir: './test-results/cms',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/cms', open: 'never' }],
    ['json', { outputFile: 'reports/cms/results.json' }],
    ['junit', { outputFile: 'reports/cms/junit.xml' }],
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

    // Deterministic viewport for visual stability.
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to extend regression to other engines:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari'] } },
  ],
});
