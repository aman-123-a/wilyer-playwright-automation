// =============================================================================
//  Wilyer Signage CMS — Playwright configuration
// =============================================================================
//  Self-contained suite. Resolves @playwright/test from the repo-root
//  node_modules, so no separate `npm install` is needed inside this folder.
//
//  Run:
//    npx playwright test --config=wilyer-signage-suite/playwright.config.ts
//    npx playwright test --config=wilyer-signage-suite/playwright.config.ts --grep @smoke
//
//  Projects (selectable with --project):
//    setup       — authenticates once, writes .auth/admin.json
//    smoke       — @smoke production deployment gate (depends on setup)
//    regression  — full CRUD + boundary + edge + failure (depends on setup)
//    edge        — @edge only (heavy / slow boundary cases)
//    no-auth     — tests that must start logged-out (auth, security)
// =============================================================================
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './config/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json');
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),

  // Long flows (uploads, 5000-screen lists, exports) need headroom.
  timeout: 120_000,
  expect: { timeout: 12_000 },

  forbidOnly: isCI,
  fullyParallel: true,
  workers: isCI ? 2 : undefined, // app is slow under load — cap in CI
  retries: isCI ? 2 : 1,

  outputDir: path.join(__dirname, 'test-results'),

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'reports', 'results.json') }],
    ['junit', { outputFile: path.join(__dirname, 'reports', 'junit.xml') }],
  ],

  use: {
    baseURL: ENV.BASE_URL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    // ── 1. One-time auth — produces the cached admin storage state ──────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // ── 2. Logged-out tests (auth + API-security) — no storageState ─────────
    {
      name: 'no-auth',
      testMatch: /(auth|security)\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── 3. Smoke — fast post-deploy gate ────────────────────────────────────
    {
      name: 'smoke',
      grep: /@smoke/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
    },

    // ── 4. Regression — everything that needs an authenticated admin ────────
    {
      name: 'regression',
      grepInvert: /@edge/,
      testIgnore: /(auth|security)\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
    },

    // ── 5. Edge — heavy boundary / scale cases, isolated so they can be skipped
    {
      name: 'edge',
      grep: /@edge/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
    },
  ],
});

export { ADMIN_STATE };
