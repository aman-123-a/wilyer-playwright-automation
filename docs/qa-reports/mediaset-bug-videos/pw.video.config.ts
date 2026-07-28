import { defineConfig } from '@playwright/test';

// Self-contained config that records a video of the Media Sets bug repro.
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  outputDir: './artifacts',
  reporter: 'list',
  use: {
    baseURL: 'https://cms2.pocsample.in',
    headless: false,
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    actionTimeout: 30_000,
    launchOptions: { slowMo: 200 },
  },
});
