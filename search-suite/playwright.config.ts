// =============================================================================
//  Playwright config for the Search test-suite.
//  • Authenticated via cached storageState (global-setup).
//  • Screenshots + traces retained ONLY on failure (keeps disk usage low).
//  • Video off by default — turn on with SEARCH_VIDEO=on if needed.
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './config/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  globalSetup: path.join(__dirname, 'global-setup.ts'),

  timeout: 90_000,
  expect: { timeout: 15_000 },

  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'report'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'report', 'results.json') }],
  ],
  outputDir: path.join(__dirname, 'test-results'),

  use: {
    baseURL: ENV.BASE_URL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    storageState: path.resolve(__dirname, ENV.AUTH_FILE),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.SEARCH_VIDEO === 'on' ? 'retain-on-failure' : 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
