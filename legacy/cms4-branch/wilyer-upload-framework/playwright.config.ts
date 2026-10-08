/**
 * Playwright configuration — config-driven, environment-aware.
 *
 * Highlights:
 *  - Reads tuning from `.env` via the typed `env` module.
 *  - Parallel execution + retries (configurable, CI-aware).
 *  - HTML + Allure + list reporters.
 *  - Screenshots, video, and traces captured on failure/retry.
 *  - Cross-browser + mobile projects (Chromium, Firefox, WebKit, Mobile
 *    Chrome, Mobile Safari).
 *  - Global setup/teardown for auth state + fixture cleanup.
 */
import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env.js';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: env.exec.isCI,
  retries: env.exec.isCI ? Math.max(env.exec.retries, 2) : env.exec.retries,
  workers: env.exec.isCI ? env.exec.workers : env.exec.workers,
  timeout: 90_000,
  expect: { timeout: env.exec.expectTimeoutMs },

  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: env.app.baseURL,
    headless: env.exec.headless,
    actionTimeout: env.exec.actionTimeoutMs,
    navigationTimeout: env.exec.navTimeoutMs,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
  ],
});
