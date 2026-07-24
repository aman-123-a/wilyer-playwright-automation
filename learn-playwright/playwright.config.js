// ─────────────────────────────────────────────────────────────────────────────
// Playwright config — a small, commented starter you can learn from.
// Docs: https://playwright.dev/docs/test-configuration
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Where the tests live (relative to this config file).
  testDir: './tests',

  // Fail the build on CI if you accidentally left test.only in the source.
  forbidOnly: !!process.env.CI,

  // Retry a failing test once locally, twice on CI (the app can be flaky/slow).
  retries: process.env.CI ? 2 : 1,

  // The app is slow under load — keep workers low to avoid 429 storms.
  workers: 2,

  // A nice HTML report you open with:  npm run learn:report
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  // Settings shared by every test.
  use: {
    baseURL: 'https://cms2.pocsample.in',
    // Capture a trace on first retry — open it with `npx playwright show-trace`.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // ── Projects ────────────────────────────────────────────────────────────────
  // "setup" logs in ONCE and saves the session to .auth/state.json.
  // "chromium" then reuses that session, so every test starts logged-in
  // (and skips the flaky reCAPTCHA login). This is the standard auth pattern.
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.js/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
});
