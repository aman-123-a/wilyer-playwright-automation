import { defineConfig, devices } from '@playwright/test';

// Dedicated config — keeps Maker-Checker suite isolated from the repo's default
// config (tests/Playlist_CRUD.spec.js etc.). Run with:
//   npx playwright test --config=playwright.maker-checker.config.js
export default defineConfig({
  testDir: './tests/maker-checker',

  // Allow long-running maker→checker handoffs (new contexts + file uploads)
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // One retry smooths transient network flakiness without masking real bugs
  retries: process.env.CI ? 2 : 1,

  // Serial by default — approval flow has shared state between tests
  workers: 1,
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://cms.pocsample.in',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Uncomment to extend coverage:
    // { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
