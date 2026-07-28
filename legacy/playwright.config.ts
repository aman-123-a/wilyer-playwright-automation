import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  /* Global timeout */
  timeout: 60_000,

  /* Retries */
  retries: 0,

  /* HTML report */
  reporter: [['html', { open: 'never' }]],

  /* Shared settings */
  use: {
    baseURL: 'https://cms.pocsample.in',
    headless: false,                  // 👈 show browser
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },

  /* Browser setup */
  projects: [
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
