// =============================================================================
//  Wilyer CMS Dashboard — dedicated Playwright config (headed-friendly).
//  -----------------------------------------------------------------------------
//  Isolated config so the dashboard POM suite runs independently of the other
//  suites in this repo.
//
//  Run headed:   npx playwright test --config=playwright.wilyer-dashboard.config.ts --headed
//  Run normal:   npx playwright test --config=playwright.wilyer-dashboard.config.ts
//
//  Auth: reuses the cached admin session at .auth/admin.json (cms.pocsample.in).
//        Refresh it via the repo's `npm run cms:login` if it has expired.
// =============================================================================

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './wilyer-dashboard/tests',

  timeout: 90_000,
  expect: { timeout: 12_000 },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1, // slow app — keep it serial for a clean headed demo

  outputDir: './test-results/wilyer-dashboard',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/wilyer-dashboard', open: 'never' }],
  ],

  use: {
    baseURL: process.env.CMS_BASE_URL ?? 'https://cms.pocsample.in',
    storageState: '.auth/admin.json',

    headless: false, // headed by default for this demo config
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',

    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
