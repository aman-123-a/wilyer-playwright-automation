import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const STORAGE_STATE = path.resolve(__dirname, '.auth/state.json');

export default defineConfig({
  testDir: path.resolve(__dirname, 'specs'),
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // 2 retries handles the flake window common to 20k-row fetches
  retries: 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(__dirname, '.report'), open: 'never' }],
    ['junit', { outputFile: path.resolve(__dirname, '.report/junit.xml') }],
  ],
  globalSetup: path.resolve(__dirname, 'global-setup.ts'),
  use: {
    baseURL: 'https://cms3.pocsample.in',
    storageState: STORAGE_STATE,
    headless: false,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Auto-capture a trace on first retry — perfect for debugging flakes
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'Chromium', use: { ...devices['Desktop Chrome'] } }],
});

export { STORAGE_STATE };
