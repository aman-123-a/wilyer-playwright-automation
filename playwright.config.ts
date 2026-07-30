// =============================================================================
//  Enterprise Playwright configuration — Wilyer CMS QA Automation Platform.
//
//  Highlights:
//   • HTML + JSON + JUnit + list + Allure reporters, all under reports/
//   • Screenshot / video / trace captured on failure (trace on first retry)
//   • Retries (2 in CI, 1 locally) + full parallel execution
//   • Cached session per environment via the `setup` project → storageState
//   • Cross-browser projects (Chromium / Firefox / WebKit) + mobile viewports
//   • A headless `api` project for pure REST suites (no browser cost)
//
//  Target environment comes from TEST_ENV — see config/environments.ts and the
//  npm scripts (npm run cms | cms2 | cms3 | cms4 | live).
// =============================================================================

import { defineConfig, devices } from '@playwright/test';
import { ENV, ADMIN_STORAGE_STATE } from './config/env';
import { ignoredTestDirsFor, testDirsFor } from './config/features';

/** Everything Playwright generates lands here, namespaced by environment. */
const REPORTS = `reports/${ENV.NAME}`;

/**
 * Specs are filed by owning server (tests/_core, tests/cms, tests/cms2, …).
 * Only the folders relevant to the active environment run: its own, the core
 * tree, and the home folder of any feature that has been rolled out to it —
 * Prayer Schedule lives in tests/cms/ but also executes on live, because
 * config/features.ts records it as released there.
 *
 * Selecting by exclusion (rather than pointing testDir at a subfolder) keeps
 * tests/global.setup.ts in scope on every environment.
 */
const FOREIGN_SERVER_SPECS = ignoredTestDirsFor(ENV.NAME).map(
  (dir) => new RegExp(`[\\\\/]tests[\\\\/]${dir}[\\\\/]`),
);

/**
 * Pure-REST suites live in tests/<module>/api/. They are claimed by the `api`
 * project and excluded from the browser projects — running them once per
 * browser would repeat identical HTTP calls five times for no added signal.
 */
const API_SPECS = /[\\/]api[\\/].*\.spec\.ts$/;

/**
 * Android player suites live in tests/<server>/player/. They drive real
 * hardware over adb / Appium, so they belong to exactly one project: running
 * them under Firefox and WebKit too would queue five workers against a single
 * physical screen and prove nothing new about the browser.
 */
const PLAYER_SPECS = /[\\/]player[\\/].*\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',

  // Verifies reachability + credentials, and prints the resolved target.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Per-test wall-clock budget. Long flows (uploads, exports) extend locally.
  timeout: 90_000,
  expect: { timeout: 12_000 },

  // Fail fast in CI if someone commits `test.only`.
  forbidOnly: ENV.IS_CI,

  // Parallelism — across files by default; serial suites opt in per-describe.
  // Capped: the CMS is slow, so one worker per CPU core causes navigation
  // stalls. 4 keeps load reasonable while staying parallel.
  fullyParallel: true,
  workers: ENV.IS_CI ? 2 : 4,

  // Retries absorb transient slow-app navigation timeouts. Higher in CI where
  // infra noise compounds with the slow external target.
  retries: ENV.IS_CI ? 2 : 1,

  outputDir: `${REPORTS}/test-results`,

  // Surfaces the environment on every HTML/Allure report, so an archived run
  // can always be traced back to the server it was executed against.
  metadata: {
    environment: ENV.NAME,
    label: ENV.LABEL,
    baseURL: ENV.BASE_URL,
    apiBaseURL: ENV.API_BASE_URL,
    apiConfidence: ENV.API_CONFIDENCE,
    destructive: ENV.ALLOW_DESTRUCTIVE,
    // Which server folders this run covers — so an archived report shows not
    // just where it ran, but which feature sets were in scope.
    testDirs: testDirsFor(ENV.NAME).join(', '),
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: `${REPORTS}/html`, open: 'never' }],
    // JSON / JUnit / Allure exist for CI consumers (dashboards, ClickUp, the
    // Allure history). Locally nothing reads them, and Allure's detail:true
    // serialises every step of every test — so they are CI-only.
    ...(ENV.IS_CI
      ? ([
          ['json', { outputFile: `${REPORTS}/results.json` }],
          ['junit', { outputFile: `${REPORTS}/junit.xml` }],
          ['allure-playwright', { resultsDir: `${REPORTS}/allure-results`, detail: true }],
        ] as const)
      : []),
  ],

  use: {
    baseURL: ENV.BASE_URL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Diagnostics captured automatically on failure / retry.
    //
    // `video` is the expensive one: 'retain-on-failure' still RECORDS every
    // test and only discards the passing ones, so the cost is paid on the 95%
    // that pass. CI keeps it (a failure there is expensive to reproduce);
    // locally the trace-on-retry is enough, and you can force video back on for
    // one run with CMS_VIDEO=1 when chasing something visual.
    screenshot: 'only-on-failure',
    video: ENV.IS_CI || process.env.CMS_VIDEO === '1' ? 'retain-on-failure' : 'off',
    trace: 'on-first-retry',

    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    testIdAttribute: 'data-testid',
  },

  projects: [
    // ── 1. Auth setup — runs first, writes storage/<env>/admin.json ─────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // ── 2. API suites — no browser UI, so they get their own fast project ───
    {
      name: 'api',
      testMatch: API_SPECS,
      testIgnore: FOREIGN_SERVER_SPECS,
      use: { storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
    },

    // ── 3. Desktop browsers (reuse cached session) ──────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: [API_SPECS, PLAYER_SPECS, ...FOREIGN_SERVER_SPECS],
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: [API_SPECS, PLAYER_SPECS, ...FOREIGN_SERVER_SPECS],
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: [API_SPECS, PLAYER_SPECS, ...FOREIGN_SERVER_SPECS],
      dependencies: ['setup'],
    },

    // ── 4. Android player — real hardware over adb / Appium ─────────────────
    //
    // Keeps a Chromium context because the end-to-end specs assert across both
    // halves of the product (publish in the CMS, verify on the screen); the
    // device work happens outside the browser regardless.
    {
      name: 'android',
      testMatch: PLAYER_SPECS,
      testIgnore: FOREIGN_SERVER_SPECS,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
      // Device work is slow by nature: sync SLAs, reboots and settling periods
      // are measured in minutes, not the seconds a CMS page load takes.
      timeout: 10 * 60_000,
      // Tests within a file run in order. Across FILES, only `--workers=1`
      // serialises — there is one physical screen, so the `player` npm script
      // sets it. Running this project by hand without it will interleave
      // reboots from one file into another file's assertions.
      fullyParallel: false,
      // A device failure is almost never transient — a retry mostly buys a
      // second reboot cycle and a report that hides the first failure.
      retries: 0,
    },

    // ── 5. Mobile viewports ─────────────────────────────────────────────────
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: [API_SPECS, PLAYER_SPECS, ...FOREIGN_SERVER_SPECS],
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: [API_SPECS, PLAYER_SPECS, ...FOREIGN_SERVER_SPECS],
      dependencies: ['setup'],
    },
  ],
});
